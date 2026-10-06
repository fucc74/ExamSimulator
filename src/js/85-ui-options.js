/* UI: options page (preferences, scoring defaults, exam rules, profiles, backup, sync, storage, library, reports, about). */
(function () {
    const { el, icon } = App.util;
    const $ = App.ui.$;
    let origin = null;       // screen to return to

    App.ui.openOptions = function () {
        if (App.state.screen !== 'options') origin = App.state.screen === 'library' || App.state.screen === 'search' ? 'back' : App.state.screen;
        App.ui.show('options');
        App.ui.renderOptions();
        if (location.hash !== '#options') { try { history.pushState(null, '', '#options'); } catch (e) { /* file:// restrictions */ } }
    };
    App.ui.closeOptions = function () {
        if (location.hash === '#options') { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ } }
        if (App.state.exam) { App.ui.renderDashboard(); App.ui.show('dashboard'); }
        else { App.ui.renderPicker(); App.ui.show('picker'); }
    };
    window.addEventListener('popstate', () => { if (App.state.screen === 'options' && location.hash !== '#options') App.ui.closeOptions(); });

    function section(id, title, iconName, ...children) {
        return el('section', { class: 'card opt-section', id: 'opt-' + id },
            el('h2', { class: 'opt-title' }, icon(iconName, 19), el('span', { text: title })), ...children);
    }
    const row = (...c) => el('div', { class: 'opt-row' }, ...c);
    const field = (label, control, hint, id) => el('div', { class: 'field' }, el('label', { for: id, text: label }), control, hint ? el('p', { class: 'hint', text: hint }) : null);
    function toggle(id, label, checked, onchange) {
        const input = el('input', { type: 'checkbox', id, checked: !!checked });
        input.addEventListener('change', () => onchange(input.checked));
        return el('label', { class: 'switch-row', for: id }, input, el('span', { class: 'switch' }), el('span', { class: 'switch-label', text: label }));
    }
    function selectOf(id, options, value, onchange) {
        const s = el('select', { id });
        options.forEach(([v, label]) => s.appendChild(el('option', { value: String(v), text: label })));
        s.value = String(value);
        s.addEventListener('change', () => onchange(s.value));
        return s;
    }

    // ---------------------------------------------------------------- sections
    function general() {
        return section('general', App.t('optGeneral'), 'globe',
            field(App.t('optLanguage'), selectOf('opt-lang', [['en', 'English'], ['it', 'Italiano']], App.lang, v => App.ui.setLang(v)), null, 'opt-lang'),
            field(App.t('optTheme'), selectOf('opt-theme', [['light', App.t('themeLight')], ['dark', App.t('themeDark')]], App.ui.theme(), v => { App.ui.setTheme(v); }), null, 'opt-theme'));
    }

    function scoring() {
        const cur = App.scoring.clean(App.storage.getPref('scoring'));
        const save = patch => {
            const next = Object.assign({}, App.scoring.clean(App.storage.getPref('scoring')), patch);
            App.storage.setPref('scoring', next);
        };
        const num = (id, key, label) => {
            const input = el('input', { type: 'number', id, min: 0, max: 1, step: 0.05, value: cur[key] !== undefined ? cur[key] : 0 });
            input.addEventListener('change', () => { const v = Math.max(0, Math.min(1, Number(input.value) || 0)); input.value = v; save({ [key]: v }); });
            return field(label, input, null, id);
        };
        return section('scoring', App.t('optScoring'), 'target',
            el('p', { class: 'hint', text: App.t('optScoringHint') }),
            toggle('opt-partial', App.t('optPartial'), cur.partialCredit, v => save({ partialCredit: v })),
            num('opt-wrong', 'wrongPenalty', App.t('optWrongPenalty')),
            num('opt-unans', 'unansweredPenalty', App.t('optUnansweredPenalty')),
            el('p', { class: 'hint', text: App.t('optPenaltyHint') }));
    }

    function examRules() {
        const cur = App.storage.getPref('examRules') || {};
        const save = patch => App.storage.setPref('examRules', Object.assign({}, App.storage.getPref('examRules') || {}, patch));
        const pauses = cur.pauses === undefined || cur.pauses === null || cur.pauses === '' ? '' : cur.pauses;
        return section('rules', App.t('optRules'), 'clock',
            el('p', { class: 'hint', text: App.t('optRulesHint') }),
            field(App.t('optPauses'), selectOf('opt-pauses', [['', App.t('pausesUnlimited')], [0, App.t('pausesNone')], [1, '1'], [2, '2'], [3, '3']], pauses, v => save({ pauses: v === '' ? '' : Number(v) })), null, 'opt-pauses'),
            toggle('opt-strict', App.t('optStrict'), cur.strictTime, v => save({ strictTime: v })),
            el('p', { class: 'hint', text: App.t('optFreeNav') }));
    }

    function profiles() {
        const cur = App.profiles.current();
        const box = section('profiles', App.t('optProfiles'), 'star', el('p', { class: 'hint', text: App.t('optProfilesHint') }));
        const switchTo = id => { App.profiles.use(id); if (App.backend && App.backend.flush) App.backend.flush(); App.ui.toast(App.t('profileSwitched')); setTimeout(() => location.reload(), 150); };
        const list = el('div', { class: 'opt-list' });
        App.profiles.list().forEach(p => {
            list.appendChild(row(
                el('span', { class: 'opt-name' }, el('b', { text: p.name }), p.id === cur ? el('span', { class: 'chip primary', text: App.t('profileCurrent') }) : null),
                el('span', { class: 'opt-actions' },
                    p.id !== cur ? App.ui.btn(App.t('profileUse'), 'play', 'btn-sm', () => switchTo(p.id)) : null,
                    App.ui.btn('', 'note', 'btn-ghost btn-sm', () => { const n = prompt(App.t('profileRenamePrompt'), p.name); if (n) { App.profiles.rename(p.id, n); App.ui.renderOptions(); } }, { title: App.t('renameBtn'), 'aria-label': App.t('renameBtn') }),
                    App.profiles.list().length > 1 ? App.ui.btn('', 'trash', 'btn-ghost btn-sm', () => { if (confirm(App.t('profileDeleteConfirm', { name: p.name }))) { const wasCur = p.id === cur; App.profiles.remove(p.id); if (wasCur) switchTo(App.profiles.current()); else App.ui.renderOptions(); } }, { title: App.t('deleteBtn'), 'aria-label': App.t('deleteBtn') }) : null)));
        });
        box.appendChild(list);
        const name = el('input', { type: 'text', id: 'opt-new-profile', maxLength: 40, placeholder: App.t('profileNamePlaceholder') });
        box.appendChild(el('div', { class: 'opt-add' }, name, App.ui.btn(App.t('profileAdd'), 'star', 'btn-sm', () => { if (!name.value.trim()) { name.focus(); return; } const id = App.profiles.create(name.value); switchTo(id); }, { id: 'opt-add-profile' })));
        return box;
    }

    function backup() {
        const last = App.backup.lastBackup();
        const box = section('backup', App.t('optBackup'), 'download',
            el('p', { class: 'hint', id: 'opt-last-backup', text: last ? App.t('backupLast', { when: new Date(last).toLocaleString() }) : App.t('backupNever') }),
            el('div', { class: 'toolbar' },
                App.ui.btn(App.t('backupDownload'), 'download', 'btn-sm', () => { App.ui.exportBackup(); App.ui.renderOptions(); }, { id: 'opt-backup-dl' }),
                App.ui.btn(App.t('backupRestore'), 'upload', 'btn-ghost btn-sm', () => App.ui.importProgress(), { id: 'opt-backup-restore' })),
            field(App.t('backupRemind'), selectOf('opt-remind', [[0, App.t('remindOff')], [7, App.t('remindDays', { n: 7 })], [14, App.t('remindDays', { n: 14 })], [30, App.t('remindDays', { n: 30 })], [60, App.t('remindDays', { n: 60 })]], App.backup.remindDays(), v => App.storage.setPref('backupRemindDays', Number(v))), null, 'opt-remind'));
        if (App.backup.fsSupported()) {
            const status = el('span', { class: 'chip', id: 'opt-auto-status', text: '…' });
            App.backup.autoFileName().then(n => { status.textContent = n ? App.t('autoBackupOn', { name: n }) : App.t('autoBackupOff'); status.classList.toggle('ok', !!n); });
            box.appendChild(el('div', { class: 'opt-auto' },
                el('p', { class: 'hint', text: App.t('autoBackupHint') }),
                el('div', { class: 'toolbar' }, status,
                    App.ui.btn(App.t('autoBackupChoose'), 'download', 'btn-ghost btn-sm', async () => { try { const n = await App.backup.chooseAutoFile(); App.ui.toast(App.t('autoBackupOn', { name: n })); App.ui.renderOptions(); } catch (e) { if (e && e.name !== 'AbortError') App.ui.toast(String(e.message || e), 5000); } }),
                    App.ui.btn(App.t('autoBackupStop'), 'x', 'btn-ghost btn-sm', async () => { await App.backup.disableAutoFile(); App.ui.renderOptions(); }))));
        } else box.appendChild(el('p', { class: 'hint', text: App.t('autoBackupUnsupported') }));
        return box;
    }

    function sync() {
        const box = section('sync', App.t('optSync'), 'refresh', el('p', { class: 'hint', text: App.t('syncHint') }));
        // transfer code
        const withLib = el('input', { type: 'checkbox', id: 'sync-lib' });
        const out = el('textarea', { id: 'sync-code-out', readOnly: true, rows: 3, placeholder: App.t('syncCodeOutPlaceholder') });
        const info = el('p', { class: 'hint', id: 'sync-code-info' });
        const gen = App.ui.btn(App.t('syncMakeCode'), 'upload', 'btn-sm', async () => {
            try {
                const code = await App.backup.encode(App.backup.snapshot({ library: withLib.checked, sessions: false }));
                out.value = code;
                info.textContent = App.t('syncCodeInfo', { kb: Math.max(1, Math.round(code.length / 1024)) }) + (code.length > 200000 ? ' ' + App.t('syncCodeBig') : '');
                App.backup.markBackup();
            } catch (e) { info.textContent = String(e.message || e); }
        }, { id: 'sync-make' });
        const copy = App.ui.btn(App.t('syncCopy'), 'note', 'btn-ghost btn-sm', async () => {
            if (!out.value) return;
            try { await navigator.clipboard.writeText(out.value); App.ui.toast(App.t('syncCopied')); } catch (e) { out.select(); App.ui.toast(App.t('syncCopyManual')); }
        });
        const inp = el('textarea', { id: 'sync-code-in', rows: 3, placeholder: App.t('syncCodeInPlaceholder') });
        const imp = App.ui.btn(App.t('syncImportCode'), 'download', 'btn-sm', async () => {
            try {
                const r = App.backup.apply(await App.backup.decode(inp.value));
                App.ui.toast(App.t('importDone', { a: r.attempts, q: r.qstats }) + (r.library ? ' ' + App.t('importLibrary', { n: r.library }) : ''));
                inp.value = '';
            } catch (e) { App.ui.toast(App.t('importFail', { detail: e.message }), 6000); }
        }, { id: 'sync-import' });
        box.appendChild(el('h3', { class: 'opt-sub', text: App.t('syncCodeTitle') }));
        box.appendChild(el('label', { class: 'check-inline', for: 'sync-lib' }, withLib, el('span', { text: App.t('syncWithLibrary') })));
        box.appendChild(el('div', { class: 'toolbar' }, gen, copy));
        box.appendChild(out); box.appendChild(info);
        box.appendChild(el('div', { style: 'margin-top:10px' }, inp, el('div', { class: 'toolbar', style: 'margin-top:8px' }, imp)));

        // gist
        const cfg = App.backup.gistConfig();
        const token = el('input', { type: 'password', id: 'gist-token', autocomplete: 'off', placeholder: 'ghp_… / github_pat_…', value: cfg.token || '' });
        const gid = el('input', { type: 'text', id: 'gist-id', placeholder: App.t('gistIdPlaceholder'), value: cfg.id || '' });
        const status = el('p', { class: 'hint', id: 'gist-status', text: cfg.last ? App.t('gistLast', { when: new Date(cfg.last).toLocaleString() }) : '' });
        const run = App.ui.btn(App.t('gistSync'), 'refresh', 'btn-sm', async () => {
            const c = Object.assign({}, App.backup.gistConfig(), { token: token.value.trim(), id: gid.value.trim() || undefined });
            if (!c.token) { token.focus(); return; }
            App.backup.setGistConfig(c);
            run.disabled = true; status.textContent = App.t('gistSyncing');
            try {
                const r = await App.backup.syncGist();
                status.textContent = App.t('gistDone', { a: r.pulled ? r.pulled.attempts : 0 });
                gid.value = r.id;
                App.ui.toast(App.t('gistDone', { a: r.pulled ? r.pulled.attempts : 0 }));
            } catch (e) { status.textContent = App.t('gistFail', { detail: e.message }); }
            run.disabled = false;
        }, { id: 'gist-sync' });
        const off = App.ui.btn(App.t('gistDisconnect'), 'x', 'btn-ghost btn-sm', () => { App.backup.setGistConfig({}); App.ui.renderOptions(); });
        box.appendChild(el('h3', { class: 'opt-sub', text: App.t('gistTitle') }));
        box.appendChild(el('p', { class: 'hint', text: App.t('gistHint') }));
        box.appendChild(field(App.t('gistToken'), token, null, 'gist-token'));
        box.appendChild(field(App.t('gistId'), gid, null, 'gist-id'));
        box.appendChild(el('div', { class: 'toolbar' }, run, off));
        box.appendChild(status);
        return box;
    }

    function storage() {
        const kindName = { indexeddb: 'IndexedDB', localStorage: 'localStorage', memory: App.t('storageMemory') }[App.storageKind] || App.storageKind;
        const usage = el('p', { class: 'hint', id: 'opt-usage', text: '…' });
        App.storageUsage().then(u => { usage.textContent = u ? App.t('storageUsage', { used: fmtBytes(u.used), quota: fmtBytes(u.quota) }) : ''; });
        return section('storage', App.t('optStorage'), 'layers',
            el('p', { text: App.t('storageKind', { kind: kindName }) }), usage,
            App.storageKind === 'memory' ? el('p', { class: 'hint', style: 'color:var(--error)', text: App.t('storageMemoryWarn') }) : null,
            el('div', { class: 'toolbar' }, App.ui.btn(App.t('storageWipe'), 'trash', 'btn-danger btn-sm', async () => {
                if (!confirm(App.t('storageWipeConfirm'))) return;
                await App.wipeAll(); App.ui.toast(App.t('storageWiped')); setTimeout(() => location.reload(), 200);
            }, { id: 'opt-wipe' })));
    }
    function fmtBytes(n) { return n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB'; }

    function library() {
        const box = section('library', App.t('optLibrary'), 'book', el('p', { class: 'hint', text: App.t('libraryHint') }));
        const list = el('div', { class: 'opt-list', id: 'opt-library-list' });
        const items = App.library.list();
        if (!items.length) list.appendChild(el('p', { class: 'hint', text: App.t('libraryEmpty') }));
        items.forEach(it => list.appendChild(row(
            el('span', { class: 'opt-name' }, el('b', { text: App.loc(it.title) }), el('span', { class: 'chip', text: App.t('nQuestions', { n: it.questionCount }) })),
            el('span', { class: 'opt-actions' },
                el('a', { class: 'btn btn-sm', href: '?content=' + encodeURIComponent(it.file) }, icon('play', 15), el('span', { text: App.t('openBtn') })),
                App.ui.btn(App.t('editBtn'), 'note', 'btn-ghost btn-sm', () => App.ui.openEditor(it.id)),
                App.ui.btn('', 'download', 'btn-ghost btn-sm', () => App.ui.exportExamDialog(App.library.get(it.id)), { title: App.t('exportExam'), 'aria-label': App.t('exportExam') }),
                App.ui.btn('', 'trash', 'btn-ghost btn-sm', () => { if (confirm(App.t('libraryDeleteConfirm', { name: App.loc(it.title) }))) { App.library.remove(it.id); App.ui.renderOptions(); } }, { title: App.t('deleteBtn'), 'aria-label': App.t('deleteBtn') })))));
        box.appendChild(list);
        box.appendChild(el('div', { class: 'toolbar', style: 'margin-top:10px' },
            App.ui.btn(App.t('libraryImport'), 'upload', 'btn-sm', () => App.ui.openWizard(), { id: 'opt-wizard' }),
            App.ui.btn(App.t('libraryNew'), 'star', 'btn-ghost btn-sm', () => App.ui.openEditor(null), { id: 'opt-new-exam' })));
        return box;
    }

    function reports() {
        const box = section('reports', App.t('optReports'), 'flag', el('p', { class: 'hint', text: App.t('reportsHint') }));
        const all = [];
        App.storage.examIds().forEach(id => App.storage.listReports(id).forEach(r => all.push(Object.assign({ examId: id }, r))));
        all.sort((a, b) => b.ts - a.ts);
        const list = el('div', { class: 'opt-list', id: 'opt-reports-list' });
        if (!all.length) list.appendChild(el('p', { class: 'hint', text: App.t('reportsEmpty') }));
        all.forEach(r => list.appendChild(row(
            el('span', { class: 'opt-name stack' },
                el('b', { text: r.examId + ' · #' + (r.qid !== undefined ? r.qid : r.uid) + ' · ' + App.t('reportKind_' + (r.kind || 'other')) }),
                r.note ? el('span', { class: 'hint', text: r.note }) : null,
                el('span', { class: 'hint', text: new Date(r.ts).toLocaleString() })),
            el('span', { class: 'opt-actions' }, App.ui.btn('', 'trash', 'btn-ghost btn-sm', () => { App.storage.removeReport(r.examId, r.id); App.ui.renderOptions(); }, { title: App.t('deleteBtn'), 'aria-label': App.t('deleteBtn') })))));
        box.appendChild(list);
        if (all.length) box.appendChild(el('div', { class: 'toolbar', style: 'margin-top:10px' },
            App.ui.btn(App.t('reportsExport'), 'download', 'btn-sm', () => App.ui.download('examsim-reports.json', JSON.stringify(all, null, 1), 'application/json'))));
        return box;
    }

    function about() {
        const upd = el('p', { class: 'hint', id: 'opt-update-status' });
        return section('about', App.t('optAbout'), 'bolt',
            el('p', { text: 'Exam Simulator ' + App.version }),
            el('div', { class: 'toolbar' },
                App.ui.btn(App.t('shortcutsBtn'), 'grid', 'btn-ghost btn-sm', () => App.ui.showShortcuts()),
                App.ui.btn(App.t('checkUpdate'), 'refresh', 'btn-ghost btn-sm', async () => { upd.textContent = App.t('updateChecking'); upd.textContent = await App.ui.checkForUpdate(); }, { id: 'opt-check-update' })),
            upd);
    }

    App.ui.renderOptions = function () {
        const v = $('view-options');
        const keepScroll = window.scrollY;
        v.textContent = '';
        v.appendChild(el('div', { class: 'row between opt-head' },
            el('div', {}, el('h1', { text: App.t('optionsTitle') }), el('p', { class: 'subtitle', text: App.t('optionsSub', { name: App.profiles.currentProfile().name }) })),
            App.ui.btn(App.t('backBtn'), 'back', 'btn-secondary btn-sm', () => App.ui.closeOptions(), { id: 'opt-back' })));
        const grid = el('div', { class: 'opt-grid' });
        [general, scoring, examRules, profiles, backup, sync, library, reports, storage, about].forEach(f => grid.appendChild(f()));
        v.appendChild(grid);
        window.scrollTo(0, keepScroll);
    };
})();
