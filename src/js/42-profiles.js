/* Profiles: several people (or goals) on one device, each with separate progress.
   "default" keeps the original storage key so existing data is untouched. */
App.profiles = (function () {
    const META = 'examsim:profiles';
    const backend = () => App.backend || App.defaultBackend();

    function read() {
        let m = null;
        try { m = JSON.parse(backend().getItem(META)); } catch (e) { m = null; }
        if (!m || !Array.isArray(m.list) || !m.list.length) m = { v: 1, current: 'default', list: [{ id: 'default', name: 'Default', created: Date.now() }] };
        if (!m.list.some(p => p.id === m.current)) m.current = m.list[0].id;
        return m;
    }
    function write(m) { try { backend().setItem(META, JSON.stringify(m)); } catch (e) { App.events.emit('storageError', e); } }

    const keyOf = id => id === 'default' ? 'examsim:v2' : 'examsim:v2:p:' + id;

    const api = {
        keyOf,
        list: () => read().list,
        current: () => read().current,
        currentProfile: () => { const m = read(); return m.list.find(p => p.id === m.current); },
        // Points App.storage at a profile's data.
        use(id) {
            const m = read();
            if (!m.list.some(p => p.id === id)) id = m.current;
            m.current = id; write(m);
            App.storage = App.createStorage(backend(), { key: keyOf(id) });
            App.events.emit('profileChange', { id });
            return App.storage;
        },
        create(name) {
            const m = read();
            name = String(name || '').trim().slice(0, 40) || ('Profile ' + (m.list.length + 1));
            const id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
            m.list.push({ id, name, created: Date.now() });
            write(m);
            return id;
        },
        rename(id, name) {
            const m = read(); const p = m.list.find(x => x.id === id);
            if (p) { p.name = String(name || '').trim().slice(0, 40) || p.name; write(m); }
        },
        remove(id) {
            const m = read();
            if (m.list.length <= 1) return false;
            m.list = m.list.filter(p => p.id !== id);
            try { backend().removeItem(keyOf(id)); } catch (e) { /* ignore */ }
            if (m.current === id) m.current = m.list[0].id;
            write(m);
            if (App.storage.key === keyOf(id)) App.profiles.use(m.current);
            return true;
        },
        reset() { try { backend().removeItem(META); } catch (e) { /* ignore */ } App.profiles.use('default'); }
    };
    return api;
})();
