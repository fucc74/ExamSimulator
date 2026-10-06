#!/usr/bin/env node
// Builds the static site for GitHub Pages (or any static host) into dist/.
// dist/index.html is the same file as exam.html, so https://<user>.github.io/<repo>/ opens the app directly.
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./exam-files.js');
const { build } = require('./build.js');

function pack(outDir) {
    outDir = outDir || path.join(ROOT, 'dist');
    build();
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    const files = ['exam.html', 'exams.js', 'sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'].concat(fs.readdirSync(ROOT).filter(f => f.endsWith('.exam')));
    files.forEach(f => fs.copyFileSync(path.join(ROOT, f), path.join(outDir, f)));
    fs.copyFileSync(path.join(ROOT, 'exam.html'), path.join(outDir, 'index.html'));
    fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
    return { outDir, files: files.length + 1 };
}
module.exports = { pack };
if (require.main === module) { const r = pack(process.argv[2]); console.log('packed ' + r.files + ' files into ' + path.relative(process.cwd(), r.outDir)); }
