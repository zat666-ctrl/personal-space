import test from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
globalThis.Matter = Matter;
const { SuikaGame, BOARD } = await import('../games/suika/src/game.js');
const advance = (game, frames = 600) => { for (let i = 0; i < frames; i++) game.step(); };

test('matching fruit merges once and awards the next tier score', () => {
    const events = [], game = new SuikaGame(e => events.push(e));
    game.create(1, 180, 610); game.create(1, 210, 610);
    advance(game, 300);
    assert.equal(game.fruits.size, 1); assert.equal([...game.fruits][0].level, 2);
    assert.equal(game.score, 3); assert.equal(events.filter(e => e.type === 'merge').length, 1);
    game.destroy();
});
test('three touching fruit are consumed as pairs, never duplicated or skipped', () => {
    const game = new SuikaGame();
    [180, 211, 242].forEach(x => game.create(1, x, 600));
    advance(game, 120);
    assert.deepEqual([...game.fruits].map(f => f.level).sort(), [1, 2]); assert.equal(game.score, 3);
    game.destroy();
});
test('floor, side walls, rolling, sleeping and pause remain stable', () => {
    const game = new SuikaGame();
    const fruit = game.create(4, 44, 200);
    Matter.Body.setVelocity(fruit.body, { x: 5, y: 0 });
    advance(game, 220);
    assert.ok(Math.abs(fruit.body.angle) > 0.01, 'off-centre contact rotates fruit');
    game.paused = true; const position = { ...fruit.body.position }; const time = game.time;
    advance(game, 300); assert.deepEqual(fruit.body.position, position); assert.equal(game.time, time);
    game.paused = false; advance(game, 1500);
    assert.ok(fruit.body.position.x >= BOARD.left + fruit.config.radius - 2);
    assert.ok(fruit.body.position.x <= BOARD.right - fruit.config.radius + 2);
    assert.ok(fruit.body.position.y <= BOARD.floor - fruit.config.radius + 2);
    assert.ok(fruit.body.speed < 0.1); game.destroy();
});
test('drop cooldown, spawn overlap, restart and overflow grace period', () => {
    const game = new SuikaGame();
    assert.equal(game.drop(), true); assert.equal(game.drop(), false);
    game.reset(); assert.equal(game.score, 0); assert.equal(game.fruits.size, 0); assert.equal(game.over, false);
    const fruit = game.create(11, 230, 190); Matter.Body.setStatic(fruit.body, true);
    advance(game, 250); assert.equal(game.over, false);
    advance(game, 250); assert.equal(game.over, true);
    game.reset(); assert.equal(game.paused, false); assert.equal(game.over, false); game.destroy();
});
test('dense pile never escapes walls or produces invalid physics', () => {
    let seed = 456;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    const game = new SuikaGame(); let last = 0;
    for (let i = 0; i < 160 && !game.over; i++) {
        game.current = 1 + Math.floor(random() * 4); game.setAim(50 + random() * 360); game.drop();
        advance(game, 48);
        assert.ok(game.score >= last); last = game.score;
        for (const fruit of game.fruits) {
            const p = fruit.body.position, r = fruit.config.radius;
            assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
            assert.ok(p.x >= BOARD.left + r - 2 && p.x <= BOARD.right - r + 2);
            assert.ok(p.y <= BOARD.floor - r + 2);
        }
    }
    assert.ok(last > 0); game.destroy();
});
