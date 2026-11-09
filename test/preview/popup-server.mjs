import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';

// Source-only loopback preview. Never serves .git, credentials or arbitrary files.
const root = new URL('../../', import.meta.url);
const allowed = new Set([
  '/src/popup/popup.html', '/src/popup/popup.js', '/src/popup/popup.css',
  '/src/popup/stats-screenshot.js', '/test/preview/popup-fixture.js',
  ...(await readdir(new URL('src/shared/', root))).filter((name) => /\.(js|css)$/.test(name)).map((name) => `/src/shared/${name}`),
]);
createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (request.method !== 'GET' || !allowed.has(pathname)) { response.writeHead(404); response.end(); return; }
  try {
    let content = await readFile(new URL(pathname.slice(1), root), 'utf8');
    if (pathname.endsWith('.html')) content = content.replace('<script type="module"', '<script src="/test/preview/popup-fixture.js"></script>\n    <script type="module"');
    response.writeHead(200, {
      'Content-Type': pathname.endsWith('.html') ? 'text/html; charset=utf-8' : pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src blob:; connect-src 'none'",
    });
    response.end(content);
  } catch { response.writeHead(500); response.end('Preview unavailable'); }
}).listen(8766, '127.0.0.1', () => console.log('Fictional popup: http://127.0.0.1:8766/src/popup/popup.html?appearance=light (or dark)'));
