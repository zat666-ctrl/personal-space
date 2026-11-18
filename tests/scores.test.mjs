import test from 'node:test';
import assert from 'node:assert/strict';
import { ScoreStore, validScore } from '../games/suika/src/scores.js';
const storage = () => { const values = new Map(); return { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) }; };
function fakeCloud() {
    const rows = new Map(), calls = [];
    const cloud = { rows, calls, fail: false, from(table) {
        assert.equal(table, 'suika_scores');
        let id, payload;
        const chain = {
            select() { return chain; }, eq(_column, value) { id = value; return chain; },
            upsert(value) { payload = value; return chain; }, maybeSingle() { return chain; }, single() { return chain; },
            async abortSignal() {
                if (cloud.fail) return { error: { code: 'NETWORK' } };
                if (payload) { id = payload.user_id; rows.set(id, Math.max(rows.get(id) || 0, payload.best_score)); calls.push(payload); }
                return { data: rows.has(id) ? { best_score: rows.get(id) } : null, error: null };
            }
        };
        return chain;
    } }; return cloud;
}
function create(options = {}) { const store = new ScoreStore({ storage: storage(), online: () => true, ...options }); store.schedule = () => {}; return store; }
test('guest best survives reload and malformed or extreme scores are rejected', () => {
    const disk = storage(), first = create({ storage: disk }); first.record(24); first.record(3);
    assert.equal(create({ storage: disk }).best, 24);
    for (const value of [-1, NaN, Infinity, 2 ** 32, 1.2, 'bad']) assert.equal(validScore(value), 0);
});
test('different identities never inherit each other or guest scores', async () => {
    const client = fakeCloud(), store = create({ client });
    store.record(100); store.setUser({ id: 'alice' }); assert.equal(store.best, 0);
    store.record(30); await store.sync();
    store.setUser({ id: 'bob' }); assert.equal(store.best, 0); store.record(10); await store.sync();
    store.setUser({ id: 'alice' }); assert.equal(store.best, 30);
    store.setUser(null); assert.equal(store.best, 100);
    assert.deepEqual([...client.rows], [['alice', 30], ['bob', 10]]);
});
test('offline writes persist, retry merges cloud maximum and another device reads it', async () => {
    const client = fakeCloud(); let online = false;
    const store = create({ client, online: () => online }); store.setUser({ id: 'alice' }); store.record(60);
    await store.sync(); assert.equal(client.calls.length, 0); assert.equal(store.best, 60);
    online = true; client.fail = true; await store.sync(); assert.equal(store.best, 60);
    client.fail = false; client.rows.set('alice', 40); await store.sync(); assert.equal(client.rows.get('alice'), 60);
    const device = create({ client }); device.setUser({ id: 'alice' }); await device.sync(); assert.equal(device.best, 60);
    client.rows.set('alice', 150); await store.sync(); assert.equal(store.best, 150);
});
test('storage failures keep a usable in-memory score and anonymous auth stays local', () => {
    const store = create({ storage: { getItem() { throw Error(); }, setItem() { throw Error(); } } });
    store.record(17); assert.equal(store.best, 17); assert.equal(store.storageFailed, true);
    store.setUser({ id: 'temporary', is_anonymous: true }); assert.equal(store.scope, 'guest');
});
