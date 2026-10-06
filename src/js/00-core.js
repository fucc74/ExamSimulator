/* Core: namespace, utilities, event bus, extension points */
const App = {
    version: '2.0.0',
    FORMAT_VERSION: 2,
    types: {},        // question type handlers (see 20-types.js)
    modeBuilders: {}, // extra study modes registered by plugins
    util: {}
};

App.util.shuffle = function (arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

App.util.sameSet = function (a, b) {
    const x = [...a].sort((p, q) => p - q), y = [...b].sort((p, q) => p - q);
    return x.length === y.length && x.every((v, i) => v === y[i]);
};

App.util.clone = o => JSON.parse(JSON.stringify(o));
App.util.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
App.util.clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
App.util.isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Builds a DOM element. Text always goes through textContent (never innerHTML).
App.util.el = function (tag, props, ...children) {
    const node = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        if (k === 'text') node.textContent = v;
        else if (k === 'style') node.style.cssText = v;
        else if (k === 'class') node.className = v;
        else if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => { node.dataset[dk] = dv; });
        else if (k === 'aria') Object.entries(v).forEach(([ak, av]) => node.setAttribute('aria-' + ak, av));
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node[k] = v;
    });
    children.flat().forEach(c => { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
};

// Tiny event bus: App.events.on('answer', fn) ... App.events.emit('answer', payload)
App.events = (function () {
    const handlers = {};
    return {
        on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); return () => this.off(name, fn); },
        off(name, fn) { handlers[name] = (handlers[name] || []).filter(h => h !== fn); },
        emit(name, payload) {
            (handlers[name] || []).slice().forEach(fn => {
                try { fn(payload); } catch (e) { if (typeof console !== 'undefined') console.error('[ExamSim] handler error for "' + name + '":', e); }
            });
        }
    };
})();

// Extension points
App.registerType = function (name, handler) { App.types[name] = handler; };
App.registerMode = function (id, builder) { App.modeBuilders[id] = builder; };
