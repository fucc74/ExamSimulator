/* IndexedDB storage backend: far larger quota than localStorage.
   The whole key/value set is loaded into memory at start-up, so the storage API stays synchronous;
   writes are sent to IndexedDB in the background right after each change (and again when the page is hidden). */
App.createIdbBackend = function (dbName) {
    dbName = dbName || 'examsim';
    const mem = new Map();
    const dirty = new Map();           // key -> string | null (null = delete)
    let db = null, timer = null, flushing = Promise.resolve();

    function open() {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB is not available')); return; }
            const req = indexedDB.open(dbName, 1);
            req.onupgradeneeded = () => { req.result.createObjectStore('kv'); };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('IndexedDB error'));
            req.onblocked = () => reject(new Error('IndexedDB blocked'));
        });
    }
    function tx(mode) { return db.transaction('kv', mode).objectStore('kv'); }

    function loadAll() {
        return new Promise((resolve, reject) => {
            const out = [];
            const req = tx('readonly').openCursor();
            req.onsuccess = () => { const c = req.result; if (c) { out.push([c.key, c.value]); c.continue(); } else resolve(out); };
            req.onerror = () => reject(req.error);
        });
    }

    function flush() {
        clearTimeout(timer); timer = null;
        if (!db || !dirty.size) return flushing;
        const batch = Array.from(dirty.entries());
        dirty.clear();
        flushing = flushing.then(() => new Promise(resolve => {
            try {
                const t = db.transaction('kv', 'readwrite');
                const st = t.objectStore('kv');
                batch.forEach(([k, v]) => { if (v === null) st.delete(k); else st.put(v, k); });
                t.oncomplete = () => resolve();
                t.onerror = t.onabort = () => { batch.forEach(([k, v]) => { if (!dirty.has(k)) dirty.set(k, v); }); App.events.emit('storageError', t.error); resolve(); };
            } catch (e) { App.events.emit('storageError', e); resolve(); }
        }));
        return flushing;
    }
    // writes are coalesced within the same tick and sent to IndexedDB immediately (no delay that a closing tab could cut)
    let queued = false;
    const schedule = () => { if (queued) return; queued = true; Promise.resolve().then(() => { queued = false; flush(); }); };

    const backend = {
        kind: 'indexeddb',
        getItem: k => (mem.has(k) ? mem.get(k) : null),
        setItem(k, v) { mem.set(k, String(v)); dirty.set(k, String(v)); schedule(); },
        removeItem(k) { mem.delete(k); dirty.set(k, null); schedule(); },
        keys: () => Array.from(mem.keys()),
        flush,
        // Opens the database, loads everything and imports data left in localStorage by earlier versions (once).
        async init() {
            db = await open();
            (await loadAll()).forEach(([k, v]) => mem.set(k, v));
            if (!mem.has('__migrated')) {
                try {
                    const ls = window.localStorage;
                    for (let i = 0; i < ls.length; i++) {
                        const k = ls.key(i);
                        if (/^(examsim:|exam_)/.test(k) && !mem.has(k)) { mem.set(k, ls.getItem(k)); dirty.set(k, ls.getItem(k)); }
                    }
                } catch (e) { /* localStorage unavailable: nothing to migrate */ }
                mem.set('__migrated', '1'); dirty.set('__migrated', '1');
                await flush();
            }
            const hide = () => { flush(); };
            document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') hide(); });
            window.addEventListener('pagehide', hide);
            return backend;
        },
        // Removes every stored key (used by "delete all data")
        async clear() {
            mem.clear(); dirty.clear(); clearTimeout(timer); timer = null;
            await flushing;
            await new Promise(resolve => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').clear(); t.oncomplete = t.onerror = t.onabort = () => resolve(); });
            mem.set('__migrated', '1'); dirty.set('__migrated', '1');
            await flush();
        }
    };
    return backend;
};

/* Chooses the best available backend: IndexedDB, then localStorage, then memory. */
App.initStorage = async function () {
    let backend = null;
    try {
        backend = await Promise.race([App.createIdbBackend().init(), new Promise((_, rej) => setTimeout(() => rej(new Error('IndexedDB timeout')), 4000))]);
        App.storageKind = 'indexeddb';
    } catch (e) {
        backend = App.defaultBackend();
        App.storageKind = backend === (typeof window !== 'undefined' && window.localStorage) ? 'localStorage' : 'memory';
    }
    App.backend = backend;
    App.profiles.use(App.profiles.current());
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* optional */ }
    return backend;
};

App.storageUsage = async function () {
    try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); return { used: e.usage || 0, quota: e.quota || 0 }; } } catch (e) { /* ignore */ }
    return null;
};

// Wipes everything (all profiles). Used by "delete all data" and by tests.
App.wipeAll = async function () {
    if (App.backend && App.backend.clear) await App.backend.clear();
    else if (App.backend) { ['examsim:profiles'].concat(App.profiles.list().map(p => App.profiles.keyOf(p.id))).forEach(k => App.backend.removeItem(k)); }
    try { Object.keys(localStorage).filter(k => /^(examsim:|exam_)/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) { /* ignore */ }
    App.profiles.reset();
};
