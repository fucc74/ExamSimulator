// Loads the engine (everything except the UI and boot modules) into a sandbox, for tools and tests.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { jsFiles } = require('./build.js');

function loadApp() {
    const files = jsFiles().filter(f => !/^(8|9)\d-/.test(path.basename(f)));
    const code = files.map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\n;App;';
    const sandbox = { console, setTimeout, clearTimeout, Date, Math, JSON, document: {} };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    return vm.runInContext(code, sandbox, { filename: 'engine-bundle.js' });
}
module.exports = { loadApp };
