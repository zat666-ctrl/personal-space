import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { buildSync } from 'esbuild';

const root = resolve(import.meta.dirname);
const dist = resolve(root, 'dist');

function loadLocalEnv() {
    const envPath = resolve(root, '.env.local');
    if (!existsSync(envPath)) return;
    for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const separator = line.indexOf('=');
        if (separator < 1) continue;
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        if (!process.env[key]) process.env[key] = value;
    }
}

loadLocalEnv();

const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!supabaseUrl || !publishableKey) {
    throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required');
}
let publicKey = publishableKey.startsWith('sb_publishable_');
if (!publicKey) {
    try { publicKey = JSON.parse(Buffer.from(publishableKey.split('.')[1], 'base64url')).role === 'anon'; } catch {}
}
if (!publicKey) throw new Error('Only a Supabase publishable or legacy anon key may be included in the frontend');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const assets = [
    'index.html',
    '_headers',
    'manifest.webmanifest',
    'sw.js',
    'favicon.svg',
    'favicon.png',
    '404.html',
    'robots.txt',
    'sitemap.xml',
    'sitemap-index.xml',
    'personal-space.css',
    'personal-space.js',
    'games'
];

for (const asset of assets) {
    cpSync(resolve(root, asset), resolve(dist, asset), { recursive: true });
}

const indexPath = resolve(dist, 'index.html');
const html = readFileSync(indexPath, 'utf8')
    .replaceAll('__SUPABASE_URL__', supabaseUrl)
    .replaceAll('__SUPABASE_PUBLISHABLE_KEY__', publishableKey);
writeFileSync(indexPath, html);

const gameConfig = resolve(dist, 'games/suika/config.js');
writeFileSync(gameConfig, 'window.PERSONAL_SPACE_CONFIG = ' + JSON.stringify({
    url: supabaseUrl,
    publishableKey
}) + ';\n');

const bundled = buildSync({
    entryPoints: [resolve(root, 'games/suika/src/bootstrap.js')],
    bundle: true, write: false, format: 'iife', platform: 'browser',
    target: ['es2020'], minify: true, legalComments: 'inline',
    banner: { js: 'try {\n' + readFileSync(resolve(root, 'games/suika/vendor/supabase-2.49.4.js'), 'utf8') + '\n} catch {}' }
}).outputFiles[0].contents;
const gameHash = createHash('sha256').update(bundled).digest('hex').slice(0, 12);
const bundleName = 'app.' + gameHash + '.js';
writeFileSync(resolve(dist, 'games/suika', bundleName), bundled);
const gameIndex = resolve(dist, 'games/suika/index.html');
writeFileSync(gameIndex, readFileSync(gameIndex, 'utf8')
    .replaceAll('__SUIKA_BUNDLE__', bundleName)
    .replace('<script src="./config.js"></script>', '<script>' + readFileSync(gameConfig, 'utf8') + '</script>'));
const swPath = resolve(dist, 'sw.js');
writeFileSync(swPath, readFileSync(swPath, 'utf8').replaceAll('__SUIKA_BUNDLE__', bundleName).replaceAll('__SUIKA_BUILD__', gameHash));
console.log('Built Personal Space into dist/');

