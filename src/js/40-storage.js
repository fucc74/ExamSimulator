/* Versioned local storage: preferences, in-progress sessions, attempt history, per-question stats.
   Everything lives under one key ("examsim:v2") so it can be exported/imported as a single file. */
App.memoryBackend = function () {
    const m = {};
    return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
};

App.defaultBackend = function () {
    try {
        const ls = window.localStorage;
        const k = '__examsim_probe__';
        ls.setItem(k, '1'); ls.removeItem(k);
        return ls;
    } catch (e) { return App.memoryBackend(); }
};

App.createStorage = function (backend) {
    const KEY = 'examsim:v2';
    const MAX_ATTEMPTS = 500, MAX_SESSIONS = 10;
    let db = null;

    const empty = () => ({ v: 2, prefs: {}, exams: {} });

    function migrate(data) {
        if (!data || typeof data !== 'object') return empty();
        // Future versions: add `if (data.v < 3) {...}` steps here.
        if (!data.prefs) data.prefs = {};
        if (!data.exams) data.exams = {};
        data.v = 2;
        return data;
    }

    function load() {
        let raw = null;
        try { raw = backend.getItem(KEY); } catch (e) { raw = null; }
        try { db = migrate(raw ? JSON.parse(raw) : null); } catch (e) { db = empty(); }
        return db;
    }
    function ensure() { return db || load(); }

    function save() {
        try { backend.setItem(KEY, JSON.stringify(ensure())); return true; }
        catch (e) { App.events.emit('storageError', e); return false; }
    }

    function bucket(examId) {
        const d = ensure();
        if (!d.exams[examId]) d.exams[examId] = { attempts: [], sessions: {}, qstats: {} };
        return d.exams[examId];
    }

    const api = {
        reload: load,
        raw: () => ensure(),

        // ---- preferences (falls back to the keys used by earlier versions) ----
        getPref(k) {
            const v = ensure().prefs[k];
            if (v !== undefined) return v;
            try { const old = backend.getItem('exam_' + k); return old === null ? undefined : old; } catch (e) { return undefined; }
        },
        setPref(k, v) { ensure().prefs[k] = v; return save(); },

        // ---- sessions in progress ----
        saveSession(examId, session) {
            const b = bucket(examId);
            session.updatedAt = Date.now();
            b.sessions[session.id] = session;
            const ids = Object.keys(b.sessions).sort((x, y) => b.sessions[y].updatedAt - b.sessions[x].updatedAt);
            ids.slice(MAX_SESSIONS).forEach(id => delete b.sessions[id]);
            return save();
        },
        getSession(examId, id) { return bucket(examId).sessions[id] || null; },
        listSessions(examId) {
            const s = bucket(examId).sessions;
            return Object.keys(s).map(k => s[k]).sort((a, b) => b.updatedAt - a.updatedAt);
        },
        deleteSession(examId, id) { delete bucket(examId).sessions[id]; return save(); },

        // ---- attempts ----
        addAttempt(examId, attempt) {
            const b = bucket(examId);
            b.attempts.push(attempt);
            if (b.attempts.length > MAX_ATTEMPTS) b.attempts.splice(0, b.attempts.length - MAX_ATTEMPTS);
            return save();
        },
        listAttempts(examId) { return bucket(examId).attempts.slice(); },

        // ---- per-question stats / flags / notes ----
        getQStat(examId, uid) { return bucket(examId).qstats[uid] || null; },
        allQStats(examId) { return bucket(examId).qstats; },
        patchQStat(examId, uid, fn) {
            const b = bucket(examId);
            const cur = b.qstats[uid] || { seen: 0, correct: 0, wrong: 0, box: 0, due: 0, last: 0, lastOk: null, time: 0, flag: false, note: '' };
            const next = fn(cur) || cur;
            b.qstats[uid] = next;
            return save();
        },

        // ---- maintenance ----
        clearExam(examId) { delete ensure().exams[examId]; return save(); },
        examIds() { return Object.keys(ensure().exams); },

        exportData(examIds) {
            const d = ensure();
            const out = { app: 'examsim', v: 2, exportedAt: new Date().toISOString(), prefs: d.prefs, exams: {} };
            (examIds || Object.keys(d.exams)).forEach(id => { if (d.exams[id]) out.exams[id] = d.exams[id]; });
            return out;
        },

        // Merges an exported file into the current data. Returns {attempts, qstats} counts or throws.
        importData(obj) {
            if (!obj || obj.app !== 'examsim' || typeof obj.exams !== 'object') throw new Error('not an ExamSim export file');
            if (obj.v > 2) throw new Error('export was made by a newer version (v' + obj.v + ')');
            let attempts = 0, qstats = 0;
            Object.keys(obj.exams).forEach(id => {
                const src = obj.exams[id] || {};
                const b = bucket(id);
                const known = new Set(b.attempts.map(a => a.id));
                (src.attempts || []).forEach(a => { if (a && a.id && !known.has(a.id)) { b.attempts.push(a); attempts++; } });
                b.attempts.sort((x, y) => x.ts - y.ts);
                Object.keys(src.qstats || {}).forEach(uid => {
                    const inc = src.qstats[uid], cur = b.qstats[uid];
                    if (!cur || (inc.last || 0) > (cur.last || 0)) {
                        // keep user-authored data if the winner lacks it
                        const merged = Object.assign({}, inc);
                        if (cur) { merged.note = inc.note || cur.note || ''; merged.flag = inc.flag || cur.flag || false; }
                        b.qstats[uid] = merged; qstats++;
                    } else if (inc.note && !cur.note) { cur.note = inc.note; }
                });
                Object.keys(src.sessions || {}).forEach(sid => { if (!b.sessions[sid]) b.sessions[sid] = src.sessions[sid]; });
            });
            save();
            return { attempts, qstats };
        }
    };
    return api;
};

App.storage = App.createStorage(App.defaultBackend());
