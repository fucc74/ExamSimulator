/* UI: shared state, view switching, toast, theme/language, header, small widgets. */
App.state = { exam: null, session: null, screen: 'picker', loadError: null, lastResult: null, dash: {}, clockTimer: null, persistTimer: null };
App.ui = {};

(function () {
    const { el, icon } = App.util;
    const $ = id => document.getElementById(id);
    App.ui.$ = $;

    const VIEWS = ['picker', 'dashboard', 'runtime', 'review', 'summary', 'stats'];
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
        if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a0e14' : '#00a67e');
        App.storage.setPref('theme', theme);
        paintHeader();
    };
    App.ui.applyStatic = function () {
        document.documentElement.lang = App.lang;
        paintHeader();
        $('logo-simulator').textContent = App.t('simulator');
        $('skip-link').textContent = App.t('skipLink');
        const mark = $('brand-mark');
        if (!mark.firstChild) mark.appendChild(icon('check', 20));
        const ti = $('timer-icon');
        if (!ti.firstChild) ti.appendChild(icon('clock', 16));
        $('brand-link').setAttribute('href', window.location.pathname.split('/').pop() || 'exam.html');
    };
    App.ui.setLang = function (lang) {
        App.setLang(lang);
        App.storage.setPref('lang', App.lang);
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
    };

    // ---- export / import of progress ----
    App.ui.exportProgress = function (examIds) {
        const data = App.storage.exportData(examIds);
        const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
        const a = el('a', { href: URL.createObjectURL(blob), download: 'examsim-progress-' + new Date().toISOString().slice(0, 10) + '.json' });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        App.ui.toast(App.t('exportDone'));
    };
    App.ui.importProgress = function () { $('import-file').click(); };
    App.ui.handleImportFile = function (file) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const r = App.storage.importData(JSON.parse(reader.result));
                App.ui.toast(App.t('importDone', { a: r.attempts, q: r.qstats }));
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
