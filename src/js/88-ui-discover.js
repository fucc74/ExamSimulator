/* UI: finding exams — the "Check for exams" bar on the start page, folder import, in-page opening of exams.
   The start page is EMPTY until the user presses the button (or imports/creates an exam in this visit). */
(function () {
    const { el, icon } = App.util;
    const $ = App.ui.$;
    const isHttp = () => /^https?:$/.test(location.protocol);

    // Opens an exam without reloading the page, so the list found by "Check for exams" stays on screen.
    App.ui.gotoExam = async function (file) {
        try {
            const exam = await App.loader.loadByName(file);
            try { history.pushState(null, '', '?content=' + encodeURIComponent(file)); } catch (e) { /* file:// may refuse; harmless */ }
            App.ui.openExam(exam);
        } catch (e) { App.ui.toast(e instanceof App.loader.LoadError ? App.loader.describe(e).join(' ') : String(e.message || e), 6000); }
    };
    // Back to the start page (the brand link) without a reload; the list stays as it was.
    App.ui.goHome = function () {
        try { history.pushState(null, '', location.pathname); } catch (e) { /* ignore */ }
        App.ui.showPicker();
    };

    function showBad(bad) {
        const body = el('div', {}, el('p', { class: 'hint', text: App.t('scanBadIntro') }));
        bad.forEach(b => body.appendChild(el('p', { class: 'scan-bad-line' }, el('b', { text: b.name + ': ' }), el('span', { text: b.message }))));
        return App.ui.modal({ title: App.t('scanBadTitle', { n: bad.length }), body, actions: [{ label: App.t('closeBtn'), cls: 'btn-ghost' }] });
    }

    function pickFolderFiles() {
        let input = $('folder-input');
        if (!input) {
            input = el('input', { type: 'file', id: 'folder-input', class: 'hidden', multiple: true, 'aria-label': App.t('scanImportFolder') });
            input.setAttribute('webkitdirectory', ''); input.setAttribute('directory', '');
            input.addEventListener('change', async () => {
                const list = Array.from(input.files || []).filter(f => /\.exam(\.txt)?$/i.test(f.name));
                input.value = '';
                if (!list.length) { App.ui.toast(App.t('scanNone'), 5000); return; }
                const files = [];
                for (const f of list) files.push({ name: f.name, text: await f.text() });
                const r = App.folder.importFiles(files);
                App.discovery.done = true;
                App.ui.toast(App.t('scanImported', { a: r.added, u: r.updated, s: r.bundled, b: r.bad.length }), 6000);
                App.ui.rerender();
                if (r.bad.length) showBad(r.bad);
            });
            document.body.appendChild(input);
        }
        input.click();
    }

    // The main button. Web address: list the exams the site offers (plus a remembered folder). Local file: read the folder.
    App.ui.checkExams = async function () {
        const sup = App.folder.supported();
        try {
            if (isHttp()) {
                await App.loader.refreshServed();
                if (sup && App.folder.hasFolder()) await App.folder.rescan();
            } else if (sup) {
                await App.folder.rescan();
            } else {
                App.discovery.done = true;                 // nothing to read here: show what is in "My exams" and offer the folder import
                App.ui.rerender();
                pickFolderFiles();
                return;
            }
            App.discovery.done = true;
            App.ui.toast(App.t('scanListed', { n: App.loader.catalog().length }), 3500);
        } catch (e) {
            if (e && e.name === 'AbortError') return;                 // folder picker closed
            App.discovery.done = true;
            App.ui.toast(e && e.message === 'denied' ? App.t('scanDenied') : String(e && e.message || e), 6000);
        }
        App.ui.rerender();
    };

    App.ui.discoverBar = function () {
        const st = App.folder.state, sup = App.folder.supported(), web = isHttp();
        const bar = el('div', { class: 'discover', id: 'discover' });
        const row = el('div', { class: 'toolbar' },
            App.ui.btn(App.t('scanBtn'), 'refresh', 'btn-sm', () => App.ui.checkExams(), { id: 'scan-btn' }),
            sup && web && !App.folder.hasFolder() ? App.ui.btn(App.t('scanChooseFolder'), 'book', 'btn-ghost btn-sm', async () => { try { await App.folder.choose(); App.discovery.done = true; App.ui.rerender(); } catch (e) { if (!e || e.name !== 'AbortError') App.ui.toast(String(e && e.message || e), 5000); } }, { id: 'folder-choose' }) : null,
            App.ui.btn(App.t('scanImportFolder'), 'upload', 'btn-ghost btn-sm', () => pickFolderFiles(), { id: 'folder-import-btn', title: App.t('scanImportHint') }),
            sup && App.folder.hasFolder() ? App.ui.btn(App.t('scanForget'), 'x', 'btn-ghost btn-sm', async () => { await App.folder.forget(); App.ui.rerender(); }, { id: 'folder-forget' }) : null);
        bar.appendChild(row);
        let msg;
        if (App.discovery.done) msg = App.t('scanListed', { n: App.loader.catalog().length }) + (App.folder.hasFolder() && st.at ? ' ' + App.t('scanStatus', { name: st.name, n: st.count, t: new Date(st.at).toLocaleTimeString() }) : '');
        else if (App.folder.hasFolder()) msg = st.access === 'denied' ? App.t('scanDenied') : App.t('scanReady', { name: st.name });
        else if (web) msg = App.t('scanServed') + (sup ? ' ' + App.t('scanServedFolder') : '');
        else if (sup) msg = App.t('scanFirstTime');
        else msg = App.t('scanUnsupported');
        bar.appendChild(el('p', { class: 'hint', id: 'scan-status', role: 'status', text: msg }));
        if (st.bad.length) bar.appendChild(el('p', { class: 'hint scan-bad', id: 'scan-bad' }, el('span', { text: App.t('scanBadSummary', { n: st.bad.length }) + ' ' }),
            el('button', { type: 'button', class: 'link-btn', onclick: () => showBad(st.bad), text: App.t('scanBadShow') })));
        return bar;
    };
})();
