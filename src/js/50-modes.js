/* Study modes and spaced repetition (Leitner boxes). Pure logic, no DOM. */
(function () {
    const { shuffle } = App.util;
    const DAY = 86400000;
    const INTERVAL_DAYS = [0, 1, 3, 7, 21];   // wait before a question is due again, per box
    const MAX_BOX = INTERVAL_DAYS.length - 1;

    App.srs = {
        DAY, INTERVAL_DAYS,
        update(stat, ok, sec, now) {
            const s = Object.assign({}, stat);
            s.seen = (s.seen || 0) + 1;
            if (ok) s.correct = (s.correct || 0) + 1; else s.wrong = (s.wrong || 0) + 1;
            s.box = ok ? Math.min((s.box || 0) + 1, MAX_BOX) : 0;
            s.due = now + INTERVAL_DAYS[s.box] * DAY;
            s.last = now;
            s.lastOk = !!ok;
            s.time = (s.time || 0) + (sec || 0);
            return s;
        },
        isDue: (stat, now) => !!stat && stat.seen > 0 && (stat.due || 0) <= now,
        isMastered: stat => !!stat && (stat.box || 0) >= 3
    };

    // Records one answer in the persistent per-question stats.
    App.recordAnswer = function (examId, uid, ok, sec, storage, now) {
        storage = storage || App.storage;
        now = now || Date.now();
        storage.patchQStat(examId, uid, cur => App.srs.update(cur, ok, sec, now));
        App.events.emit('answerRecorded', { examId, uid, ok });
    };

    function byTopic(questions) {
        const m = {};
        questions.forEach(q => (m[q.topic] = m[q.topic] || []).push(q));
        return m;
    }

    function balanced(questions, count) {
        const groups = byTopic(questions);
        const pool = Object.keys(groups).map(t => shuffle(groups[t])[0]);
        const used = new Set(pool.map(q => q.uid));
        pool.push(...shuffle(questions.filter(q => !used.has(q.uid))).slice(0, Math.max(0, count - pool.length)));
        return shuffle(pool).slice(0, count);
    }

    function weighted(questions, mode) {
        const groups = byTopic(questions);
        const pool = [], used = new Set();
        mode.groups.forEach(g => {
            let remaining = g.weight;
            for (let round = 0; remaining > 0 && round < 100; round++) {
                for (const topic of shuffle(g.topics)) {
                    if (remaining <= 0) break;
                    const q = shuffle((groups[topic] || []).filter(x => !used.has(x.uid)))[0];
                    if (!q) continue;
                    used.add(q.uid); pool.push(q); remaining--;
                }
                if (!g.topics.some(t => (groups[t] || []).some(x => !used.has(x.uid)))) break;
            }
        });
        const count = mode.count || pool.length;
        if (pool.length < count) pool.push(...shuffle(questions.filter(q => !used.has(q.uid))).slice(0, count - pool.length));
        return shuffle(pool).slice(0, count);
    }

    // Lists the modes offered for an exam. `stats` = per-question stats map, used to size the practice pools.
    App.modes = {
        list(exam, stats, now) {
            now = now || Date.now();
            stats = stats || {};
            const out = [];
            exam.modes.forEach(m => out.push({
                id: m.id, group: 'exam', label: m.name, defined: m, studyDefault: !m.exam,
                count: m.count, available: exam.questions.length
            }));
            out.push({ id: 'all', group: 'practice', labelKey: 'modeAll', labelParams: { n: exam.questions.length }, studyDefault: true, available: exam.questions.length });
            exam.topicList.forEach(t => out.push({
                id: 'topic:' + t, group: 'topic', labelKey: 'modeTopic', labelParams: { t: (exam.topics && exam.topics[t]) ? exam.topics[t] : t },
                studyDefault: true, available: exam.questions.filter(q => q.topic === t).length
            }));
            const poolSize = id => App.modes.pool(exam, id, stats, now).questions.length;
            ['review', 'mistakes', 'flagged', 'unseen'].forEach(id => out.push({
                id, group: 'practice', labelKey: { review: 'modeReview', mistakes: 'modeMistakes', flagged: 'modeFlagged', unseen: 'modeUnseen' }[id],
                studyDefault: true, available: poolSize(id), defaultCount: id === 'flagged' ? undefined : 20
            }));
            if (exam.hasDifficulty) [1, 2, 3].forEach(d => out.push({
                id: 'difficulty:' + d, group: 'practice', labelKey: 'modeDifficulty', labelParams: { d: App.t(['', 'diffEasy', 'diffMedium', 'diffHard'][d]) },
                studyDefault: true, available: exam.questions.filter(q => q.difficulty === d).length
            }));
            return out;
        },

        // All questions that belong to a practice mode (before applying the count).
        pool(exam, id, stats, now) {
            now = now || Date.now();
            stats = stats || {};
            const qs = exam.questions;
            if (id === 'all') return { questions: qs.slice() };
            if (id.startsWith('topic:')) return { questions: qs.filter(q => q.topic === id.slice(6)) };
            if (id.startsWith('difficulty:')) return { questions: qs.filter(q => q.difficulty === Number(id.slice(11))) };
            if (id === 'flagged') return { questions: qs.filter(q => stats[q.uid] && stats[q.uid].flag) };
            if (id === 'unseen') return { questions: qs.filter(q => !stats[q.uid] || !stats[q.uid].seen) };
            if (id === 'mistakes') {
                return { questions: qs.filter(q => { const s = stats[q.uid]; return s && s.seen && s.lastOk === false; }) };   // latest answer was wrong
            }
            if (id === 'review') {
                const seen = qs.filter(q => stats[q.uid] && stats[q.uid].seen);
                const due = seen.filter(q => App.srs.isDue(stats[q.uid], now)).sort((a, b) => (stats[a.uid].due || 0) - (stats[b.uid].due || 0));
                if (due.length) return { questions: due };
                const weakest = seen.slice().sort((a, b) => (stats[a.uid].box || 0) - (stats[b.uid].box || 0) || (stats[a.uid].due || 0) - (stats[b.uid].due || 0));
                return { questions: weakest, fallback: true };
            }
            if (App.modeBuilders[id]) return { questions: App.modeBuilders[id](exam, stats, now) };
            return { questions: [] };
        },

        // Picks the questions for a session. opts.count caps the number of questions.
        pick(exam, id, stats, opts) {
            opts = opts || {};
            const now = opts.now || Date.now();
            const defined = exam.modes.find(m => m.id === id);
            let qs, fallback = false;
            if (defined) {
                const count = opts.count || defined.count || exam.questions.length;
                if (defined.selection === 'weighted') qs = weighted(exam.questions, Object.assign({}, defined, { count }));
                else if (defined.selection === 'balanced') qs = balanced(exam.questions, count);
                else qs = shuffle(exam.questions).slice(0, count);
            } else {
                const p = App.modes.pool(exam, id, stats, now);
                fallback = !!p.fallback;
                qs = p.questions;
                const ordered = id === 'all' || id.startsWith('topic:');
                if (id === 'review' || id === 'mistakes') qs = shuffle(qs.slice(0, opts.count || 20));
                else if (ordered && (!opts.count || opts.count >= qs.length)) qs = qs.slice();   // whole pool: keep file order
                else qs = shuffle(qs).slice(0, opts.count || qs.length);
            }
            return { questions: qs, fallback };
        }
    };
})();
