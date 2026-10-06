/* UI: shared state, view switching, toast, theme/language, import/export helpers. */
App.state = { exam: null, session: null, screen: 'picker', loadError: null, lastResult: null, dash: {}, clockTimer: null, persistTimer: null };
App.ui = {};

(function () {
    const { el } = App.util;
    const $ = id => document.getElementById(id);
    App.ui.$ = $;

    const VIEWS = ['picker', 'dashboard', 'runtime', 'review', 'summary', 'stats'];
    App.ui.show = function (view) {
        App.state.screen = view;
        VIEWS.forEach(v => $('view-' + v).classList.toggle('hidden', v !== view));
        window.scrollTo(0, 0);
        App.events.emit('viewChange', { view });
    };

    App.ui.toast = function (msg, ms) {
        const box = $('toast');
        const node = el('div', { class: 'toast-msg', text: msg });
        box.appendChild(node);
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

    // ---- theme / language ----
    App.ui.theme = () => document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    App.ui.setTheme = function (theme) {
        document.documentElement.setAttribute('data-theme', theme);
        App.storage.setPref('theme', theme);
        $('theme-btn').textContent = theme === 'dark' ? '☀' : '☾';
    };
    App.ui.applyStatic = function () {
        document.documentElement.lang = App.lang;
        $('lang-btn').textContent = App.lang.toUpperCase();
        $('lang-btn').title = App.t('langTitle');
        $('lang-btn').setAttribute('aria-label', App.t('langTitle'));
        $('theme-btn').title = App.t('themeTitle');
        $('theme-btn').setAttribute('aria-label', App.t('themeTitle'));
        $('theme-btn').textContent = App.ui.theme() === 'dark' ? '☀' : '☾';
        $('logo-simulator').textContent = App.t('simulator');
        $('skip-link').textContent = App.t('skipLink');
    };
    App.ui.setLang = function (lang) {
        App.setLang(lang);
        App.storage.setPref('lang', App.lang);
        App.ui.applyStatic();
        App.ui.rerender();
    };

    // Re-renders the visible screen (after a language change)
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
        const btn = (label, fn) => bar.appendChild(el('button', { type: 'button', class: 'btn btn-ghost btn-small', text: label, onclick: fn }));
        if (opts.stats) btn('📊 ' + App.t('statsBtn'), () => App.ui.openStats());
        btn('⬇ ' + App.t('exportBtn'), () => App.ui.exportProgress(opts.examIds));
        btn('⬆ ' + App.t('importBtn'), () => App.ui.importProgress());
        return bar;
    };
})();
