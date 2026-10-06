// E2E suites. Each receives {p, ctx, browser, check, answerCurrent, runAll, URL_BASE, HTTP_BASE, ROOT, errors, newPage}.
const fs = require('fs');
const path = require('path');
const { readExamFile } = require('../tools/exam-files.js');
const DEMO = readExamFile(path.join(__dirname, '..', 'demo.exam'));
const N = DEMO.questions.length;
const N_D3 = DEMO.questions.filter(q => q.difficulty === 3).length;

const S = p => p.evaluate(() => { const s = ExamSim.App.state.session; return s && { index: s.index, length: s.length, studyMode: s.studyMode, kind: s.item().kind }; });
const fresh = async (p, base, content) => {
    await p.goto(base + (content ? '?content=' + content : ''));
    await p.waitForFunction(() => window.ExamSim && ExamSim.App.backend);
    await p.evaluate(async () => { await ExamSim.App.wipeAll(); try { localStorage.clear(); } catch (e) {} });
    await p.goto(base + (content ? '?content=' + content : ''));
    if (content) await p.waitForSelector('#start-btn');
};

module.exports = {
    'rich text renders images, code, math and tables safely': async ({ p, check, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        await p.selectOption('#cfg-mode', 'all');
        await p.click('#start-btn');
        await p.evaluate(() => { ExamSim.App.state.session.goTo(12); ExamSim.App.ui.refreshRuntime(); });
        check('image rendered', (await p.locator('#q-text img.rich-img').count()) === 1);
        check('inline code and bold in options', (await p.locator('#q-body code.rich-code').count()) === 1 && (await p.locator('#q-body strong').count()) >= 1);
        await p.evaluate(() => { ExamSim.App.state.session.goTo(13); ExamSim.App.ui.refreshRuntime(); });
        check('formula rendered as MathML', (await p.locator('#q-text math').count()) === 2);
        await p.evaluate(() => { ExamSim.App.state.session.goTo(14); ExamSim.App.ui.refreshRuntime(); });
        check('table rendered', (await p.locator('#q-text table.rich-table tbody tr').count()) === 3);
        await p.evaluate(() => { const s = ExamSim.App.state.session; s.items[0].text = '<img src=x onerror="window.__xss=1"> **ok**'; s.goTo(0); ExamSim.App.ui.refreshRuntime(); });
        check('HTML in content is shown as text, never executed', (await p.locator('#q-text img').count()) === 0 && (await p.evaluate(() => window.__xss)) === undefined);
    },

    'pause policy, strict clock, pace and custom scoring': async ({ p, check, answerCurrent, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        await p.selectOption('#cfg-mode', 'strict');
        check('exam mode default for strict mode', !(await p.locator('#cfg-study').isChecked()));
        await p.click('#start-btn');
        check('pause button shows pauses left', /1 left/.test(await p.locator('#pause-btn').innerText()));
        const before = await p.evaluate(() => ExamSim.App.state.session.secondsLeft);
        await p.click('#pause-btn');
        check('pause overlay hides the question', await p.locator('#pause-overlay').isVisible());
        await p.waitForTimeout(2300);
        const during = await p.evaluate(() => ExamSim.App.state.session.secondsLeft);
        check('clock stopped while paused', during === before, [before, during]);
        await p.click('#unpause-btn');
        check('no pauses left afterwards', await p.locator('#pause-btn').isDisabled());
        check('free navigation still works in strict mode', await (async () => { await p.click('#session-action-trigger'); return (await S(p)).index === 1; })());
        // strict clock: time passes while the session is closed
        await p.evaluate(() => { const A = ExamSim.App; const s = A.state.session; A.ui.persist(); A.storage.raw().exams.demo.sessions[s.id].updatedAt -= 60000; A.storage.setPref('touch', 1); });
        await p.reload();
        await p.waitForSelector('.sessions-box');
        await p.click('.sessions-box >> text=Resume');
        const left = await p.evaluate(() => ExamSim.App.state.session.secondsLeft);
        check('strict time deducts the time spent away', left <= before - 55, [before, left]);
        check('pace chip shown for total timers', await p.locator('#pace-chip').isVisible());
        // answer everything correctly → custom scoring shows points
        const n = await p.evaluate(() => ExamSim.App.state.session.length);
        await p.evaluate(() => { ExamSim.App.state.session.goTo(0); ExamSim.App.ui.refreshRuntime(); });
        for (let i = 0; i < n; i++) {
            await answerCurrent(p);
            if (i < n - 1) await p.click('#session-action-trigger');
        }
        await p.click('#session-action-trigger');
        await p.click('#submit-btn');
        check('100% with all answers right', (await p.locator('#metric-percentage').innerText()) === '100%');
        check('points line shown for custom scoring', /6 \/ 6 points/.test(await p.locator('#points-line').innerText()), await p.locator('#points-line').innerText().catch(() => 'none'));
    },

    'print layout': async ({ p, check, runAll, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        await runAll(p, 'all');
        check('print button available', await p.locator('#print-btn').isVisible());
        await p.emulateMedia({ media: 'print' });
        check('header and toolbar hidden when printing', !(await p.locator('.app-header').isVisible()) && !(await p.locator('#view-summary .toolbar').isVisible()));
        check('print heading shown', await p.locator('.print-head').isVisible());
        await p.emulateMedia({ media: 'screen' });
    },

    'picker and exam loading': async ({ p, check, URL_BASE }) => {
        await p.goto(URL_BASE);
        check('exam cards listed', (await p.locator('.exam-card').count()) >= 4);
        await p.click('.exam-card >> text=V31 Practice Test');
        await p.waitForSelector('#start-btn');
        check('dashboard opens', /V31/.test(await p.title()));
        check('exam chips for switching', (await p.locator('.exam-chip').count()) >= 4);
        await p.goto(URL_BASE + '?content=doesnotexist');
        await p.waitForSelector('.error-box');
        check('missing file shows a clear error', /doesnotexist\.exam/.test(await p.locator('.error-box').innerText()));
    },

    'full run of each bundled exam (single/multiple)': async ({ p, check, runAll, URL_BASE }) => {
        for (const name of ['managedServices', 'v31', 'v31advanced']) {
            await fresh(p, URL_BASE, name);
            const n = await runAll(p, 'all');
            const pct = await p.locator('#metric-percentage').innerText();
            check(name + ': ' + n + ' questions answered correctly → 100%', pct === '100%', pct);
        }
    },

    'demo exam: every question type through the UI': async ({ p, check, runAll, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        const n = await runAll(p, 'all');
        const kinds = await p.evaluate(() => [...new Set(ExamSim.App.state.lastResult.session.items.map(i => i.kind))].sort());
        check('all kinds present', ['multiple', 'matching', 'numeric', 'ordering', 'scenario', 'single'].every(k => kinds.includes(k)), kinds);
        check(N + ' questions → 100%', n === N && (await p.locator('#metric-percentage').innerText()) === '100%', await p.locator('#metric-percentage').innerText());
    },

    'study mode: check locks the answer and shows the explanation': async ({ p, check, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        await p.selectOption('#cfg-mode', 'all');
        await p.click('#start-btn');
        check('check button visible in study mode', await p.locator('#validate-btn').isVisible());
        await p.click('#validate-btn');
        check('check without an answer is refused', (await p.locator('.dynamic-explanation-box').count()) === 0);
        const info = await p.evaluate(() => ExamSim.App.state.session.item().kind);
        await p.locator('#q-body .option-card').first().click();
        await p.click('#validate-btn');
        check('explanation shown after checking', (await p.locator('.dynamic-explanation-box').count()) === 1);
        check('check button disabled afterwards', await p.locator('#validate-btn').isDisabled());
        check('inputs locked', await p.locator('#q-body .option-input').first().isDisabled());
        check('grid shows correct/wrong state', (await p.locator('.nav-grid-btn.answered-correct, .nav-grid-btn.answered-wrong').count()) === 1);
    },

    'exam mode: no check button, review screen before submitting': async ({ p, check, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        await p.selectOption('#cfg-mode', 'mock');
        check('exam mode is the default for exam modes', !(await p.locator('#cfg-study').isChecked()));
        await p.click('#start-btn');
        check('no check button in exam mode', !(await p.locator('#validate-btn').isVisible()));
        const kind = await p.evaluate(() => ExamSim.App.state.session.item().kind);
        await p.click('#session-action-trigger');           // skip a question without answering
        await p.click('#finish-btn'); // end and score → review
        await p.waitForSelector('#view-review:not(.hidden)');
        const text = await p.locator('#view-review .subtitle').innerText();
        check('review lists unanswered questions', /10 unanswered/.test(text), text);
        await p.click('text=Back to the exam');
        check('back to the exam works', await p.locator('#view-runtime').isVisible());
        await p.click('#finish-btn');
        await p.click('#submit-btn');
        check('results shown', await p.locator('#metric-percentage').isVisible());
        check('unanswered counted as such', (await p.locator('.review-item-card.is-unanswered').count()) === 10);
    },

    'flags and notes persist; flagged mode': async ({ p, check, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        await p.selectOption('#cfg-mode', 'all');
        await p.click('#start-btn');
        await p.click('.flag-btn');
        check('flag button pressed', (await p.getAttribute('.flag-btn', 'aria-pressed')) === 'true');
        check('grid shows flagged marker', (await p.locator('.nav-grid-btn.flagged').count()) === 1);
        await p.locator('.note-box summary').click();
        await p.fill('#q-note', 'remember this');
        await p.waitForTimeout(600);
        await p.reload();
        await p.waitForSelector('#start-btn');
        const flaggedOpt = await p.locator('#cfg-mode option[value="flagged"]').innerText();
        check('flagged mode counts 1', /\(1\)/.test(flaggedOpt), flaggedOpt);
        await p.selectOption('#cfg-mode', 'flagged');
        await p.click('#start-btn');
        check('flagged session has 1 question', (await S(p)).length === 1);
        await p.locator('.note-box summary').click().catch(() => {});
        check('note restored', (await p.inputValue('#q-note')) === 'remember this');
    },

    'sessions in progress can be resumed': async ({ p, check, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        await p.selectOption('#cfg-mode', 'all');
        await p.click('#start-btn');
        await p.locator('#q-body .option-card').first().click();
        await p.click('#session-action-trigger');
        await p.waitForTimeout(500);
        await p.reload();
        await p.waitForSelector('.sessions-box');
        const info = await p.locator('.session-info').first().innerText();
        check('session listed with progress', new RegExp('1/' + N + ' answered').test(info), info);
        await p.click('.sessions-box >> text=Resume');
        check('resumes at the right question', (await S(p)).index === 1);
        check('answer preserved', await p.evaluate(() => ExamSim.App.state.session.hasAnswer(0)));
    },

    'attempt history and statistics': async ({ p, check, runAll, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        await runAll(p, 'all');
        await p.click('#return-btn');
        await p.click('#view-dashboard >> text=Statistics');
        await p.waitForSelector('.tiles');
        const tiles = await p.locator('.tiles').innerText();
        check('stats show 1 attempt and 100% accuracy', /1\s*\nAttempts/.test(tiles) && /100%\s*\nOverall accuracy/.test(tiles), tiles);
        check('history chart rendered', (await p.locator('#view-stats .chart-box svg circle').count()) === 1);
        check('topic bars rendered', (await p.locator('#view-stats .bar-row').count()) === 3);
        await p.click('#view-stats >> text=Back');
        check('back to dashboard', await p.locator('#start-btn').isVisible());
    },

    'spaced repetition: mistakes and review modes': async ({ p, check, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        await p.selectOption('#cfg-mode', 'all');
        await p.click('#start-btn');
        // answer the first question wrongly on purpose (study mode): pick an option that is not correct
        const wrongIdx = await p.evaluate(() => { const it = ExamSim.App.state.session.item(); return it.kind === 'single' || it.kind === 'multiple' ? [0, 1, 2, 3].find(i => !it.answer.includes(i)) : -1; });
        if (wrongIdx >= 0) { await p.locator('#q-body .option-card').nth(wrongIdx).click(); await p.click('#validate-btn'); }
        else { check('first question is choice-based', false, wrongIdx); }
        await p.click('#finish-btn');
        await p.click('#submit-btn');
        await p.click('#return-btn');
        const mistakes = await p.locator('#cfg-mode option[value="mistakes"]').innerText();
        check('mistakes mode lists the wrong question', /\(1\)/.test(mistakes), mistakes);
        const review = await p.locator('#cfg-mode option[value="review"]').innerText();
        check('review mode lists the due question', /\(1\)/.test(review), review);
        const unseen = await p.locator('#cfg-mode option[value="unseen"]').innerText();
        check('unseen excludes answered question', new RegExp('\\(' + (N - 1) + '\\)').test(unseen), unseen);
        await p.selectOption('#cfg-mode', 'mistakes');
        await p.click('#start-btn');
        check('mistakes session has 1 question', (await S(p)).length === 1);
        // answer it correctly
        await p.evaluate(() => 0);
        const ok = await p.evaluate(() => { const s = ExamSim.App.state.session; return s.item().answer; });
        for (const k of ok) await p.locator('#q-body .option-card').nth(k).click();
        await p.click('#validate-btn');
        await p.click('#finish-btn'); await p.click('#submit-btn'); await p.click('#return-btn');
        const after = await p.locator('#cfg-mode option[value="mistakes"]').innerText();
        check('mistake leaves the list after a correct answer', /\(0\)/.test(after), after);
    },

    'difficulty modes and counts': async ({ p, check, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        check('difficulty modes present', (await p.locator('#cfg-mode option[value^="difficulty:"]').count()) === 3);
        await p.selectOption('#cfg-mode', 'difficulty:3');
        const max = await p.getAttribute('#cfg-count', 'max');
        check('count max equals pool size', Number(max) === N_D3, max);
        await p.fill('#cfg-count', '2');
        await p.click('#start-btn');
        check('count respected', (await S(p)).length === 2);
    },

    'per-question timer advances automatically': async ({ p, check, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        await p.selectOption('#cfg-mode', 'all');
        await p.selectOption('#cfg-timer', 'perQuestion');
        await p.click('#start-btn');
        check('timer label shows question time', /Question time/.test(await p.locator('#timer-label').innerText()));
        await p.evaluate(() => { ExamSim.App.state.session.qLeft = 2; });
        await p.waitForFunction(() => ExamSim.App.state.session.index === 1, null, { timeout: 5000 });
        check('moved to the next question when time ran out', (await S(p)).index === 1);
        const q = await p.evaluate(() => ExamSim.App.state.session.qLeft);
        check('timer reset for the new question', q >= 40, q);
    },

    'total timer expiry submits the session': async ({ p, check, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        await p.selectOption('#cfg-mode', 'all');
        await p.click('#start-btn');
        await p.evaluate(() => { ExamSim.App.state.session.secondsLeft = 2; });
        await p.waitForSelector('#view-summary:not(.hidden)', { timeout: 6000 });
        check('auto-submitted when time is over', await p.locator('#metric-percentage').isVisible());
    },

    'keyboard shortcuts': async ({ p, check, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        await p.selectOption('#cfg-mode', 'all');
        await p.click('#start-btn');
        await p.evaluate(() => document.activeElement && document.activeElement.blur());
        await p.keyboard.press('2');
        check('"2" selects the second option', await p.evaluate(() => ExamSim.App.state.session.value(0) === 1));
        await p.keyboard.press('Enter');
        check('Enter checks the answer in study mode', (await p.locator('.dynamic-explanation-box').count()) === 1);
        await p.keyboard.press('ArrowRight');
        check('ArrowRight goes to the next question', (await S(p)).index === 1);
        await p.keyboard.press('ArrowLeft');
        check('ArrowLeft goes back', (await S(p)).index === 0);
        await p.keyboard.press('m');
        check('"m" flags the question', (await p.getAttribute('.flag-btn', 'aria-pressed')) === 'true');
    },

    'localized content follows the language toggle': async ({ p, check, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        await p.selectOption('#cfg-mode', 'all');
        await p.click('#start-btn');
        const en = await p.locator('#q-text').innerText();
        await p.click('#lang-btn');
        const it = await p.locator('#q-text').innerText();
        check('question text switches language', en !== it && /Quale approccio/.test(it), [en, it]);
        check('options switch language', /supervisionato/.test(await p.locator('#q-body').innerText()));
        check('UI switches language', new RegExp('Domanda 1 di ' + N).test(await p.locator('#view-runtime .q-number').first().innerText()));
        await p.click('#lang-btn');
    },

    'language and theme preferences persist': async ({ p, check, URL_BASE }) => {
        await p.goto(URL_BASE);
        await p.click('#lang-btn');
        check('italian UI', /Scegli un esame/.test(await p.locator('#view-picker h1').innerText()));
        await p.click('#theme-btn');
        await p.reload();
        check('language remembered', /Scegli un esame/.test(await p.locator('#view-picker h1').innerText()));
        check('theme remembered', (await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
        await p.click('#lang-btn'); await p.click('#theme-btn');
    },

    'export and import progress': async ({ p, check, runAll, URL_BASE, ROOT }) => {
        await fresh(p, URL_BASE, 'demo');
        await runAll(p, 'all');
        await p.click('#return-btn');
        const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#view-dashboard >> text=Export progress')]);
        const file = path.join(require('os').tmpdir(), 'examsim-e2e-export.json');
        await dl.saveAs(file);
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        check('export has attempts and question stats', data.exams.demo.attempts.length === 1 && Object.keys(data.exams.demo.qstats).length === N);
        await p.evaluate(async () => { await ExamSim.App.wipeAll(); });
        await p.reload();
        await p.waitForSelector('#start-btn');
        await p.setInputFiles('#import-file', file);
        await p.waitForSelector('.toast-msg');
        await p.click('#view-dashboard >> text=Statistics');
        check('statistics restored after import', /1\s*\nAttempts/.test(await p.locator('.tiles').innerText()));
        await p.setInputFiles('#import-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
        await p.waitForFunction(() => /Could not import/.test(document.getElementById('toast').innerText));
        check('invalid import file is rejected with a message', true);
    },

    'accessibility basics': async ({ p, check, URL_BASE }) => {
        await fresh(p, URL_BASE, 'demo');
        await p.selectOption('#cfg-mode', 'all');
        await p.click('#start-btn');
        check('radio inputs for single choice', (await p.locator('#q-body input[type=radio]').count()) === 4);
        check('options are labelled', (await p.locator('#q-body label.option-card').count()) === 4);
        check('main landmark and skip link', (await p.locator('main#main').count()) === 1 && (await p.locator('a.skip-link').count()) === 1);
        check('grid buttons have names', (await p.locator('.nav-grid-btn[aria-label]').count()) === N);
        const unlabeled = await p.evaluate(() => [...document.querySelectorAll('button')].filter(b => !b.textContent.trim() && !b.getAttribute('aria-label')).length);
        check('no unlabeled buttons', unlabeled === 0, unlabeled);
        await p.keyboard.press('Tab');
        check('keyboard focus is visible somewhere', await p.evaluate(() => document.activeElement !== document.body));
    },

    'mobile layout': async ({ browser, check, URL_BASE }) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
        const p = await ctx.newPage();
        p.on('dialog', d => d.accept());
        await p.goto(URL_BASE + '?content=demo');
        await p.waitForSelector('#start-btn');
        const dash = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
        check('dashboard has no horizontal scroll', dash);
        const order = await p.evaluate(() => { const y = s => document.querySelector(s).getBoundingClientRect().top; return y('.mode-grid') < y('#setup-card') && y('#setup-card') < y('.topic-list'); });
        check('on phones: modes, then setup, then topics', order);
        await p.selectOption('#cfg-mode', 'all');
        await p.click('#start-btn');
        const bar = await p.evaluate(() => { const r = document.querySelector('.actionbar').getBoundingClientRect(); return { bottom: Math.round(r.bottom), h: window.innerHeight, pos: getComputedStyle(document.querySelector('.actionbar')).position }; });
        check('action bar is pinned to the bottom of the phone screen', bar.pos === 'fixed' && bar.bottom === bar.h, bar);
        for (let i = 0; i < N; i++) {
            const ok = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
            if (!ok) { check('question ' + (i + 1) + ' fits the screen', false); break; }
            if (i === N - 1) check('all ' + N + ' demo questions fit a 390px screen', true);
            else await p.click('#session-action-trigger');
        }
        await ctx.close();
    },

    'loading over http, offline support and error handling': async ({ browser, check, HTTP_BASE }) => {
        const ctx = await browser.newContext();
        const p = await ctx.newPage();
        const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        p.on('dialog', d => d.accept());
        await p.goto(HTTP_BASE + '/exam.html?content=v31advanced');
        await p.waitForSelector('#start-btn');
        check('exam loaded via fetch (octet-stream + nosniff)', /V31 Advanced/.test(await p.title()));
        await p.goto(HTTP_BASE + '/exam.html?content=nope');
        await p.waitForSelector('.error-box');
        check('404 reported as not found', /nope\.exam/.test(await p.locator('.error-box').innerText()));
        // remote URL loading
        await p.goto(HTTP_BASE + '/exam.html?url=' + encodeURIComponent(HTTP_BASE + '/demo.exam'));
        await p.waitForSelector('#start-btn');
        check('loads an exam from ?url=', /Demo/.test(await p.title()));
        // service worker + offline
        await p.goto(HTTP_BASE + '/exam.html?content=demo');
        await p.evaluate(() => navigator.serviceWorker.ready);
        await p.waitForTimeout(800);
        await p.reload();                        // now controlled by the service worker
        await ctx.setOffline(true);
        await p.goto(HTTP_BASE + '/exam.html?content=demo');
        await p.waitForSelector('#start-btn', { timeout: 8000 });
        check('works offline after the first visit', /Demo/.test(await p.title()));
        await ctx.setOffline(false);
        check('no uncaught errors over http', errs.length === 0, errs);
        await ctx.close();
    },

    'invalid exam files are explained': async ({ browser, check, HTTP_BASE }) => {
        const ctx = await browser.newContext({ serviceWorkers: 'block' });   // the service worker would bypass the mocked routes
        const p = await ctx.newPage();
        await ctx.route('**/broken.exam', r => r.fulfill({ status: 200, contentType: 'application/octet-stream', body: 'ExamSim.register({"format":2,"id":"b","title":"B","questions":[{"id":1,"topic":"t","text":"q","options":["a","b"],"answer":[5]}]});' }));
        await ctx.route('**/garbled.exam', r => r.fulfill({ status: 200, contentType: 'application/octet-stream', body: 'ExamSim.register({oops});' }));
        await p.goto(HTTP_BASE + '/exam.html?content=broken');
        await p.waitForSelector('.error-box');
        const t = await p.locator('.error-box').innerText();
        check('validation problems are listed with paths', /questions\[0\].*out of range/s.test(t), t);
        await p.goto(HTTP_BASE + '/exam.html?content=garbled');
        await p.waitForSelector('.error-box');
        check('unreadable JSON is explained', /could not be read/.test(await p.locator('.error-box').innerText()));
        await ctx.close();
    }
};
