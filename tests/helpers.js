// Loads the engine modules (everything except UI/boot) into a sandbox for unit tests.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadApp() {
    const App = require('../tools/load-app.js').loadApp();
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
