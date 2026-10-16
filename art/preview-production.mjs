// Local review adapter for the generated Cloudflare fetch handler. No deployment.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../.output/server/index.mjs';

const publicRoot = fileURLToPath(new URL('../.output/public/', import.meta.url));
const port = Number(process.env.PORT || 8004);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer between 1024 and 65535');
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    const asset = resolve(publicRoot, '.' + decodeURIComponent(url.pathname));
    if (asset.startsWith(publicRoot.replace(/[\\/]$/, '') + sep)) {
      const info = await stat(asset).catch(() => null);
      if (info?.isFile()) {
        res.writeHead(200, { 'Content-Type': mime[extname(asset)] || 'application/octet-stream', 'Cache-Control': 'no-store, no-cache, must-revalidate' });
        res.end(await readFile(asset));
        return;
      }
    }
    const response = await worker.fetch(new Request(url, { method: req.method, headers: req.headers }), {}, { waitUntil: promise => promise.catch(console.error) });
    const headers = Object.fromEntries(response.headers);
    headers['cache-control'] = 'no-store, no-cache, must-revalidate';
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end('Local preview failed');
  }
}).listen(port, '127.0.0.1', () => console.log(`Production review: http://127.0.0.1:${port}`));
