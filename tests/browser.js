// Shared browser helpers for the audit and visual-regression scripts.
const path = require('path');
const pw = require('playwright');
const { start } = require('./server.js');
const ROOT = path.resolve(__dirname, '..');

async function open(opts) {
    opts = opts || {};
    const { server, port } = await start(ROOT, 0);
    const base = 'http://127.0.0.1:' + port;
    const browser = await pw[process.env.E2E_BROWSER || 'chromium'].launch();
    const ctx = await browser.newContext({ colorScheme: opts.scheme || 'light', viewport: opts.viewport || { width: 1280, height: 800 }, serviceWorkers: 'block', reducedMotion: 'reduce', deviceScaleFactor: 1 });
    // deterministic rendering: no web font download
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    const p = await ctx.newPage();
    return { p, ctx, browser, base, close: async () => { await browser.close(); server.close(); } };
}

// Resets storage then walks to a named state of the app.
const STATES = {
    async picker(p, base) { await reset(p, base); await p.goto(base); await p.waitForSelector('#exam-list .exam-card'); },
    async dashboard(p, base) { await reset(p, base); await p.goto(base + '/?content=demo'); await p.waitForSelector('#start-btn'); },
    async runtime(p, base) { await STATES.dashboard(p, base); await p.selectOption('#cfg-mode', 'all'); await p.check('#cfg-study'); await p.click('#start-btn'); await p.waitForSelector('#q-body .option-card'); },
    async checked(p, base) { await STATES.runtime(p, base); await p.locator('#q-body .option-card').first().click(); await p.click('#validate-btn'); await p.waitForSelector('#q-expl .dynamic-explanation-box'); },
    async review(p, base) { await STATES.runtime(p, base); await p.click('#finish-btn'); await p.waitForSelector('#submit-btn'); },
    async summary(p, base) { await STATES.review(p, base); await p.click('#submit-btn'); await p.waitForSelector('.review-item-card'); },
    async stats(p, base) { await STATES.summary(p, base); await p.goto(base + '/?content=demo'); await p.waitForSelector('#start-btn'); await p.click('#view-dashboard >> text=Statistics'); await p.waitForSelector('#quality-panel'); },
    async options(p, base) { await STATES.dashboard(p, base); await p.click('#options-btn'); await p.waitForSelector('#opt-general'); },
    async editor(p, base) { await STATES.picker(p, base); await p.click('#picker-new'); await p.waitForSelector('#ed-questions'); await p.locator('.ed-q-head').first().click(); },
    async search(p, base) { await STATES.dashboard(p, base); await p.click('#dash-search'); await p.waitForSelector('.search-card'); },
    async palette(p, base) { await STATES.dashboard(p, base); await p.keyboard.press('Control+K'); await p.waitForSelector('#palette-input'); },
    async wizard(p, base) { await STATES.picker(p, base); await p.click('#picker-wizard'); await p.waitForSelector('#wiz-text'); }
};
async function reset(p, base) {
    await p.goto(base);
    await p.waitForFunction(() => window.ExamSim && ExamSim.App.backend);
    await p.evaluate(async () => { await ExamSim.App.wipeAll(); try { localStorage.clear(); } catch (e) {} });
}
module.exports = { open, STATES, ROOT };
