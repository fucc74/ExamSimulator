/* Exam format v2: validation, legacy conversion, normalization, quality lint. */
(function () {
    const { isObj, isLoc } = App.util;
    const RESERVED_MODES = ['all', 'review', 'mistakes', 'flagged', 'unseen', 'topic', 'difficulty'];
    const SELECTIONS = ['random', 'balanced', 'weighted'];
    const textOf = d => d.text !== undefined ? d.text : d.question;

    function newReport() {
        const r = { errors: [], warnings: [] };
        r.error = (path, message) => r.errors.push({ path, message });
        r.warn = (path, message) => r.warnings.push({ path, message });
        r.ok = () => r.errors.length === 0;
        r.format = () => r.errors.map(e => '  ✗ ' + e.path + ': ' + e.message).concat(r.warnings.map(w => '  ! ' + w.path + ': ' + w.message)).join('\n');
        return r;
    }

    function stripLetter(s) { return String(s).replace(/^\s*[A-Fa-f][)\.]\s+/, ''); }

    // Legacy shape: { config: {...}, questions: [{id, topic, question, options:["A) ..."], answer:[i], explanation}] }
    function fromLegacy(data, fileId) {
        const c = data.config || {};
        const modes = [];
        const n = (data.questions || []).length;
        if (c.mockStandardCount) modes.push({ id: 'standard', name: { en: 'Standard mock exam', it: 'Simulazione standard' }, selection: 'balanced', count: Math.min(c.mockStandardCount, n) });
        if (c.mockOfficialCount) {
            modes.push({
                id: 'official', name: { en: 'Official exam simulation', it: 'Simulazione esame ufficiale' }, selection: 'weighted', exam: true,
                count: Math.min(c.mockOfficialCount, n), timeSec: c.mockOfficialTimeSec, passThreshold: c.passThresholdMockOfficial,
                groups: (c.macroGroups || []).map(g => ({ topics: g.topics, weight: g.weight }))
            });
        }
        return {
            format: 2, id: fileId || String(c.examCode || 'exam').toLowerCase(), code: c.examCode,
            title: c.examTitle || c.examCode, description: c.subtitle, version: c.version,
            settings: { passThreshold: c.passThresholdDefault, timePerQuestionSec: c.timePerQuestionSec },
            modes,
            questions: (data.questions || []).map(q => {
                const out = { id: q.id, topic: q.topic, text: q.question, options: (q.options || []).map(stripLetter), answer: q.answer, explanation: q.explanation };
                if (q.shuffle === false) out.shuffle = false;
                const a = Array.isArray(q.answer) ? q.answer : [q.answer];
                out.type = a.length > 1 ? 'multiple' : 'single';
                return out;
            })
        };
    }

    function validate(exam) {
        const rep = newReport();
        if (!isObj(exam)) { rep.error('exam', 'must be an object'); return rep; }
        if (exam.format !== App.FORMAT_VERSION) rep.error('format', 'must be ' + App.FORMAT_VERSION + ' (got ' + JSON.stringify(exam.format) + ')');
        if (typeof exam.id !== 'string' || !/^[\w.\-]+$/.test(exam.id)) rep.error('id', 'must be a short identifier (letters, digits, "-", "_", ".")');
        if (!isLoc(exam.title)) rep.error('title', 'is required (string or {en,it})');
        ['description'].forEach(k => { if (exam[k] !== undefined && !isLoc(exam[k])) rep.error(k, 'must be a non-empty string or {en,it} object'); });

        const s = exam.settings;
        if (s !== undefined) {
            if (!isObj(s)) rep.error('settings', 'must be an object');
            else {
                if (s.passThreshold !== undefined && !(s.passThreshold >= 0 && s.passThreshold <= 100)) rep.error('settings.passThreshold', 'must be between 0 and 100');
                if (s.timePerQuestionSec !== undefined && !(s.timePerQuestionSec > 0)) rep.error('settings.timePerQuestionSec', 'must be a positive number');
            }
        }

        const qs = exam.questions;
        if (!Array.isArray(qs) || !qs.length) { rep.error('questions', 'must be a non-empty list'); return rep; }

        const topicsSeen = new Set();
        const uids = new Set();
        const texts = new Map();
        qs.forEach((q, i) => {
            const p = 'questions[' + i + ']';
            if (!isObj(q)) { rep.error(p, 'must be an object'); return; }
            const label = p + (q.id !== undefined ? ' (id ' + q.id + ')' : '');
            if (q.id === undefined || q.id === '') rep.error(label, 'is missing "id"');
            const uid = q.uid !== undefined ? String(q.uid) : String(q.id);
            if (uids.has(uid)) rep.error(label, 'duplicate uid/id "' + uid + '"'); uids.add(uid);
            if (typeof q.topic !== 'string' || !q.topic.trim()) rep.error(label + '.topic', 'is required'); else topicsSeen.add(q.topic);
            if (!isLoc(textOf(q))) rep.error(label + '.text', 'is required (string or {en,it})');
            if (q.explanation !== undefined && !isLoc(q.explanation)) rep.error(label + '.explanation', 'must be a non-empty string or {en,it} object');
            if (q.difficulty !== undefined && ![1, 2, 3].includes(q.difficulty)) rep.error(label + '.difficulty', 'must be 1, 2 or 3');
            if (q.tags !== undefined && !(Array.isArray(q.tags) && q.tags.every(t => typeof t === 'string'))) rep.error(label + '.tags', 'must be a list of strings');
            if (q.estimatedSec !== undefined && !(q.estimatedSec > 0)) rep.error(label + '.estimatedSec', 'must be a positive number');
            const type = App.questionType(q);
            const h = App.types[type];
            if (!h) rep.error(label + '.type', 'unknown question type "' + type + '"');
            else if (h.validateDef) h.validateDef(q, label, rep);
            const key = App.loc(textOf(q)).trim().toLowerCase();
            if (key) { if (texts.has(key)) rep.warn(label, 'same text as question ' + texts.get(key)); else texts.set(key, q.id); }
        });

        if (exam.topics !== undefined) {
            if (!isObj(exam.topics)) rep.error('topics', 'must be an object mapping topic -> name');
            else Object.keys(exam.topics).forEach(k => { if (!isLoc(exam.topics[k])) rep.error('topics.' + k, 'must be a non-empty string or {en,it} object'); });
        }

        if (exam.modes !== undefined) {
            if (!Array.isArray(exam.modes)) rep.error('modes', 'must be a list');
            else {
                const ids = new Set();
                exam.modes.forEach((m, i) => {
                    const p = 'modes[' + i + ']';
                    if (!isObj(m)) { rep.error(p, 'must be an object'); return; }
                    if (typeof m.id !== 'string' || !/^[\w\-]+$/.test(m.id)) rep.error(p + '.id', 'must be a short identifier');
                    else if (RESERVED_MODES.includes(m.id)) rep.error(p + '.id', '"' + m.id + '" is reserved for a built-in mode');
                    else if (ids.has(m.id)) rep.error(p + '.id', 'duplicate mode id "' + m.id + '"'); else ids.add(m.id);
                    if (!isLoc(m.name)) rep.error(p + '.name', 'is required (string or {en,it})');
                    if (m.selection !== undefined && !SELECTIONS.includes(m.selection)) rep.error(p + '.selection', 'must be one of ' + SELECTIONS.join(', '));
                    if (m.count !== undefined && !(Number.isInteger(m.count) && m.count > 0)) rep.error(p + '.count', 'must be a positive integer');
                    if (m.count > qs.length) rep.warn(p + '.count', 'is larger than the number of questions (' + qs.length + ')');
                    if (m.timeSec !== undefined && !(m.timeSec >= 0)) rep.error(p + '.timeSec', 'must be >= 0');
                    if (m.passThreshold !== undefined && !(m.passThreshold >= 0 && m.passThreshold <= 100)) rep.error(p + '.passThreshold', 'must be between 0 and 100');
                    if (m.selection === 'weighted') {
                        if (!Array.isArray(m.groups) || !m.groups.length) rep.error(p + '.groups', 'weighted selection needs "groups": [{topics, weight}]');
                        else {
                            let sum = 0;
                            m.groups.forEach((g, gi) => {
                                const gp = p + '.groups[' + gi + ']';
                                if (!isObj(g) || !Array.isArray(g.topics) || !g.topics.length) { rep.error(gp + '.topics', 'must be a non-empty list of topics'); return; }
                                g.topics.forEach(t => { if (!topicsSeen.has(t)) rep.error(gp + '.topics', 'unknown topic "' + t + '"'); });
                                if (!(Number.isInteger(g.weight) && g.weight > 0)) rep.error(gp + '.weight', 'must be a positive integer'); else sum += g.weight;
                            });
                            if (m.count && sum !== m.count) rep.warn(p + '.groups', 'weights sum to ' + sum + ' but count is ' + m.count);
                        }
                    }
                });
            }
        }
        return rep;
    }

    // Fills defaults and derived fields. Input must already be valid.
    function normalize(raw, fileId) {
        const exam = App.util.clone(raw);
        exam.id = exam.id || fileId;
        exam.settings = Object.assign({ passThreshold: 70, timePerQuestionSec: 90, shuffleOptions: true }, exam.settings || {});
        Object.keys(exam.settings).forEach(k => { if (exam.settings[k] === undefined) delete exam.settings[k]; });
        exam.settings = Object.assign({ passThreshold: 70, timePerQuestionSec: 90, shuffleOptions: true }, exam.settings);
        exam.questions.forEach(q => {
            if (q.text === undefined) q.text = q.question;
            delete q.question;
            q.uid = q.uid !== undefined ? String(q.uid) : String(q.id);
            q.type = App.questionType(q);
        });
        exam.topicList = [];
        exam.questions.forEach(q => { if (!exam.topicList.includes(q.topic)) exam.topicList.push(q.topic); });
        exam.hasDifficulty = exam.questions.some(q => q.difficulty);
        if (!Array.isArray(exam.modes) || !exam.modes.length) {
            exam.modes = [{ id: 'standard', name: { en: 'Standard mock exam', it: 'Simulazione standard' }, selection: 'balanced', count: Math.min(20, exam.questions.length) }];
        }
        exam.modes.forEach(m => { m.selection = m.selection || 'random'; });
        return exam;
    }

    // Accepts v2 or legacy data. Returns {exam, report}; exam is null when invalid.
    function prepare(data, fileId) {
        let raw = data;
        if (isObj(data) && data.format === undefined && (data.config || data.questions)) raw = fromLegacy(data, fileId);
        if (isObj(raw) && raw.id === undefined && fileId) raw = Object.assign({}, raw, { id: fileId });
        const report = validate(raw);
        return { exam: report.ok() ? normalize(raw, fileId) : null, report };
    }

    // Content-quality hints for single-answer questions (used by the validator CLI).
    function lint(exam) {
        const out = [];
        const singles = exam.questions.filter(q => App.questionType(q) === 'single' && Array.isArray(q.options));
        if (singles.length >= 10) {
            const pos = [0, 0, 0, 0, 0, 0];
            let longest = 0;
            singles.forEach(q => {
                const a = Array.isArray(q.answer) ? q.answer[0] : q.answer;
                pos[a]++;
                const lens = q.options.map(o => App.loc(o).length);
                if (lens[a] === Math.max(...lens) && lens.filter(l => l === lens[a]).length === 1) longest++;
            });
            const n = singles.length;
            const worst = Math.max(...pos);
            if (worst / n > 0.4) out.push('correct answer is always in position ' + 'ABCDEF'[pos.indexOf(worst)] + ' (' + Math.round(100 * worst / n) + '%) — fine if options are shuffled at runtime');
            if (longest / n > 0.45) out.push('the correct answer is the single longest option in ' + Math.round(100 * longest / n) + '% of single-answer questions');
        }
        return out;
    }

    App.schema = { validate, fromLegacy, normalize, prepare, lint, newReport };
})();
