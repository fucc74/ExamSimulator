const test = require('node:test');
const assert = require('node:assert');
const { loadApp, loadExamFile } = require('./helpers.js');

const App = loadApp();
const q = (over) => Object.assign({ id: 1, topic: 'T', text: 'Question?', options: ['a', 'b', 'c', 'd'], answer: [1], explanation: 'e' }, over);
const mkExam = (questions, extra) => Object.assign({ format: 2, id: 'x', title: 'X', questions }, extra || {});

test('schema: accepts a minimal valid exam and normalizes it', () => {
    const { exam, report } = App.schema.prepare(mkExam([q({ id: 1 }), q({ id: 2 })]), 'x');
    assert.ok(exam, report.format());
    assert.equal(exam.questions[0].uid, '1');
    assert.equal(exam.questions[0].type, 'single');
    assert.deepEqual(exam.topicList, ['T']);
    assert.equal(exam.settings.passThreshold, 70);
    assert.ok(exam.modes.length >= 1);
});

test('schema: reports readable errors with paths', () => {
    const bad = mkExam([q({ id: 1, answer: [4] }), q({ id: 1 }), q({ id: 3, options: ['only one'] })]);
    const { exam, report } = App.schema.prepare(bad, 'x');
    assert.equal(exam, null);
    const msgs = report.errors.map(e => e.path + ' ' + e.message).join('\n');
    assert.match(msgs, /questions\[0\].*answer.*out of range/s);
    assert.match(msgs, /duplicate uid/);
    assert.match(msgs, /2 to 6 options/);
});

test('schema: validates modes, weights and unknown topics', () => {
    const exam = mkExam([q({ id: 1 }), q({ id: 2 })], { modes: [
        { id: 'official', name: 'Official', selection: 'weighted', count: 2, groups: [{ topics: ['Nope'], weight: 2 }] },
        { id: 'all', name: 'Reserved' }
    ] });
    const r = App.schema.validate(exam);
    const msgs = r.errors.map(e => e.message).join('\n');
    assert.match(msgs, /unknown topic "Nope"/);
    assert.match(msgs, /reserved/);
});

test('schema: legacy format is converted (option letters stripped, types inferred)', () => {
    const legacy = { config: { examCode: 'L', examTitle: 'Legacy', mockStandardCount: 2, passThresholdDefault: 80 },
        questions: [{ id: 1, topic: 'T', question: 'Q1?', options: ['A) x', 'B) y'], answer: [0], explanation: 'e' },
                    { id: 2, topic: 'T', question: 'Select two', options: ['A) x', 'B) y', 'C) z'], answer: [0, 2], explanation: 'e' }] };
    const { exam, report } = App.schema.prepare(legacy, 'legacy');
    assert.ok(exam, report.format());
    assert.equal(exam.questions[0].options[0], 'x');
    assert.equal(exam.questions[1].type, 'multiple');
    assert.equal(exam.settings.passThreshold, 80);
});

test('bundled exam files are valid', () => {
    for (const f of ['managedServices.exam', 'v31.exam', 'v31realtest.exam']) {
        const data = loadExamFile(f);
        const { exam, report } = App.schema.prepare(data, f.replace('.exam', ''));
        assert.ok(exam, f + '\n' + report.format());
    }
});

test('types: single/multiple prepare keeps the correct answer after shuffling', () => {
    for (let n = 0; n < 50; n++) {
        const item = App.prepareQuestion(q({ options: ['A', 'B', 'C', 'D'], answer: [2] }), {});
        assert.equal(item.options[item.answer[0]], 'C');
        const m = App.prepareQuestion(q({ options: ['A', 'B', 'C', 'D'], answer: [0, 3] }), {});
        assert.deepEqual(m.answer.map(i => m.options[i]).sort(), ['A', 'D']);
    }
    const fixed = App.prepareQuestion(q({ shuffle: false, options: ['A', 'B', 'All of the above'], answer: [2] }), {});
    assert.deepEqual(fixed.options, ['A', 'B', 'All of the above']);
});

test('types: scoring for every type', () => {
    const T = App.types;
    const single = App.prepareQuestion(q({ shuffle: false }), {});
    assert.ok(T.single.isCorrect(single, 1)); assert.ok(!T.single.isCorrect(single, 0)); assert.ok(!T.single.isCorrect(single, undefined));
    const multi = App.prepareQuestion(q({ shuffle: false, answer: [0, 2] }), {});
    assert.ok(T.multiple.isCorrect(multi, [2, 0])); assert.ok(!T.multiple.isCorrect(multi, [0])); assert.ok(!T.multiple.hasAnswer(multi, []));
    const tf = App.prepareQuestion({ id: 5, topic: 'T', text: 'Sky is blue', type: 'truefalse', answer: true }, {});
    assert.equal(tf.kind, 'single'); assert.ok(T.single.isCorrect(tf, 0)); assert.ok(!T.single.isCorrect(tf, 1));
    const ord = App.prepareQuestion({ id: 6, topic: 'T', text: 'Order', type: 'ordering', items: ['a', 'b', 'c'] }, {});
    assert.ok(T.ordering.isCorrect(ord, [0, 1, 2])); assert.ok(!T.ordering.isCorrect(ord, [1, 0, 2])); assert.ok(!T.ordering.hasAnswer(ord, undefined));
    assert.notDeepEqual(ord.shownOrder, [0, 1, 2]);
    const mat = App.prepareQuestion({ id: 7, topic: 'T', text: 'Match', pairs: [{ left: 'a', right: '1' }, { left: 'b', right: '2' }] }, {});
    assert.ok(T.matching.isCorrect(mat, [0, 1])); assert.ok(!T.matching.isCorrect(mat, [1, 0])); assert.ok(!T.matching.hasAnswer(mat, [-1, -1]));
    const num = App.prepareQuestion({ id: 8, topic: 'T', text: 'How many?', type: 'numeric', answer: { value: 8, tolerance: 0.5, unit: 'GPUs' } }, {});
    assert.ok(T.numeric.isCorrect(num, '8')); assert.ok(T.numeric.isCorrect(num, '8,4')); assert.ok(!T.numeric.isCorrect(num, '9')); assert.ok(!T.numeric.isCorrect(num, 'abc'));
    const sc = App.prepareQuestion({ id: 9, topic: 'T', text: 'Scenario', context: 'ctx', parts: [
        { text: 'p1', options: ['x', 'y'], answer: [0], shuffle: false }, { text: 'p2', type: 'numeric', answer: 3 }] }, {});
    assert.equal(sc.kind, 'scenario');
    assert.ok(T.scenario.isCorrect(sc, [0, '3'])); assert.ok(!T.scenario.isCorrect(sc, [0, '4'])); assert.ok(!T.scenario.isCorrect(sc, [1, '3']));
});

test('types: validation of new question types', () => {
    const exam = mkExam([
        { id: 1, topic: 'T', text: 'Order', type: 'ordering', items: ['only one'] },
        { id: 2, topic: 'T', text: 'Match', pairs: [{ left: 'a' }, { left: 'b', right: 'x' }] },
        { id: 3, topic: 'T', text: 'N', type: 'numeric', answer: 'abc' },
        { id: 4, topic: 'T', text: 'S', parts: [{ text: 'solo', options: ['a', 'b'], answer: [0] }] },
        { id: 5, topic: 'T', text: 'TF', type: 'truefalse', answer: 'yes' }
    ]);
    const r = App.schema.validate(exam);
    assert.equal(r.errors.length >= 5, true, r.format());
});

test('srs: boxes, due dates and mastery', () => {
    const now = 1_000_000_000_000;
    let s = App.srs.update({}, true, 5, now);
    assert.equal(s.box, 1); assert.equal(s.due, now + App.srs.DAY);
    s = App.srs.update(s, true, 5, now); s = App.srs.update(s, true, 5, now); assert.equal(s.box, 3); assert.ok(App.srs.isMastered(s));
    s = App.srs.update(s, false, 5, now); assert.equal(s.box, 0); assert.equal(s.lastOk, false); assert.ok(!App.srs.isMastered(s));
    assert.equal(s.seen, 4); assert.equal(s.time, 20);
    assert.ok(App.srs.isDue(s, now));
});

function mkBig(n) {
    return App.schema.prepare(mkExam(Array.from({ length: n }, (_, i) => q({ id: i + 1, topic: 'T' + (i % 3), difficulty: 1 + (i % 3) })), {
        id: 'big',
        modes: [{ id: 'quick', name: 'Quick', selection: 'balanced', count: 6 },
                { id: 'official', name: 'Official', selection: 'weighted', exam: true, count: 9, timeSec: 600, groups: [{ topics: ['T0'], weight: 3 }, { topics: ['T1'], weight: 3 }, { topics: ['T2'], weight: 3 }] }]
    }), 'big').exam;
}

test('modes: exam-defined selection respects counts, topics and weights', () => {
    const exam = mkBig(30);
    const quick = App.modes.pick(exam, 'quick', {}, {}).questions;
    assert.equal(quick.length, 6);
    assert.equal(new Set(quick.map(x => x.topic)).size, 3);
    const off = App.modes.pick(exam, 'official', {}, {}).questions;
    assert.equal(off.length, 9);
    ['T0', 'T1', 'T2'].forEach(t => assert.equal(off.filter(x => x.topic === t).length, 3));
    assert.equal(new Set(off.map(x => x.uid)).size, 9);
});

test('modes: practice pools (mistakes, flagged, unseen, review, difficulty)', () => {
    const exam = mkBig(12);
    const now = Date.now();
    const stats = {
        '1': { seen: 2, correct: 1, wrong: 1, box: 0, due: now - 1000, lastOk: false, flag: true },
        '2': { seen: 3, correct: 3, wrong: 0, box: 3, due: now + 5 * App.srs.DAY, lastOk: true },
        '3': { seen: 1, correct: 1, wrong: 0, box: 1, due: now - 10, lastOk: true }
    };
    const ids = id => App.modes.pool(exam, id, stats, now).questions.map(x => x.uid).sort();
    assert.deepEqual(ids('mistakes'), ['1']);
    assert.deepEqual(ids('flagged'), ['1']);
    assert.equal(ids('unseen').length, 9);
    assert.deepEqual(ids('review'), ['1', '3']);
    assert.equal(App.modes.pool(exam, 'difficulty:1', stats, now).questions.length, 4);
    const none = App.modes.pool(exam, 'review', { '2': stats['2'] }, now);
    assert.ok(none.fallback); assert.deepEqual(none.questions.map(x => x.uid), ['2']);
    const list = App.modes.list(exam, stats, now);
    assert.ok(list.find(m => m.id === 'review').available === 2);
    assert.ok(list.find(m => m.id === 'difficulty:3'));
});

test('session: scoring, check/SRS recording, timers, serialization', () => {
    const exam = mkBig(6);
    const store = App.createStorage(App.memoryBackend());
    const session = App.Session.create(exam.questions.slice(0, 3), { examId: 'big', modeId: 'all', studyMode: true, timerMode: 'total', totalSec: 5, threshold: 50, shuffleOptions: false });
    assert.equal(session.length, 3);
    session.setValue(0, 1);       // correct (answer index 1)
    session.setValue(1, 0);       // wrong
    assert.equal(session.check(0, store), true);
    assert.equal(session.check(1, store), false);
    assert.equal(session.check(2, store), null);
    assert.equal(store.getQStat('big', '1').box, 1);
    assert.equal(store.getQStat('big', '2').lastOk, false);
    const copy = App.Session.fromJSON(JSON.parse(JSON.stringify(session)));
    assert.equal(copy.answeredCount(), 2);
    let ev = null; for (let i = 0; i < 5; i++) ev = session.tick();
    assert.equal(ev, 'total');
    const attempt = session.submit(store);
    assert.equal(attempt.total, 3); assert.equal(attempt.correct, 1); assert.equal(attempt.pct, 33); assert.equal(attempt.passed, false);
    assert.equal(store.getQStat('big', '1').seen, 1, 'already-checked answers are not recorded twice');
    assert.deepEqual(attempt.answers.map(a => a[3]), [1, 1, 0]);
});

test('session: per-question timer resets when moving', () => {
    const exam = mkBig(4);
    const s = App.Session.create(exam.questions, { examId: 'big', modeId: 'all', timerMode: 'perQuestion', perQuestionSec: 3, threshold: 50 });
    assert.equal(s.tick(), null); assert.equal(s.qLeft, 2);
    s.goTo(1); assert.equal(s.qLeft, 3);
    s.tick(); s.tick(); assert.equal(s.tick(), 'question');
});

test('storage: attempts, sessions, qstats, export/import merge', () => {
    const a = App.createStorage(App.memoryBackend());
    a.addAttempt('e', { id: 'a1', ts: 1, pct: 50 });
    a.addAttempt('e', { id: 'a2', ts: 2, pct: 80 });
    a.patchQStat('e', 'u1', s => { s.seen = 1; s.last = 10; s.note = 'mine'; return s; });
    a.saveSession('e', { id: 's1', examId: 'e' });
    assert.equal(a.listSessions('e').length, 1);
    const dump = JSON.parse(JSON.stringify(a.exportData()));
    const b = App.createStorage(App.memoryBackend());
    b.addAttempt('e', { id: 'a2', ts: 2, pct: 80 });
    b.patchQStat('e', 'u1', s => { s.seen = 5; s.last = 5; return s; });
    const r = b.importData(dump);
    assert.equal(r.attempts, 1);
    assert.equal(b.listAttempts('e').length, 2);
    assert.equal(b.getQStat('e', 'u1').seen, 1, 'newer record wins');
    assert.equal(b.getQStat('e', 'u1').note, 'mine');
    assert.throws(() => b.importData({ foo: 1 }), /not an ExamSim/);
    assert.throws(() => b.importData({ app: 'examsim', v: 9, exams: {} }), /newer/);
});

test('storage: survives corrupted data and old versions', () => {
    const be = App.memoryBackend();
    be.setItem('examsim:v2', '{not json');
    const s = App.createStorage(be);
    assert.deepEqual(s.listAttempts('x'), []);
    be.setItem('exam_lang', 'it');
    assert.equal(s.getPref('lang'), 'it', 'falls back to the key used by earlier versions');
});

test('stats: aggregates attempts and per-question stats', () => {
    const exam = mkBig(9);
    const store = App.createStorage(App.memoryBackend());
    store.addAttempt('big', { id: 'a', ts: 1, pct: 40, passed: false, threshold: 70 });
    store.addAttempt('big', { id: 'b', ts: 2, pct: 90, passed: true, threshold: 70 });
    App.recordAnswer('big', '1', true, 4, store); App.recordAnswer('big', '1', true, 6, store);
    App.recordAnswer('big', '2', false, 10, store);
    const st = App.stats.compute(exam, store);
    assert.equal(st.attemptCount, 2); assert.equal(st.bestPct, 90); assert.equal(st.avgPct, 65);
    assert.equal(st.answered, 3); assert.equal(st.accuracy, 67);
    assert.equal(st.avgTimeSec, 7);
    assert.equal(st.hardest[0].uid, '2');
    const t = st.topics.find(x => x.topic === 'T0');
    assert.ok(t.seen >= 1);
});

test('loader: parses ExamSim.register(...) text without executing it', () => {
    const L = App.loader;
    const text = '// header\nExamSim.register({"format":2,"id":"z","title":"Z","questions":[]});\n';
    assert.equal(L.parseText(text).id, 'z');
    assert.equal(L.parseText('window.ExamData = {config:{}}'), null);
    assert.throws(() => L.parseText('ExamSim.register({bad json});'), e => e.code === 'parse');
    const bad = { format: 2, id: 'z', title: 'Z', questions: [] };
    assert.throws(() => L.finalize(bad, 'z', 'z.exam'), e => e.code === 'invalid');
});

test('events: handlers run and errors are isolated', () => {
    let n = 0;
    const off = App.events.on('t', () => { n++; });
    App.events.on('t', () => { throw new Error('boom'); });
    const origErr = console.error; console.error = () => {};
    App.events.emit('t'); console.error = origErr;
    off(); App.events.emit('t');
    assert.equal(n, 1);
});

test('rich text: parsing, safety and plain text', () => {
    const R = App.rich;
    const b = R.parse('Hello **bold** `code`\nnext');
    assert.equal(b[0].t, 'p');
    assert.ok(b[0].c.some(n => n.t === 'b') && b[0].c.some(n => n.t === 'code') && b[0].c.some(n => n.t === 'br'));
    assert.equal(R.parse('1. a\n2. b')[0].t, 'ol');
    assert.equal(R.parse('- a\n- b')[0].t, 'ul');
    assert.equal(R.parse('```js\nlet x = 1;\n```')[0].t, 'codeblock');
    assert.equal(R.parse('| a | b |\n|---|---|\n| 1 | 2 |')[0].t, 'table');
    // safety: no html, no javascript: URLs
    const evil = R.parse('<script>x</script> ![i](javascript:alert(1)) [l](javascript:alert(1))');
    const flat = JSON.stringify(evil);
    assert.ok(!/"t":"img"|"t":"a"/.test(flat));
    assert.ok(R.parse('![ok](data:image/png;base64,AAAA)')[0].c.some(n => n.t === 'img'));
    assert.ok(R.parse('![ok](pics/a.png)')[0].c.some(n => n.t === 'img'));
    assert.ok(R.parse('[ok](https://example.com/x)')[0].c.some(n => n.t === 'a'));
    // dollar amounts are not math
    assert.ok(!JSON.stringify(R.parse('about $1,000 USD (of the total $2,000)')).includes('"math"'));
    assert.ok(JSON.stringify(R.parse('area $x^2 + \\frac{a}{b}$')).includes('"math"'));
    assert.equal(R.plain('**a** ![alt](x.png) `c` [t](https://e.com)'), 'a alt c t');
    assert.ok(R.isPlain('Plain question text?') && !R.isPlain('with `code`'));
});

test('rich text: LaTeX subset', () => {
    const m = App.rich.parseMath('\\frac{a}{b}^2 + \\sqrt{x_1} \\times \\alpha');
    const s = JSON.stringify(m);
    for (const t of ['mfrac', 'msup', 'msqrt', 'msub']) assert.ok(s.includes('"' + t + '"'), t);
    assert.ok(s.includes('×') && s.includes('α'));
    assert.ok(JSON.stringify(App.rich.parseMath('x_a^b')).includes('msubsup'));
});

test('schema: warns about unsafe or huge images', () => {
    const r = App.schema.validate({ format: 2, id: 'x', title: 'X', questions: [
        { id: 1, topic: 'T', text: 'See ![x](javascript:alert(1))', options: ['a', 'b'], answer: [0] }] });
    assert.ok(r.warnings.some(w => /not allowed/.test(w.message)), r.format());
});

test('scoring: partial credit, penalties and points', () => {
    const items = [
        App.prepareQuestion(q({ id: 1, shuffle: false, answer: [0, 2], text: 'Select two' }), {}),
        App.prepareQuestion(q({ id: 2, shuffle: false, answer: [1] }), {}),
        App.prepareQuestion(q({ id: 3, shuffle: false, answer: [1], points: 3 }), {}),
        App.prepareQuestion(q({ id: 4, shuffle: false, answer: [1] }), {})
    ];
    // q1 partial (one of two), q2 wrong, q3 right (3 points), q4 unanswered
    const values = { 0: [0], 1: 0, 2: 1 };
    const plain = App.scoring.score(items, values, {});
    assert.equal(plain.score, 3); assert.equal(plain.max, 6); assert.equal(plain.pct, 50);
    assert.equal(plain.fully, 1); assert.equal(plain.partial, 0); assert.equal(plain.wrong, 2); assert.equal(plain.unanswered, 1);
    assert.equal(plain.custom, true, 'weighted points make the scoring custom');
    const partial = App.scoring.score(items, values, { partialCredit: true });
    assert.equal(partial.score, 3.5); assert.equal(partial.partial, 1);
    const penal = App.scoring.score(items, values, { partialCredit: true, wrongPenalty: 0.5, unansweredPenalty: 0.25 });
    assert.equal(penal.score, 3.5 - 0.5 - 0.25);
    assert.equal(App.scoring.score(items, {}, { wrongPenalty: 1, unansweredPenalty: 1 }).score, 0, 'never below zero');
});

test('scoring: partial credit per type and mandatory questions', () => {
    const T = App.types;
    const multi = App.prepareQuestion(q({ shuffle: false, answer: [0, 1, 2], text: 'Select three' }), {});
    assert.equal(App.fractionOf(multi, [0, 1], { partialCredit: true }).toFixed(2), '0.67');
    assert.equal(App.fractionOf(multi, [0, 1, 3], { partialCredit: true }).toFixed(2), '0.33');
    assert.equal(App.fractionOf(multi, [0, 1], {}), 0);
    const ord = App.prepareQuestion({ id: 6, topic: 'T', text: 'o', type: 'ordering', items: ['a', 'b', 'c', 'd'] }, {});
    assert.equal(App.fractionOf(ord, [0, 1, 3, 2], { partialCredit: true }), 0.5);
    const mat = App.prepareQuestion({ id: 7, topic: 'T', text: 'm', pairs: [{ left: 'a', right: '1' }, { left: 'b', right: '2' }] }, {});
    assert.equal(App.fractionOf(mat, [0, 0], { partialCredit: true }), 0.5);
    const sc = App.prepareQuestion({ id: 9, topic: 'T', text: 's', parts: [{ text: 'p1', options: ['x', 'y'], answer: [0], shuffle: false }, { text: 'p2', type: 'numeric', answer: 3 }] }, {});
    assert.equal(App.fractionOf(sc, [0, '4'], { partialCredit: true }), 0.5);
    const m1 = App.prepareQuestion(q({ id: 10, shuffle: false, mandatory: true }), {});
    assert.deepEqual(App.scoring.score([m1], { 0: 0 }, {}).mandatoryFailed, [0]);
    assert.deepEqual(App.scoring.score([m1], { 0: 1 }, {}).mandatoryFailed, []);
});

test('scoring: resolution order (defaults < user < exam < mode) and session pass/fail', () => {
    const exam = { settings: { scoring: { wrongPenalty: 0.25 } } };
    assert.equal(App.scoring.resolve(exam, null, { partialCredit: true }).partialCredit, false, 'exam rules win over user preferences');
    assert.equal(App.scoring.resolve({ settings: {} }, null, { partialCredit: true }).partialCredit, true);
    assert.equal(App.scoring.resolve({ settings: {} }, { exam: true }, { partialCredit: true }).partialCredit, false, 'exam modes ignore user preferences');
    assert.equal(App.scoring.resolve(exam, { scoring: { wrongPenalty: 0.5 } }, null).wrongPenalty, 0.5);

    const e = mkBig(4);
    const store = App.createStorage(App.memoryBackend());
    const qs = e.questions.map((x, i) => i === 0 ? Object.assign({}, x, { mandatory: true }) : x);
    const s = App.Session.create(qs, { examId: 'big', modeId: 'all', timerMode: 'none', threshold: 50, shuffleOptions: false });
    s.setValue(1, 1); s.setValue(2, 1); s.setValue(3, 1);      // 3 of 4 right, the mandatory first one unanswered
    const a = s.submit(store);
    assert.equal(a.pct, 75); assert.equal(a.mandatoryFailed, 1); assert.equal(a.passed, false);
});

test('profiles: separate data per profile, default key preserved', () => {
    const be = App.memoryBackend();
    App.backend = be;
    App.profiles.reset();
    App.profiles.use('default');
    assert.equal(App.storage.key, 'examsim:v2');
    App.storage.addAttempt('e', { id: 'a1', ts: 1, pct: 50 });
    const id = App.profiles.create('Anna');
    App.profiles.use(id);
    assert.notEqual(App.storage.key, 'examsim:v2');
    assert.equal(App.storage.listAttempts('e').length, 0, 'new profile starts empty');
    App.storage.addAttempt('e', { id: 'b1', ts: 2, pct: 90 });
    App.profiles.use('default');
    assert.equal(App.storage.listAttempts('e').length, 1);
    assert.equal(App.storage.listAttempts('e')[0].id, 'a1');
    assert.equal(App.profiles.list().length, 2);
    App.profiles.rename(id, 'Anna R.');
    assert.equal(App.profiles.list().find(p => p.id === id).name, 'Anna R.');
    assert.equal(App.profiles.remove('default') && App.profiles.list().length, 1, 'a profile can be removed');
    assert.equal(App.profiles.remove(App.profiles.current()), false, 'the last profile cannot be removed');
    App.profiles.reset();
});
