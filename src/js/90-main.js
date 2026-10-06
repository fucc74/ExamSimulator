/* Boot: preferences, header controls, routing (?content=NAME or ?url=ADDRESS). */
(function () {
    const $ = App.ui.$;

    function openExam(exam) {
        App.state.exam = exam;
        App.state.loadError = null;
        App.state.dash = {};
        $('logo-exam-code').textContent = exam.code || exam.id;
        $('logo-version').textContent = exam.version || '';
        document.title = App.loc(exam.title) + ' — Exam Simulator';
        App.ui.renderDashboard();
        App.ui.show('dashboard');
        App.events.emit('examLoaded', { exam });
    }
    App.ui.openExam = openExam;

    function showPicker(errorLines) {
        App.state.exam = null;
        App.state.loadError = errorLines || null;
        $('logo-exam-code').textContent = 'EXAM';
        $('logo-version').textContent = '';
        document.title = 'Exam Simulator';
        App.ui.renderPicker();
        App.ui.show('picker');
    }

    async function route() {
        const params = new URLSearchParams(window.location.search);
        const name = params.get('content');
        const url = params.get('url');
        try {
            if (name && (/^(local:)?[\w.\-]+$/.test(name) || /^disk:.+$/.test(name))) {
                showLoading();
                openExam(await App.loader.loadByName(name));
            } else if (url) {
                showLoading();
                openExam(await App.loader.loadByUrl(url));
            } else showPicker();
        } catch (err) {
            if (err instanceof App.loader.LoadError) showPicker(App.loader.describe(err));
            else { console.error(err); showPicker([String(err && err.message || err)]); }
        }
    }

    function showLoading() {
        const v = $('view-picker');
        v.textContent = '';
        v.appendChild(App.util.el('p', { class: 'subtitle', text: App.t('loadingExam') }));
        App.ui.show('picker');
    }

    async function boot() {
        await App.initStorage();
        const lang = App.ui.getGlobal('lang');
        App.setLang(lang === 'it' ? 'it' : 'en');
        const theme = App.ui.getGlobal('theme');
        if (theme === 'dark' || theme === 'light') document.documentElement.setAttribute('data-theme', theme);
        App.ui.applyStatic();
        $('lang-btn').addEventListener('click', () => App.ui.setLang(App.lang === 'en' ? 'it' : 'en'));
        $('theme-btn').addEventListener('click', () => App.ui.setTheme(App.ui.theme() === 'dark' ? 'light' : 'dark'));
        const pal = $('palette-btn'); pal.appendChild(App.util.icon('search', 18)); pal.title = pal.ariaLabel = App.t('cmdTitle'); pal.addEventListener('click', () => App.ui.openPalette());
        const opt = $('options-btn'); opt.appendChild(App.util.icon('settings', 18)); opt.title = App.t('optionsTitle'); opt.setAttribute('aria-label', App.t('optionsTitle')); opt.addEventListener('click', () => (App.state.screen === 'options' ? App.ui.closeOptions() : App.ui.openOptions()));
        $('import-file').addEventListener('change', e => { if (e.target.files[0]) App.ui.handleImportFile(e.target.files[0]); e.target.value = ''; });
        try { await App.folder.restore(); } catch (e) { /* folder access is optional */ }
        await route();
        if (location.hash === '#options') App.ui.openOptions();
        App.events.on('sessionEnd', () => { App.backup.writeAuto(); });
        if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
            const first = !navigator.serviceWorker.controller;
            let reloading = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => { if (first || reloading) return; reloading = true; location.reload(); });
            navigator.serviceWorker.register('sw.js')
                .then(reg => {
                    // a new version was downloaded in the background: offer to switch to it
                    const watch = r => { const w = r.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) App.ui.showUpdateBanner(r); }); };
                    if (reg.waiting && navigator.serviceWorker.controller) App.ui.showUpdateBanner(reg);
                    reg.addEventListener('updatefound', () => watch(reg));
                    return navigator.serviceWorker.ready;
                })
                .then(() => { if (first) App.ui.toast(App.t('offlineReady')); })
                .catch(() => { /* offline support is optional */ });
        }
    }

    App.boot = boot;
    if (typeof document !== 'undefined' && document.getElementById('view-picker')) boot();
})();
