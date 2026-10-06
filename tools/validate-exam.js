#!/usr/bin/env node
// Validates exam files and prints readable problems plus content-quality hints.
// Usage: node tools/validate-exam.js [files...]   Exit code 1 if any file has errors.
const path = require('path');
const { readExamFile, examFiles } = require('./exam-files.js');
const { loadAppForTools } = require('./convert-legacy.js');

const App = loadAppForTools();
const files = process.argv.length > 2 ? process.argv.slice(2).map(f => path.resolve(f)) : examFiles();
let bad = 0;
files.forEach(file => {
    const name = path.basename(file);
    let data;
    try { data = readExamFile(file); } catch (e) { console.log('✗ ' + name + ': cannot be read (' + e.message + ')'); bad++; return; }
    if (!data) { console.log('✗ ' + name + ': registers no exam'); bad++; return; }
    const { exam, report } = App.schema.prepare(data, path.basename(file, '.exam'));
    if (!exam) {
        bad++;
        console.log('✗ ' + name + ': ' + report.errors.length + ' error(s)');
    } else {
        console.log('✓ ' + name + ': ' + exam.questions.length + ' questions, ' + exam.topicList.length + ' topics');
    }
    if (report.errors.length || report.warnings.length) console.log(report.format());
    if (exam) App.schema.lint(exam).forEach(w => console.log('  ~ ' + w));
});
process.exit(bad ? 1 : 0);
