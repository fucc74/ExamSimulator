/* UI: question-bank search, command palette, shortcuts help, wrong-question reports, "what's new" notice, quality panel. */
(function () {
    const { el, icon } = App.util;
    const $ = App.ui.$;

    const LETTERS = 'ABCDEF';
    const isTyping = t => t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || (t.tagName === 'INPUT' && !/^(checkbox|radio|button)$/.test(t.type)));

    // ---------------------------------------------------------------- custom practice session (from search results)
    App.ui.startCustomSession = function (questions, label) {
        const exam = App.state.exam;
        if (!questions.length) { App.ui.toast(App.t('modeEmpty')); return; }
        const session = App.Session.create(questions, {
            examId: exam.id, modeId: 'custom', modeLabel: label, studyMode: true, timerMode: 'none', totalSec: 0,
            perQuestionSec: exam.settings.timePerQuestionSec, threshold: exam.settings.passThreshold,
            scoring: App.scoring.resolve(exam, null, App.storage.getPref('scoring')), shuffleOptions: exam.settings.shuffleOptions
        });
        App.ui.beginSession(session);
    };

    // ---------------------------------------------------------------- search
    let S = { q: '', topic: '', type: '', diff: '', status: '', picked: new Set(), index: null, examId: null };

    function haystack(exam, q) {
        const parts = [String(q.id), q.topic, q.type, (q.tags || []).join(' ')];
        const topicName = exam.topics && exam.topics[q.topic];
        if (topicName) parts.push(typeof topicName === 'string' ? topicName : Object.values(topicName).join(' '));
        const add = v => { if (v === undefined || v === null) return; if (typeof v === 'string' || typeof v === 'number') parts.push(String(v)); else if (Array.isArray(v)) v.forEach(add); else if (typeof v === 'object') Object.values(v).forEach(add); };
        ['text', 'options', 'explanation', 'items', 'pairs', 'context', 'parts', 'source'].forEach(k => add(q[k]));
        return App.rich.plain(parts.join(' \n ')).toLowerCase();
    }
    function buildIndex(exam) {
        if (S.index && S.examId === exam.id && S.index.length === exam.questions.length) return S.index;
        S.examId = exam.id;
        S.index = exam.questions.map(q => ({ q, h: haystack(exam, q) }));
        return S.index;
    }

    App.ui.search = function (exam, f, stats) {
        stats = stats || App.storage.allQStats(exam.id);
        const terms = String(f.q || '').toLowerCase().split(/\s+/).filter(Boolean);
        return buildIndex(exam).filter(({ q, h }) => {
            if (f.topic && q.topic !== f.topic) return false;
            if (f.type && (q.type || App.questionType(q)) !== f.type) return false;
            if (f.diff && String(q.difficulty || '') !== String(f.diff)) return false;
            const st = stats[q.uid];
            if (f.status === 'flagged' && !(st && st.flag)) return false;
            if (f.status === 'mistakes' && !(st && st.seen && st.lastOk === false)) return false;
            if (f.status === 'unseen' && st && st.seen) return false;
            if (f.status === 'mastered' && !(st && App.srs.isMastered(st))) return false;
            if (f.status === 'notes' && !(st && st.note)) return false;
            return terms.every(t => h.includes(t));
        }).map(x => x.q);
    };

    function highlight(text, terms) {
        const out = document.createDocumentFragment();
        if (!terms.length) { out.appendChild(document.createTextNode(text)); return out; }
        const lower = text.toLowerCase();
        const marks = [];
        terms.forEach(t => { let i = 0; while ((i = lower.indexOf(t, i)) >= 0) { marks.push([i, i + t.length]); i += t.length; } });
        marks.sort((a, b) => a[0] - b[0]);
        let pos = 0;
        marks.forEach(([s, e]) => { if (s < pos) { if (e > pos) { out.lastChild.textContent += text.slice(pos, e); pos = e; } return; } if (s > pos) out.appendChild(document.createTextNode(text.slice(pos, s))); out.appendChild(el('mark', { text: text.slice(s, e) })); pos = e; });
        if (pos < text.length) out.appendChild(document.createTextNode(text.slice(pos)));
        return out;
    }

    App.ui.openSearch = function (query) {
        if (!App.state.exam) { App.ui.toast(App.t('searchNeedExam')); return; }
        if (query !== undefined) S.q = query;
        App.ui.show('search');
        App.ui.renderSearch();
        const box = $('search-q'); if (box) box.focus();
    };

    App.ui.renderSearch = function () {
        const exam = App.state.exam;
        const v = $('view-search');
        if (!exam) { App.ui.closeOptions(); return; }
        v.textContent = '';
        const stats = App.storage.allQStats(exam.id);
        v.appendChild(el('div', { class: 'row between opt-head' },
            el('div', {}, el('h1', { text: App.t('searchTitle') }), el('p', { class: 'subtitle', text: App.loc(exam.title) })),
            App.ui.btn(App.t('backBtn'), 'back', 'btn-secondary btn-sm', () => { App.ui.renderDashboard(); App.ui.show('dashboard'); }, { id: 'search-back' })));

        const q = el('input', { type: 'text', id: 'search-q', placeholder: App.t('searchPlaceholder'), value: S.q, autocomplete: 'off', 'aria-label': App.t('searchPlaceholder') });
        const sel = (id, label, opts, val, key) => {
            const s = el('select', { id }); opts.forEach(([value, text]) => s.appendChild(el('option', { value: String(value), text })));
            s.value = String(val); s.addEventListener('change', () => { S[key] = s.value; S.picked.clear(); paint(); });
            return el('div', { class: 'field' }, el('label', { for: id, text: label }), s);
        };
        const types = [['', App.t('searchAny')]].concat(['single', 'multiple', 'truefalse', 'ordering', 'matching', 'numeric', 'scenario'].filter(t => exam.questions.some(x => x.type === t)).map(t => [t, App.t('type_' + t)]));
        const topics = [['', App.t('searchAny')]].concat(exam.topicList.map(t => [t, exam.topics && exam.topics[t] ? App.loc(exam.topics[t]) : t]));
        const diffs = [['', App.t('searchAny')], [1, App.t('diffEasy')], [2, App.t('diffMedium')], [3, App.t('diffHard')]];
        const statuses = [['', App.t('searchAny')], ['mistakes', App.t('modeMistakes')], ['flagged', App.t('modeFlagged')], ['unseen', App.t('modeUnseen')], ['mastered', App.t('searchMastered')], ['notes', App.t('searchWithNotes')]];
        v.appendChild(el('div', { class: 'card search-form' },
            el('div', { class: 'field' }, q),
            el('div', { class: 'search-filters' },
                sel('search-topic', App.t('edTopic'), topics, S.topic, 'topic'),
                sel('search-type', App.t('edType'), types, S.type, 'type'),
                exam.hasDifficulty ? sel('search-diff', App.t('edDifficulty'), diffs, S.diff, 'diff') : null,
                sel('search-status', App.t('searchStatus'), statuses, S.status, 'status'))));
        const bar = el('div', { class: 'search-bar', id: 'search-bar' });
        const list = el('div', { class: 'search-results', id: 'search-results' });
        v.appendChild(bar); v.appendChild(list);

        function paint() {
            const res = App.ui.search(exam, S, stats);
            const terms = S.q.toLowerCase().split(/\s+/).filter(Boolean);
            bar.textContent = '';
            const picked = res.filter(r => S.picked.has(r.uid));
            const target = picked.length ? picked : res;
            bar.appendChild(el('span', { class: 'chip primary', id: 'search-count', text: App.t('searchResults', { n: res.length, t: exam.questions.length }) }));
            bar.appendChild(el('span', { class: 'toolbar' },
                App.ui.btn(picked.length ? App.t('searchPracticePicked', { n: picked.length }) : App.t('searchPracticeAll', { n: res.length }), 'play', 'btn-sm', () => App.ui.startCustomSession(target, App.t('searchSessionLabel')), { id: 'search-practice', disabled: !res.length }),
                res.length ? App.ui.btn(picked.length === res.length ? App.t('searchNone') : App.t('searchSelectAll'), 'check', 'btn-ghost btn-sm', () => { if (picked.length === res.length) S.picked.clear(); else res.forEach(r => S.picked.add(r.uid)); paint(); }) : null));
            list.textContent = '';
            if (!res.length) list.appendChild(el('p', { class: 'hint', style: 'text-align:center;padding:24px', text: App.t('searchEmpty') }));
            res.slice(0, 100).forEach(r => list.appendChild(resultCard(exam, r, terms, stats, paint)));
            if (res.length > 100) list.appendChild(el('p', { class: 'hint', style: 'text-align:center', text: App.t('searchMore', { n: res.length - 100 }) }));
        }
        let timer = null;
        q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { S.q = q.value; S.picked.clear(); paint(); }, 120); });
        paint();
    }

    function resultCard(exam, q, terms, stats, repaint) {
        const st = stats[q.uid] || {};
        const text = App.rich.plain(App.loc(q.text)).replace(/\s+/g, ' ');
        const pick = el('input', { type: 'checkbox', checked: S.picked.has(q.uid), 'aria-label': App.t('searchSelect') });
        pick.addEventListener('change', () => { if (pick.checked) S.picked.add(q.uid); else S.picked.delete(q.uid); repaint(); });
        const details = el('div', { class: 'search-details hidden' });
        const toggle = App.ui.btn(App.t('searchShow'), 'chevron', 'btn-ghost btn-sm', () => {
            if (!details.firstChild) {
                try {
                    const item = App.prepareQuestion(q, { shuffleOptions: false });
                    details.appendChild(App.rich.node(App.loc(q.text)));
                    details.appendChild(App.types[item.kind].renderReview(item, undefined));
                    if (q.explanation) details.appendChild(el('div', { class: 'explanation-box' }, el('h4', { text: App.t('explanation') }), App.rich.node(App.loc(q.explanation))));
                } catch (e) { details.appendChild(el('p', { class: 'hint', text: String(e.message || e) })); }
            }
            const open = details.classList.toggle('hidden') === false;
            toggle.querySelector('span').textContent = open ? App.t('searchHide') : App.t('searchShow');
        });
        const flag = App.ui.btn('', 'flag', 'btn-ghost btn-sm' + (st.flag ? ' on' : ''), () => { App.storage.patchQStat(exam.id, q.uid, s => { s.flag = !s.flag; return s; }); repaint(); }, { title: App.t('flag'), 'aria-pressed': st.flag ? 'true' : 'false', 'aria-label': App.t('flag') });
        return el('article', { class: 'search-card', dataset: { uid: q.uid } },
            el('label', { class: 'search-pick' }, pick),
            el('div', { class: 'search-main' },
                el('div', { class: 'search-meta' },
                    el('span', { class: 'chip', text: '#' + q.id }),
                    el('span', { class: 'chip primary', text: exam.topics && exam.topics[q.topic] ? App.loc(exam.topics[q.topic]) : q.topic }),
                    el('span', { class: 'chip', text: App.t('type_' + (q.type || App.questionType(q))) }),
                    st.seen ? el('span', { class: 'chip ' + (st.lastOk ? 'ok' : 'bad'), text: st.correct + '/' + st.seen }) : el('span', { class: 'chip', text: App.t('modeUnseen') }),
                    st.note ? el('span', { class: 'chip warn', text: App.t('note') }) : null),
                el('p', { class: 'search-text' }, highlight(text.length > 280 ? text.slice(0, 280) + '…' : text, terms)),
                el('div', { class: 'toolbar' }, toggle, flag),
                details));
    }

    // ---------------------------------------------------------------- shortcuts help
    App.ui.showShortcuts = function () {
        const rows = [
            ['Ctrl/⌘ + K', App.t('scPalette')], ['?', App.t('scHelp')], ['/', App.t('scSearch')],
            ['1–6 · A–F', App.t('scSelect')], ['← →', App.t('scNav')], ['Enter', App.t('scEnter')],
            ['M', App.t('scFlag')], ['X', App.t('scClear')], ['R', App.t('scReport')], ['P', App.t('scPause')], ['Esc', App.t('scClose')]];
        const tbl = el('table', { class: 'kbd-table' });
        rows.forEach(([k, d]) => tbl.appendChild(el('tr', {}, el('td', {}, ...k.split(' + ').map((p, i, a) => [el('kbd', { text: p }), i < a.length - 1 ? ' + ' : null])), el('td', { text: d }))));
        return App.ui.modal({ title: App.t('shortcutsTitle'), body: tbl, actions: [{ label: App.t('closeBtn'), cls: 'btn-ghost' }] });
    };

    // ---------------------------------------------------------------- command palette
    function commands() {
        const out = [];
        const add = (label, hint, iconName, run) => out.push({ label, hint, iconName, run });
        const exam = App.state.exam;
        add(App.t('cmdHome'), '', 'home', () => { location.href = location.pathname; });
        App.loader.catalog().forEach(c => { if (!exam || c.file !== exam.sourceFile) add(App.t('cmdOpenExam', { name: App.loc(c.title) || c.file }), '', 'book', () => App.ui.gotoExam(c.file)); });
        if (exam) {
            add(App.t('cmdSearch'), '/', 'grid', () => App.ui.openSearch());
            add(App.t('statsBtn'), '', 'chart', () => App.ui.openStats());
            add(App.t('cmdDashboard'), '', 'layers', () => { App.ui.renderDashboard(); App.ui.show('dashboard'); });
            App.modes.list(exam, App.storage.allQStats(exam.id)).filter(m => m.available > 0 && (m.group === 'exam' || ['review', 'mistakes', 'flagged', 'unseen'].includes(m.id))).forEach(m => {
                add(App.t('cmdStart', { name: App.ui.modeTitle(m) }), '', 'play', () => {
                    const n = Math.min(m.count || m.defaultCount || m.available, m.available);
                    App.ui.startFromDashboard(m, n, m.studyDefault, 'default');
                });
            });
            add(App.t('cmdExportExam'), '', 'download', () => App.ui.exportExamDialog(exam.local ? App.library.get(exam.id) || exam : exam, { raw: !!exam.local }));
        }
        add(App.t('scanBtn'), '', 'refresh', () => App.ui.checkExams());
        add(App.t('optionsTitle'), '', 'menu', () => App.ui.openOptions());
        add(App.t('themeTitle'), '', App.ui.theme() === 'dark' ? 'sun' : 'moon', () => App.ui.setTheme(App.ui.theme() === 'dark' ? 'light' : 'dark'));
        add(App.t('langTitle'), '', 'globe', () => App.ui.setLang(App.lang === 'en' ? 'it' : 'en'));
        add(App.t('backupDownload'), '', 'download', () => App.ui.exportBackup());
        add(App.t('libraryImport'), '', 'upload', () => App.ui.openWizard());
        add(App.t('libraryNew'), '', 'star', () => App.ui.openEditor(null));
        add(App.t('shortcutsBtn'), '?', 'grid', () => App.ui.showShortcuts());
        return out;
    }

    App.ui.openPalette = function () {
        if (App.ui.modalOpen()) return;
        const input = el('input', { type: 'text', id: 'palette-input', placeholder: App.t('cmdPlaceholder'), autocomplete: 'off', role: 'combobox', aria: { expanded: 'true', controls: 'palette-list', autocomplete: 'list' } });
        const list = el('ul', { id: 'palette-list', class: 'palette-list', role: 'listbox' });
        const cmds = commands();
        let shown = [], active = 0;
        let m;
        function paint() {
            const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
            shown = cmds.filter(c => terms.every(t => c.label.toLowerCase().includes(t))).slice(0, 12);
            active = Math.min(active, Math.max(0, shown.length - 1));
            list.textContent = '';
            if (!shown.length) list.appendChild(el('li', { class: 'palette-empty', text: App.t('cmdNone') }));
            shown.forEach((c, i) => {
                const li = el('li', { class: 'palette-item' + (i === active ? ' active' : ''), role: 'option', id: 'palette-opt-' + i, aria: { selected: i === active ? 'true' : 'false' }, onclick: () => run(i) },
                    icon(c.iconName, 16), el('span', { class: 'palette-label', text: c.label }), c.hint ? el('kbd', { text: c.hint }) : null);
                list.appendChild(li);
            });
            input.setAttribute('aria-activedescendant', shown.length ? 'palette-opt-' + active : '');
            const a = list.querySelector('.active'); if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' });
        }
        function run(i) { const c = shown[i]; if (!c) return; m.close(); setTimeout(c.run, 0); }
        input.addEventListener('input', () => { active = 0; paint(); });
        input.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown') { active = Math.min(shown.length - 1, active + 1); paint(); e.preventDefault(); }
            else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); paint(); e.preventDefault(); }
            else if (e.key === 'Enter') { run(active); e.preventDefault(); }
        });
        m = App.ui.modal({ title: App.t('cmdTitle'), body: el('div', { class: 'palette' }, input, list) });
        m.card.classList.add('palette-card');
        paint();
    };

    // ---------------------------------------------------------------- reports
    const REPORT_KINDS = ['wrongAnswer', 'unclear', 'typo', 'outdated', 'other'];
    App.ui.reportQuestion = function (item) {
        const exam = App.state.exam;
        if (!exam || !item) return;
        const kind = el('select', { id: 'report-kind' });
        REPORT_KINDS.forEach(k => kind.appendChild(el('option', { value: k, text: App.t('reportKind_' + k) })));
        const note = el('textarea', { id: 'report-note', rows: 4, maxLength: 1000, placeholder: App.t('reportPlaceholder') });
        const body = el('div', {},
            el('p', { class: 'report-q', text: '#' + item.id + ' — ' + App.rich.plain(App.loc(item.text)).slice(0, 160) }),
            el('div', { class: 'field' }, el('label', { for: 'report-kind', text: App.t('reportKind') }), kind),
            el('div', { class: 'field' }, el('label', { for: 'report-note', text: App.t('reportNote') }), note),
            el('p', { class: 'hint', text: App.t('reportWhere') }));
        return App.ui.modal({ title: App.t('reportTitle'), body, actions: [
            { label: App.t('reportSend'), icon: 'flag', onclick: () => { App.storage.addReport(exam.id, { uid: item.uid, qid: item.id, kind: kind.value, note: note.value.trim(), ver: exam.version || '' }); App.ui.toast(App.t('reportSaved')); } },
            { label: App.t('cancelBtn'), cls: 'btn-ghost' }] });
    };

    // ---------------------------------------------------------------- "what's new" notice
    function notesOf(entry) { return (Array.isArray(entry.notes) ? entry.notes : (entry.notes ? [entry.notes] : [])); }
    App.ui.changelogNotice = function (exam) {
        if (!exam.version || exam.preview) return null;
        const seen = App.storage.getMeta(exam.id, 'seenVersion');
        if (seen === undefined) { App.storage.setMeta(exam.id, 'seenVersion', exam.version); return null; }
        if (seen === exam.version) return null;
        if (!exam.changelog || !exam.changelog.length) { App.storage.setMeta(exam.id, 'seenVersion', exam.version); return null; }
        const fresh = [];
        for (const c of exam.changelog) { if (c.version === seen) break; fresh.push(c); }
        const list = fresh.length ? fresh : exam.changelog.slice(0, 1);
        const box = el('div', { class: 'banner info', id: 'changelog-notice', role: 'status' }, icon('star', 18),
            el('div', { class: 'banner-text' }, el('b', { text: App.t('whatsNew', { v: exam.version }) }),
                ...list.map(c => el('div', { class: 'cl-entry' }, el('span', { class: 'chip', text: c.version + (c.date ? ' · ' + c.date : '') }), el('ul', {}, ...notesOf(c).map(n => el('li', { text: App.loc(n) })))))),
            el('span', { class: 'banner-actions' }, App.ui.btn(App.t('gotIt'), 'check', 'btn-sm', () => { App.storage.setMeta(exam.id, 'seenVersion', exam.version); box.remove(); }, { id: 'changelog-dismiss' })));
        return box;
    };
    App.ui.showChangelog = function (exam) {
        const body = el('div', {});
        (exam.changelog || []).forEach(c => body.appendChild(el('div', { class: 'cl-entry' }, el('span', { class: 'chip primary', text: c.version + (c.date ? ' · ' + c.date : '') }), el('ul', {}, ...notesOf(c).map(n => el('li', { text: App.loc(n) }))))));
        return App.ui.modal({ title: App.t('changelogTitle'), body, actions: [{ label: App.t('closeBtn'), cls: 'btn-ghost' }] });
    };

    // ---------------------------------------------------------------- quality panel (statistics screen)
    App.ui.qualityPanel = function (exam) {
        const findings = App.quality.analyze(exam, App.storage.allQStats(exam.id)).concat(App.quality.structural(exam));
        const box = el('div', { class: 'card', id: 'quality-panel' }, el('h2', { text: App.t('qualityTitle') }), el('p', { class: 'hint', text: App.t('qualityHint', { n: App.quality.MIN_SEEN }) }));
        if (!findings.length) { box.appendChild(el('p', { text: App.t('qualityNone') })); return box; }
        const byId = new Map(exam.questions.map(q => [q.uid, q]));
        const list = el('div', { class: 'quality-list' });
        findings.slice(0, 25).forEach(f => {
            const q = byId.get(f.uid);
            list.appendChild(el('div', { class: 'quality-row sev' + f.severity },
                el('span', { class: 'chip ' + (f.severity >= 3 ? 'bad' : f.severity === 2 ? 'warn' : ''), text: App.t('quality_' + f.kind) }),
                el('span', { class: 'quality-text' }, el('b', { text: '#' + f.id + ' ' }), el('span', { text: App.rich.plain(App.loc(q.text)).replace(/\s+/g, ' ').slice(0, 110) })),
                el('span', { class: 'hint', text: App.t('qualityDetail_' + f.kind, f.params) })));
        });
        box.appendChild(list);
        if (findings.length > 25) box.appendChild(el('p', { class: 'hint', text: App.t('searchMore', { n: findings.length - 25 }) }));
        return box;
    };

    // ---------------------------------------------------------------- global keyboard
    document.addEventListener('keydown', e => {
        const k = e.key;
        if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'k') { e.preventDefault(); App.ui.openPalette(); return; }
        if (e.ctrlKey || e.metaKey || e.altKey || App.ui.modalOpen() || isTyping(e.target)) return;
        if (k === '?') { e.preventDefault(); App.ui.showShortcuts(); }
        else if (k === '/' && App.state.screen !== 'runtime' && App.state.exam) { e.preventDefault(); App.ui.openSearch(); }
    });

    // ---------------------------------------------------------------- update check (service worker)
    App.ui.checkForUpdate = async function () {
        if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return App.t('updateNoSw');
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            if (!reg) return App.t('updateNoSw');
            await reg.update();
            if (reg.waiting || reg.installing) { App.ui.showUpdateBanner(reg); return App.t('updateAvailable'); }
            return App.t('updateLatest');
        } catch (e) { return App.t('updateFailed'); }
    };
    App.ui.showUpdateBanner = function (reg) {
        if ($('update-banner')) return;
        const b = el('div', { class: 'update-banner', id: 'update-banner', role: 'status' },
            icon('refresh', 18), el('span', { text: App.t('updateBanner') }),
            App.ui.btn(App.t('updateReload'), 'refresh', 'btn-sm', () => {
                const w = reg.waiting;
                if (w) w.postMessage({ type: 'SKIP_WAITING' }); else location.reload();
            }, { id: 'update-reload' }),
            App.ui.btn('', 'x', 'btn-ghost btn-sm', () => b.remove(), { 'aria-label': App.t('closeBtn') }));
        document.body.appendChild(b);
    };
})();
