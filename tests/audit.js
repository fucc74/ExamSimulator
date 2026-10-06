// Accessibility (axe-core) and performance audits. Run: node tests/audit.js
// Fails on serious/critical accessibility violations in any screen (light and dark theme) and when a performance budget is exceeded.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { open, STATES, ROOT } = require('./browser.js');
const AXE = path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js');

const BUDGET = {
    htmlKB: 450,            // exam.html as shipped
    gzipKB: 120,            // the same, gzip compressed
    firstRenderMs: 2500,    // exam list visible, CPU throttled 4x
    startBigSessionMs: 2500 // 200-question exam: click Start -> first question visible, CPU throttled 4x
};

let failures = 0;
const fail = m => { failures++; console.log('  ✗ ' + m); };
const ok = m => console.log('  ✓ ' + m);

async function a11y() {
    console.log('accessibility (axe-core, WCAG 2.1 A/AA + best practices)');
    for (const scheme of ['light', 'dark']) {
        const b = await open({ scheme });
        try {
            for (const name of Object.keys(STATES)) {
                await STATES[name](b.p, b.base);
                await b.p.addScriptTag({ path: AXE });
                const res = await b.p.evaluate(async () => {
                    const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }, resultTypes: ['violations'] });
                    return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\n').slice(1, 3).join(' ').trim()) }));
                });
                const bad = res.filter(v => v.impact === 'serious' || v.impact === 'critical');
                const minor = res.filter(v => !(v.impact === 'serious' || v.impact === 'critical'));
                if (bad.length) { fail(scheme + ' · ' + name + ': ' + bad.length + ' serious violation(s)'); bad.forEach(v => console.log('      ' + v.id + ' (' + v.impact + '): ' + v.help + '\n        ' + v.nodes.join('\n        '))); }
                else ok(scheme + ' · ' + name + (minor.length ? ' (' + minor.length + ' minor: ' + minor.map(v => v.id).join(', ') + ')' : ''));
            }
        } finally { await b.close(); }
    }
}

async function perf() {
    console.log('performance budget');
    const html = fs.readFileSync(path.join(ROOT, 'exam.html'));
    const kb = Math.round(html.length / 1024), gz = Math.round(zlib.gzipSync(html).length / 1024);
    (kb <= BUDGET.htmlKB ? ok : fail)('exam.html is ' + kb + ' KB (budget ' + BUDGET.htmlKB + ')');
    (gz <= BUDGET.gzipKB ? ok : fail)('gzip size ' + gz + ' KB (budget ' + BUDGET.gzipKB + ')');
    const b = await open();
    try {
        const cdp = await b.p.context().newCDPSession(b.p);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        const t0 = Date.now();
        await b.p.goto(b.base);
        await b.p.waitForSelector('#exam-list .exam-card');
        const first = Date.now() - t0;
        (first <= BUDGET.firstRenderMs ? ok : fail)('exam list visible after ' + first + ' ms at 4x CPU slowdown (budget ' + BUDGET.firstRenderMs + ')');
        await b.p.goto(b.base + '/?content=v31');
        await b.p.waitForSelector('#start-btn');
        await b.p.selectOption('#cfg-mode', 'all');
        const t1 = Date.now();
        await b.p.click('#start-btn');
        await b.p.waitForSelector('#q-body .option-card');
        const start = Date.now() - t1;
        (start <= BUDGET.startBigSessionMs ? ok : fail)('200-question session ready after ' + start + ' ms (budget ' + BUDGET.startBigSessionMs + ')');
        const longTasks = await b.p.evaluate(() => performance.getEntriesByType('longtask').length).catch(() => 0);
        console.log('  · long tasks observed: ' + longTasks);
    } finally { await b.close(); }
}

(async () => {
    await a11y();
    await perf();
    console.log(failures ? '\n' + failures + ' audit check(s) failed' : '\naudit passed');
    process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
