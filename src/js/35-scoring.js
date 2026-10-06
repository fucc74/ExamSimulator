/* Scoring rules: partial credit, negative marking, mandatory questions.
   Rules can be set per exam (settings.scoring), per mode (modes[].scoring) and, for practice modes, in the options page. */
App.scoring = (function () {
    const DEFAULTS = { partialCredit: false, wrongPenalty: 0, unansweredPenalty: 0 };

    function clean(c) {
        const out = {};
        if (!c) return out;
        if (typeof c.partialCredit === 'boolean') out.partialCredit = c.partialCredit;
        if (typeof c.wrongPenalty === 'number' && c.wrongPenalty >= 0) out.wrongPenalty = c.wrongPenalty;
        if (typeof c.unansweredPenalty === 'number' && c.unansweredPenalty >= 0) out.unansweredPenalty = c.unansweredPenalty;
        return out;
    }

    // Effective rules: built-in defaults < user preference (practice modes only) < exam settings < mode.
    function resolve(exam, modeDef, userPref) {
        const examLevel = clean(exam && exam.settings && exam.settings.scoring);
        const modeLevel = clean(modeDef && modeDef.scoring);
        const explicit = Object.keys(examLevel).length || Object.keys(modeLevel).length;
        const useUser = !(modeDef && modeDef.exam) && !explicit;      // exam-defined exam modes keep the exam's own rules
        return Object.assign({}, DEFAULTS, useUser ? clean(userPref) : {}, examLevel, modeLevel);
    }

    // Scores a list of {item, value} pairs.
    function score(items, values, cfg) {
        cfg = Object.assign({}, DEFAULTS, cfg || {});
        let got = 0, max = 0, fully = 0, partial = 0, wrong = 0, unanswered = 0;
        const mandatoryFailed = [];
        const details = items.map((item, i) => {
            const pts = typeof item.points === 'number' && item.points > 0 ? item.points : 1;
            max += pts;
            const answered = App.types[item.kind].hasAnswer(item, values[i]);
            const frac = answered ? App.fractionOf(item, values[i], cfg) : 0;
            let delta = pts * frac;
            if (!answered) { unanswered++; delta -= cfg.unansweredPenalty * pts; }
            else if (frac >= 1) fully++;
            else if (frac > 0) partial++;
            else { wrong++; delta -= cfg.wrongPenalty * pts; }
            got += delta;
            if (item.mandatory && frac < 1) mandatoryFailed.push(i);
            return { frac, points: pts, delta, answered };
        });
        const total = Math.max(0, got);
        return {
            score: Math.round(total * 100) / 100, max, pct: max ? Math.round(100 * total / max) : 0,
            fully, partial, wrong, unanswered, mandatoryFailed, details, cfg,
            custom: cfg.partialCredit || cfg.wrongPenalty > 0 || cfg.unansweredPenalty > 0 || items.some(it => typeof it.points === 'number' && it.points !== 1)
        };
    }

    return { DEFAULTS, clean, resolve, score };
})();

/* Exam-taking rules: how many pauses are allowed and whether the clock keeps running while you are away.
   Free navigation between questions is never restricted. */
App.examRules = {
    resolve(exam, modeDef, userPref) {
        const isExam = !!(modeDef && modeDef.exam);
        if (!isExam) return { pauses: null, strictTime: false };
        const pick = (k, dflt) => modeDef[k] !== undefined ? modeDef[k] : (exam.settings && exam.settings[k] !== undefined ? exam.settings[k] : (userPref && userPref[k] !== undefined ? userPref[k] : dflt));
        const pauses = pick('pauses', null);
        return { pauses: (pauses === null || pauses === undefined || pauses === '') ? null : Number(pauses), strictTime: !!pick('strictTime', false) };
    }
};
