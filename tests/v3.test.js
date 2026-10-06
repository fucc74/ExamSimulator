const test = require('node:test');
const assert = require('node:assert');
const { loadApp, loadExamFile } = require('./helpers.js');

const App = loadApp();
const q = over => Object.assign({ id: 1, topic: 'T', text: 'Question?', options: ['a', 'b', 'c', 'd'], answer: [1], explanation: 'e' }, over);
const mkExam = (questions, extra) => Object.assign({ format: 2, id: 'x', title: 'X', questions }, extra || {});

// ------------------------------------------------------------------ text parser
test('parseText: numbered questions with lettered options, answers and explanations', () => {
    const r = App.convert.parseText(`# My Exam
> A test exam

## Networking

1. What does DNS do?
A) Encrypts traffic
B) Resolves names to addresses
C) Routes packets
D) Assigns MAC addresses
Answer: B
Explanation: DNS maps names to IPs.

2. Select two private ranges.
A. 10.0.0.0/8
B. 8.8.8.0/24
C. 192.168.0.0/16
Answer: A, C

## Storage

3. True or false: RAID 0 is redundant.
Answer: False
4. How many bits in a byte?
Answer: 8
`);
    assert.equal(r.meta.title, 'My Exam');
    assert.equal(r.meta.description, 'A test exam');
    assert.equal(r.questions.length, 4);
    const [a, b, c, d] = r.questions;
    assert.deepEqual([a.type, a.answer, a.options.length, a.topic], ['single', [1], 4, 'networking']);
    assert.equal(a.explanation, 'DNS maps names to IPs.');
    assert.deepEqual([b.type, b.answer], ['multiple', [0, 2]]);
    assert.deepEqual([c.type, c.answer, c.topic], ['truefalse', false, 'storage']);
    assert.deepEqual([d.type, d.answer], ['numeric', 8]);
    assert.deepEqual(r.topics, { networking: 'Networking', storage: 'Storage' });
});

test('parseText: Italian labels, checkbox options and multi-line text', () => {
    const r = App.convert.parseText(`Domanda 1: Quale protocollo
è usato per il web sicuro?
- [ ] FTP
- [x] HTTPS
- [ ] Telnet

Domanda 2: Quale porta usa SSH?
a) 21
b) 22 ✓
c) 23
Spiegazione: SSH usa la 22.
Risposta corretta: B`);
    assert.equal(r.questions.length, 2);
    assert.match(r.questions[0].text, /Quale protocollo\nè usato/);
    assert.deepEqual(r.questions[0].answer, [1]);
    assert.deepEqual(r.questions[1].answer, [1]);
    assert.equal(r.questions[1].explanation, 'SSH usa la 22.');
});

test('parseText: flags questions without an answer, and an explanation containing a number does not split', () => {
    const r = App.convert.parseText(`1. Pick one
A) x
B) y

2. Another
A) x
B) y
Answer: A
Explanation: Steps:
1. first thing
2. second thing
`);
    assert.equal(r.questions.length, 2);
    assert.deepEqual(r.questions[0]._issues, ['noAnswer']);
    assert.match(r.questions[1].explanation, /first thing/);
});

test('buildExam output validates', () => {
    const p = App.convert.parseText('# T\n\n1. Q one\nA) a\nB) b\nAnswer: A\n\n2. Q two\nA) a\nB) b\nAnswer: B\n');
    const exam = App.convert.buildExam(Object.assign({ id: 'imp' }, p.meta, { questions: p.questions, topics: p.topics }));
    const { exam: ok, report } = App.schema.prepare(exam, 'imp');
    assert.ok(ok, report.format());
    assert.equal(ok.questions.length, 2);
});

// ------------------------------------------------------------------ Markdown / CSV / Anki
const demo = () => loadExamFile('demo.exam');

test('markdown export re-imports the supported question types', () => {
    const exam = demo();
    App.setLang('en');
    const md = App.convert.toMarkdown(exam, 'en');
    assert.ok(md.skipped.length > 0, 'ordering/matching/scenario are skipped');
    const back = App.convert.parseText(md.text);
    const supported = exam.questions.filter(x => ['single', 'multiple', 'truefalse', 'numeric'].includes(App.questionType(x)));
    assert.equal(back.questions.length, supported.length);
    back.questions.forEach((bq, i) => {
        const orig = supported[i];
        assert.equal(bq.type, App.questionType(orig), 'type of question ' + orig.id);
        if (orig.options) assert.deepEqual(bq.answer, Array.isArray(orig.answer) ? orig.answer : [orig.answer]);
    });
    assert.equal(back.meta.title, App.loc(exam.title));
});

test('csv round trip keeps single, multiple, ordering, matching, numeric and true/false', () => {
    const exam = demo();
    const csv = App.convert.toCSV(exam, 'en');
    assert.ok(csv.text.startsWith('﻿id,topic,type'));
    assert.ok(csv.skipped.length >= 1, 'scenario skipped');
    const back = App.convert.fromCSV(csv.text);
    assert.equal(back.questions.length, exam.questions.length - csv.skipped.length);
    assert.ok(back.questions.every(x => x._issues.length === 0), JSON.stringify(back.questions.filter(x => x._issues.length)));
    const types = new Set(back.questions.map(x => x.type));
    ['single', 'multiple', 'truefalse', 'ordering', 'matching', 'numeric'].forEach(t => assert.ok(types.has(t), 'has ' + t));
    const built = App.convert.buildExam({ id: 'csv', title: 'CSV', questions: back.questions, topics: back.topics });
    const { exam: ok, report } = App.schema.prepare(built, 'csv');
    assert.ok(ok, report.format());
});

test('csv import: semicolon delimiter, option columns, quoted cells and accents', () => {
    const csv = 'Domanda;Opzione A;Opzione B;Opzione C;Risposta;Argomento;Spiegazione\n"Qual è la capitale; d\'Italia?";Roma;Milano;Torino;A;Geografia;"Roma, ""caput mundi"""\n';
    const r = App.convert.fromCSV(csv);
    assert.equal(r.questions.length, 1);
    const x = r.questions[0];
    assert.equal(x.text, "Qual è la capitale; d'Italia?");
    assert.deepEqual([x.type, x.options, x.answer], ['single', ['Roma', 'Milano', 'Torino'], [0]]);
    assert.equal(x.explanation, 'Roma, "caput mundi"');
    assert.deepEqual(r.topics, { geografia: 'Geografia' });
});

test('anki export is tab separated with the three columns and html line breaks', () => {
    const txt = App.convert.toAnki(demo(), 'en');
    const lines = txt.trim().split('\n');
    assert.deepEqual(lines.slice(0, 3), ['#separator:tab', '#html:true', '#tags column:3']);
    const cards = lines.slice(3);
    assert.equal(cards.length, demo().questions.length);
    cards.forEach(l => assert.equal(l.split('\t').length, 3, l));
    assert.ok(cards.some(l => l.includes('<br>')));
});

// ------------------------------------------------------------------ transfer code, backup reminder, library
test('transfer code round trip (gzip when available)', async () => {
    App.storage = App.createStorage(App.memoryBackend());
    App.storage.addAttempt('e', { id: 'a1', ts: 1000, pct: 80, answers: [] });
    App.storage.patchQStat('e', '1', c => Object.assign({}, c, { seen: 2, correct: 1, last: 5, note: 'remember' }));
    const code = await App.backup.encode(App.backup.snapshot());
    assert.match(code, /^ES[01]\.[\w-]+$/);
    const obj = await App.backup.decode(' ' + code.slice(0, 10) + '\n' + code.slice(10) + ' ');
    const other = App.createStorage(App.memoryBackend());
    const r = other.importData(obj);
    assert.equal(r.attempts, 1);
    assert.equal(other.getQStat('e', '1').note, 'remember');
    await assert.rejects(() => App.backup.decode('hello'), /transfer code/);
    await assert.rejects(() => App.backup.decode('ES1.AAAA'), /damaged|incomplete/);
});

test('snapshot keeps only portable prefs and never the gist token', () => {
    App.backend = App.memoryBackend();
    App.storage = App.createStorage(App.backend);
    App.storage.setPref('lang', 'it');
    App.storage.setPref('scoring', { partialCredit: true });
    App.backup.setGistConfig({ token: 'secret-token', id: 'abc' });
    const snap = App.backup.snapshot();
    assert.deepEqual(Object.keys(snap.prefs), ['scoring']);
    assert.ok(!JSON.stringify(snap).includes('secret-token'));
});

test('backup reminder: due only with progress and after the configured days', () => {
    App.storage = App.createStorage(App.memoryBackend());
    const day = 86400000, t0 = Date.now();
    assert.equal(App.backup.due(t0), false, 'no progress, nothing to protect');
    App.storage.addAttempt('e', { id: 'a', ts: t0, pct: 50, answers: [] });
    assert.equal(App.backup.due(t0 + 5 * day), false);
    assert.equal(App.backup.due(t0 + 20 * day), true);
    App.backup.snooze(3, t0 + 20 * day);
    assert.equal(App.backup.due(t0 + 21 * day), false);
    assert.equal(App.backup.due(t0 + 24 * day), true);
    App.backup.markBackup(t0 + 24 * day);
    assert.equal(App.backup.due(t0 + 30 * day), false);
    App.storage.setPref('backupRemindDays', 0);
    assert.equal(App.backup.due(t0 + 900 * day), false, 'reminder switched off');
});

test('gist sync: merges the remote copy, then pushes (mocked GitHub API)', async () => {
    App.backend = App.memoryBackend();
    App.storage = App.createStorage(App.backend);
    App.storage.addAttempt('e', { id: 'local1', ts: 1, pct: 10, answers: [] });
    let remote = JSON.stringify({ app: 'examsim', v: 2, prefs: {}, exams: { e: { attempts: [{ id: 'remote1', ts: 2, pct: 90, answers: [] }], sessions: {}, qstats: {} } } });
    const calls = [];
    const ctx = global;
    const realFetch = ctx.fetch;
    ctx.fetch = async (url, opt) => {
        calls.push([opt.method, url.replace('https://api.github.com', '')]);
        assert.equal(opt.headers.Authorization, 'Bearer tok');
        if (opt.method === 'GET') return { ok: true, status: 200, json: async () => ({ files: { 'examsim-backup.json': { content: remote } } }) };
        remote = JSON.parse(opt.body).files['examsim-backup.json'].content;
        return { ok: true, status: 200, json: async () => ({ id: 'newgist' }) };
    };
    try {
        App.backup.setGistConfig({ token: 'tok' });
        const r1 = await App.backup.syncGist();
        assert.equal(r1.id, 'newgist');
        assert.deepEqual(calls, [['POST', '/gists']]);
        assert.equal(App.backup.gistConfig().id, 'newgist');
        const r2 = await App.backup.syncGist();
        assert.equal(r2.pulled.attempts, 0, 'its own push is already known');
        remote = JSON.stringify({ app: 'examsim', v: 2, prefs: {}, exams: { e: { attempts: [{ id: 'remote1', ts: 2, pct: 90, answers: [] }], sessions: {}, qstats: {} } } });
        const r3 = await App.backup.syncGist();
        assert.equal(r3.pulled.attempts, 1);
        assert.equal(App.storage.listAttempts('e').length, 2);
        assert.ok(JSON.parse(remote).exams.e.attempts.length === 2, 'merged data pushed back');
    } finally { ctx.fetch = realFetch; }
});

test('library: save, validate, list, catalog id and removal', () => {
    App.backend = App.memoryBackend();
    const raw = mkExam([q({ id: 1 }), q({ id: 2, topic: 'U' })], { id: 'mine', title: 'Mine' });
    const bad = App.library.save(mkExam([q({ id: 1, answer: [9] })], { id: 'bad' }));
    assert.equal(bad.ok, false);
    assert.ok(bad.report.errors.length);
    const ok = App.library.save(raw);
    assert.ok(ok.ok);
    const list = App.library.list();
    assert.equal(list.length, 1);
    assert.deepEqual([list[0].file, list[0].questionCount, list[0].topicCount], ['local:mine', 2, 2]);
    assert.equal(App.library.freeId('mine', ['demo']), 'mine-2');
    assert.equal(App.library.freeId('Demo Exam!', ['demo-exam']), 'demo-exam-2');
    const map = App.library.exportAll();
    App.library.remove('mine');
    assert.equal(App.library.list().length, 0);
    assert.equal(App.library.importAll(map), 1);
    assert.ok(App.library.get('mine'));
    assert.equal(App.library.importAll(map), 0, 'same version is not re-imported');
});

// ------------------------------------------------------------------ reports, versions, quality
test('reports and metadata are stored, merged on import and exported', () => {
    const s = App.createStorage(App.memoryBackend());
    s.addReport('e', { uid: '3', kind: 'wrongAnswer', note: 'B is correct' });
    s.setMeta('e', 'seenVersion', '1.0');
    const rep = s.listReports('e');
    assert.equal(rep.length, 1);
    assert.ok(rep[0].id && rep[0].ts);
    const data = s.exportData();
    const t = App.createStorage(App.memoryBackend());
    t.importData(data); t.importData(data);
    assert.equal(t.listReports('e').length, 1);
    assert.equal(t.getMeta('e', 'seenVersion'), '1.0');
    t.removeReport('e', rep[0].id);
    assert.equal(t.listReports('e').length, 0);
});

test('retired questions are excluded, revised questions come back for review', () => {
    const { exam } = App.schema.prepare(mkExam([q({ id: 1 }), q({ id: 2, retired: true }), q({ id: 3, rev: 2 })]), 'x');
    assert.equal(exam.questions.length, 2);
    assert.equal(exam.retiredQuestions.length, 1);
    const now = Date.now();
    const stats = { '1': { seen: 1, due: now + 5 * 86400000, box: 2 }, '3': { seen: 1, due: now + 5 * 86400000, box: 2, rev: 1 } };
    const pool = App.modes.pool(exam, 'review', stats, now);
    assert.deepEqual(pool.questions.map(x => x.id), [3]);
    assert.ok(!pool.fallback);
    assert.equal(App.schema.validate(mkExam([q({ id: 1, retired: true })])).ok(), false);
});

test('changelog validation', () => {
    const good = mkExam([q()], { changelog: [{ version: '1.1', date: '2026-03-01', notes: ['Fixed Q3', { en: 'Added Q9', it: 'Aggiunta Q9' }] }] });
    assert.ok(App.schema.validate(good).ok());
    const bad = mkExam([q()], { changelog: [{ version: '', notes: [''] }, { version: '1.0', date: 'yesterday' }] });
    assert.ok(App.schema.validate(bad).errors.length >= 2);
});

test('picks per original option are recorded; quality flags a likely wrong key', () => {
    const { exam } = App.schema.prepare(mkExam([q({ id: 1, shuffle: false })]), 'x');
    const storage = App.createStorage(App.memoryBackend());
    // 10 attempts, always picking option C (index 2) although the key says B
    for (let i = 0; i < 10; i++) {
        const session = App.Session.create(exam.questions, { examId: 'x', modeId: 'all', shuffleOptions: false });
        session.setValue(0, 2);
        session.submit(storage);
    }
    const st = storage.getQStat('x', '1');
    assert.equal(st.picks[2], 10);
    assert.equal(st.rev, undefined);
    const f = App.quality.analyze(exam, storage.allQStats('x'));
    assert.ok(f.some(x => x.kind === 'dubiousKey' && x.params.opt === 'C'), JSON.stringify(f));
    assert.ok(f.some(x => x.kind === 'tooHard'));
});

test('quality: too easy, weak distractors and structural issues', () => {
    const { exam } = App.schema.prepare(mkExam([q({ id: 1, options: ['x', 'y', 'z', 'Long long long long long long long long answer text here'], answer: [3] }), q({ id: 2, options: ['dup', 'dup', 'c', 'All of the above'], answer: [2] })]), 'x');
    const stats = { '1': { seen: 12, correct: 12, wrong: 0, picks: { 3: 12 } } };
    const f = App.quality.analyze(exam, stats);
    assert.ok(f.some(x => x.kind === 'tooEasy'));
    assert.ok(f.some(x => x.kind === 'weakDistractor'));
    const s = App.quality.structural(exam);
    assert.ok(s.some(x => x.kind === 'correctMuchLonger' && x.id === 1));
    assert.ok(s.some(x => x.kind === 'duplicateOptions' && x.id === 2));
    assert.ok(s.some(x => x.kind === 'allOfAbove'));
});

// ------------------------------------------------------------------ translations
test('every UI string used in the code exists in English and Italian', () => {
    const fs = require('fs'), path = require('path');
    const dir = path.join(__dirname, '..', 'src', 'js');
    const used = new Set();
    for (const f of fs.readdirSync(dir)) {
        const t = fs.readFileSync(path.join(dir, f), 'utf8');
        for (const m of t.matchAll(/App\.t\('([A-Za-z0-9_]+)'/g)) used.add(m[1]);
        for (const m of t.matchAll(/App\.t\((?:[^()'"]*\?\s*)?'([A-Za-z0-9_]+)'\s*:\s*'([A-Za-z0-9_]+)'/g)) { used.add(m[1]); used.add(m[2]); }
    }
    ['wizNoteText', 'wizNoteCsv', 'wizNoTextColumn', 'wizNoQuestions'].forEach(k => used.add(k));
    ['noAnswer', 'fewOptions', 'noOptions', 'noText', 'badType'].forEach(k => used.add('issue_' + k));
    ['wrongAnswer', 'unclear', 'typo', 'outdated', 'other'].forEach(k => used.add('reportKind_' + k));
    ['single', 'multiple', 'truefalse', 'ordering', 'matching', 'numeric', 'scenario'].forEach(k => used.add('type_' + k));
    ['tooEasy', 'tooHard', 'dubiousKey', 'weakDistractor', 'slow', 'difficultyMismatch', 'duplicateOptions', 'allOfAbove', 'correctMuchLonger'].forEach(k => { used.add('quality_' + k); used.add('qualityDetail_' + k); });
    const missing = [];
    used.forEach(k => { if (k.endsWith('_')) return; ['en', 'it'].forEach(l => { if (!(k in App.I18N[l])) missing.push(l + ':' + k); }); });
    assert.deepEqual(missing, []);
    const en = Object.keys(App.I18N.en), it = Object.keys(App.I18N.it);
    assert.deepEqual(en.filter(k => !it.includes(k)), [], 'keys only in English');
    assert.deepEqual(it.filter(k => !en.includes(k)), [], 'keys only in Italian');
});

// ------------------------------------------------------------------ exams on disk
const examText = (id, title, n) => 'ExamSim.register(' + JSON.stringify(mkExam(Array.from({ length: n || 2 }, (_, i) => q({ id: i + 1, topic: i ? 'U' : 'T' })), { id, title })) + ');';
function fakeDir(name, files) {
    return {
        name, kind: 'directory',
        async *entries() { for (const [n, text] of Object.entries(files)) yield [n, { kind: 'file', getFile: async () => ({ text: async () => text }) }]; yield ['sub', { kind: 'directory' }]; },
        queryPermission: async () => 'granted'
    };
}

test('folder scan: cards come from the files, bad files are reported, folder exams load without a build', async () => {
    App.backend = App.memoryBackend();
    const r = await App.folder.useHandle(fakeDir('exams', {
        'alpha.exam': examText('alpha', 'Alpha exam', 3), 'beta.exam': examText('beta', 'Beta exam', 2),
        'broken.exam': 'ExamSim.register({ not json', 'invalid.exam': 'ExamSim.register(' + JSON.stringify(mkExam([q({ answer: [9] })], { id: 'inv' })) + ');', 'notes.txt': 'ignore me'
    }));
    assert.equal(r.found, 2);
    assert.deepEqual(App.folder.entries().map(e => [e.id, e.file, e.questionCount, e.topicCount, e.disk]), [['alpha', 'disk:alpha', 3, 2, true], ['beta', 'disk:beta', 2, 2, true]]);
    assert.deepEqual(App.folder.state.bad.map(b => b.name).sort(), ['broken.exam', 'invalid.exam']);
    assert.match(App.folder.state.bad.find(b => b.name === 'invalid.exam').message, /answer/);
    const exam = await App.loader.loadByName('disk:alpha');
    assert.equal(exam.questions.length, 3);
    assert.equal(exam.sourceFile, 'disk:alpha');
    await assert.rejects(() => App.loader.loadByName('disk:missing'), e => e.code === 'diskAccess');
    // a changed file shows up after the next scan
    await App.folder.useHandle(fakeDir('exams', { 'alpha.exam': examText('alpha', 'Alpha exam v2', 5) }));
    assert.deepEqual(App.folder.entries().map(e => e.questionCount), [5]);
    await App.folder.forget();
    assert.equal(App.folder.entries().length, 0);
});

test('catalog merges bundled, own and folder exams; the fresher source wins on the same id', async () => {
    App.backend = App.memoryBackend();
    App.library.save(mkExam([q()], { id: 'mine', title: 'Mine' }));
    await App.folder.useHandle(fakeDir('d', { 'mine.exam': examText('mine', 'Mine on disk', 4), 'new.exam': examText('new', 'New one', 2) }));
    const cat = App.loader.catalog();
    assert.deepEqual(cat.map(c => c.id), ['mine', 'new']);
    assert.equal(cat[0].disk, true);
    await App.folder.forget();
});

test('folder import copies exams into the library: new, updated, bundled skipped, bad reported', () => {
    App.backend = App.memoryBackend();
    const files = [{ name: 'a.exam', text: examText('a', 'A', 2) }, { name: 'bad.exam', text: 'nonsense' }];
    let r = App.folder.importFiles(files);
    assert.deepEqual([r.added, r.updated, r.bundled, r.bad.length], [1, 0, 0, 1]);
    r = App.folder.importFiles([{ name: 'a.exam', text: examText('a', 'A changed', 4) }]);
    assert.deepEqual([r.added, r.updated], [0, 1]);
    assert.equal(App.library.get('a').questions.length, 4);
    assert.equal(App.library.list().length, 1);
});
