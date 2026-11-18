import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };
http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/') { res.writeHead(302, { Location: '/personal-space/' }); return res.end(); }
        if (!url.pathname.startsWith('/personal-space/')) throw new Error('Not found');
        let path = resolve(root, decodeURIComponent(url.pathname.slice('/personal-space/'.length)));
        if (path !== root && !path.startsWith(root + sep)) throw new Error('Not found');
        if ((await stat(path)).isDirectory()) {
            if (!url.pathname.endsWith('/')) { res.writeHead(301, { Location: url.pathname + '/' + url.search }); return res.end(); }
            path = resolve(path, 'index.html');
        }
        const body = await readFile(path);
        res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(body);
    } catch { res.writeHead(404); res.end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('Local: http://127.0.0.1:4173/personal-space/'));
