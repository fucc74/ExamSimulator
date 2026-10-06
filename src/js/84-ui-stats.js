/* UI: statistics screen (history chart, accuracy by topic, hardest questions). */
(function () {
    const { el } = App.util;
    const $ = App.ui.$;
    const SVGNS = 'http://www.w3.org/2000/svg';
    const svg = (tag, attrs) => { const n = document.createElementNS(SVGNS, tag); Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v)); return n; };

    App.ui.openStats = function () { App.ui.show('stats'); App.ui.renderStats(); };

    function historyChart(attempts, threshold) {
        const list = attempts.slice(-30);
        const W = 600, H = 170, L = 30, R = 10, T = 12, B = 22;
        const root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': App.t('statsHistory') });
        const y = pct => T + (H - T - B) * (1 - pct / 100);
        [0, 50, 100].forEach(p => {
            root.appendChild(svg('line', { x1: L, x2: W - R, y1: y(p), y2: y(p), class: 'chart-axis' }));
            const t = svg('text', { x: 4, y: y(p) + 3, class: 'chart-label' }); t.textContent = p; root.appendChild(t);
        });
        if (threshold !== null) root.appendChild(svg('line', { x1: L, x2: W - R, y1: y(threshold), y2: y(threshold), class: 'chart-thr' }));
        const x = i => list.length === 1 ? (L + W - R) / 2 : L + (W - L - R) * i / (list.length - 1);
        root.appendChild(svg('polyline', { points: list.map((a, i) => x(i) + ',' + y(a.pct)).join(' '), class: 'chart-line' }));
        list.forEach((a, i) => {
            const c = svg('circle', { cx: x(i), cy: y(a.pct), r: 4, class: 'chart-dot' + (a.passed ? '' : ' fail') });
            const title = svg('title'); title.textContent = a.pct + '% · ' + (a.modeLabel || a.mode) + ' · ' + new Date(a.ts).toLocaleDateString(); c.appendChild(title);
            root.appendChild(c);
        });
        return root;
    }

    App.ui.renderStats = function () {
        const exam = App.state.exam;
        const v = $('view-stats');
        v.textContent = '';
        const st = App.stats.compute(exam, App.storage);
        const head = el('div', { class: 'card-title-row' },
            el('h1', { text: App.t('statsTitle') + ' — ' + App.loc(exam.title) }),
            el('button', { type: 'button', class: 'btn btn-secondary btn-small', text: '← ' + App.t('backBtn'), onclick: () => { App.ui.renderDashboard(); App.ui.show('dashboard'); } }));
        v.appendChild(head);

        if (!st.attemptCount && !st.answered) { v.appendChild(el('p', { class: 'subtitle', text: App.t('statsEmpty') })); return; }

        const tile = (value, label) => el('div', { class: 'tile' }, el('div', { class: 'tile-value', text: String(value) }), el('div', { class: 'tile-label', text: label }));
        v.appendChild(el('div', { class: 'tiles' },
            tile(st.attemptCount, App.t('statsAttempts')),
            tile(st.accuracy === null ? '–' : st.accuracy + '%', App.t('statsAccuracy')),
            tile(st.bestPct === null ? '–' : st.bestPct + '%', App.t('statsBest')),
            tile(st.answered, App.t('statsAnswered')),
            tile(st.mastered + ' / ' + st.totalQuestions, App.t('statsMastered')),
            tile(st.avgTimeSec === null ? '–' : st.avgTimeSec + ' s', App.t('statsAvgTime'))));

        if (st.attempts.length) {
            const thr = st.attempts[st.attempts.length - 1].threshold;
            v.appendChild(el('div', { class: 'stat-section chart-box' }, el('h2', { text: App.t('statsHistory') }), historyChart(st.attempts, typeof thr === 'number' ? thr : null)));
        }

        const topics = el('div', { class: 'stat-section' }, el('h2', { text: App.t('statsTopics') }));
        st.topics.forEach(t => {
            const name = exam.topics && exam.topics[t.topic] ? App.loc(exam.topics[t.topic]) : t.topic;
            const pct = t.pct === null ? 0 : t.pct;
            const cls = t.pct === null ? '' : (t.pct < 50 ? ' low' : (t.pct < 75 ? ' mid' : ''));
            topics.appendChild(el('div', { class: 'bar-row' },
                el('span', { text: name }),
                el('div', { class: 'bar-track', role: 'img', aria: { label: name + ' ' + (t.pct === null ? '–' : t.pct + '%') } }, el('div', { class: 'bar-fill' + cls, style: 'width:' + pct + '%' })),
                el('span', { class: 'bar-pct', text: t.pct === null ? '–' : t.pct + '%' })));
        });
        v.appendChild(topics);

        const hard = el('div', { class: 'stat-section' }, el('h2', { text: App.t('statsHardest') }));
        if (!st.hardest.length) hard.appendChild(el('p', { class: 'hint', text: App.t('statsNoHard') }));
        st.hardest.forEach(h => hard.appendChild(el('div', { class: 'hard-row' },
            el('div', { text: App.loc(h.text).slice(0, 220) }),
            el('div', { class: 'hard-meta', text: h.topic + ' · ' + App.t('statsErrRate', { p: Math.round(h.rate * 100), w: h.wrong, n: h.seen }) }))));
        v.appendChild(hard);
    };
})();
