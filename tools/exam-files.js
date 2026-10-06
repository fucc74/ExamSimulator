// Shared helpers for tools: read .exam files (v2 `ExamSim.register({...})` or legacy `window.ExamData = {...}`).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function readExamFile(file) {
    const text = fs.readFileSync(file, 'utf8');
    const sandbox = { window: {} };
    let registered = null;
    sandbox.ExamSim = { register: d => { registered = d; } };
    vm.createContext(sandbox);
    vm.runInContext(text, sandbox, { filename: file, timeout: 5000 });
    return registered || sandbox.window.ExamData || null;
}

function examFiles(dir) {
    return fs.readdirSync(dir || ROOT).filter(f => f.endsWith('.exam')).sort().map(f => path.join(dir || ROOT, f));
}

// JSON with one question field per line but short primitive arrays kept inline.
function pretty(v, indent) {
    indent = indent || '';
    const next = indent + '  ';
    if (Array.isArray(v)) {
        if (v.every(x => x === null || typeof x !== 'object')) {
            const inline = '[' + v.map(x => JSON.stringify(x)).join(', ') + ']';
            if (inline.length <= 100) return inline;
        }
        return '[\n' + v.map(x => next + pretty(x, next)).join(',\n') + '\n' + indent + ']';
    }
    if (v && typeof v === 'object') {
        const keys = Object.keys(v).filter(k => v[k] !== undefined);
        if (!keys.length) return '{}';
        const flat = keys.every(k => v[k] === null || typeof v[k] !== 'object') ? '{ ' + keys.map(k => JSON.stringify(k) + ': ' + JSON.stringify(v[k])).join(', ') + ' }' : null;
        if (flat && flat.length <= 80) return flat;
        return '{\n' + keys.map(k => next + JSON.stringify(k) + ': ' + pretty(v[k], next)).join(',\n') + '\n' + indent + '}';
    }
    return JSON.stringify(v);
}

function writeExamFile(file, exam) {
    const header = '// ExamSim exam file (format 2). Pure JSON inside ExamSim.register(...); validate with: node tools/validate-exam.js ' + path.basename(file) + '\n';
    fs.writeFileSync(file, header + 'ExamSim.register(' + pretty(exam) + ');\n');
}

module.exports = { ROOT, readExamFile, examFiles, writeExamFile, pretty };
