import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

// Only the preview and its explicit modules are served, never arbitrary repository files.
const root = new URL('../../', import.meta.url);
const allowed = new Set([
  '/test/preview/summary-image.html', '/test/preview/summary-image.js',
  '/src/shared/summary-image.js', '/src/shared/summary-image-data.js', '/src/shared/display-format.js',
]);
createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (request.method !== 'GET' || !allowed.has(pathname)) { response.writeHead(404); response.end(); return; }
  try {
    const content = await readFile(new URL(pathname.slice(1), root));
    response.writeHead(200, {
      'Content-Type': pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src blob:; connect-src 'none'",
    });
    response.end(content);
  } catch { response.writeHead(500); response.end('Preview file unavailable'); }
}).listen(8765, '127.0.0.1', () => console.log('Open http://127.0.0.1:8765/test/preview/summary-image.html — Ctrl+C to stop.'));
