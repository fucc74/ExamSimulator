/* Backup and sync: snapshots, transfer codes, backup reminder, auto-backup file, private GitHub Gist sync.
   Everything here is opt-in; nothing leaves the device unless the user starts it. */
App.backup = (function () {
    const GIST_FILE = 'examsim-backup.json';
    const GIST_KEY = 'examsim:gist';
    const PORTABLE_PREFS = ['scoring', 'examRules', 'backupRemindDays'];
    const rawBackend = () => App.backend || App.defaultBackend();

    // ---- snapshot of the current profile (+ optionally the local exam library) ----
    function snapshot(opts) {
        opts = opts || {};
        const data = App.storage.exportData(opts.examIds);
        const prefs = {};
        PORTABLE_PREFS.forEach(k => { if (data.prefs && data.prefs[k] !== undefined) prefs[k] = data.prefs[k]; });
        data.prefs = prefs;
        if (opts.library && App.library) data.library = App.library.exportAll();
        if (opts.sessions === false) Object.keys(data.exams).forEach(id => { data.exams[id] = Object.assign({}, data.exams[id], { sessions: {} }); });
        return data;
    }

    // Merges a snapshot into the current profile. Returns counts.
    function apply(obj) {
        const r = App.storage.importData(obj);
        r.library = 0;
        if (obj.library && App.library) r.library = App.library.importAll(obj.library);
        const prefs = obj.prefs || {};
        PORTABLE_PREFS.forEach(k => { if (prefs[k] !== undefined && App.storage.getPref(k) === undefined) App.storage.setPref(k, prefs[k]); });
        return r;
    }

    // ---- transfer code: gzip + base64url, safe to paste into a chat or a note ----
    function toB64(bytes) {
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function fromB64(str) {
        const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
        const out = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
        return out;
    }
    async function pipe(bytes, stream) {
        const body = new Blob([bytes]).stream().pipeThrough(stream);
        return new Uint8Array(await new Response(body).arrayBuffer());
    }
    const canGzip = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

    async function encode(obj) {
        const bytes = new TextEncoder().encode(JSON.stringify(obj));
        if (canGzip()) return 'ES1.' + toB64(await pipe(bytes, new CompressionStream('gzip')));
        return 'ES0.' + toB64(bytes);
    }
    async function decode(code) {
        const m = String(code || '').trim().replace(/\s+/g, '').match(/^(ES[01])\.([\w\-]+)$/);
        if (!m) throw new Error('not an ExamSim transfer code');
        let bytes = fromB64(m[2]);
        if (m[1] === 'ES1') {
            if (!canGzip()) throw new Error('this browser cannot read compressed codes');
            try { bytes = await pipe(bytes, new DecompressionStream('gzip')); } catch (e) { throw new Error('the code is damaged or incomplete'); }
        }
        let obj;
        try { obj = JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { throw new Error('the code is damaged or incomplete'); }
        return obj;
    }

    // ---- backup reminder ----
    function markBackup(now) { App.storage.setPref('lastBackup', now || Date.now()); }
    function lastBackup() { return Number(App.storage.getPref('lastBackup')) || 0; }
    function remindDays() { const d = App.storage.getPref('backupRemindDays'); return d === undefined || d === '' ? 14 : Number(d); }
    // True when there is progress worth protecting and no backup was made for `remindDays` days.
    function due(now) {
        now = now || Date.now();
        const days = remindDays();
        if (!(days > 0)) return false;
        if ((Number(App.storage.getPref('backupSnooze')) || 0) > now) return false;
        let oldest = Infinity, any = false;
        App.storage.examIds().forEach(id => App.storage.listAttempts(id).forEach(a => { any = true; oldest = Math.min(oldest, a.ts); }));
        if (!any) return false;
        const base = lastBackup() || oldest;
        return now - base > days * 86400000;
    }
    function snooze(days, now) { App.storage.setPref('backupSnooze', (now || Date.now()) + (days || 3) * 86400000); }

    // ---- GitHub Gist sync (private gist, token stays on this device, never exported) ----
    function gistConfig() { try { return JSON.parse(rawBackend().getItem(GIST_KEY)) || {}; } catch (e) { return {}; } }
    function setGistConfig(c) { rawBackend().setItem(GIST_KEY, JSON.stringify(c || {})); if (rawBackend().flush) rawBackend().flush(); }
    async function gistFetch(method, path, token, body) {
        let resp;
        try {
            resp = await fetch('https://api.github.com' + path, {
                method, headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined
            });
        } catch (e) { throw new Error('network error'); }
        if (resp.status === 401) throw new Error('GitHub refused the token (401)');
        if (resp.status === 404) throw new Error('gist not found (404) — check the id and that the token has the "gist" permission');
        if (!resp.ok) throw new Error('GitHub answered ' + resp.status);
        return resp.json();
    }
    async function gistPull(cfg) {
        const g = await gistFetch('GET', '/gists/' + encodeURIComponent(cfg.id), cfg.token);
        const f = g.files && g.files[GIST_FILE];
        if (!f) throw new Error('the gist has no ' + GIST_FILE);
        let content = f.content;
        if (f.truncated && f.raw_url) { const r = await fetch(f.raw_url); content = await r.text(); }
        try { return JSON.parse(content); } catch (e) { throw new Error('the gist content is not valid JSON'); }
    }
    async function gistPush(cfg, data) {
        const files = {}; files[GIST_FILE] = { content: JSON.stringify(data) };
        if (cfg.id) { await gistFetch('PATCH', '/gists/' + encodeURIComponent(cfg.id), cfg.token, { files }); return cfg.id; }
        const g = await gistFetch('POST', '/gists', cfg.token, { description: 'ExamSim backup', public: false, files });
        return g.id;
    }
    // Pull (merge) then push. Returns {pulled, pushed, id}.
    async function syncGist(opts) {
        const cfg = Object.assign({}, gistConfig());
        if (!cfg.token) throw new Error('no GitHub token configured');
        let pulled = null;
        if (cfg.id) pulled = apply(await gistPull(cfg));
        cfg.id = await gistPush(cfg, snapshot({ library: !opts || opts.library !== false, sessions: false }));
        cfg.last = Date.now();
        setGistConfig(cfg);
        markBackup();
        return { pulled, id: cfg.id };
    }

    // ---- auto-backup to a file chosen by the user (File System Access API, Chromium browsers) ----
    const fsSupported = () => typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
    function fsDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('examsim-fs', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('h');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    async function fsGet() { try { const db = await fsDb(); return await new Promise(r => { const q = db.transaction('h').objectStore('h').get('file'); q.onsuccess = () => r(q.result || null); q.onerror = () => r(null); }); } catch (e) { return null; } }
    async function fsPut(h) { const db = await fsDb(); await new Promise((res, rej) => { const t = db.transaction('h', 'readwrite'); if (h) t.objectStore('h').put(h, 'file'); else t.objectStore('h').delete('file'); t.oncomplete = res; t.onerror = rej; }); }
    async function chooseAutoFile() {
        const h = await window.showSaveFilePicker({ suggestedName: 'examsim-backup.json', types: [{ description: 'ExamSim backup', accept: { 'application/json': ['.json'] } }] });
        await fsPut(h);
        await writeAuto();
        return h.name;
    }
    async function autoFileName() { const h = await fsGet(); return h ? h.name : null; }
    async function disableAutoFile() { await fsPut(null); }
    // Writes the backup if a file was chosen and permission is still granted. Never prompts.
    async function writeAuto() {
        if (!fsSupported()) return false;
        const h = await fsGet();
        if (!h) return false;
        try {
            if (h.queryPermission && (await h.queryPermission({ mode: 'readwrite' })) !== 'granted') return false;
            const w = await h.createWritable();
            await w.write(JSON.stringify(snapshot({ library: true, sessions: false })));
            await w.close();
            markBackup();
            return true;
        } catch (e) { return false; }
    }

    return { snapshot, apply, encode, decode, canGzip, markBackup, lastBackup, remindDays, due, snooze, gistConfig, setGistConfig, syncGist, gistPull, gistPush, fsSupported, chooseAutoFile, autoFileName, disableAutoFile, writeAuto, PORTABLE_PREFS };
})();
