/* UI: shared state, view switching, toast, theme/language, header, small widgets. */
App.state = { exam: null, session: null, screen: 'picker', loadError: null, lastResult: null, dash: {}, clockTimer: null, persistTimer: null };
App.ui = {};

(function () {
    const { el, icon } = App.util;
    const $ = id => document.getElementById(id);
    App.ui.$ = $;

    const VIEWS = ['picker', 'dashboard', 'runtime', 'review', 'summary', 'stats', 'options', 'library', 'search'];
    App.ui.show = function (view) {
        App.state.screen = view;
        VIEWS.forEach(v => $('view-' + v).classList.toggle('hidden', v !== view));
        document.body.dataset.view = view;
        window.scrollTo(0, 0);
        App.events.emit('viewChange', { view });
    };

    App.ui.toast = function (msg, ms) {
        const node = el('div', { class: 'toast-msg', text: msg });
        $('toast').appendChild(node);
        setTimeout(() => node.remove(), ms || 3500);
    };
    App.events.on('storageError', () => App.ui.toast(App.t('storageError'), 6000));

    App.ui.fmtTime = function (sec) {
        sec = Math.max(0, Math.round(sec));
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
        const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
        return h ? h + ':' + mm + ':' + ss : mm + ':' + ss;
    };

    App.ui.timeAgo = function (ts) {
        const d = (Date.now() - ts) / 1000;
        if (d < 60) return App.t('justNow');
        if (d < 3600) return App.t('minutesAgo', { n: Math.round(d / 60) });
        if (d < 86400) return App.t('hoursAgo', { n: Math.round(d / 3600) });
        return App.t('daysAgo', { n: Math.round(d / 86400) });
    };

    // Button with an icon and a text label
    App.ui.btn = function (label, iconName, cls, onclick, extra) {
        return el('button', Object.assign({ type: 'button', class: 'btn ' + (cls || ''), onclick }, extra || {}), iconName ? icon(iconName, 17) : null, label ? el('span', { text: label }) : null);
    };

    // Circular progress ring (SVG). Returns {svg}; animates from empty.
    App.ui.ring = function (pct, color, size, stroke) {
        const NS = 'http://www.w3.org/2000/svg';
        const r = 52, c = 2 * Math.PI * r;
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 120 120');
        svg.setAttribute('aria-hidden', 'true');
        const mk = (cls, stk) => {
            const circ = document.createElementNS(NS, 'circle');
            circ.setAttribute('cx', 60); circ.setAttribute('cy', 60); circ.setAttribute('r', r);
            circ.setAttribute('fill', 'none'); circ.setAttribute('stroke-width', stroke || 10); circ.setAttribute('stroke-linecap', 'round');
            circ.setAttribute('class', cls); if (stk) circ.setAttribute('stroke', stk);
            return circ;
        };
        const bg = mk('ring-bg'); bg.setAttribute('stroke', 'currentColor'); bg.style.opacity = '0.18';
        const fg = mk('ring-fg', color);
        fg.setAttribute('stroke-dasharray', c); fg.setAttribute('stroke-dashoffset', c);
        svg.appendChild(bg); svg.appendChild(fg);
        requestAnimationFrame(() => requestAnimationFrame(() => fg.setAttribute('stroke-dashoffset', c * (1 - Math.max(0, Math.min(100, pct)) / 100))));
        return svg;
    };

    // ---- language / theme are per device: stored outside the profile data ----
    const UI_KEY = 'examsim:ui';
    const rawBackend = () => App.backend || App.defaultBackend();
    // Language and theme are also mirrored in localStorage: it is synchronous, so the choice survives even a reload right after the click.
    App.ui.getGlobal = function (k) {
        try { const m = localStorage.getItem('examsim:ui:' + k); if (m) return m; } catch (e) { /* storage blocked */ }
        try { const o = JSON.parse(rawBackend().getItem(UI_KEY)) || {}; if (o[k] !== undefined) return o[k]; } catch (e) { /* fall through */ }
        return App.storage.getPref(k);
    };
    App.ui.setGlobal = function (k, v) {
        let o = {};
        try { o = JSON.parse(rawBackend().getItem(UI_KEY)) || {}; } catch (e) { o = {}; }
        o[k] = v;
        try { localStorage.setItem('examsim:ui:' + k, v); } catch (e) { /* mirror is optional */ }
        try { rawBackend().setItem(UI_KEY, JSON.stringify(o)); if (rawBackend().flush) rawBackend().flush(); } catch (e) { App.events.emit('storageError', e); }
    };

    // ---- modal dialog ----
    // App.ui.modal({title, body: Node, actions: [{label, cls, onclick, close:true}], wide}) -> {close, root}
    App.ui.modal = function (opts) {
        const prev = document.activeElement;
        const titleId = 'modal-title-' + App.util.uid();
        const root = el('div', { class: 'modal-backdrop', onclick: e => { if (e.target === root) close(); } });
        const card = el('div', { class: 'modal-card' + (opts.wide ? ' wide' : ''), role: 'dialog', aria: { modal: 'true', labelledby: titleId } });
        card.appendChild(el('div', { class: 'modal-head' }, el('h2', { id: titleId, text: opts.title || '' }),
            el('button', { type: 'button', class: 'icon-btn', 'aria-label': App.t('closeBtn'), onclick: () => close() }, icon('x', 18))));
        const body = el('div', { class: 'modal-body' }, opts.body);
        card.appendChild(body);
        if (opts.actions && opts.actions.length) {
            const bar = el('div', { class: 'modal-actions' });
            opts.actions.forEach(a => bar.appendChild(App.ui.btn(a.label, a.icon, a.cls || '', () => { if (a.onclick) { if (a.onclick() === false) return; } if (a.close !== false) close(); })));
            card.appendChild(bar);
        }
        root.appendChild(card);
        document.body.appendChild(root);
        function onKey(e) {
            if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
            if (e.key === 'Tab') {      // keep focus inside the dialog
                const f = Array.from(card.querySelectorAll('button:not(:disabled), input:not(:disabled), select, textarea, a[href], [tabindex]:not([tabindex="-1"])')).filter(n => n.offsetParent !== null);
                if (!f.length) return;
                const first = f[0], last = f[f.length - 1];
                if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
                else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
            }
        }
        document.addEventListener('keydown', onKey, true);
        function close() {
            document.removeEventListener('keydown', onKey, true);
            root.remove();
            if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* element gone */ } }
            if (opts.onclose) opts.onclose();
        }
        const firstField = card.querySelector('input, textarea, select') || card.querySelector('.modal-actions button, .modal-head button');
        if (firstField) setTimeout(() => firstField.focus(), 0);
        return { close, root, card };
    };
    App.ui.modalOpen = () => !!document.querySelector('.modal-backdrop');

    // Downloads text as a file
    App.ui.download = function (name, text, mime) {
        const blob = new Blob([text], { type: mime || 'text/plain' });
        const a = el('a', { href: URL.createObjectURL(blob), download: name });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };

    // ---- backup reminder banner (picker and dashboard) ----
    App.ui.backupBanner = function () {
        if (!App.backup || !App.backup.due()) return null;
        const days = App.backup.lastBackup() ? Math.round((Date.now() - App.backup.lastBackup()) / 86400000) : null;
        return el('div', { class: 'banner', id: 'backup-banner', role: 'status' },
            icon('download', 18),
            el('span', { class: 'banner-text', text: days === null ? App.t('backupDueNever') : App.t('backupDue', { n: days }) }),
            el('span', { class: 'banner-actions' },
                App.ui.btn(App.t('backupNow'), 'download', 'btn-sm', () => { App.ui.exportBackup(); App.ui.rerender(); }),
                App.ui.btn(App.t('remindLater'), '', 'btn-ghost btn-sm', () => { App.backup.snooze(3); App.ui.rerender(); })));
    };

    // ---- theme / language ----
    App.ui.theme = () => document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    function paintHeader() {
        const dark = App.ui.theme() === 'dark';
        const tb = $('theme-btn'); tb.textContent = ''; tb.appendChild(icon(dark ? 'sun' : 'moon', 18));
        const lb = $('lang-btn'); lb.textContent = ''; lb.appendChild(icon('globe', 17)); lb.appendChild(el('span', { text: App.lang.toUpperCase() }));
        lb.title = App.t('langTitle'); lb.setAttribute('aria-label', App.t('langTitle'));
        tb.title = App.t('themeTitle'); tb.setAttribute('aria-label', App.t('themeTitle'));
    }
    App.ui.setTheme = function (theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a0e14' : '#f4f7fb');
        App.ui.setGlobal('theme', theme);
        try { localStorage.setItem('examsim:theme', theme); } catch (e) { /* optional mirror for the pre-paint script */ }
        paintHeader();
    };
    App.ui.applyStatic = function () {
        document.documentElement.lang = App.lang;
        paintHeader();
        $('skip-link').textContent = App.t('skipLink');
        const mark = $('brand-mark');
        if (!mark.firstChild) mark.appendChild(icon('check', 20));
        const ti = $('timer-icon');
        if (!ti.firstChild) ti.appendChild(icon('clock', 16));
        $('brand-link').setAttribute('href', window.location.pathname.split('/').pop() || 'exam.html');
    };
    App.ui.setLang = function (lang) {
        App.setLang(lang);
        App.ui.setGlobal('lang', App.lang);
        App.ui.applyStatic();
        App.ui.rerender();
    };

    App.ui.rerender = function () {
        const s = App.state.screen;
        if (s === 'picker') App.ui.renderPicker();
        else if (s === 'dashboard') App.ui.renderDashboard();
        else if (s === 'runtime') App.ui.refreshRuntime();
        else if (s === 'review') App.ui.renderReview();
        else if (s === 'summary') App.ui.renderSummary();
        else if (s === 'stats') App.ui.renderStats();
        else if (s === 'options' && App.ui.renderOptions) App.ui.renderOptions();
        else if (s === 'library' && App.ui.renderLibrary) App.ui.renderLibrary();
        else if (s === 'search' && App.ui.renderSearch) App.ui.renderSearch();
    };

    // ---- export / import of progress ----
    App.ui.exportProgress = function (examIds) {
        const data = App.backup.snapshot({ examIds, library: !examIds });
        App.ui.download('examsim-progress-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(data, null, 1), 'application/json');
        if (!examIds) App.backup.markBackup();
        App.ui.toast(App.t('exportDone'));
    };
    App.ui.exportBackup = function () { App.ui.exportProgress(null); };
    App.ui.importProgress = function () { $('import-file').click(); };
    App.ui.handleImportFile = function (file) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const r = App.backup.apply(JSON.parse(reader.result));
                App.ui.toast(App.t('importDone', { a: r.attempts, q: r.qstats }) + (r.library ? ' ' + App.t('importLibrary', { n: r.library }) : ''));
                App.ui.rerender();
            } catch (e) { App.ui.toast(App.t('importFail', { detail: e.message }), 6000); }
        };
        reader.onerror = () => App.ui.toast(App.t('importFail', { detail: 'read error' }), 6000);
        reader.readAsText(file);
    };

    App.ui.toolbarButtons = function (opts) {
        const bar = el('div', { class: 'toolbar' });
        if (opts.stats) bar.appendChild(App.ui.btn(App.t('statsBtn'), 'chart', 'btn-ghost btn-sm', () => App.ui.openStats()));
        bar.appendChild(App.ui.btn(App.t('exportBtn'), 'download', 'btn-ghost btn-sm', () => App.ui.exportProgress(opts.examIds)));
        bar.appendChild(App.ui.btn(App.t('importBtn'), 'upload', 'btn-ghost btn-sm', () => App.ui.importProgress()));
        return bar;
    };
})();
