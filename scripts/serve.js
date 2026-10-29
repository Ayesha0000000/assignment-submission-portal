'use strict';
/*
 * Tiny local web server for trying the portal in your browser (no packages needed).
 *   npm run serve        ->  http://localhost:5500
 * Only the three public site files are served.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const port = Number(process.env.PORT || 5500);
const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
};

http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const entry = files[pathname];
  if (!entry) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  fs.readFile(path.join(root, entry[0]), (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      return res.end('Server error');
    }
    res.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => {
  console.log('Portal running at http://localhost:' + port + '  (press Ctrl+C to stop)');
});
