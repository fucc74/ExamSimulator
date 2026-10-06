/* UI: the exam runtime (question view, progress grid, flags, notes, timers, keyboard). */
(function () {
    const { el } = App.util;
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

    App.ui.resumeSession = function (session) { App.ui.beginSession(session, true); };

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
        refs.topic = el('span', { class: 'tag-topic' });
        refs.pos = el('span', { class: 'q-number', aria: { live: 'polite' } });
        refs.flag = el('button', { type: 'button', class: 'flag-btn', onclick: () => toggleFlag() });
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
        refs.prev = el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => go(S().index - 1) });
        refs.check = el('button', { type: 'button', id: 'validate-btn', onclick: () => checkAnswer() });
        refs.next = el('button', { type: 'button', class: 'btn', id: 'session-action-trigger', onclick: () => nextQuestion() });
        refs.help = el('p', { class: 'kbd-help' });
        refs.legend = el('div', { class: 'legend' });
        refs.grid = el('div', { class: 'grid-navigation', role: 'group' });
        refs.finish = el('button', { type: 'button', class: 'btn btn-secondary btn-danger-outline', onclick: () => App.ui.openReview() });

        const main = el('div', { class: 'card', style: 'margin-bottom:0;' },
            el('div', { class: 'question-header' }, refs.topic, el('span', { class: 'question-actions' }, refs.pos, refs.flag)),
            refs.text, refs.body, refs.expl, refs.note,
            el('div', { class: 'nav-controls' }, refs.prev, refs.check, el('span', { class: 'spacer' }), refs.next),
            refs.help);
        const side = el('div', { class: 'sidebar-box' }, el('h2', { class: 'sidebar-title', id: 'progress-title' }), refs.legend, refs.grid, refs.finish);
        refs.progressTitle = side.querySelector('#progress-title');
        v.appendChild(el('div', { class: 'runtime-layout' }, main, side));
    }

    function topicName(t) {
        const ex = App.state.exam;
        return ex && ex.topics && ex.topics[t] ? App.loc(ex.topics[t]) : t;
    }

    // Full refresh of the runtime view (also after language change)
    App.ui.refreshRuntime = function () {
        const s = S();
        if (!s) return;
        refs.prev.textContent = App.t('previous');
        refs.check.textContent = App.t('validate');
        refs.check.classList.toggle('hidden', !s.studyMode);
        refs.progressTitle.textContent = App.t('progress');
        refs.finish.textContent = App.t('endScore');
        refs.help.textContent = App.t('keyboardHelp');
        refs.noteSummary.textContent = '📝 ' + App.t('note');
        refs.noteArea.placeholder = App.t('notePlaceholder');
        refs.legend.textContent = '';
        refs.legend.appendChild(el('span', { class: 'lg-answered', text: App.t('legendAnswered') }));
        refs.legend.appendChild(el('span', { text: App.t('legendUnanswered') }));
        refs.legend.appendChild(el('span', { class: 'lg-flagged', text: App.t('legendFlagged') }));
        renderQuestion();
        renderGrid();
        updateClock();
    };

    function renderQuestion() {
        const s = S();
        const i = s.index;
        const item = s.item(i);
        const h = s.handler(i);
        const checked = s.studyMode && s.isChecked(i);
        refs.topic.textContent = topicName(item.topic);
        refs.pos.textContent = App.t('questionOf', { i: i + 1, n: s.length });
        refs.text.textContent = App.loc(item.text);
        refs.text.setAttribute('aria-label', '');
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
            refs.expl.appendChild(el('div', { class: 'dynamic-explanation-box' },
                el('h3', { text: App.t('explanation') }),
                el('p', { text: App.loc(item.explanation) || App.t('noExplanation') })));
        }
        refs.check.disabled = !!checked;
        const last = i === s.length - 1;
        refs.next.textContent = last ? App.t('finish') : App.t('next');
        refs.next.classList.toggle('btn-final', last);
        refs.prev.disabled = i === 0;
        const st = App.storage.getQStat(s.examId, item.uid) || {};
        refs.flag.setAttribute('aria-pressed', st.flag ? 'true' : 'false');
        refs.flag.textContent = '⚑ ' + (st.flag ? App.t('unflag') : App.t('flag'));
        refs.noteArea.value = st.note || '';
        refs.note.open = !!st.note;
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
            const b = el('button', { type: 'button', class: cls, text: String(i + 1), onclick: () => go(i),
                aria: { label: App.t('questionOf', { i: i + 1, n: s.length }), current: i === s.index ? 'true' : 'false' } });
            refs.grid.appendChild(b);
        }
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
        if (!s || App.state.screen !== 'runtime' || s.timerMode === 'none') { box.classList.add('hidden'); return; }
        box.classList.remove('hidden');
        $('timer-label').textContent = s.timerMode === 'perQuestion' ? App.t('timerQuestionLabel') : App.t('timeRemaining');
        $('runtime-clock-string').textContent = App.ui.fmtTime(s.timerMode === 'perQuestion' ? s.qLeft : s.secondsLeft);
    }
    App.ui.updateClock = updateClock;

    function startClock() {
        clearInterval(App.state.clockTimer);
        App.state.clockTimer = setInterval(() => {
            const s = S();
            if (!s || App.state.screen !== 'runtime') return;
            const ev = s.tick();
            updateClock();
            if (ev === 'total') { App.ui.submit(true); return; }
            if (ev === 'question') { if (s.index < s.length - 1) go(s.index + 1); else App.ui.openReview(); return; }
            if (s.times[s.index] % 10 === 0) App.ui.persist();
        }, 1000);
    }
    App.ui.stopClock = function () {
        clearInterval(App.state.clockTimer);
        App.state.clockTimer = null;
        $('runtime-timer-box').classList.add('hidden');
    };

    // ---- keyboard ----
    document.addEventListener('keydown', e => {
        if (App.state.screen !== 'runtime' || e.ctrlKey || e.metaKey || e.altKey) return;
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
        else if (key === 'enter' && t.tagName !== 'BUTTON' && t.tagName !== 'A') {
            if (s.studyMode && !s.isChecked(s.index) && s.hasAnswer(s.index)) checkAnswer(); else nextQuestion();
            e.preventDefault();
        }
    });
})();
