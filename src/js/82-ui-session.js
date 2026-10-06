/* UI: the exam runtime (question card, progress grid, flags, notes, timers, keyboard). */
(function () {
    const { el, icon } = App.util;
    const $ = App.ui.$;
    let refs = {};

    const S = () => App.state.session;

    App.ui.persist = function () {
        const s = S();
        if (s && !s.submitted) App.storage.saveSession(s.examId, s.toJSON());
    };
    function schedulePersist() {
        clearTimeout(App.state.persistTimer);
        App.state.persistTimer = setTimeout(App.ui.persist, 400);
    }

    App.ui.resumeSession = function (session) {
        const away = session.applyAway();
        if (away > 0 && session.secondsLeft <= 0) {      // strict clock: time ran out while away
            App.state.session = session;
            App.ui.toast(App.t('strictExpired'), 5000);
            App.state.exam && App.ui.submit(true);
            return;
        }
        App.ui.beginSession(session, true);
    };

    App.ui.beginSession = function (session, resumed) {
        App.state.session = session;
        App.state.lastResult = null;
        buildSkeleton();
        App.ui.show('runtime');
        App.ui.persist();
        startClock();
        App.ui.refreshRuntime();
        App.events.emit('sessionStart', { session, resumed: !!resumed });
    };

    function buildSkeleton() {
        const v = $('view-runtime');
        v.textContent = '';
        refs = {};
        refs.bar = el('i');
        refs.topic = el('span', { class: 'tag-topic' });
        refs.pos = el('span', { class: 'q-number', aria: { live: 'polite' } });
        refs.pace = el('span', { class: 'chip pace-chip hidden', id: 'pace-chip' });
        refs.pause = el('button', { type: 'button', class: 'chip-btn', id: 'pause-btn', onclick: () => doPause() });
        refs.flag = el('button', { type: 'button', class: 'flag-btn', onclick: () => toggleFlag() });
        refs.report = el('button', { type: 'button', class: 'chip-btn', id: 'report-btn', onclick: () => App.ui.reportQuestion(S().item()) });
        refs.clear = el('button', { type: 'button', class: 'chip-btn', id: 'clear-btn', onclick: () => clearAnswer() });
        refs.text = el('div', { class: 'question-text', id: 'q-text' });
        refs.body = el('div', { id: 'q-body' });
        refs.expl = el('div', { id: 'q-expl', aria: { live: 'polite' } });
        refs.noteSummary = el('summary', {});
        refs.noteArea = el('textarea', { id: 'q-note', maxLength: 2000 });
        refs.noteArea.addEventListener('input', () => {
            const s = S(), uid = s.item().uid;
            clearTimeout(refs.noteTimer);
            refs.noteTimer = setTimeout(() => App.storage.patchQStat(s.examId, uid, st => { st.note = refs.noteArea.value; return st; }), 400);
        });
        refs.note = el('details', { class: 'note-box' }, refs.noteSummary, refs.noteArea);
        refs.prev = el('button', { type: 'button', class: 'btn btn-secondary', id: 'prev-btn', onclick: () => go(S().index - 1) });
        refs.check = el('button', { type: 'button', class: 'btn btn-dark', id: 'validate-btn', onclick: () => checkAnswer() });
        refs.next = el('button', { type: 'button', class: 'btn', id: 'session-action-trigger', onclick: () => nextQuestion() });
        refs.help = el('p', { class: 'kbd-help' });
        refs.legend = el('div', { class: 'legend' });
        refs.grid = el('div', { class: 'grid-navigation', role: 'group' });
        refs.gridTitle = el('span', {});
        refs.gridCount = el('span', { class: 'count' });
        refs.finish = el('button', { type: 'button', class: 'btn btn-danger btn-block', id: 'finish-btn', style: 'margin-top:12px', onclick: () => App.ui.openReview() });

        const main = el('div', { class: 'card q-card' },
            el('div', { class: 'q-bar' }, refs.bar),
            el('div', { class: 'q-top' }, refs.topic, el('div', { class: 'q-meta' }, refs.pace, refs.pos, refs.pause, refs.clear, refs.report, refs.flag)),
            refs.text, refs.body, refs.expl, refs.note,
            el('div', { class: 'actionbar' }, refs.prev, refs.check, el('span', { class: 'spacer' }), refs.next),
            refs.help);
        const panel = el('details', { class: 'panel', id: 'grid-panel' },
            el('summary', { class: 'panel-title' }, refs.gridTitle, el('span', { class: 'row', style: 'gap:8px' }, refs.gridCount, icon('chevron', 16))),
            refs.legend, refs.grid);
        if (window.matchMedia && window.matchMedia('(min-width: 961px)').matches) panel.open = true;
        const side = el('aside', { class: 'run-side' }, panel, refs.finish);
        refs.overlay = el('div', { class: 'pause-overlay hidden', id: 'pause-overlay', role: 'dialog', aria: { modal: 'true' } });
        v.appendChild(el('div', { class: 'run-layout' }, main, side));
        v.appendChild(refs.overlay);
    }

    function doPause() {
        const s = S();
        if (!s.pause()) return;
        App.ui.persist();
        App.events.emit('pause', { session: s });
        renderPause();
    }
    function doUnpause() {
        const s = S();
        s.unpause();
        App.ui.persist();
        renderPause();
        App.events.emit('unpause', { session: s });
    }
    function renderPause() {
        const s = S();
        refs.overlay.classList.toggle('hidden', !s.paused);
        refs.overlay.textContent = '';
        if (s.paused) {
            refs.overlay.appendChild(el('div', { class: 'pause-card' },
                icon('clock', 34), el('h2', { text: App.t('pausedTitle') }), el('p', { class: 'muted', text: App.t('pausedText') }),
                App.ui.btn(App.t('resumeExam'), 'play', 'btn-lg', () => doUnpause(), { id: 'unpause-btn' })));
            const b = refs.overlay.querySelector('button'); if (b) b.focus();
        }
        const left = s.pausesLeft();
        refs.pause.classList.toggle('hidden', s.timerMode === 'none');
        refs.pause.disabled = !s.canPause();
        refs.pause.textContent = '';
        refs.pause.appendChild(icon('clock', 14));
        refs.pause.appendChild(el('span', { text: left === null ? App.t('pauseBtn') : (left > 0 ? App.t('pauseLeft', { n: left }) : App.t('pauseNone')) }));
    }
    function renderPace() {
        const s = S();
        const d = s.pace();
        if (d === null || s.studyMode) { refs.pace.classList.add('hidden'); return; }
        refs.pace.classList.remove('hidden', 'ok', 'warn', 'bad');
        const txt = d >= 1 ? App.t('paceAhead', { n: Math.floor(d) }) : (d <= -2 ? App.t('paceBehind', { n: Math.ceil(-d) }) : App.t('paceOn'));
        refs.pace.textContent = txt;
        refs.pace.classList.add(d >= 1 ? 'ok' : (d <= -2 ? 'bad' : 'warn'));
        refs.pace.classList.toggle('warn', d > -2 && d < 1);
    }

    function topicName(t) {
        const ex = App.state.exam;
        return ex && ex.topics && ex.topics[t] ? App.loc(ex.topics[t]) : t;
    }

    // Full refresh of the runtime view (also after language change)
    App.ui.refreshRuntime = function () {
        const s = S();
        if (!s) return;
        refs.prev.textContent = ''; refs.prev.appendChild(icon('back', 17)); refs.prev.appendChild(el('span', { text: App.t('previous') }));
        refs.check.textContent = ''; refs.check.appendChild(icon('check', 17)); refs.check.appendChild(el('span', { text: App.t('validate') }));
        refs.check.classList.toggle('hidden', !s.studyMode);
        refs.gridTitle.textContent = App.t('progress');
        refs.finish.textContent = ''; refs.finish.appendChild(icon('flag', 16)); refs.finish.appendChild(el('span', { text: App.t('endScore') }));
        refs.help.textContent = App.t('keyboardHelp');
        refs.noteSummary.textContent = ''; refs.noteSummary.appendChild(icon('note', 15)); refs.noteSummary.appendChild(el('span', { text: App.t('note') }));
        refs.noteArea.placeholder = App.t('notePlaceholder');
        refs.legend.textContent = '';
        refs.legend.appendChild(el('span', { class: 'lg-answered', text: App.t('legendAnswered') }));
        refs.legend.appendChild(el('span', { text: App.t('legendUnanswered') }));
        refs.legend.appendChild(el('span', { class: 'lg-flagged', text: App.t('legendFlagged') }));
        renderQuestion();
        renderGrid();
        updateClock();
        renderPause();
        renderPace();
    };

    function renderQuestion() {
        const s = S();
        const i = s.index;
        const item = s.item(i);
        const h = s.handler(i);
        const checked = s.studyMode && s.isChecked(i);
        refs.topic.textContent = topicName(item.topic);
        refs.pos.textContent = App.t('questionOf', { i: i + 1, n: s.length });
        refs.text.textContent = '';
        refs.text.appendChild(App.rich.node(App.loc(item.text)));
        refs.body.textContent = '';
        refs.body.appendChild(h.render({
            item, value: s.value(i), locked: checked, reveal: checked, uid: 'q' + i,
            onChange: (v, o) => {
                s.setValue(i, v);
                App.events.emit('answer', { session: s, index: i, value: v });
                renderGrid();
                schedulePersist();
                if (!o || !o.silent) renderQuestion();
            }
        }));
        refs.expl.textContent = '';
        if (checked) {
            refs.expl.appendChild(el('div', { class: 'dynamic-explanation-box' }, el('div', {},
                el('h3', { text: App.t('explanation') }),
                item.explanation ? App.rich.node(App.loc(item.explanation)) : el('p', { text: App.t('noExplanation') }))));
        }
        refs.check.disabled = !!checked;
        const last = i === s.length - 1;
        refs.next.textContent = '';
        refs.next.appendChild(el('span', { text: last ? App.t('finish') : App.t('next') }));
        refs.next.appendChild(icon(last ? 'flag' : 'next', 17));
        refs.prev.disabled = i === 0;
        const st = App.storage.getQStat(s.examId, item.uid) || {};
        refs.flag.setAttribute('aria-pressed', st.flag ? 'true' : 'false');
        refs.flag.textContent = ''; refs.flag.appendChild(icon('flag', 14)); refs.flag.appendChild(el('span', { text: st.flag ? App.t('unflag') : App.t('flag') }));
        refs.noteArea.value = st.note || '';
        refs.note.open = !!st.note;
        refs.clear.disabled = !!checked || !s.hasAnswer(i);
        refs.clear.textContent = ''; refs.clear.appendChild(icon('x', 14)); refs.clear.appendChild(el('span', { text: App.t('clearBtn') }));
        refs.report.textContent = ''; refs.report.appendChild(icon('flag', 14)); refs.report.appendChild(el('span', { text: App.t('reportBtn') }));
    }

    function clearAnswer() {
        const s = S(), i = s.index;
        if (s.isChecked(i) || !s.hasAnswer(i)) return;
        s.setValue(i, undefined);
        App.events.emit('answer', { session: s, index: i, value: undefined });
        renderQuestion(); renderGrid(); App.ui.persist();
    }

    function renderGrid() {
        const s = S();
        const stats = App.storage.allQStats(s.examId);
        refs.grid.textContent = '';
        for (let i = 0; i < s.length; i++) {
            let cls = 'nav-grid-btn' + (i === s.index ? ' active' : '');
            if (s.studyMode && s.validated[i] === true) cls += ' answered-correct';
            else if (s.studyMode && s.validated[i] === false) cls += ' answered-wrong';
            else if (s.hasAnswer(i)) cls += ' answered';
            const st = stats[s.item(i).uid];
            if (st && st.flag) cls += ' flagged';
            refs.grid.appendChild(el('button', { type: 'button', class: cls, text: String(i + 1), onclick: () => go(i),
                aria: { label: App.t('questionOf', { i: i + 1, n: s.length }), current: i === s.index ? 'true' : 'false' } }));
        }
        const answered = s.answeredCount();
        refs.gridCount.textContent = App.t('answeredOf', { a: answered, n: s.length });
        refs.bar.style.width = (s.length ? Math.round(100 * answered / s.length) : 0) + '%';
    }

    function go(i) {
        const s = S();
        if (s.goTo(i)) { renderQuestion(); renderGrid(); updateClock(); App.ui.persist(); App.events.emit('navigate', { session: s, index: i }); }
    }

    function nextQuestion() {
        const s = S();
        if (s.index === s.length - 1) App.ui.openReview(); else go(s.index + 1);
    }

    function checkAnswer() {
        const s = S();
        const r = s.check(s.index);
        if (r === null) { App.ui.toast(App.t('selectFirst')); return; }
        App.events.emit('check', { session: s, index: s.index, correct: r });
        renderQuestion(); renderGrid(); App.ui.persist();
    }

    function toggleFlag() {
        const s = S(), uid = s.item().uid;
        App.storage.patchQStat(s.examId, uid, st => { st.flag = !st.flag; return st; });
        renderQuestion(); renderGrid();
    }

    // ---- clock ----
    function updateClock() {
        const s = S();
        const box = $('runtime-timer-box');
        const live = App.state.screen === 'runtime' || (App.state.screen === 'review' && s && s.timerMode === 'total');
        if (!s || !live || s.timerMode === 'none') { box.classList.add('hidden'); return; }
        box.classList.remove('hidden');
        const per = s.timerMode === 'perQuestion';
        const left = per ? s.qLeft : s.secondsLeft;
        $('timer-label').textContent = per ? App.t('timerQuestionLabel') : App.t('timeRemaining');
        $('runtime-clock-string').textContent = App.ui.fmtTime(left);
        const warn = per ? 10 : 60, danger = per ? 5 : 15;
        box.classList.toggle('warn', left <= warn && left > danger);
        box.classList.toggle('danger', left <= danger);
    }
    App.ui.updateClock = updateClock;

    function startClock() {
        clearInterval(App.state.clockTimer);
        App.state.clockTimer = setInterval(() => {
            const s = S();
            const screen = App.state.screen;
            // the total timer keeps running on the review screen; per-question timers pause there
            if (!s || s.paused || !(screen === 'runtime' || (screen === 'review' && s.timerMode === 'total'))) return;
            const ev = s.tick();
            updateClock();
            if (screen === 'runtime') renderPace();
            if (ev === 'total') { App.ui.submit(true); return; }
            if (ev === 'question' && screen === 'runtime') { if (s.index < s.length - 1) go(s.index + 1); else App.ui.openReview(); return; }
            if (s.times[s.index] % 10 === 0) App.ui.persist();
        }, 1000);
    }
    App.ui.stopClock = function () {
        clearInterval(App.state.clockTimer);
        App.state.clockTimer = null;
        const box = $('runtime-timer-box');
        box.classList.add('hidden'); box.classList.remove('warn', 'danger');
    };

    // ---- keyboard ----
    document.addEventListener('keydown', e => {
        if (App.state.screen !== 'runtime' || e.ctrlKey || e.metaKey || e.altKey) return;
        if (S() && S().paused && e.key.toLowerCase() !== 'p') return;
        const t = e.target;
        const typing = t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type === 'text') || (e.key.startsWith('Arrow') && t.classList && t.classList.contains('option-input')));
        if (typing) return;
        const s = S();
        const key = e.key.toLowerCase();
        const pick = idx => {
            const inputs = refs.body.querySelectorAll('.option-input');
            if (inputs[idx] && !inputs[idx].disabled) { inputs[idx].click(); e.preventDefault(); }
        };
        if (/^[1-6]$/.test(key)) pick(parseInt(key, 10) - 1);
        else if (/^[a-f]$/.test(key)) pick(key.charCodeAt(0) - 97);
        else if (key === 'arrowright') { if (s.index < s.length - 1) go(s.index + 1); e.preventDefault(); }
        else if (key === 'arrowleft') { go(s.index - 1); e.preventDefault(); }
        else if (key === 'm') { toggleFlag(); e.preventDefault(); }
        else if (key === 'r') { App.ui.reportQuestion(s.item()); e.preventDefault(); }
        else if (key === 'x') { clearAnswer(); e.preventDefault(); }
        else if (key === 'p') { if (s.paused) doUnpause(); else doPause(); e.preventDefault(); }
        else if (key === 'enter' && t.tagName !== 'BUTTON' && t.tagName !== 'A' && t.tagName !== 'SUMMARY') {
            if (s.studyMode && !s.isChecked(s.index) && s.hasAnswer(s.index)) checkAnswer(); else nextQuestion();
            e.preventDefault();
        }
    });
})();
