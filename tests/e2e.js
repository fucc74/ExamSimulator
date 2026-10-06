// End-to-end checks in a real browser (Playwright, Chromium). Run: node tests/e2e.js
// Requires `playwright` to be resolvable (e.g. NODE_PATH=$(npm root -g)).
const path = require('path');
const pw = require('playwright');
const BROWSER = process.env.E2E_BROWSER || 'chromium';          // chromium | firefox | webkit
const DEVICE = process.env.E2E_DEVICE ? pw.devices[process.env.E2E_DEVICE] : null;   // e.g. "Pixel 7", "iPhone 14"
if (process.env.E2E_DEVICE && !DEVICE) { console.error('unknown device ' + process.env.E2E_DEVICE); process.exit(2); }
const { start } = require('./server.js');

const ROOT = path.resolve(__dirname, '..');
const URL_BASE = process.env.E2E_BASE || 'file://' + path.join(ROOT, 'exam.html');

let failures = 0;
function check(name, cond, extra) {
    if (cond) console.log('  ✓ ' + name);
    else { failures++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

// Answers the current question correctly through the UI, whatever its type.
async function answerCurrent(p) {
    const info = await p.evaluate(() => {
        const s = ExamSim.App.state.session; const it = s.item();
        return { kind: it.kind, item: JSON.parse(JSON.stringify(it)), index: s.index };
    });
    await answerItem(p, info.item, 'body');
}

async function answerItem(p, item, scope) {
    const root = scope === 'body' ? '#q-body' : scope;
    if (item.kind === 'single' || item.kind === 'multiple') {
        for (const k of item.answer) await p.locator(root + ' .option-card').nth(k).click();
    } else if (item.kind === 'numeric') {
        await p.locator(root + ' .numeric-input').fill(String(item.numeric.value));
    } else if (item.kind === 'matching') {
        const selects = p.locator(root + ' .match-select');
        for (let i = 0; i < item.lefts.length; i++) await selects.nth(i).selectOption(String(i));
    } else if (item.kind === 'ordering') {
        // bubble the shown order into the correct order using the move buttons
        let order = await p.evaluate(() => 0);
        const shown = item.shownOrder.slice();
        for (let target = 0; target < shown.length; target++) {
            let pos = shown.indexOf(target);
            while (pos > target) {
                await p.locator(root + ' .ordering-row').nth(pos).locator('.mini-btn').first().click();
                [shown[pos - 1], shown[pos]] = [shown[pos], shown[pos - 1]];
                pos--;
            }
        }
    } else if (item.kind === 'scenario') {
        for (let i = 0; i < item.parts.length; i++) {
            await answerItem(p, item.parts[i], root + ' .scenario-part:nth-of-type(' + (i + (item.context ? 2 : 1)) + ')');
        }
    }
}

async function runAll(p, mode) {
    await p.selectOption('#cfg-mode', mode);
    await p.click('#start-btn');
    const n = await p.evaluate(() => ExamSim.App.state.session.length);
    for (let i = 0; i < n; i++) {
        await answerCurrent(p);
        if (i < n - 1) await p.click('#session-action-trigger');
    }
    await p.click('#session-action-trigger');   // last question -> review screen
    await p.click('#submit-btn');
    return n;
}

async function main() {
    const { server, port, override } = await start(ROOT, 0);
    const HTTP_BASE = 'http://127.0.0.1:' + port;
    const browser = await pw[BROWSER].launch();
    console.log('browser: ' + BROWSER + (DEVICE ? ' (' + process.env.E2E_DEVICE + ')' : ''));
    const ctx = await browser.newContext(DEVICE ? Object.assign({ colorScheme: 'light' }, DEVICE) : { colorScheme: 'light', viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    p.on('dialog', d => d.accept());

    const suites = Object.assign({}, require('./e2e-suites.js'), require('./e2e-v3.js'));
    const only = (process.env.E2E_ONLY || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    for (const [name, fn] of Object.entries(suites)) {
        if (only.length && !only.some(o => name.toLowerCase().includes(o))) continue;
        console.log(name);
        try { await fn({ p, ctx, check, answerCurrent, runAll, URL_BASE, HTTP_BASE, ROOT, errors, browser, override }); }
        catch (e) { failures++; console.log('  ✗ suite crashed: ' + e.message); }
    }
    check('no page errors', errors.length === 0, errors);
    await browser.close();
    server.close();
    console.log(failures ? '\n' + failures + ' check(s) failed' : '\nall e2e checks passed');
    process.exit(failures ? 1 : 0);
}
main();
