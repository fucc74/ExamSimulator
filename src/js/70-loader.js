/* Exam loading. Exam files look like:   ExamSim.register({ ...pure JSON... });
   - over http(s) the text is fetched and the JSON is parsed WITHOUT executing it;
   - from file:// (where fetch is blocked) a <script> tag is used instead;
   - legacy files (window.ExamData = {...}) still load through the script path. */
App.loader = (function () {
    let pending = null;

    class LoadError extends Error {
        constructor(code, info) { super(code); this.code = code; Object.assign(this, info || {}); }
    }

    function register(data) { pending = data; }

    // Extracts the JSON argument of ExamSim.register(...). Returns null when the text is not in that shape.
    function parseText(text) {
        const t = String(text).replace(/^﻿/, '').replace(/^(\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*/, '').trim();
        const m = t.match(/^ExamSim\.register\(([\s\S]*)\)\s*;?\s*$/);
        if (!m) {
            if (t.startsWith('{')) { try { return JSON.parse(t); } catch (e) { throw new LoadError('parse', { detail: e.message }); } }
            return null;
        }
        try { return JSON.parse(m[1]); } catch (e) { throw new LoadError('parse', { detail: e.message }); }
    }

    function finalize(data, fileId, label) {
        const { exam, report } = App.schema.prepare(data, fileId);
        if (!exam) throw new LoadError('invalid', { report, name: label || fileId });
        exam.sourceFile = fileId;
        return exam;
    }

    async function fetchText(url, name) {
        let resp;
        try { resp = await fetch(url, { cache: 'no-cache' }); } catch (e) { throw new LoadError('network', { name }); }
        if (resp.status === 404) throw new LoadError('notFound', { name });
        if (!resp.ok) throw new LoadError('network', { name });
        return resp.text();
    }

    function loadScript(url, name) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url;
            s.onload = () => { s.remove(); resolve(); };
            s.onerror = () => { s.remove(); reject(new LoadError('notFound', { name })); };
            document.head.appendChild(s);
        });
    }

    const isHttp = () => typeof location !== 'undefined' && /^https?:$/.test(location.protocol);

    async function loadByName(name) {
        if (name.startsWith('disk:')) {
            const key = name.slice(5);
            const data = App.folder && App.folder.get(key);
            if (!data) throw new LoadError('diskAccess', { name: key + '.exam' });
            const exam = finalize(data, key, key + '.exam');
            exam.sourceFile = name; exam.disk = true;
            return exam;
        }
        if (name.startsWith('local:')) {
            const id = name.slice(6);
            const raw = App.library && App.library.get(id);
            if (!raw) throw new LoadError('notFound', { name });
            const exam = finalize(raw, id, name);
            exam.sourceFile = name; exam.local = true;
            return exam;
        }
        const file = name + '.exam';
        let data = null;
        pending = null;
        if (isHttp()) {
            try { data = parseText(await fetchText(file, file)); }
            catch (e) { if (e.code === 'notFound' || e.code === 'parse') { if (!e.name || e.name === 'LoadError' || e.name === 'Error') e.name = file; throw e; } /* network trouble: try the script path */ }
        }
        if (!data) {
            pending = null;
            try { delete window.ExamData; } catch (e) { window.ExamData = undefined; }
            await loadScript(file, file);
            data = pending || window.ExamData;
            try { delete window.ExamData; } catch (e) { window.ExamData = undefined; }
            if (!data) throw new LoadError('noRegister', { name: file });
        }
        return finalize(data, name, file);
    }

    async function loadByUrl(url) {
        let u;
        try { u = new URL(url, location.href); } catch (e) { throw new LoadError('network', { name: url }); }
        if (!/^https?:$/.test(u.protocol)) throw new LoadError('network', { name: url });
        const data = parseText(await fetchText(u.href, url));
        if (!data) throw new LoadError('parse', { name: url, detail: 'not an ExamSim format 2 file' });
        const base = (u.pathname.split('/').pop() || 'remote').replace(/\.exam$|\.json$/g, '').replace(/[^\w.\-]/g, '_');
        return finalize(data, base || 'remote', url);
    }

    // Exam list: exams.js (generated, optional) overrides the list embedded in exam.html at build time.
    // The catalog list built into the page (exams.js / exam.html): used for bundled ids and as the fallback of a served-site check.
    function baseCatalog() {
        if (typeof window === 'undefined') return [];
        if (Array.isArray(window.ExamCatalog) && window.ExamCatalog.length) return window.ExamCatalog;
        return Array.isArray(window.ExamCatalogDefault) ? window.ExamCatalogDefault : [];
    }

    // The start page lists NOTHING until the user presses "Check for exams" (or imports something):
    // `done` flips to true on those actions, `served` holds the list found on the web server.
    const discovery = { done: false, served: [] };
    App.discovery = discovery;
    if (App.events) App.events.on('libraryChange', () => { discovery.done = true; });

    // Over http(s): read the server's exams.js again. Returns the number of exams listed, or -1 when not applicable.
    async function refreshServed() {
        if (!isHttp()) return -1;
        let list = null;
        try {
            const resp = await fetch('exams.js', { cache: 'no-cache' });
            if (resp.ok) { const m = (await resp.text()).match(/window\.ExamCatalog\s*=\s*(\[[\s\S]*\])\s*;?/); if (m) list = JSON.parse(m[1]); }
        } catch (e) { /* offline or no exams.js */ }
        discovery.served = Array.isArray(list) ? list : baseCatalog().slice();
        discovery.done = true;
        return discovery.served.length;
    }

    // What the start page shows. Same id: the fresher source wins (folder > mine > served).
    function catalog() {
        if (!discovery.done) return [];
        const out = [];
        const put = item => { const id = item.id || item.file; const i = out.findIndex(x => (x.id || x.file) === id); if (i >= 0) out[i] = item; else out.push(item); };
        discovery.served.forEach(put);
        (App.library ? App.library.list() : []).forEach(put);
        (App.folder ? App.folder.entries() : []).forEach(put);
        return out;
    }
    // Every id that already exists somewhere (to avoid clashes when creating or importing exams).
    function knownIds() {
        const ids = new Set(baseCatalog().map(c => c.id || c.file));
        discovery.served.concat(App.library ? App.library.list() : [], App.folder ? App.folder.entries() : []).forEach(c => ids.add(c.id || c.file));
        return Array.from(ids);
    }

    // Human-readable message for a load error.
    function describe(err) {
        const T = App.t;
        const name = err.name || '';
        switch (err.code) {
            case 'notFound': return [T('errNotFound', { name })];
            case 'network': return [T('errNetwork', { name })];
            case 'parse': return [T('errParse', { name: name || '', detail: err.detail || '' })];
            case 'noRegister': return [T('errNoRegister', { name })];
            case 'diskAccess': return [T('errDiskAccess', { name })];
            case 'invalid': {
                const lines = (err.report && err.report.errors || []).slice(0, 6).map(e => '• ' + e.path + ': ' + e.message);
                return [T('errInvalid', { name, n: err.report ? err.report.errors.length : '?' })].concat(lines);
            }
            default: return [String(err && err.message || err)];
        }
    }

    return { register, parseText, finalize, loadByName, loadByUrl, catalog, baseCatalog, knownIds, refreshServed, describe, LoadError };
})();

if (typeof window !== 'undefined') window.ExamSim = { register: d => App.loader.register(d), version: App.version, App };
