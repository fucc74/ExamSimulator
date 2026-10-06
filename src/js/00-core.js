/* Core: namespace, utilities, event bus, extension points */
const App = {
    version: '3.0.0',
    FORMAT_VERSION: 2,
    types: {},        // question type handlers (see 20-types.js)
    modeBuilders: {}, // extra study modes registered by plugins
    util: {},
    // Deployment settings. Forks: change supportUrl to your own link, or set it to '' to hide every support button.
    config: { supportUrl: 'https://buymeacoffee.com/gifwebsolutions' }
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
        else if (k === 'for') node.htmlFor = v;
        else if (k.includes('-') || k === 'role') node.setAttribute(k, v);      // aria-*, data-*, role must be attributes, not properties
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

// ---- Icons (inline SVG, stroke style, 24x24). App.util.icon('moon') -> <svg> ----
App.util.ICONS = {
    sun: ['c', 12, 12, 4, 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4'],
    moon: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
    globe: ['c', 12, 12, 10, 'M2 12h20', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'],
    chart: ['M3 3v18h18', 'M7 15l4-4 3 3 5-6'],
    download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
    upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
    flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
    clock: ['c', 12, 12, 10, 'M12 6v6l4 2'],
    check: ['M20 6L9 17l-5-5'],
    x: ['M18 6L6 18M6 6l12 12'],
    play: ['M6 4l14 8-14 8V4z'],
    back: ['M19 12H5M12 19l-7-7 7-7'],
    next: ['M5 12h14M12 5l7 7-7 7'],
    grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
    note: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'],
    book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'],
    refresh: ['M23 4v6h-6', 'M1 20v-6h6', 'M3.5 9a9 9 0 0 1 14.9-3.4L23 10', 'M1 14l4.6 4.4A9 9 0 0 0 20.5 15'],
    trash: ['M3 6h18', 'M19 6l-1 14H6L5 6', 'M10 11v6M14 11v6', 'M9 6V4h6v2'],
    trophy: ['M8 21h8M12 17v4', 'M7 4h10v5a5 5 0 0 1-10 0V4z', 'M17 5h3v2a3 3 0 0 1-3 3', 'M7 5H4v2a3 3 0 0 0 3 3'],
    bolt: ['M13 2L3 14h9l-1 8 10-12h-9l1-8z'],
    target: ['c', 12, 12, 10, 'c', 12, 12, 6, 'c', 12, 12, 2],
    layers: ['M12 2l10 5-10 5L2 7l10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
    star: ['M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9l3-7z'],
    menu: ['M3 6h18M3 12h18M3 18h18'],
    chevron: ['M6 9l6 6 6-6'],
    home: ['M3 10.5L12 3l9 7.5', 'M5 9.5V21h14V9.5'],
    coffee: ['M18 8h1a4 4 0 0 1 0 8h-1', 'M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z', 'M6 1v3', 'M10 1v3', 'M14 1v3'],
    settings: ['c', 12, 12, 3, 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
    search: ['c', 11, 11, 7, 'M21 21l-4.3-4.3']
};
App.util.icon = function (name, size) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size || 18); svg.setAttribute('height', size || 18);
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    svg.classList.add('icon');
    const parts = App.util.ICONS[name] || [];
    for (let i = 0; i < parts.length; i++) {
        if (parts[i] === 'c') {
            const c = document.createElementNS(NS, 'circle');
            c.setAttribute('cx', parts[i + 1]); c.setAttribute('cy', parts[i + 2]); c.setAttribute('r', parts[i + 3]);
            svg.appendChild(c); i += 3;
        } else {
            const p = document.createElementNS(NS, 'path');
            p.setAttribute('d', parts[i]);
            svg.appendChild(p);
        }
    }
    return svg;
};
