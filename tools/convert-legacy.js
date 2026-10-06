#!/usr/bin/env node
// Converts legacy .exam files (window.ExamData = {config, questions}) to format 2 in place.
// Usage: node tools/convert-legacy.js [file ...]   (default: every *.exam in the project folder)
const fs = require('fs');
const path = require('path');
const { ROOT, readExamFile, examFiles, writeExamFile } = require('./exam-files.js');

const { loadApp: loadAppForTools } = require('./load-app.js');

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
