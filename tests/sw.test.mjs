import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function serviceWorker(network) {
    const handlers = {}, records = new Map(), puts = [], pending = [];
    const cache = { match: async request => records.get(request.url)?.clone(), put: async (request, response) => { puts.push(request.url); records.set(request.url, response); } };
    const context = {
        self: { location: { origin: 'https://example.test', href: 'https://example.test/personal-space/sw.js' }, addEventListener: (name, handler) => handlers[name] = handler },
        caches: { open: async () => cache }, URL, Request, Response, AbortController, setTimeout, clearTimeout, fetch: network
    };
    vm.runInNewContext(readFileSync('sw.js','utf8'), context);
    return { records, puts, async request(url, mode = 'cors') {
        let response;
        handlers.fetch({ request: { url, mode, method: 'GET' }, respondWith: promise => response = promise, waitUntil: promise => pending.push(promise) });
        if (!response) return undefined;
        const result = await response; await Promise.all(pending); return result;
    } };
}
test('cached old navigation and scripts are replaced on the current request', async () => {
    const worker = serviceWorker(async (_request, options) => { assert.equal(options.cache, 'no-cache'); return new Response('new icon-only UI'); });
    for (const [path, mode] of [['/personal-space/','navigate'],['/personal-space/personal-space.css','cors'],['/personal-space/games/suika/src/main.js','cors']]) {
        const url = 'https://example.test' + path;
        worker.records.set(url,new Response('old text button'));
        assert.equal(await (await worker.request(url,mode)).text(), 'new icon-only UI');
        assert.equal(await worker.records.get(url).clone().text(), 'new icon-only UI');
    }
});
test('offline navigations retain cached pages and API requests are not intercepted', async () => {
    const worker = serviceWorker(async () => { throw Error('offline'); });
    const url = 'https://example.test/personal-space/games/suika/';
    worker.records.set(url,new Response('offline game'));
    assert.equal(await (await worker.request(url,'navigate')).text(),'offline game');
    assert.equal(await worker.request('https://example.supabase.co/rest/v1/suika_scores'),undefined);
});
