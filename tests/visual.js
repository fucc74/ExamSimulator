// Visual regression: screenshots of the main screens (phone and desktop, light and dark) compared with a baseline.
//   node tests/visual.js            compare (creates the baseline when it does not exist yet)
//   node tests/visual.js --update   regenerate the baseline
// The baseline depends on the fonts of the machine that made it: generate it where the check runs (CI) — see README.
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');
const { open, STATES, ROOT } = require('./browser.js');

const BASE_DIR = path.join(ROOT, 'tests', 'visual-baseline');
const OUT_DIR = path.join(ROOT, 'tests', 'visual-output');
const VIEWPORTS = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 780 } };
const SCREENS = ['picker', 'dashboard', 'runtime', 'checked', 'summary', 'stats', 'options', 'editor', 'search', 'palette'];
const PIXEL_THRESHOLD = 0.12;       // per-pixel colour distance (anti-aliasing tolerance)
const MAX_DIFF_RATIO = 0.015;       // share of pixels allowed to differ

(async () => {
    const update = process.argv.includes('--update');
    const haveBaseline = fs.existsSync(BASE_DIR) && fs.readdirSync(BASE_DIR).some(f => f.endsWith('.png'));
    const writing = update || !haveBaseline;
    fs.mkdirSync(BASE_DIR, { recursive: true });
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(OUT_DIR, { recursive: true });
    if (!haveBaseline && !update) console.log('no baseline yet: creating it (commit tests/visual-baseline/ to enable comparisons)');
    let failures = 0, compared = 0;
    for (const scheme of ['light', 'dark']) {
        for (const vp of Object.keys(VIEWPORTS)) {
            const b = await open({ scheme, viewport: VIEWPORTS[vp] });
            try {
                for (const name of SCREENS) {
                    await STATES[name](b.p, b.base);
                    await b.p.evaluate(() => document.fonts && document.fonts.ready);
                    await b.p.waitForTimeout(250);                       // finish transitions
                    const file = [name, vp, scheme].join('-') + '.png';
                    const shot = await b.p.screenshot({ fullPage: false, animations: 'disabled' });
                    if (writing) { fs.writeFileSync(path.join(BASE_DIR, file), shot); console.log('  + ' + file); continue; }
                    const basePath = path.join(BASE_DIR, file);
                    if (!fs.existsSync(basePath)) { fs.writeFileSync(path.join(OUT_DIR, file), shot); failures++; console.log('  ✗ ' + file + ': no baseline image'); continue; }
                    const a = PNG.sync.read(fs.readFileSync(basePath)), c = PNG.sync.read(shot);
                    compared++;
                    if (a.width !== c.width || a.height !== c.height) { fs.writeFileSync(path.join(OUT_DIR, file), shot); failures++; console.log('  ✗ ' + file + ': size changed ' + a.width + 'x' + a.height + ' → ' + c.width + 'x' + c.height); continue; }
                    const diff = new PNG({ width: a.width, height: a.height });
                    const n = pixelmatch(a.data, c.data, diff.data, a.width, a.height, { threshold: PIXEL_THRESHOLD });
                    const ratio = n / (a.width * a.height);
                    if (ratio > MAX_DIFF_RATIO) {
                        failures++;
                        fs.writeFileSync(path.join(OUT_DIR, file), shot);
                        fs.writeFileSync(path.join(OUT_DIR, file.replace('.png', '.diff.png')), PNG.sync.write(diff));
                        console.log('  ✗ ' + file + ': ' + (ratio * 100).toFixed(2) + '% of pixels differ (limit ' + MAX_DIFF_RATIO * 100 + '%)');
                    } else console.log('  ✓ ' + file + ' (' + (ratio * 100).toFixed(2) + '%)');
                }
            } finally { await b.close(); }
        }
    }
    if (writing) console.log('\nbaseline written to ' + path.relative(ROOT, BASE_DIR));
    else console.log(failures ? '\n' + failures + ' of ' + compared + ' screenshots differ — see tests/visual-output' : '\nvisual regression passed (' + compared + ' screenshots)');
    process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
