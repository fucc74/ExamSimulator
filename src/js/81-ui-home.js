/* UI: exam picker and exam dashboard (hero, mode tiles, topics, session setup). */
(function () {
    const { el, icon } = App.util;
    const $ = App.ui.$;

    const col = pct => pct >= 75 ? 'var(--success)' : (pct >= 50 ? 'var(--warning)' : 'var(--error)');

    function miniRing(pct) {
        const wrap = el('div', { class: 'mini-ring', title: pct + '%' });
        wrap.appendChild(App.ui.ring(pct, col(pct), 46, 12));
        wrap.appendChild(el('span', { text: pct + '%' }));
        return wrap;
    }

    // ---------------------------------------------------------------- picker
    App.ui.renderPicker = function () {
        const v = $('view-picker');
        v.textContent = '';
        const err = App.state.loadError;
        v.appendChild(el('div', { class: 'picker-head' },
            el('h1', { text: err ? App.t('loadFailedTitle') : App.t('noExamTitle'), style: err ? '-webkit-text-fill-color:var(--error);color:var(--error);background:none' : '' }),
            el('p', { class: 'subtitle', text: App.t('noExamText') })));
        if (err) {
            const box = el('div', { class: 'error-box', role: 'alert' });
            err.forEach(line => box.appendChild(el('p', { text: line })));
            v.appendChild(box);
        }
        const cat = App.loader.catalog();
        if (!cat.length) v.appendChild(el('p', { class: 'hint', style: 'text-align:center', text: App.t('noCatalog') }));
        const grid = el('div', { class: 'exam-grid', id: 'exam-list' });
        cat.forEach(item => {
            const id = item.id || item.file;
            const attempts = App.storage.listAttempts(id);
            const last = attempts[attempts.length - 1];
            const sessions = App.storage.listSessions(id).length;
            const top = el('div', { class: 'exam-card-top' }, el('div', { class: 'exam-card-icon' }, icon('book', 22)));
            if (last) top.appendChild(miniRing(last.pct));
            const meta = el('div', { class: 'exam-card-meta' });
            if (item.questionCount) meta.appendChild(el('span', { class: 'chip', text: App.t('examCardMeta', { n: item.questionCount, t: item.topicCount || '–' }) }));
            if (attempts.length) meta.appendChild(el('span', { class: 'chip primary', text: attempts.length === 1 ? App.t('attemptOne') : App.t('attemptsChip', { n: attempts.length }) }));
            if (sessions) meta.appendChild(el('span', { class: 'chip warn', text: App.t('inProgressChip') }));
            grid.appendChild(el('a', { href: '?content=' + encodeURIComponent(item.file), class: 'exam-card' }, top,
                el('div', { class: 'exam-card-title', text: App.loc(item.title) || item.file }),
                el('div', { class: 'exam-card-desc', text: App.loc(item.description) }), meta));
        });
        v.appendChild(grid);
        v.appendChild(el('div', { style: 'margin-top:var(--space)' }, App.ui.toolbarButtons({ stats: false })));
    };

    // ------------------------------------------------------------- dashboard
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
    function modeTitle(m) {
        return m.label ? App.loc(m.label) : App.t(m.labelKey, Object.assign({}, m.labelParams, m.labelParams && m.labelParams.t ? { t: App.loc(m.labelParams.t) } : {}));
    }
    App.ui.modeTitle = modeTitle;

    const TILE_ICONS = { all: 'layers', review: 'refresh', mistakes: 'target', flagged: 'flag', unseen: 'star' };

    App.ui.renderDashboard = function () {
        const exam = App.state.exam;
        const v = $('view-dashboard');
        v.textContent = '';
        const qstats = App.storage.allQStats(exam.id);
        const stats = App.stats.compute(exam, App.storage);
        const mastery = stats.totalQuestions ? Math.round(100 * stats.mastered / stats.totalQuestions) : 0;

        // hero
        const official = exam.modes.find(m => m.exam);
        const hero = el('div', { class: 'hero' });
        const heroLeft = el('div', { style: 'flex:1 1 320px;min-width:0' },
            el('span', { class: 'hero-eyebrow' }, icon('book', 14), el('span', { text: [exam.code, exam.version].filter(Boolean).join(' · ') || 'EXAM' })),
            el('h1', { text: App.loc(exam.title) }),
            exam.description ? el('p', { class: 'subtitle', text: App.loc(exam.description) }) : null,
            el('div', { class: 'hero-chips' },
                el('span', { class: 'hero-chip' }, icon('layers', 14), el('span', { text: App.t('nQuestions', { n: exam.questions.length }) })),
                el('span', { class: 'hero-chip' }, icon('grid', 14), el('span', { text: App.t('nTopics', { n: exam.topicList.length }) })),
                el('span', { class: 'hero-chip' }, icon('target', 14), el('span', { text: App.t('passChip', { p: exam.settings.passThreshold }) })),
                official && official.timeSec ? el('span', { class: 'hero-chip' }, icon('clock', 14), el('span', { text: Math.round(official.timeSec / 60) + ' min' })) : null));
        hero.appendChild(el('div', { class: 'hero-grid' }, heroLeft, heroMasteryRing(mastery, stats)));
        v.appendChild(hero);

        v.appendChild(el('div', { class: 'exam-switcher' }, el('span', { class: 'exam-switcher-label', text: App.t('switchExam') }), examChips()));
        v.appendChild(el('div', { style: 'margin-bottom:var(--space)' }, App.ui.toolbarButtons({ stats: true, examIds: [exam.id] })));

        const grid = el('div', { class: 'dash-grid' });
        const main = el('div', { class: 'dash-main' });
        const side = el('div', { class: 'dash-side' });

        // sessions in progress
        const sessions = App.storage.listSessions(exam.id);
        if (sessions.length) {
            const box = el('div', { class: 'sessions-box' }, el('h3', {}, icon('play', 16), el('span', { text: App.t('resumeTitle') })));
            sessions.forEach(sd => {
                const s = App.Session.fromJSON(sd);
                box.appendChild(el('div', { class: 'session-row' },
                    el('span', { class: 'session-info', text: App.t('resumeInfo', { mode: s.modeLabel, done: s.answeredCount(), n: s.length, when: App.ui.timeAgo(s.updatedAt) }) }),
                    el('span', { class: 'session-actions' },
                        App.ui.btn(App.t('resumeBtn'), 'play', 'btn-sm', () => App.ui.resumeSession(s)),
                        App.ui.btn('', 'trash', 'btn-ghost btn-sm', () => { if (confirm(App.t('confirmDeleteSession'))) { App.storage.deleteSession(exam.id, s.id); App.ui.renderDashboard(); } }, { title: App.t('deleteBtn'), 'aria-label': App.t('deleteBtn') }))));
            });
            box.classList.add('ord-sessions');
            main.appendChild(box);
        }

        // setup form (side)
        const modes = App.modes.list(exam, qstats);
        const d = App.state.dash;
        const select = el('select', { id: 'cfg-mode' });
        const groups = { exam: el('optgroup', { label: App.t('modeGroupExam') }), practice: el('optgroup', { label: App.t('modeGroupPractice') }), topic: el('optgroup', { label: App.t('modeGroupTopics') }) };
        modes.forEach(m => groups[m.group].appendChild(el('option', { value: m.id, text: modeLabel(m), disabled: m.available === 0 })));
        ['exam', 'practice', 'topic'].forEach(g => { if (groups[g].children.length) select.appendChild(groups[g]); });
        const count = el('input', { type: 'number', id: 'cfg-count', min: 1, step: 1, inputMode: 'numeric' });
        const study = el('input', { type: 'checkbox', id: 'cfg-study' });
        const timer = el('select', { id: 'cfg-timer' });
        const hintEl = el('p', { class: 'hint', id: 'cfg-hint' });
        const startBtn = el('button', { id: 'start-btn', class: 'btn btn-lg btn-block', type: 'button' }, icon('play', 18), el('span', { text: App.t('startSession') }));
        const tiles = [];

        function current() { return modes.find(m => m.id === select.value) || modes[0]; }
        function paintTiles() { tiles.forEach(t => t.btn.setAttribute('aria-pressed', t.id === select.value ? 'true' : 'false')); }
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
            paintTiles();
        }
        select.value = d.mode && modes.some(m => m.id === d.mode && m.available) ? d.mode : (modes.find(m => m.available) || modes[0]).id;
        select.addEventListener('change', () => { d.mode = select.value; refresh(true); });
        count.addEventListener('input', () => refresh(false));
        study.addEventListener('change', () => { hintEl.textContent = study.checked ? App.t('studyModeHint') : App.t('examModeHint'); });

        // mode tiles
        const tileModes = modes.filter(m => m.group === 'exam' || (m.group === 'practice' && TILE_ICONS[m.id]));
        const tileGrid = el('div', { class: 'mode-grid', role: 'group', aria: { label: App.t('selectMode') } });
        tileModes.forEach(m => {
            const sub = m.group === 'exam' ? [m.count ? App.t('nQuestions', { n: m.count }) : '', m.defined && m.defined.timeSec ? Math.round(m.defined.timeSec / 60) + ' min' : ''].filter(Boolean).join(' · ') : App.t('nQuestions', { n: m.available });
            const iconName = m.group === 'exam' ? (m.defined && m.defined.exam ? 'trophy' : 'bolt') : TILE_ICONS[m.id];
            const btn = el('button', { type: 'button', class: 'mode-tile', disabled: m.available === 0, aria: { pressed: 'false' },
                onclick: () => { select.value = m.id; select.dispatchEvent(new Event('change')); } },
                el('span', { class: 'mode-icon' }, icon(iconName, 18)),
                el('span', { class: 'mode-name', text: modeTitle(m) }),
                el('span', { class: 'mode-sub', text: sub }));
            tiles.push({ id: m.id, btn });
            tileGrid.appendChild(btn);
        });

        refresh(true);
        if (d.count && d.mode === select.value && !count.disabled) count.value = Math.min(d.count, count.max);
        if (d.study !== undefined && d.mode === select.value) study.checked = d.study;
        if (d.timer) timer.value = d.timer;
        hintEl.textContent = study.checked ? App.t('studyModeHint') : App.t('examModeHint');
        startBtn.addEventListener('click', () => {
            Object.assign(d, { mode: select.value, count: Number(count.value), study: study.checked, timer: timer.value });
            App.ui.startFromDashboard(current(), Number(count.value), study.checked, timer.value);
        });

        const setup = el('div', { class: 'card', id: 'setup-card', style: 'margin-bottom:0' },
            el('h2', { style: 'margin-bottom:14px', text: App.t('sessionConfig') }),
            el('div', { class: 'field' }, el('label', { for: 'cfg-mode', text: App.t('selectMode') }), select),
            el('div', { class: 'field' }, el('label', { for: 'cfg-count', text: App.t('count') }), count),
            el('label', { class: 'switch-row', for: 'cfg-study' }, study, el('span', { class: 'switch' }), el('span', { class: 'switch-label', text: App.t('studyMode') })),
            hintEl,
            el('div', { class: 'field', style: 'margin-top:12px' }, el('label', { for: 'cfg-timer', text: App.t('timerLabel') }), timer),
            startBtn);
        side.appendChild(setup);

        const modesBox = el('div', { class: 'ord-modes' }, el('div', { class: 'section-title' }, el('h2', { text: App.t('chooseMode') })), tileGrid);
        main.appendChild(modesBox);

        // topics
        const topicsBox = el('div', { class: 'ord-topics' });
        topicsBox.appendChild(el('div', { class: 'section-title' }, el('h2', { text: App.t('distribution') }),
            el('span', { class: 'chip', text: App.t('nQuestions', { n: exam.questions.length }) })));
        const list = el('div', { class: 'topic-list' });
        stats.topics.forEach(t => {
            const name = exam.topics && exam.topics[t.topic] ? App.loc(exam.topics[t.topic]) : t.topic;
            const row = el('button', { type: 'button', class: 'topic-row', title: App.t('modeTopic', { t: name }),
                onclick: () => { select.value = 'topic:' + t.topic; select.dispatchEvent(new Event('change')); $('setup-card').scrollIntoView({ behavior: 'smooth', block: 'center' }); } },
                el('span', { class: 'topic-name', text: name }),
                el('span', { class: 'topic-count', text: App.t('nQuestions', { n: t.total }) + (t.pct !== null ? ' · ' + t.pct + '%' : '') }),
                el('span', { class: 'topic-bar' }, el('i', { style: 'width:' + (t.pct === null ? 0 : t.pct) + '%' })));
            list.appendChild(row);
        });
        topicsBox.appendChild(list);
        main.appendChild(topicsBox);

        grid.appendChild(main);
        grid.appendChild(side);
        v.appendChild(grid);
    };

    function heroMasteryRing(mastery, stats) {
        const wrap = el('div', { class: 'score-ring hero-ring', style: 'width:128px;color:#fff;flex-shrink:0', title: App.t('statsMastered') });
        wrap.appendChild(App.ui.ring(mastery, '#ffffff', 128, 9));
        wrap.appendChild(el('div', { class: 'score-num', style: 'font-size:1.7rem;color:#fff' }, el('span', { text: mastery + '%' }), el('small', { style: 'color:rgba(255,255,255,.85)', text: App.t('masteredShort') })));
        return wrap;
    }

    App.ui.startFromDashboard = function (mode, count, studyMode, timerChoice) {
        const exam = App.state.exam;
        const qstats = App.storage.allQStats(exam.id);
        const picked = App.modes.pick(exam, mode.id, qstats, { count });
        if (!picked.questions.length) { App.ui.toast(App.t('modeEmpty')); return; }
        if (picked.fallback) App.ui.toast(App.t('notDue'), 5000);
        const defined = mode.defined;
        const n = picked.questions.length;
        const timerMode = timerChoice === 'none' ? 'none' : (timerChoice === 'perQuestion' ? 'perQuestion' : 'total');
        const totalSec = (defined && defined.timeSec) ? defined.timeSec : n * exam.settings.timePerQuestionSec;
        const session = App.Session.create(picked.questions, {
            examId: exam.id, modeId: mode.id, modeLabel: modeTitle(mode), studyMode,
            timerMode, totalSec: timerMode === 'total' ? totalSec : 0, perQuestionSec: exam.settings.timePerQuestionSec,
            threshold: (defined && defined.passThreshold !== undefined) ? defined.passThreshold : exam.settings.passThreshold,
            shuffleOptions: exam.settings.shuffleOptions
        });
        App.ui.beginSession(session);
    };
})();
