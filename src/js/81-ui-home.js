/* UI: exam picker and exam dashboard (mode selection, sessions in progress). */
(function () {
    const { el } = App.util;
    const $ = App.ui.$;

    App.ui.renderPicker = function () {
        const v = $('view-picker');
        v.textContent = '';
        v.appendChild(el('h1', { text: App.state.loadError ? App.t('loadFailedTitle') : App.t('noExamTitle'), style: App.state.loadError ? 'color:var(--error)' : '' }));
        v.appendChild(el('p', { class: 'subtitle', text: App.t('noExamText') }));
        if (App.state.loadError) {
            const box = el('div', { class: 'error-box', role: 'alert' });
            App.state.loadError.forEach(line => box.appendChild(el('p', { text: line })));
            v.appendChild(box);
        }
        const list = el('div', { id: 'exam-list' });
        const cat = App.loader.catalog();
        if (!cat.length) list.appendChild(el('p', { class: 'hint', text: App.t('noCatalog') }));
        else list.appendChild(el('h2', { style: 'font-size:1.05rem;margin:10px 0;', text: App.t('availableExams') }));
        cat.forEach(item => {
            const meta = item.questionCount ? App.t('examCardMeta', { n: item.questionCount, t: item.topicCount || '–' }) : '';
            list.appendChild(el('a', { href: '?content=' + encodeURIComponent(item.file), class: 'exam-card' },
                el('div', { class: 'exam-card-title', text: App.loc(item.title) || item.file }),
                el('div', { class: 'exam-card-desc', text: App.loc(item.description) }),
                meta ? el('div', { class: 'hint', text: meta }) : null));
        });
        v.appendChild(list);
        v.appendChild(App.ui.toolbarButtons({ stats: false }));
    };

    function examChips() {
        const chips = el('div', { class: 'exam-chips' });
        App.loader.catalog().forEach(item => {
            const cur = item.file === App.state.exam.sourceFile;
            chips.appendChild(el('a', { href: '?content=' + encodeURIComponent(item.file), class: 'exam-chip' + (cur ? ' current' : ''), text: App.loc(item.title) || item.file, aria: cur ? { current: 'page' } : {} }));
        });
        return chips;
    }

    function modeLabel(m) {
        const base = m.label ? App.loc(m.label) : App.t(m.labelKey, Object.assign({}, m.labelParams, m.labelParams && m.labelParams.t ? { t: App.loc(m.labelParams.t) } : {}));
        return m.group === 'exam' ? base : base + ' (' + m.available + ')';
    }

    App.ui.renderDashboard = function () {
        const exam = App.state.exam;
        const v = $('view-dashboard');
        v.textContent = '';
        const qstats = App.storage.allQStats(exam.id);
        const stats = App.stats.compute(exam, App.storage);

        v.appendChild(el('h1', { text: App.loc(exam.title) }));
        if (exam.description) v.appendChild(el('p', { class: 'subtitle', text: App.loc(exam.description) }));
        v.appendChild(el('div', { class: 'exam-switcher' }, el('span', { class: 'exam-switcher-label', text: App.t('switchExam') }), examChips()));
        v.appendChild(App.ui.toolbarButtons({ stats: true, examIds: [exam.id] }));

        // sessions in progress
        const sessions = App.storage.listSessions(exam.id);
        if (sessions.length) {
            const box = el('div', { class: 'sessions-box' }, el('h3', { text: App.t('resumeTitle') }));
            sessions.forEach(sd => {
                const s = App.Session.fromJSON(sd);
                const info = App.t('resumeInfo', { mode: s.modeLabel, done: s.answeredCount(), n: s.length, when: App.ui.timeAgo(s.updatedAt) });
                box.appendChild(el('div', { class: 'session-row' },
                    el('span', { class: 'session-info', text: info }),
                    el('span', {},
                        el('button', { type: 'button', class: 'btn btn-small', text: App.t('resumeBtn'), onclick: () => App.ui.resumeSession(s) }), ' ',
                        el('button', { type: 'button', class: 'btn btn-ghost btn-small', text: App.t('deleteBtn'), onclick: () => { if (confirm(App.t('confirmDeleteSession'))) { App.storage.deleteSession(exam.id, s.id); App.ui.renderDashboard(); } } }))));
            });
            v.appendChild(box);
        }

        const grid = el('div', { class: 'grid-dashboard' });
        // left: distribution
        const left = el('div', {}, el('h2', { style: 'font-size:1.1rem;font-weight:600;margin-bottom:10px;', text: App.t('distribution') }));
        const list = el('div', { class: 'topic-list' });
        list.appendChild(el('div', { class: 'topic-item topic-total' },
            el('span', { class: 'topic-name', style: 'color:var(--primary);font-weight:700;', text: App.t('totalQuestions') }),
            el('span', { class: 'topic-count', style: 'background:var(--primary);color:var(--on-accent);', text: App.t('nQuestions', { n: exam.questions.length }) })));
        stats.topics.forEach(t => {
            const name = exam.topics && exam.topics[t.topic] ? App.loc(exam.topics[t.topic]) : t.topic;
            list.appendChild(el('div', { class: 'topic-item' },
                el('span', { class: 'topic-name', text: name }),
                el('span', { class: 'topic-count-wrap' },
                    el('span', { class: 'topic-count', text: App.t('nQuestions', { n: t.total }) }),
                    t.pct !== null ? el('span', { class: 'mini-acc', text: t.pct + '%', title: App.t('statsAccuracy') }) : null)));
        });
        left.appendChild(list);

        // right: setup
        const modes = App.modes.list(exam, qstats);
        const d = App.state.dash;
        const select = el('select', { id: 'cfg-mode' });
        const groups = { exam: el('optgroup', { label: App.t('modeGroupExam') }), practice: el('optgroup', { label: App.t('modeGroupPractice') }), topic: el('optgroup', { label: App.t('modeGroupTopics') }) };
        modes.forEach(m => groups[m.group].appendChild(el('option', { value: m.id, text: modeLabel(m), disabled: m.available === 0 })));
        ['exam', 'practice', 'topic'].forEach(g => { if (groups[g].children.length) select.appendChild(groups[g]); });
        const count = el('input', { type: 'number', id: 'cfg-count', min: 1, step: 1 });
        const study = el('input', { type: 'checkbox', id: 'cfg-study' });
        const timer = el('select', { id: 'cfg-timer' });
        const hintEl = el('p', { class: 'hint', id: 'cfg-hint' });
        const startBtn = el('button', { id: 'start-btn', class: 'btn', type: 'button', text: App.t('startSession') });

        function current() { return modes.find(m => m.id === select.value) || modes[0]; }
        function refresh(fromChange) {
            const m = current();
            const defined = m.defined;
            const def = Math.min(m.count || m.defaultCount || m.available, m.available) || 1;
            count.max = m.available;
            if (fromChange || !count.value) count.value = def;
            count.disabled = !!(defined && defined.selection === 'weighted');
            if (count.disabled) count.value = def;
            if (fromChange) study.checked = m.studyDefault;
            hintEl.textContent = study.checked ? App.t('studyModeHint') : App.t('examModeHint');
            const totalSec = (defined && defined.timeSec) ? defined.timeSec : (Number(count.value) || def) * exam.settings.timePerQuestionSec;
            const keep = timer.value || 'default';
            timer.textContent = '';
            timer.appendChild(el('option', { value: 'default', text: App.t('timerDefault') + ' — ' + App.t('timerTotal', { m: Math.max(1, Math.round(totalSec / 60)) }) }));
            timer.appendChild(el('option', { value: 'perQuestion', text: App.t('timerPerQuestion', { s: exam.settings.timePerQuestionSec }) }));
            timer.appendChild(el('option', { value: 'none', text: App.t('timerNone') }));
            timer.value = keep;
            startBtn.disabled = m.available === 0;
        }
        select.value = d.mode && modes.some(m => m.id === d.mode && m.available) ? d.mode : (modes.find(m => m.available) || modes[0]).id;
        select.addEventListener('change', () => { d.mode = select.value; refresh(true); });
        count.addEventListener('input', () => refresh(false));
        study.addEventListener('change', () => { hintEl.textContent = study.checked ? App.t('studyModeHint') : App.t('examModeHint'); });
        refresh(true);
        if (d.count && d.mode === select.value && !count.disabled) count.value = Math.min(d.count, count.max);
        if (d.study !== undefined && d.mode === select.value) study.checked = d.study;
        if (d.timer) timer.value = d.timer;
        hintEl.textContent = study.checked ? App.t('studyModeHint') : App.t('examModeHint');

        startBtn.addEventListener('click', () => {
            Object.assign(d, { mode: select.value, count: Number(count.value), study: study.checked, timer: timer.value });
            App.ui.startFromDashboard(current(), Number(count.value), study.checked, timer.value);
        });

        const setup = el('div', { class: 'sidebar-box', style: 'margin-top:15px;' },
            el('h2', { class: 'sidebar-title', text: App.t('sessionConfig') }),
            el('div', { class: 'setup-box' },
                el('div', { class: 'form-group' }, el('label', { for: 'cfg-mode', text: App.t('selectMode') }), select),
                el('div', { class: 'form-group' }, el('label', { for: 'cfg-count', text: App.t('count') }), count),
                el('div', { class: 'checkbox-row' }, study, el('label', { for: 'cfg-study', text: App.t('studyMode') })),
                hintEl,
                el('div', { class: 'form-group' }, el('label', { for: 'cfg-timer', text: App.t('timerLabel') }), timer),
                startBtn));
        grid.appendChild(left);
        grid.appendChild(setup);
        v.appendChild(grid);
    };

    App.ui.startFromDashboard = function (mode, count, studyMode, timerChoice) {
        const exam = App.state.exam;
        const qstats = App.storage.allQStats(exam.id);
        const picked = App.modes.pick(exam, mode.id, qstats, { count });
        if (!picked.questions.length) { App.ui.toast(App.t('modeEmpty')); return; }
        if (picked.fallback) App.ui.toast(App.t('notDue'), 5000);
        const defined = mode.defined;
        const n = picked.questions.length;
        let timerMode = timerChoice === 'none' ? 'none' : (timerChoice === 'perQuestion' ? 'perQuestion' : 'total');
        const totalSec = (defined && defined.timeSec) ? defined.timeSec : n * exam.settings.timePerQuestionSec;
        const label = mode.label ? App.loc(mode.label) : App.t(mode.labelKey, Object.assign({}, mode.labelParams, mode.labelParams && mode.labelParams.t ? { t: App.loc(mode.labelParams.t) } : {}));
        const session = App.Session.create(picked.questions, {
            examId: exam.id, modeId: mode.id, modeLabel: label, studyMode,
            timerMode, totalSec: timerMode === 'total' ? totalSec : 0, perQuestionSec: exam.settings.timePerQuestionSec,
            threshold: (defined && defined.passThreshold !== undefined) ? defined.passThreshold : exam.settings.passThreshold,
            shuffleOptions: exam.settings.shuffleOptions
        });
        App.ui.beginSession(session);
    };
})();
