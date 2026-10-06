/* Automatic question-quality detection from the answers collected on this device.
   Pure logic: works on an exam and a map of per-question stats ({seen, correct, wrong, time, picks}). */
App.quality = (function () {
    const MIN_SEEN = 5;

    // Returns a list of findings: {uid, id, kind, severity, params}.
    // kinds: tooEasy, tooHard, dubiousKey, weakDistractor, slow, difficultyMismatch
    function analyze(exam, qstats) {
        const out = [];
        qstats = qstats || {};
        exam.questions.forEach(q => {
            const s = qstats[q.uid];
            if (!s || (s.seen || 0) < MIN_SEEN) return;
            const acc = s.correct / s.seen;
            const add = (kind, severity, params) => out.push({ uid: q.uid, id: q.id, kind, severity, params: params || {} });
            const type = q.type || App.questionType(q);
            if (acc >= 0.95 && s.seen >= MIN_SEEN) add('tooEasy', 1, { pct: Math.round(acc * 100), n: s.seen });
            if (acc <= 0.25) add('tooHard', 2, { pct: Math.round(acc * 100), n: s.seen });
            if (q.difficulty === 1 && acc <= 0.4) add('difficultyMismatch', 1, { pct: Math.round(acc * 100), d: 1 });
            if (q.difficulty === 3 && acc >= 0.9) add('difficultyMismatch', 1, { pct: Math.round(acc * 100), d: 3 });
            const avg = s.time && s.seen ? s.time / s.seen : 0;
            const est = q.estimatedSec || 0;
            if (est && avg > est * 3 && s.seen >= MIN_SEEN) add('slow', 1, { avg: Math.round(avg), est });
            if ((type === 'single' || type === 'multiple') && s.picks && Array.isArray(q.options)) {
                const ans = Array.isArray(q.answer) ? q.answer : [q.answer];
                const total = Object.values(s.picks).reduce((a, b) => a + b, 0);
                const wrongPicks = q.options.map((_, i) => ans.includes(i) ? 0 : (s.picks[i] || 0));
                const wrongTotal = wrongPicks.reduce((a, b) => a + b, 0);
                // everybody who is wrong picks the same distractor, and accuracy is very low: the key may be wrong
                if (type === 'single' && s.seen >= 8 && acc <= 0.15 && wrongTotal >= 6 && Math.max(...wrongPicks) / wrongTotal >= 0.7) {
                    const top = wrongPicks.indexOf(Math.max(...wrongPicks));
                    add('dubiousKey', 3, { opt: 'ABCDEF'[top], pct: Math.round(100 * acc) });
                }
                // a distractor nobody ever picks does not distract
                if (total >= 10) {
                    const dead = q.options.map((_, i) => i).filter(i => !ans.includes(i) && !(s.picks[i] > 0));
                    if (dead.length && q.options.length - ans.length >= 2) add('weakDistractor', 1, { opts: dead.map(i => 'ABCDEF'[i]).join(', '), n: total });
                }
            }
        });
        return out.sort((a, b) => b.severity - a.severity);
    }

    // Structural checks that need no answers: very short options, duplicates, "all of the above" patterns, long option imbalance.
    function structural(exam) {
        const out = [];
        exam.questions.forEach(q => {
            const type = q.type || App.questionType(q);
            if (type !== 'single' && type !== 'multiple') return;
            const texts = q.options.map(o => App.rich.plain(App.loc(o)).trim());
            const add = (kind, params) => out.push({ uid: q.uid, id: q.id, kind, severity: 1, params: params || {} });
            if (new Set(texts.map(t => t.toLowerCase())).size < texts.length) add('duplicateOptions');
            if (texts.some(t => /^(all|none) of the above|^(tutte|nessuna) (le precedenti|delle precedenti)/i.test(t))) add('allOfAbove');
            const ans = Array.isArray(q.answer) ? q.answer : [q.answer];
            const lens = texts.map(t => t.length);
            if (type === 'single' && lens.length >= 3 && lens[ans[0]] > 1.8 * Math.max(...lens.filter((_, i) => i !== ans[0]))) add('correctMuchLonger');
        });
        return out;
    }

    return { analyze, structural, MIN_SEEN };
})();
