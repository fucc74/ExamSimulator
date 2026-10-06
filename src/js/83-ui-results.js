/* UI: review before finishing, results and per-question review. */
(function () {
    const { el, icon } = App.util;
    const $ = App.ui.$;
    const S = () => App.state.session;

    const kpi = (value, label, cls) => el('div', { class: 'kpi ' + (cls || '') }, el('b', { text: String(value) }), el('span', { text: label }));
    const resume = i => { S().goTo(i); App.ui.show('runtime'); App.ui.refreshRuntime(); };

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

        const card = el('div', { class: 'card' });
        card.appendChild(el('h1', { text: App.t('reviewTitle') }));
        card.appendChild(el('p', { class: 'subtitle', text: App.t('reviewText', { a: s.length - unanswered.length, n: s.length, u: unanswered.length, f: flagged.length }) }));
        card.appendChild(el('div', { class: 'kpis' },
            kpi(s.length - unanswered.length, App.t('legendAnswered'), 'ok'),
            kpi(unanswered.length, App.t('reviewUnanswered'), unanswered.length ? 'warn' : ''),
            kpi(flagged.length, App.t('reviewFlagged'))));

        const grid = el('div', { class: 'review-grid' });
        for (let i = 0; i < s.length; i++) {
            let cls = 'nav-grid-btn' + (s.hasAnswer(i) ? ' answered' : ' unanswered-hint');
            if (flagged.includes(i)) cls += ' flagged';
            grid.appendChild(el('button', { type: 'button', class: cls, text: String(i + 1), onclick: () => resume(i), aria: { label: App.t('questionOf', { i: i + 1, n: s.length }) } }));
        }
        card.appendChild(grid);

        const pills = (title, list) => {
            if (!list.length) return;
            const box = el('div', { class: 'review-block' }, el('h2', { text: title + ' (' + list.length + ')' }));
            const pl = el('div', { class: 'pill-list' });
            list.forEach(i => pl.appendChild(el('button', { type: 'button', class: 'pill', text: '#' + (i + 1), onclick: () => resume(i) })));
            box.appendChild(pl); card.appendChild(box);
        };
        pills(App.t('reviewUnanswered'), unanswered);
        pills(App.t('reviewFlagged'), flagged);

        card.appendChild(el('div', { class: 'toolbar', style: 'margin-top:22px' },
            App.ui.btn(App.t('reviewBack'), 'back', 'btn-secondary', () => { App.ui.show('runtime'); App.ui.refreshRuntime(); }),
            App.ui.btn(App.t('reviewSubmit'), 'check', 'btn-lg', () => App.ui.submit(false), { id: 'submit-btn' })));
        v.appendChild(card);
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
        App.state.reviewFilter = 'all';
        App.ui.show('summary');
        App.ui.renderSummary();
    };

    function topicBreakdown(s, exam) {
        const by = {};
        for (let i = 0; i < s.length; i++) {
            const t = s.item(i).topic;
            by[t] = by[t] || { total: 0, ok: 0 };
            by[t].total++; if (s.isCorrect(i)) by[t].ok++;
        }
        const keys = Object.keys(by);
        if (keys.length < 2) return null;
        const box = el('div', { class: 'stat-section' }, el('h2', { text: App.t('topicBreakdown') }));
        keys.forEach(t => {
            const pct = Math.round(100 * by[t].ok / by[t].total);
            const name = exam && exam.topics && exam.topics[t] ? App.loc(exam.topics[t]) : t;
            box.appendChild(el('div', { class: 'bar-row' },
                el('span', { text: name }),
                el('div', { class: 'bar-track' }, el('div', { class: 'bar-fill' + (pct < 50 ? ' low' : (pct < 75 ? ' mid' : '')), style: 'width:' + pct + '%' })),
                el('span', { class: 'bar-pct', text: pct + '%' })));
        });
        return box;
    }

    App.ui.renderSummary = function () {
        const r = App.state.lastResult;
        if (!r) return;
        const { attempt, session: s } = r;
        const exam = App.state.exam;
        const v = $('view-summary');
        v.textContent = '';
        const color = attempt.passed ? 'var(--success)' : 'var(--error)';
        const card = el('div', { class: 'card' });
        card.appendChild(el('div', { class: 'print-only print-head' },
            el('h2', { text: App.loc(exam.title) }),
            el('p', { text: [s.modeLabel, App.t('printedOn', { d: new Date().toLocaleString(App.lang === 'it' ? 'it-IT' : 'en-GB') }), App.t('scoreLine', { c: attempt.correct, n: attempt.total }) + ' (' + attempt.pct + '%)'].join(' · ') })));
        card.appendChild(el('h1', { text: App.t('resultsTitle') }));
        card.appendChild(el('p', { class: 'subtitle', text: App.t('resultsSubtitle') }));

        const ring = el('div', { class: 'score-ring' });
        ring.appendChild(App.ui.ring(attempt.pct, color, 168, 10));
        ring.appendChild(el('div', { class: 'score-num' }, el('span', { id: 'metric-percentage', text: attempt.pct + '%' }), el('small', { text: App.t('scoreWord') })));
        const unanswered = attempt.answers.filter(a => !a[3]).length;
        const partialN = attempt.partial || 0;
        const wrongN = attempt.total - attempt.correct - partialN - unanswered;
        card.appendChild(el('div', { class: 'score-hero', style: 'margin-top:20px' }, ring,
            el('div', { style: 'flex:1 1 260px;min-width:0' },
                el('div', { class: 'verdict ' + (attempt.passed ? 'pass' : 'fail'), id: 'exam-result-badge' }, icon(attempt.passed ? 'trophy' : 'x', 18), el('span', { text: App.t(attempt.passed ? 'pass' : 'fail', { t: attempt.threshold }).replace(/^[^\w]*\s*/, '') })),
                el('p', { id: 'metric-raw-string', style: 'font-weight:600;font-size:1.05rem', text: App.t('scoreLine', { c: attempt.correct, n: attempt.total }) }),
                attempt.scoring ? el('p', { class: 'hint', id: 'points-line', text: App.t('pointsLine', { s: attempt.score, m: attempt.maxScore }) }) : null,
                attempt.mandatoryFailed ? el('p', { class: 'hint', style: 'color:var(--error);font-weight:700', text: App.t('mandatoryFailedMsg', { n: attempt.mandatoryFailed }) }) : null,
                el('p', { class: 'hint', text: s.modeLabel }))));

        card.appendChild(el('div', { class: 'kpis' },
            kpi(attempt.correct, App.t('correctKpi'), 'ok'),
            partialN ? kpi(partialN, App.t('partialKpi'), 'warn') : null,
            kpi(wrongN, App.t('wrongKpi'), wrongN ? 'bad' : ''),
            kpi(unanswered, App.t('unansweredKpi'), unanswered ? 'warn' : ''),
            kpi(App.ui.fmtTime(attempt.durationSec), App.t('timeKpi'))));

        const tb = topicBreakdown(s, exam);
        if (tb) card.appendChild(tb);

        const wrong = [];
        for (let i = 0; i < s.length; i++) if (!s.isCorrect(i)) wrong.push(s.item(i).uid);
        const bar = el('div', { class: 'toolbar' },
            App.ui.btn(App.t('backToMenu'), 'home', '', () => { App.ui.renderDashboard(); App.ui.show('dashboard'); }, { id: 'return-btn' }));
        if (wrong.length) bar.appendChild(App.ui.btn(App.t('retryWrong') + ' (' + wrong.length + ')', 'refresh', 'btn-ghost', () => App.ui.retry(wrong)));
        bar.appendChild(App.ui.btn(App.t('statsBtn'), 'chart', 'btn-ghost', () => App.ui.openStats()));
        bar.appendChild(App.ui.btn(App.t('printBtn'), 'download', 'btn-ghost', () => window.print(), { id: 'print-btn' }));
        card.appendChild(bar);

        // filter chips + review cards
        const stats = App.storage.allQStats(s.examId);
        const filters = [['all', App.t('filterAll')], ['wrong', App.t('filterWrong')], ['unanswered', App.t('filterUnanswered')], ['flagged', App.t('filterFlagged')]];
        const chips = el('div', { class: 'filter-chips', role: 'group' });
        const box = el('div', { id: 'review-payload-box' });
        const cards = [];
        for (let i = 0; i < s.length; i++) {
            const item = s.item(i);
            const answered = s.hasAnswer(i), ok = s.isCorrect(i);
            const st = stats[item.uid];
            const frac = s.fraction(i);
            const part = answered && !ok && frac > 0;
            const cls = ok ? 'is-correct' : (part ? 'is-partial' : (answered ? 'is-incorrect' : 'is-unanswered'));
            const badge = ok ? App.t('correct') : (part ? App.t('partialBadge', { p: Math.round(frac * 100) }) : (answered ? App.t('incorrect') : App.t('unansweredBadge')));
            const meta = [item.topic, item.difficulty ? '★'.repeat(item.difficulty) : '', item.mandatory ? App.t('mandatoryChip') : '', (s.times[i] || 0) + 's'].filter(Boolean).join(' · ');
            const c = el('div', { class: 'review-item-card ' + cls },
                el('span', { class: 'review-status-badge' }, icon(ok ? 'check' : (answered ? 'x' : 'clock'), 12), el('span', { text: badge })),
                el('div', { class: 'meta', text: meta }),
                el('div', { class: 'review-q', role: 'heading', aria: { level: '3' } }, el('strong', { text: App.t('questionN', { n: i + 1, q: '' }) }), App.rich.node(App.loc(item.text))),
                App.types[item.kind].renderReview(item, s.value(i)),
                item.explanation ? el('div', { class: 'explanation-box' }, el('h4', { text: App.t('explanation') }), App.rich.node(App.loc(item.explanation))) : null,
                el('div', { class: 'review-tools' }, App.ui.btn(App.t('reportBtn'), 'flag', 'btn-ghost btn-sm report-btn', () => App.ui.reportQuestion(item))));
            cards.push({ node: c, ok, answered, flagged: !!(st && st.flag) });
            box.appendChild(c);
        }
        function applyFilter(f) {
            App.state.reviewFilter = f;
            chips.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === f ? 'true' : 'false'));
            cards.forEach(c => {
                const show = f === 'all' || (f === 'wrong' && !c.ok && c.answered) || (f === 'unanswered' && !c.answered) || (f === 'flagged' && c.flagged);
                c.node.classList.toggle('hidden', !show);
            });
        }
        filters.forEach(([f, label]) => chips.appendChild(el('button', { type: 'button', class: 'filter-chip', text: label, dataset: { f }, onclick: () => applyFilter(f) })));
        card.appendChild(chips);
        card.appendChild(box);
        v.appendChild(card);
        const sup = App.ui.supportBlock(); if (sup) { sup.id = 'support-results'; v.appendChild(sup); }
        applyFilter(App.state.reviewFilter || 'all');
    };

    // New study session with the questions that were wrong/unanswered
    App.ui.retry = function (uids) {
        const exam = App.state.exam;
        const set = new Set(uids);
        const qs = exam.questions.filter(q => set.has(q.uid));
        if (!qs.length) return;
        const session = App.Session.create(qs, {
            examId: exam.id, modeId: 'retry', modeLabel: App.t('retryWrong'), studyMode: true,
            timerMode: 'none', threshold: exam.settings.passThreshold, scoring: App.scoring.resolve(exam, null, App.storage.getPref('scoring')), shuffleOptions: exam.settings.shuffleOptions
        });
        App.ui.beginSession(session);
    };
})();
