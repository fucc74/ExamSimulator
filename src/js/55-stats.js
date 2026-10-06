/* Statistics computed from attempts and per-question stats (exam-agnostic, no DOM). */
App.stats = {
    compute(exam, storage, now) {
        storage = storage || App.storage;
        now = now || Date.now();
        const attempts = storage.listAttempts(exam.id).sort((a, b) => a.ts - b.ts);
        const qstats = storage.allQStats(exam.id);
        const byUid = {};
        exam.questions.forEach(q => { byUid[q.uid] = q; });

        let answered = 0, correct = 0, time = 0, mastered = 0, seenQuestions = 0, flagged = 0;
        const topics = {};
        exam.topicList.forEach(t => { topics[t] = { topic: t, total: exam.questions.filter(q => q.topic === t).length, seen: 0, correct: 0, wrong: 0, mastered: 0, answeredQuestions: 0 }; });
        const hard = [];

        Object.keys(qstats).forEach(uid => {
            const q = byUid[uid], s = qstats[uid];
            if (!q || !s) return;
            if (s.flag) flagged++;
            if (!s.seen) return;
            answered += s.seen; correct += s.correct || 0; time += s.time || 0;
            seenQuestions++;
            if (App.srs.isMastered(s)) mastered++;
            const t = topics[q.topic];
            t.seen += s.seen; t.correct += s.correct || 0; t.wrong += s.wrong || 0; t.answeredQuestions++;
            if (App.srs.isMastered(s)) t.mastered++;
            if ((s.wrong || 0) > 0) hard.push({ uid, topic: q.topic, text: q.text, seen: s.seen, wrong: s.wrong, rate: s.wrong / s.seen, last: s.last });
        });

        hard.sort((a, b) => b.rate - a.rate || b.wrong - a.wrong || b.seen - a.seen);
        const topicList = Object.values(topics).map(t => Object.assign(t, { pct: t.seen ? Math.round(100 * t.correct / t.seen) : null }));
        const pcts = attempts.map(a => a.pct);

        return {
            attempts, attemptCount: attempts.length,
            bestPct: pcts.length ? Math.max(...pcts) : null,
            avgPct: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
            answered, correct, accuracy: answered ? Math.round(100 * correct / answered) : null,
            avgTimeSec: answered ? Math.round(time / answered) : null,
            seenQuestions, mastered, flagged, totalQuestions: exam.questions.length,
            topics: topicList, hardest: hard.slice(0, 10)
        };
    }
};
