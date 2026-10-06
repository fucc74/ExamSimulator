/* UI: finding exams on disk — the "Check for exams" bar on the start screen, folder import, in-page opening of folder exams. */
(function () {
    const { el, icon } = App.util;
    const $ = App.ui.$;

    // Opens an exam from the catalog. Exams read from the folder live in memory, so they open without a page reload.
    App.ui.gotoExam = async function (file) {
        if (!String(file).startsWith('disk:')) { location.href = '?content=' + encodeURIComponent(file); return; }
        try {
            const exam = await App.loader.loadByName(file);
            try { history.pushState(null, '', '?content=' + encodeURIComponent(file)); } catch (e) { /* file:// may refuse; harmless */ }
            App.ui.openExam(exam);
        } catch (e) { App.ui.toast(e instanceof App.loader.LoadError ? App.loader.describe(e).join(' ') : String(e.message || e), 6000); }
    };

    // Over http(s) the bundled list can be refreshed from exams.js without rebuilding anything on this side.
    async function refreshBundled() {
        if (!/^https?:$/.test(location.protocol)) return;
        try {
            const resp = await fetch('exams.js', { cache: 'no-cache' });
            if (!resp.ok) return;
            const m = (await resp.text()).match(/window\.ExamCatalog\s*=\s*(\[[\s\S]*\])\s*;?/);
            if (m) window.ExamCatalog = JSON.parse(m[1]);
        } catch (e) { /* offline: keep the list we have */ }
    }

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
                const list = Array.from(input.files || []).filter(f => /\.exam$/i.test(f.name));
                input.value = '';
                if (!list.length) { App.ui.toast(App.t('scanNone'), 5000); return; }
                const files = [];
                for (const f of list) files.push({ name: f.name, text: await f.text() });
                const r = App.folder.importFiles(files);
                App.ui.toast(App.t('scanImported', { a: r.added, u: r.updated, s: r.bundled, b: r.bad.length }), 6000);
                App.ui.rerender();
                if (r.bad.length) showBad(r.bad);
            });
            document.body.appendChild(input);
        }
        input.click();
    }

    // The main button: re-read the remembered folder (asking for permission again if the browser wants it).
    App.ui.checkExams = async function () {
        await refreshBundled();
        if (!App.folder.supported()) { App.ui.rerender(); App.ui.toast(App.t('scanRefreshed')); return; }
        try {
            const r = await App.folder.rescan();
            App.ui.toast(App.t('scanDone', { n: r.found, name: App.folder.state.name }), 4000);
        } catch (e) {
            if (e && e.name === 'AbortError') return;                 // picker closed
            App.ui.toast(e && e.message === 'denied' ? App.t('scanDenied') : String(e && e.message || e), 6000);
        }
        App.ui.rerender();
    };

    App.ui.discoverBar = function () {
        const st = App.folder.state, sup = App.folder.supported();
        const bar = el('div', { class: 'discover', id: 'discover' });
        const row = el('div', { class: 'toolbar' },
            App.ui.btn(App.t('scanBtn'), 'refresh', 'btn-sm', () => App.ui.checkExams(), { id: 'scan-btn' }),
            sup ? App.ui.btn(App.t('scanImportFolder'), 'upload', 'btn-ghost btn-sm', () => pickFolderFiles(), { id: 'folder-import-btn', title: App.t('scanImportHint') }) : null,
            sup && App.folder.hasFolder() ? App.ui.btn(App.t('scanForget'), 'x', 'btn-ghost btn-sm', async () => { await App.folder.forget(); App.ui.rerender(); }, { id: 'folder-forget' }) : null);
        bar.appendChild(row);
        let msg;
        if (!sup) msg = App.t('scanUnsupported');
        else if (!App.folder.hasFolder()) msg = App.t('scanFirstTime');
        else if (st.access === 'granted') msg = App.t('scanStatus', { name: st.name, n: st.count, t: new Date(st.at).toLocaleTimeString() });
        else if (st.access === 'denied') msg = App.t('scanDenied');
        else msg = App.t('scanAllow', { name: st.name });
        bar.appendChild(el('p', { class: 'hint', id: 'scan-status', role: 'status', text: msg }));
        if (st.bad.length) bar.appendChild(el('p', { class: 'hint scan-bad', id: 'scan-bad' }, el('span', { text: App.t('scanBadSummary', { n: st.bad.length }) + ' ' }),
            el('button', { type: 'button', class: 'link-btn', onclick: () => showBad(st.bad), text: App.t('scanBadShow') })));
        return bar;
    };
})();
