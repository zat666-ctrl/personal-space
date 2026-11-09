import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
    'personal-space.js'
];

for (const asset of assets) {
    cpSync(resolve(root, asset), resolve(dist, asset));
}

const indexPath = resolve(dist, 'index.html');
const html = readFileSync(indexPath, 'utf8')
    .replaceAll('__SUPABASE_URL__', supabaseUrl)
    .replaceAll('__SUPABASE_PUBLISHABLE_KEY__', publishableKey);
writeFileSync(indexPath, html);

console.log('Built Personal Space into dist/');

