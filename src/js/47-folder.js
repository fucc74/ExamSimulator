/* Finding exams on disk.
   1) Folder access (File System Access API, Chromium browsers): the user picks a folder once, the browser remembers it,
      and "Check for exams" re-reads the .exam files in it — no build step. Cards come straight from the files.
   2) Folder import (any browser): pick a folder, every .exam in it is copied into the local library.
   Both share the same reader, which validates each file and reports the ones it cannot use. */
App.folder = (function () {
    const state = { name: null, access: 'none', count: 0, bad: [], at: 0 };   // access: none | granted | prompt | denied
    let handle = null, entries = [], cache = new Map();

    const supported = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
    const baseName = n => String(n).replace(/\.exam$/i, '');

    // ---- remembered folder handle (IndexedDB, separate tiny database) ----
    function db() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('examsim-fs', 1);
            req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('h')) req.result.createObjectStore('h'); };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    async function load() { try { const d = await db(); return await new Promise(r => { const q = d.transaction('h').objectStore('h').get('dir'); q.onsuccess = () => r(q.result || null); q.onerror = () => r(null); }); } catch (e) { return null; } }
    async function store(h) {
        try { const d = await db(); await new Promise((res, rej) => { const t = d.transaction('h', 'readwrite'); if (h) t.objectStore('h').put(h, 'dir'); else t.objectStore('h').delete('dir'); t.oncomplete = res; t.onerror = t.onabort = rej; }); return true; }
        catch (e) { return false; }      // not clonable (tests) or storage blocked: the folder is then remembered for this visit only
    }

    // ---- reading ----
    // files: [{name, text}] -> {ok: [{name, key, data, exam}], bad: [{name, message}]}
    function readFiles(files) {
        const ok = [], bad = [];
        files.forEach(f => {
            const key = baseName(f.name);
            try {
                const data = App.loader.parseText(f.text);
                if (!data) throw new App.loader.LoadError('parse', { detail: 'not an ExamSim file' });
                const { exam, report } = App.schema.prepare(data, key);
                if (!exam) { bad.push({ name: f.name, message: report.errors.slice(0, 3).map(e => e.path + ': ' + e.message).join(' · ') }); return; }
                ok.push({ name: f.name, key, data, exam });
            } catch (e) {
                bad.push({ name: f.name, message: e instanceof App.loader.LoadError ? App.loader.describe(Object.assign(e, { name: f.name })).join(' ') : String(e && e.message || e) });
            }
        });
        return { ok, bad };
    }

    const entryOf = x => ({
        id: x.exam.id, file: 'disk:' + x.key, title: x.exam.title, description: x.exam.description, code: x.exam.code, version: x.exam.version,
        questionCount: x.exam.questions.length, topicCount: x.exam.topicList.length, disk: true
    });

    async function scan() {
        const files = [], unreadable = [];
        for await (const [name, h] of handle.entries()) {
            if (h.kind !== 'file' || !/\.exam$/i.test(name)) continue;
            try { files.push({ name, text: await (await h.getFile()).text() }); } catch (e) { unreadable.push({ name, message: String(e && e.message || e) }); }
        }
        files.sort((a, b) => a.name.localeCompare(b.name));
        const r = readFiles(files);
        entries = r.ok.map(entryOf);
        cache = new Map(r.ok.map(x => [x.key, x.data]));
        state.count = entries.length; state.bad = r.bad.concat(unreadable); state.at = Date.now(); state.name = handle.name;
        App.events.emit('catalogChange', { source: 'folder' });
        return { found: entries.length, bad: state.bad };
    }

    async function permission(ask) {
        if (!handle.queryPermission) return 'granted';
        const o = { mode: 'read' };
        let p = await handle.queryPermission(o);
        if (p !== 'granted' && ask && handle.requestPermission) p = await handle.requestPermission(o);
        return p;
    }

    const api = {
        supported, state,
        entries: () => entries,
        get: key => cache.get(key) || null,
        hasFolder: () => !!handle,
        readFiles,

        // At start-up: use the remembered folder when the browser still allows it without asking.
        async restore() {
            if (!supported()) return false;
            handle = await load();
            if (!handle) return false;
            state.name = handle.name;
            state.access = await permission(false).catch(() => 'prompt');
            if (state.access === 'granted') { try { await scan(); } catch (e) { state.access = 'prompt'; } }
            return state.access === 'granted';
        },
        // Uses a directory handle (also what the tests pass in). Remembers it when possible.
        async useHandle(h) {
            handle = h; state.name = h.name; state.access = 'granted';
            await store(h);
            return scan();
        },
        async choose() {
            const h = await window.showDirectoryPicker({ id: 'examsim', mode: 'read' });
            return api.useHandle(h);
        },
        // The "Check for exams" button: ask permission again if needed, then re-read the folder.
        async rescan() {
            if (!handle) return api.choose();
            state.access = await permission(true);
            if (state.access !== 'granted') { state.access = 'denied'; throw new Error('denied'); }
            return scan();
        },
        async forget() { handle = null; entries = []; cache = new Map(); state.name = null; state.access = 'none'; state.count = 0; state.bad = []; await store(null); App.events.emit('catalogChange', { source: 'folder' }); },

        // Fallback for every browser: copies the exams found in `files` into the local library.
        // Exams already bundled with the app (same id) are skipped; exams already in the library are updated.
        importFiles(files) {
            const r = readFiles(files);
            const bundled = new Set((App.loader.baseCatalog() || []).map(c => c.id || c.file));
            const out = { added: 0, updated: 0, bundled: 0, bad: r.bad.slice() };
            r.ok.forEach(x => {
                const id = x.exam.id;
                if (bundled.has(id)) { out.bundled++; return; }
                const existed = App.library.has(id);
                const raw = Object.assign({}, x.data.format === undefined ? App.schema.fromLegacy(x.data, x.key) : x.data, { id });
                const res = App.library.save(raw);
                if (res.ok) { if (existed) out.updated++; else out.added++; }
                else out.bad.push({ name: x.name, message: res.report.errors.slice(0, 2).map(e => e.path + ': ' + e.message).join(' · ') });
            });
            return out;
        }
    };
    return api;
})();
