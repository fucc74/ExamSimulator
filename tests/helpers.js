// Loads the engine modules (everything except UI/boot) into a sandbox for unit tests.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { jsFiles } = require('../tools/build.js');

function loadApp(opts) {
    opts = opts || {};
    const files = jsFiles().filter(f => !/^(8|9)\d-/.test(path.basename(f)));
    const code = files.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\n;App;';
    const sandbox = { console, setTimeout, clearTimeout, Date, Math, JSON };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    const App = vm.runInContext(code, sandbox);
    App.storage = App.createStorage(App.memoryBackend());
    return App;
}

function loadExamFile(file) {
    const text = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    const sandbox = { window: {} };
    sandbox.ExamSim = { register: d => { sandbox.window.__registered = d; } };
    vm.createContext(sandbox);
    vm.runInContext(text, sandbox);
    return sandbox.window.__registered || sandbox.window.ExamData;
}

module.exports = { loadApp, loadExamFile };
