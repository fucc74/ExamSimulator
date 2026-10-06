/* Local exam library: exams created with the wizard/editor or imported from a file live in the browser storage
   and appear next to the bundled exams. They are shared by all profiles. */
App.library = (function () {
    const INDEX = 'examsim:lib:index';
    const keyOf = id => 'examsim:lib:' + id;
    const be = () => App.backend || App.defaultBackend();
    const flush = () => { const b = be(); if (b && b.flush) b.flush(); };

    function readIndex() { try { const x = JSON.parse(be().getItem(INDEX)); return Array.isArray(x) ? x : []; } catch (e) { return []; } }
    function writeIndex(list) { be().setItem(INDEX, JSON.stringify(list)); }

    function summary(raw) {
        const topics = new Set((raw.questions || []).map(q => q.topic));
        return { id: raw.id, title: raw.title, description: raw.description, code: raw.code, version: raw.version,
            questionCount: (raw.questions || []).length, topicCount: topics.size, updated: Date.now() };
    }

    const api = {
        // Catalog entries in the same shape as the bundled catalog.
        list() { return readIndex().map(s => Object.assign({}, s, { file: 'local:' + s.id, local: true })); },
        has: id => readIndex().some(s => s.id === id),
        get(id) { try { return JSON.parse(be().getItem(keyOf(id))); } catch (e) { return null; } },
        // A free id: appends -2, -3… when taken by a bundled or local exam.
        freeId(wanted, takenByCatalog) {
            let base = String(wanted || 'my-exam').toLowerCase().replace(/[^\w.\-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'my-exam', id = base, n = 2;
            const taken = new Set((takenByCatalog || []).concat(readIndex().map(s => s.id)));
            while (taken.has(id)) id = base + '-' + (n++);
            return id;
        },
        // Validates and stores an exam (raw format-2 object). Returns {ok, report, id}.
        save(raw) {
            const prepared = App.schema.prepare(raw, raw && raw.id);
            if (!prepared.exam) return { ok: false, report: prepared.report };
            const clean = App.util.clone(raw);
            clean.format = App.FORMAT_VERSION;
            try { be().setItem(keyOf(clean.id), JSON.stringify(clean)); } catch (e) { App.events.emit('storageError', e); return { ok: false, report: prepared.report, error: e }; }
            const idx = readIndex().filter(s => s.id !== clean.id);
            idx.push(summary(clean));
            writeIndex(idx);
            flush();
            App.events.emit('libraryChange', { id: clean.id });
            return { ok: true, report: prepared.report, id: clean.id };
        },
        remove(id) {
            be().removeItem(keyOf(id));
            writeIndex(readIndex().filter(s => s.id !== id));
            flush();
            App.events.emit('libraryChange', { id });
        },
        exportAll() { const out = {}; readIndex().forEach(s => { const e = api.get(s.id); if (e) out[s.id] = e; }); return out; },
        // Adds exams from a snapshot without overwriting newer local copies. Returns how many were added/updated.
        importAll(map) {
            let n = 0;
            Object.keys(map || {}).forEach(id => {
                const inc = map[id];
                if (!inc || typeof inc !== 'object') return;
                const cur = api.get(id);
                const better = !cur || (String(inc.version || '') > String(cur.version || '')) || (inc.questions || []).length > (cur.questions || []).length;
                if (better && api.save(Object.assign({}, inc, { id })).ok) n++;
            });
            return n;
        },
        // Serializes a raw exam as a .exam file
        toFileText(raw) { return 'ExamSim.register(' + JSON.stringify(raw, null, 1) + ');\n'; }
    };
    return api;
})();
