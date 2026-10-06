#!/usr/bin/env node
// Converts legacy .exam files (window.ExamData = {config, questions}) to format 2 in place.
// Usage: node tools/convert-legacy.js [file ...]   (default: every *.exam in the project folder)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT, readExamFile, examFiles, writeExamFile } = require('./exam-files.js');

function loadAppForTools() {
    const files = ['00-core', '10-i18n', '20-types', '30-schema'].map(f => fs.readFileSync(path.join(ROOT, 'src/js', f + '.js'), 'utf8'));
    const sandbox = { document: {}, window: {} };
    vm.createContext(sandbox);
    return vm.runInContext(files.join('\n') + '\n;App;', sandbox);
}

if (require.main === module) {
    const App = loadAppForTools();
    const files = process.argv.length > 2 ? process.argv.slice(2) : examFiles();
    files.forEach(file => {
        const data = readExamFile(file);
        if (!data) { console.log('skip ' + file + ' (no exam registered)'); return; }
        if (data.format === 2) { console.log('skip ' + path.basename(file) + ' (already format 2)'); return; }
        const id = path.basename(file, '.exam');
        const v2 = App.schema.fromLegacy(data, id);
        writeExamFile(file, JSON.parse(JSON.stringify(v2)));
        console.log('converted ' + path.basename(file) + ' (' + v2.questions.length + ' questions)');
    });
}
module.exports = { loadAppForTools };
