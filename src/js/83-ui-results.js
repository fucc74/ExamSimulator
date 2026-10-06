/* UI: review before finishing, results and per-question review. */
(function () {
    const { el } = App.util;
    const $ = App.ui.$;
    const S = () => App.state.session;

    App.ui.openReview = function () {
        App.ui.show('review');
        App.ui.renderReview();
    };

    App.ui.renderReview = function () {
        const s = S();
        const v = $('view-review');
        v.textContent = '';
        const unanswered = s.unanswered();
        const stats = App.storage.allQStats(s.examId);
        const flagged = [];
        for (let i = 0; i < s.length; i++) { const st = stats[s.item(i).uid]; if (st && st.flag) flagged.push(i); }

        v.appendChild(el('h1', { text: App.t('reviewTitle') }));
        v.appendChild(el('p', { class: 'subtitle', text: App.t('reviewText', { a: s.length - unanswered.length, n: s.length, u: unanswered.length, f: flagged.length }) }));

        const grid = el('div', { class: 'review-grid' });
        for (let i = 0; i < s.length; i++) {
            let cls = 'nav-grid-btn' + (s.hasAnswer(i) ? ' answered' : ' unanswered-hint');
            if (flagged.includes(i)) cls += ' flagged';
            grid.appendChild(el('button', { type: 'button', class: cls, text: String(i + 1), onclick: () => { s.goTo(i); App.ui.show('runtime'); App.ui.refreshRuntime(); },
                aria: { label: App.t('questionOf', { i: i + 1, n: s.length }) } }));
        }
        v.appendChild(grid);

        const pills = (title, list) => {
            if (!list.length) return;
            const box = el('div', { class: 'review-block' }, el('h2', { text: title + ' (' + list.length + ')' }));
            const pl = el('div', { class: 'pill-list' });
            list.forEach(i => pl.appendChild(el('button', { type: 'button', class: 'pill', text: '#' + (i + 1), onclick: () => { s.goTo(i); App.ui.show('runtime'); App.ui.refreshRuntime(); } })));
            box.appendChild(pl); v.appendChild(box);
        };
        pills(App.t('reviewUnanswered'), unanswered);
        pills(App.t('reviewFlagged'), flagged);

        v.appendChild(el('div', { class: 'toolbar', style: 'margin-top:20px;' },
            el('button', { type: 'button', class: 'btn btn-secondary', text: App.t('reviewBack'), onclick: () => { App.ui.show('runtime'); App.ui.refreshRuntime(); } }),
            el('button', { type: 'button', class: 'btn', id: 'submit-btn', text: App.t('reviewSubmit'), onclick: () => App.ui.submit(false) })));
    };

    App.ui.submit = function (auto) {
        const s = S();
        if (!s || s.submitted) return;
        s.submitted = true;
        App.ui.stopClock();
        clearTimeout(App.state.persistTimer);
        const attempt = s.submit(App.storage);
        App.storage.addAttempt(s.examId, attempt);
        App.storage.deleteSession(s.examId, s.id);
        App.state.lastResult = { attempt, session: s };
        App.ui.show('summary');
        App.ui.renderSummary();
    };

    App.ui.renderSummary = function () {
        const r = App.state.lastResult;
        if (!r) return;
        const { attempt, session: s } = r;
        const v = $('view-summary');
        v.textContent = '';
        v.appendChild(el('h1', { text: App.t('resultsTitle') }));
        v.appendChild(el('p', { class: 'subtitle', text: App.t('resultsSubtitle') }));

        const color = attempt.passed ? 'var(--success)' : 'var(--error)';
        v.appendChild(el('div', { class: 'metrics-summary-box' },
            el('div', { class: 'score-circle', id: 'metric-percentage', style: 'border-color:' + color + ';color:' + color, text: attempt.pct + '%' }),
            el('div', {},
                el('h2', { id: 'metric-raw-string', style: 'font-size:1.3rem;font-weight:600;margin-bottom:4px;', text: App.t('scoreLine', { c: attempt.correct, n: attempt.total }) }),
                el('p', { id: 'exam-result-badge', style: 'font-size:1rem;font-weight:700;color:' + color, text: App.t(attempt.passed ? 'pass' : 'fail', { t: attempt.threshold }) }),
                el('p', { class: 'hint', text: s.modeLabel + ' · ' + App.t('resultTime', { m: App.ui.fmtTime(attempt.durationSec) }) }))));

        const wrong = [];
        for (let i = 0; i < s.length; i++) if (!s.isCorrect(i)) wrong.push(s.item(i).uid);
        const bar = el('div', { class: 'toolbar' },
            el('button', { type: 'button', class: 'btn', id: 'return-btn', text: App.t('backToMenu'), onclick: () => { App.ui.renderDashboard(); App.ui.show('dashboard'); } }));
        if (wrong.length) bar.appendChild(el('button', { type: 'button', class: 'btn btn-ghost', text: App.t('retryWrong') + ' (' + wrong.length + ')', onclick: () => App.ui.retry(wrong) }));
        bar.appendChild(el('button', { type: 'button', class: 'btn btn-ghost', text: '📊 ' + App.t('statsBtn'), onclick: () => App.ui.openStats() }));
        v.appendChild(bar);

        const box = el('div', { id: 'review-payload-box' });
        for (let i = 0; i < s.length; i++) {
            const item = s.item(i);
            const answered = s.hasAnswer(i), ok = s.isCorrect(i);
            const cls = ok ? 'is-correct' : (answered ? 'is-incorrect' : 'is-unanswered');
            const badge = ok ? App.t('correct') : (answered ? App.t('incorrect') : App.t('unansweredBadge'));
            const meta = [item.topic, item.difficulty ? '★'.repeat(item.difficulty) : '', (s.times[i] || 0) + 's'].filter(Boolean).join(' · ');
            const card = el('div', { class: 'review-item-card ' + cls },
                el('span', { class: 'review-status-badge', text: badge }),
                el('div', { class: 'meta', text: meta }),
                el('h3', { style: 'font-size:1.05rem;margin-bottom:10px;white-space:pre-line;', text: App.t('questionN', { n: i + 1, q: App.loc(item.text) }) }),
                App.types[item.kind].renderReview(item, s.value(i)),
                item.explanation ? el('div', { class: 'explanation-box', style: 'margin-top:15px;' },
                    el('h4', { style: 'font-size:0.95rem;', text: App.t('explanation') }),
                    el('p', { style: 'font-size:0.9rem;', text: App.loc(item.explanation) })) : null);
            box.appendChild(card);
        }
        v.appendChild(box);
    };

    // New study session with the questions that were wrong/unanswered
    App.ui.retry = function (uids) {
        const exam = App.state.exam;
        const set = new Set(uids);
        const qs = exam.questions.filter(q => set.has(q.uid));
        if (!qs.length) return;
        const session = App.Session.create(qs, {
            examId: exam.id, modeId: 'retry', modeLabel: App.t('retryWrong'), studyMode: true,
            timerMode: 'none', threshold: exam.settings.passThreshold, shuffleOptions: exam.settings.shuffleOptions
        });
        App.ui.beginSession(session);
    };
})();
