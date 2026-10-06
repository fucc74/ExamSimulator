// E2E suites for engine v3: options, backup/sync, library, wizard, editor, export, search, palette, reports, quality, update prompt.
const fs = require('fs');
const path = require('path');

const fresh = async (p, base, content) => {
    await p.goto(base + (content ? '?content=' + content : ''));
    await p.waitForFunction(() => window.ExamSim && ExamSim.App.backend);
    await p.evaluate(async () => { await ExamSim.App.wipeAll(); try { localStorage.clear(); } catch (e) {} });
    await p.goto(base + (content ? '?content=' + content : ''));
    if (content) await p.waitForSelector('#start-btn'); else await p.waitForSelector('#exam-list');
};
const openOptions = async p => { await p.click('#options-btn'); await p.waitForSelector('#opt-general'); };
const finishSession = async (p, runAll, mode) => { await runAll(p, mode); };

const TEXT_EXAM = `# Imported Networking Quiz
> Made from pasted text

## Basics

1. Which protocol resolves names to addresses?
A) FTP
B) DNS
C) SMTP
Answer: B
Explanation: DNS maps names to IPs.

2. Select two private IPv4 ranges.
- [x] 10.0.0.0/8
- [ ] 8.8.8.0/24
- [x] 192.168.0.0/16

## Security

3. Which port does HTTPS use by default?
A) 80
B) 443
C) 22
Answer: B

4. A question the author forgot to finish
A) first
B) second
`;

module.exports = {
    'options page: scoring and exam rules persist, language switch, back': async ({ p, check, URL_BASE }) => {
        await fresh(p, URL_BASE);
        await openOptions(p);
        check('options page shown', await p.locator('#view-options').isVisible());
        await p.check('#opt-partial', { force: true });
        await p.fill('#opt-wrong', '0.25');
        await p.dispatchEvent('#opt-wrong', 'change');
        await p.selectOption('#opt-pauses', '2');
        await p.check('#opt-strict', { force: true });
        const prefs = await p.evaluate(() => ({ s: ExamSim.App.storage.getPref('scoring'), r: ExamSim.App.storage.getPref('examRules') }));
        check('scoring saved', prefs.s && prefs.s.partialCredit === true && prefs.s.wrongPenalty === 0.25, prefs);
        check('exam rules saved', prefs.r && prefs.r.pauses === 2 && prefs.r.strictTime === true, prefs);
        await p.selectOption('#opt-lang', 'it');
        check('options translated', /Opzioni/.test(await p.locator('#view-options h1').innerText()));
        await p.reload();
        await p.waitForSelector('#opt-general');
        check('options page reopened from the address (#options)', await p.locator('#view-options').isVisible());
        check('language remembered', /Opzioni/.test(await p.locator('#view-options h1').innerText()));
        check('partial credit remembered', await p.locator('#opt-partial').isChecked());
        await p.click('#opt-back');
        check('back to the exam list', await p.locator('#exam-list').isVisible());
        await p.evaluate(() => ExamSim.App.ui.setLang('en'));
    },

    'profiles keep separate progress': async ({ p, check, runAll, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        await runAll(p, 'quick');
        check('default profile has an attempt', (await p.evaluate(() => ExamSim.App.storage.listAttempts('demo').length)) === 1);
        await p.goto(URL_BASE);
        await openOptions(p);
        await p.fill('#opt-new-profile', 'Anna');
        await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('#opt-add-profile')]);
        await p.waitForSelector('#opt-general');
        check('switched to the new profile', (await p.evaluate(() => ExamSim.App.profiles.currentProfile().name)) === 'Anna');
        check('new profile starts empty', (await p.evaluate(() => ExamSim.App.storage.listAttempts('demo').length)) === 0);
        check('language is device-wide, not per profile', await p.locator('#view-options h1').innerText() === 'Options');
        // go back to default
        await p.evaluate(() => ExamSim.App.profiles.use('default'));
        await p.reload();
        check('default profile progress intact', (await p.evaluate(() => ExamSim.App.storage.listAttempts('demo').length)) === 1);
    },

    'backup: reminder banner, full backup file, restore': async ({ p, check, runAll, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        await runAll(p, 'quick');
        await p.goto(URL_BASE);
        check('no reminder right after the first session', (await p.locator('#backup-banner').count()) === 0);
        await p.evaluate(() => { const a = ExamSim.App.storage.raw().exams.demo.attempts; a.forEach(x => { x.ts -= 30 * 86400000; }); ExamSim.App.storage.setPref('x', 1); });
        await p.goto(URL_BASE);
        await p.waitForSelector('#exam-list');
        check('reminder shown after 30 days without backup', (await p.locator('#backup-banner').count()) === 1);
        await p.click('#backup-banner >> text=Remind me later');
        check('reminder snoozed', (await p.locator('#backup-banner').count()) === 0);
        await openOptions(p);
        const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#opt-backup-dl')]);
        const file = await dl.path();
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        check('backup file has the attempt and a library section', data.app === 'examsim' && data.exams.demo.attempts.length === 1 && data.library !== undefined, Object.keys(data));
        check('last backup recorded', /Last backup/.test(await p.locator('#opt-last-backup').innerText()));
        // restore into a wiped store
        await p.evaluate(async () => { await ExamSim.App.wipeAll(); });
        await p.goto(URL_BASE);
        await p.waitForSelector('#exam-list');
        check('wiped', (await p.evaluate(() => ExamSim.App.storage.listAttempts('demo').length)) === 0);
        await p.setInputFiles('#import-file', file);
        await p.waitForFunction(() => ExamSim.App.storage.listAttempts('demo').length === 1);
        check('attempt restored from the file', true);
    },

    'sync: transfer code between profiles and mocked gist': async ({ p, ctx, check, runAll, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        await runAll(p, 'quick');
        await p.evaluate(() => ExamSim.App.storage.patchQStat('demo', '1', c => Object.assign({}, c, { note: 'my note', seen: 1, last: Date.now() })));
        await p.goto(URL_BASE);
        await openOptions(p);
        await p.click('#sync-make');
        await p.waitForFunction(() => document.querySelector('#sync-code-out').value.startsWith('ES'));
        const code = await p.inputValue('#sync-code-out');
        check('transfer code created', /^ES[01]\.[\w-]+$/.test(code), code.slice(0, 20));
        await p.evaluate(async () => { await ExamSim.App.wipeAll(); });
        await p.goto(URL_BASE);
        await p.waitForSelector('#exam-list');
        await openOptions(p);
        await p.fill('#sync-code-in', 'garbage');
        await p.click('#sync-import');
        check('bad code is rejected with a message', /Could not import/.test(await p.locator('.toast-msg').last().innerText()));
        await p.fill('#sync-code-in', code);
        await p.click('#sync-import');
        await p.waitForFunction(() => ExamSim.App.storage.listAttempts('demo').length === 1);
        check('attempt restored from the code', true);
        check('note restored', (await p.evaluate(() => ExamSim.App.storage.getQStat('demo', '1').note)) === 'my note');

        // gist, GitHub API mocked
        let remote = null, posts = 0, patches = 0;
        await p.route('https://api.github.com/**', async route => {
            const req = route.request();
            const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json' };
            if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
            if (req.headers().authorization !== 'Bearer tok123') return route.fulfill({ status: 401, headers, body: '{}' });
            if (req.method() === 'POST') { posts++; remote = JSON.parse(req.postData()).files['examsim-backup.json'].content; return route.fulfill({ status: 201, headers, body: JSON.stringify({ id: 'gist42' }) }); }
            if (req.method() === 'PATCH') { patches++; remote = JSON.parse(req.postData()).files['examsim-backup.json'].content; return route.fulfill({ status: 200, headers, body: JSON.stringify({ id: 'gist42' }) }); }
            return route.fulfill({ status: 200, headers, body: JSON.stringify({ files: { 'examsim-backup.json': { content: remote } } }) });
        });
        await p.fill('#gist-token', 'wrong');
        await p.click('#gist-sync');
        await p.waitForFunction(() => /failed/i.test(document.querySelector('#gist-status').textContent));
        check('wrong token explained', /401/.test(await p.locator('#gist-status').innerText()));
        await p.fill('#gist-token', 'tok123');
        await p.click('#gist-sync');
        await p.waitForFunction(() => /Synced/.test(document.querySelector('#gist-status').textContent));
        check('first sync created a private gist', posts === 1 && (await p.inputValue('#gist-id')) === 'gist42');
        check('uploaded data has no token and no sessions', remote && !remote.includes('tok123') && JSON.parse(remote).exams.demo.attempts.length === 1);
        // another "device" adds an attempt remotely
        const r = JSON.parse(remote);
        r.exams.demo.attempts.push({ id: 'otherdevice', ts: Date.now(), pct: 77, total: 3, correct: 2, answers: [], passed: true });
        remote = JSON.stringify(r);
        await p.click('#gist-sync');
        await p.waitForFunction(() => ExamSim.App.storage.listAttempts('demo').length === 2);
        check('second sync merged the remote attempt and pushed back', patches === 1 && JSON.parse(remote).exams.demo.attempts.length === 2);
        await p.unroute('https://api.github.com/**');
    },

    'wizard and editor: import text, fix problems, save, use, export': async ({ p, check, URL_BASE }) => {
        await fresh(p, URL_BASE);
        await p.click('#picker-wizard');
        await p.fill('#wiz-text', TEXT_EXAM);
        await p.click('.modal-actions >> text=Continue');
        await p.waitForSelector('#ed-questions');
        check('four questions understood', (await p.locator('.ed-q').count()) === 4);
        check('title and description picked up', (await p.inputValue('#ed-title')) === 'Imported Networking Quiz');
        check('the unfinished question is flagged', (await p.locator('.ed-q.has-problem').count()) >= 1);
        check('save is blocked while invalid', await p.locator('#ed-save').isDisabled());
        check('validation lists the problem', /problem/.test(await p.locator('#ed-validation').innerText()));
        // fix question 4: mark the second option as correct
        const q4 = p.locator('.ed-q').nth(3);
        if (!(await q4.locator('.ed-q-body').count())) await q4.locator('.ed-q-head').click();
        await p.locator('.ed-q').nth(3).locator('.ed-correct input').nth(1).check();
        await p.waitForFunction(() => !document.querySelector('#ed-save').disabled);
        check('valid after the fix', /Valid/.test(await p.locator('#ed-validation').innerText()));
        check('multi-answer question detected', await p.evaluate(() => ExamSim.App.questionType({ options: ['a', 'b', 'c'], answer: [0, 2] })) === 'multiple');
        await p.click('#ed-save');
        await p.waitForFunction(() => ExamSim.App.library.list().length === 1);
        const saved = await p.evaluate(() => ExamSim.App.library.list()[0]);
        check('saved in the library with 4 questions and 2 topics', saved.questionCount === 4 && saved.topicCount === 2, saved);
        await p.click('#ed-back');
        await p.click('#opt-back');
        const bundled = await p.evaluate(() => ExamSim.App.loader.baseCatalog().length);
        check('picker lists the new exam', (await p.locator('#exam-list .exam-card').count()) === bundled + 1);
        await p.click('.exam-card:has-text("Imported Networking Quiz")');
        await p.waitForSelector('#start-btn');
        check('local exam opens on its dashboard', /Imported Networking Quiz/.test(await p.locator('#view-dashboard h1').innerText()));
        await p.selectOption('#cfg-mode', 'all');
        await p.click('#start-btn');
        check('session runs', (await p.evaluate(() => ExamSim.App.state.session.length)) === 4);
        await p.goto(URL_BASE + '?content=' + encodeURIComponent('local:' + saved.id));
        await p.waitForSelector('#start-btn');
        // export dialog: csv + markdown + anki
        await p.click('#dash-export-exam');
        const dl = async sel => { const [d] = await Promise.all([p.waitForEvent('download'), p.click(sel)]); return fs.readFileSync(await d.path(), 'utf8'); };
        const csv = await dl('#exp-csv');
        check('CSV export has header and 4 rows', csv.replace(/^﻿/, '').split('\r\n').filter(Boolean).length === 5 && /^﻿?id,topic,type/.test(csv), csv.slice(0, 80));
        const md = await dl('#exp-md');
        check('Markdown export has the title and questions', /^# Imported Networking Quiz/.test(md) && /### 4\./.test(md));
        const anki = await dl('#exp-anki');
        check('Anki export has 4 cards', anki.trim().split('\n').length === 7 && anki.includes('#separator:tab'));
        const exam = await dl('#exp-exam');
        check('.exam export is loadable', /^ExamSim\.register\(/.test(exam));
        await p.keyboard.press('Escape');
        // re-import the CSV through the wizard
        const csvPath = path.join(require('os').tmpdir(), 'rt.csv');
        fs.writeFileSync(csvPath, csv);
        await p.click('#dash-edit').catch(() => {});
        await p.goto(URL_BASE);
        await p.click('#picker-wizard');
        await p.setInputFiles('#wiz-file', csvPath);
        await p.waitForFunction(() => document.querySelector('#wiz-text').value.length > 20);
        await p.click('.modal-actions >> text=Continue');
        await p.waitForSelector('#ed-questions');
        check('CSV re-imported with 4 valid questions', (await p.locator('.ed-q').count()) === 4 && (await p.locator('.ed-q.has-problem').count()) === 0);
        check('re-import is saveable', !(await p.locator('#ed-save').isDisabled()));
    },

    'editor: new exam, live validation, image attach, preview': async ({ p, check, URL_BASE }) => {
        await fresh(p, URL_BASE);
        await p.click('#picker-new');
        await p.waitForSelector('#ed-questions');
        check('new exam cannot be saved while the first question is empty', await p.locator('#ed-save').isDisabled());
        await p.locator('.ed-q-head').first().click();
        await p.fill('[id^="edq-text-"]', 'What is **2 + 2**?');
        await p.locator('.ed-option input[type="text"]').nth(0).fill('3');
        await p.locator('.ed-option input[type="text"]').nth(1).fill('4');
        await p.locator('.ed-correct input').nth(1).check();
        await p.waitForFunction(() => !document.querySelector('#ed-save').disabled);
        check('valid once text, options and answer are set', true);
        // attach an image (generated PNG)
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
        const pngPath = path.join(require('os').tmpdir(), 'dot.png');
        fs.writeFileSync(pngPath, png);
        await p.setInputFiles('.ed-q.open input[type="file"]', pngPath);
        await p.waitForFunction(() => /\(@img1\)/.test(document.querySelector('[id^="edq-text-"]').value));
        check('image shown as a short @img token in the text box', true);
        await p.click('#ed-preview');
        await p.waitForSelector('#start-btn');
        check('preview opens the draft as an exam', await p.locator('#preview-banner').isVisible());
        await p.selectOption('#cfg-mode', 'all');
        await p.click('#start-btn');
        check('image really rendered in the question', (await p.locator('#q-text img.rich-img').count()) === 1);
        check('bold rendered', (await p.locator('#q-text strong').count()) === 1);
        await p.evaluate(() => ExamSim.App.ui.openReview && ExamSim.App.ui.show('dashboard'));
        await p.click('#preview-back');
        await p.waitForSelector('#ed-questions');
        await p.click('#ed-save');
        await p.waitForFunction(() => ExamSim.App.library.list().length === 1);
        const stored = await p.evaluate(() => JSON.stringify(ExamSim.App.library.get(ExamSim.App.library.list()[0].id)));
        check('saved question keeps the real data URI', /data:image\/(png|jpeg);base64,/.test(stored));
    },

    'question search, practice from results, command palette, shortcuts': async ({ p, check, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        await p.click('#dash-search');
        await p.waitForSelector('#search-q');
        const total = await p.evaluate(() => ExamSim.App.state.exam.questions.length);
        check('all questions listed at first', (await p.locator('.search-card').count()) === total);
        await p.fill('#search-q', 'GPU');
        await p.waitForFunction(n => document.querySelectorAll('.search-card').length < n, total);
        const n1 = await p.locator('.search-card').count();
        check('text filter narrows the list and highlights', n1 >= 1 && (await p.locator('.search-card mark').count()) >= 1, n1);
        await p.fill('#search-q', '');
        await p.selectOption('#search-type', 'numeric');
        const nNum = await p.evaluate(() => ExamSim.App.state.exam.questions.filter(q => q.type === 'numeric').length);
        await p.waitForFunction(n => document.querySelectorAll('.search-card').length === n, nNum);
        check('type filter', nNum >= 1);
        await p.locator('.search-card button:has-text("Show answer")').first().click();
        check('answer revealed', (await p.locator('.search-details .review-correct').count()) >= 1);
        await p.click('#search-practice');
        check('practice session started from the results', (await p.evaluate(() => ExamSim.App.state.session.length)) === nNum && (await p.locator('#view-runtime').isVisible()));
        await p.keyboard.press('Control+K');
        await p.waitForSelector('#palette-input');
        await p.keyboard.type('option');
        await p.keyboard.press('Enter');
        await p.waitForSelector('#opt-general');
        check('command palette opened the options page', true);
        await p.click('#opt-back');
        await p.keyboard.press('Shift+?');
        check('? opens the shortcuts help', (await p.locator('.kbd-table').count()) === 1);
        await p.keyboard.press('Escape');
        check('Escape closes the dialog', (await p.locator('.modal-backdrop').count()) === 0);
        await p.keyboard.press('/');
        check('/ opens the search', await p.locator('#search-q').isVisible());
    },

    'clear answer, report a question, quality findings, changelog notice': async ({ p, check, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        await p.selectOption('#cfg-mode', 'all');
        await p.click('#start-btn');
        await p.locator('#q-body .option-card').first().click().catch(() => {});
        const kind = await p.evaluate(() => ExamSim.App.state.session.item().kind);
        if (kind === 'single' || kind === 'multiple') {
            check('answer recorded', await p.evaluate(() => ExamSim.App.state.session.hasAnswer(0)));
            await p.click('#clear-btn');
            check('Clear removes the answer', !(await p.evaluate(() => ExamSim.App.state.session.hasAnswer(0))));
        }
        await p.keyboard.press('r');
        await p.selectOption('#report-kind', 'typo');
        await p.fill('#report-note', 'there is a typo here');
        await p.click('.modal-actions >> text=Save report');
        check('report stored', (await p.evaluate(() => ExamSim.App.storage.listReports('demo').length)) === 1);
        await p.waitForTimeout(200);       // let the IndexedDB write commit before leaving the page
        await p.goto(URL_BASE);
        await openOptions(p);
        const rl = await p.locator('#opt-reports-list').innerText(); check('report listed in options', /Typo/.test(rl), rl);

        // quality: question answered wrong many times, always picking the same wrong option
        await p.goto(URL_BASE + '?content=demo');
        await p.waitForSelector('#start-btn');
        await p.evaluate(() => {
            const exam = ExamSim.App.state.exam;
            const q = exam.questions.find(x => x.type === 'single');
            ExamSim.App.storage.patchQStat('demo', q.uid, () => ({ seen: 12, correct: 1, wrong: 11, box: 0, due: 0, last: Date.now(), lastOk: false, time: 60, picks: { [(q.answer[0] + 1) % q.options.length]: 11, [q.answer[0]]: 1 } }));
        });
        await p.click('text=Statistics');
        await p.waitForSelector('#quality-panel');
        check('quality panel flags the suspicious key', /Check the answer key/.test(await p.locator('#quality-panel').innerText()));

        // changelog: add a local exam, bump the version and check the notice
        await p.evaluate(() => {
            const base = { format: 2, id: 'cl', title: 'Changelog exam', version: '1.0', questions: [{ id: 1, topic: 't', text: 'Q?', options: ['a', 'b'], answer: [0] }, { id: 2, topic: 't', text: 'Q2?', options: ['a', 'b'], answer: [1] }] };
            ExamSim.App.library.save(base);
        });
        await p.goto(URL_BASE + '?content=local%3Acl');
        await p.waitForSelector('#start-btn');
        check('no notice on the first visit', (await p.locator('#changelog-notice').count()) === 0);
        await p.evaluate(() => {
            ExamSim.App.library.save({ format: 2, id: 'cl', title: 'Changelog exam', version: '1.1', changelog: [{ version: '1.1', date: '2026-02-01', notes: ['Fixed question 2', { en: 'Added question 3', it: 'Aggiunta la domanda 3' }] }, { version: '1.0' }], questions: [{ id: 1, topic: 't', text: 'Q?', options: ['a', 'b'], answer: [0] }, { id: 2, topic: 't', text: 'Q2?', options: ['a', 'b'], answer: [1], rev: 2 }] });
        });
        await p.goto(URL_BASE + '?content=local%3Acl');
        await p.waitForSelector('#changelog-notice');
        check('notice lists the new entries', /Fixed question 2/.test(await p.locator('#changelog-notice').innerText()) && /Added question 3/.test(await p.locator('#changelog-notice').innerText()));
        await p.click('#changelog-dismiss');
        await p.waitForTimeout(200);
        await p.reload();
        await p.waitForSelector('#start-btn');
        check('notice stays dismissed', (await p.locator('#changelog-notice').count()) === 0, await p.evaluate(() => ExamSim.App.storage.getMeta('cl', 'seenVersion')));
        await p.click('#dash-changelog');
        check('full change log available', /Fixed question 2/.test(await p.locator('.modal-body').innerText()));
        await p.keyboard.press('Escape');
    },

    'update prompt: a changed service worker offers a reload': async ({ browser, check, HTTP_BASE, ROOT, override }) => {
        const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
        const p = await ctx.newPage();
        await p.goto(HTTP_BASE + '/exam.html');
        await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller || false, null, { timeout: 15000 }).catch(() => {});
        await p.evaluate(() => navigator.serviceWorker.ready);
        await p.reload();
        await p.waitForFunction(() => !!navigator.serviceWorker.controller);
        check('no banner when nothing changed', (await p.locator('#update-banner').count()) === 0);
        // the "server" now ships a different service worker
        override('/sw.js', () => fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').replace(/examsim-[0-9a-f]{10}/, 'examsim-newversion1'));
        await p.waitForSelector('#options-btn');
        await p.click('#options-btn');
        await p.click('#opt-check-update');
        await p.waitForSelector('#update-banner', { timeout: 15000 });
        check('new version banner shown', true);
        await Promise.all([p.waitForNavigation({ waitUntil: 'load', timeout: 15000 }), p.click('#update-reload')]);
        const names = await p.evaluate(() => caches.keys());
        check('page reloaded on the new version', names.includes('examsim-newversion1'), names);
        override('/sw.js', null);
        await ctx.close();
    },

    'exam discovery: check button, folder scan, folder import, exam menu': async ({ p, check, URL_BASE }) => {
        const mk = (id, title, n) => 'ExamSim.register(' + JSON.stringify({ format: 2, id, title, description: 'From disk: ' + title, questions: Array.from({ length: n }, (_, i) => ({ id: i + 1, topic: 'Topic', text: 'Question ' + (i + 1) + '?', options: ['a', 'b'], answer: [i % 2] })) }) + ');';
        // a fake folder that behaves like a File System Access directory handle
        await p.addInitScript(() => {
            window.__disk = { 'disk-quiz.exam': null, 'second.exam': null, 'broken.exam': 'ExamSim.register({ nope' };
            window.showDirectoryPicker = async () => ({
                name: 'my-exams', kind: 'directory',
                async *entries() { for (const [n, t] of Object.entries(window.__disk)) yield [n, { kind: 'file', getFile: async () => ({ text: async () => t }) }]; },
                queryPermission: async () => 'granted'
            });
        });
        await fresh(p, URL_BASE);
        check('the check button is on the start screen from the start', await p.locator('#scan-btn').isVisible());
        check('first-time hint explains what it does', /choose the folder/.test(await p.locator('#scan-status').innerText()));
        await p.evaluate(([a, b]) => { window.__disk['disk-quiz.exam'] = a; window.__disk['second.exam'] = b; }, [mk('disk-quiz', 'Disk Quiz', 3), mk('second', 'Second Disk Exam', 2)]);
        await p.click('#scan-btn');
        await p.waitForSelector('.exam-card:has-text("Disk Quiz")');
        check('cards built from the .exam files', (await p.locator('.exam-card:has-text("Disk Quiz")').innerText()).includes('From disk: Disk Quiz') && /3 questions/.test(await p.locator('.exam-card:has-text("Disk Quiz")').innerText()));
        check('folder chip shown', (await p.locator('.exam-card:has-text("Disk Quiz") .chip:has-text("Folder")').count()) === 1);
        check('status line shows the folder and count', /my-exams.*2 exams found/.test(await p.locator('#scan-status').innerText()));
        check('unreadable file reported', /1 file/.test(await p.locator('#scan-bad').innerText()));
        await p.click('#scan-bad button');
        check('details name the broken file', /broken\.exam/.test(await p.locator('.modal-body').innerText()));
        await p.keyboard.press('Escape');
        // a file changes on disk: pressing the button picks it up
        await p.evaluate(a => { window.__disk['disk-quiz.exam'] = a; }, mk('disk-quiz', 'Disk Quiz', 7));
        await p.click('#scan-btn');
        await p.waitForFunction(() => /7 questions/.test(document.querySelector('.exam-card:nth-of-type(n)').parentElement.innerText));
        check('re-scan picks up the changed file', /7 questions/.test(await p.locator('.exam-card:has-text("Disk Quiz")').innerText()));
        // open a folder exam: no page reload needed
        await p.evaluate(() => { window.__marker = 'same-page'; });
        await p.click('.exam-card:has-text("Disk Quiz")');
        await p.waitForSelector('#start-btn');
        check('folder exam opens on its dashboard', /Disk Quiz/.test(await p.locator('#view-dashboard h1').innerText()));
        check('opened without reloading the page', (await p.evaluate(() => window.__marker)) === 'same-page');
        // exam menu
        check('exam menu shows the current exam', (await p.locator('#exam-switch option:checked').innerText()).includes('Disk Quiz'));
        await p.selectOption('#exam-switch', 'disk:second');
        await p.waitForFunction(() => /Second Disk Exam/.test(document.querySelector('#view-dashboard h1').innerText));
        check('switching with the menu works for folder exams', true);
        await p.selectOption('#exam-switch', 'demo');
        await p.waitForSelector('#view-dashboard h1:has-text("Engine Demo")');
        check('...and for bundled exams', true);

        // fallback: import a whole folder (works in every browser)
        const dir = path.join(require('os').tmpdir(), 'examsim-folder-' + Date.now());
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'imported-one.exam'), mk('imported-one', 'Imported One', 2));
        fs.writeFileSync(path.join(dir, 'imported-two.exam'), mk('imported-two', 'Imported Two', 4));
        fs.writeFileSync(path.join(dir, 'garbage.exam'), 'not an exam');
        fs.writeFileSync(path.join(dir, 'readme.txt'), 'ignored');
        await p.goto(URL_BASE);
        await p.waitForSelector('#exam-list');
        const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#folder-import-btn')]);
        await chooser.setFiles(dir);
        await p.waitForFunction(() => ExamSim.App.library.list().length === 2);
        check('folder import added two exams to My exams', true);
        await p.waitForSelector('.modal-body:has-text("garbage.exam")');
        check('the unreadable file is listed', true);
        await p.keyboard.press('Escape');
        check('imported exams appear as cards', (await p.locator('.exam-card:has-text("Imported Two") .chip:has-text("My exam")').count()) === 1);
    }
};
