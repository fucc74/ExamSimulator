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
            if (name && /^(local:)?[\w.\-]+$/.test(name)) {
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
        const lang = App.storage.getPref('lang');
        App.setLang(lang === 'it' ? 'it' : 'en');
        const theme = App.storage.getPref('theme');
        if (theme === 'dark' || theme === 'light') document.documentElement.setAttribute('data-theme', theme);
        App.ui.applyStatic();
        $('lang-btn').addEventListener('click', () => App.ui.setLang(App.lang === 'en' ? 'it' : 'en'));
        $('theme-btn').addEventListener('click', () => App.ui.setTheme(App.ui.theme() === 'dark' ? 'light' : 'dark'));
        $('import-file').addEventListener('change', e => { if (e.target.files[0]) App.ui.handleImportFile(e.target.files[0]); e.target.value = ''; });
        route();
        if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
            const first = !navigator.serviceWorker.controller;
            navigator.serviceWorker.register('sw.js')
                .then(() => navigator.serviceWorker.ready)
                .then(() => { if (first) App.ui.toast(App.t('offlineReady')); })
                .catch(() => { /* offline support is optional */ });
        }
    }

    App.boot = boot;
    if (typeof document !== 'undefined' && document.getElementById('view-picker')) boot();
})();
