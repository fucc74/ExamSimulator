// Minimal static server for e2e tests. `.exam` is deliberately served as application/octet-stream
// (what many servers do for unknown extensions) to prove loading does not depend on the MIME type.
const http = require('http');
const fs = require('fs');
const path = require('path');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

function start(root, port) {
    const overrides = {};       // pathname -> () => body, lets tests ship a different file (e.g. a new sw.js)
    const server = http.createServer((req, res) => {
        let p = decodeURIComponent(req.url.split('?')[0]);
        if (p === '/') p = '/exam.html';
        if (overrides[p]) { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'text/plain', 'Cache-Control': 'no-store' }); res.end(overrides[p]()); return; }
        const file = path.join(root, p);
        if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise(resolve => server.listen(port || 0, '127.0.0.1', () => resolve({ server, port: server.address().port, override: (name, fn) => { if (fn) overrides[name] = fn; else delete overrides[name]; } })));
}
module.exports = { start };
