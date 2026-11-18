// Adapted from QuangLe1997/suika-merge (MIT); see ../THIRD_PARTY.md.
import { FruitFactory } from './entities/FruitFactory.js';
import { FRUITS, MAX_LEVEL, randomDropLevel } from './config/fruits.js';

const M = globalThis.Matter;
export const BOARD = Object.freeze({ width: 460, height: 680, left: 28, right: 432, floor: 648, danger: 132, spawn: 64 });
export const STEP = 1000 / 120;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class SuikaGame {
    constructor(onEvent = () => {}) {
        this.onEvent = onEvent;
        this.engine = M.Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8, constraintIterations: 2 });
        this.engine.gravity.y = 1.05;
        this.factory = new FruitFactory(this.engine);
        this.fruits = new Set();
        this.pending = [];
        M.Events.on(this.engine, 'collisionStart collisionActive', event => this.collisions(event));
        this.reset();
    }

    reset() {
        M.Composite.clear(this.engine.world, false);
        M.Engine.clear(this.engine);
        this.fruits.clear(); this.pending.length = 0;
        this.score = 0; this.time = 0; this.cooldown = 0;
        this.paused = false; this.over = false; this.danger = 0;
        this.next = randomDropLevel(); this.current = randomDropLevel();
        this.aim = BOARD.width / 2;
        const wall = { isStatic: true, friction: 0.15, restitution: 0.08, label: 'wall' };
        M.Composite.add(this.engine.world, [
            M.Bodies.rectangle(BOARD.left - 24, 320, 48, 1000, wall),
            M.Bodies.rectangle(BOARD.right + 24, 320, 48, 1000, wall),
            M.Bodies.rectangle(230, BOARD.floor + 24, 500, 48, wall)
        ]);
        this.onEvent({ type: 'reset', score: 0 });
    }

    create(level, x, y) {
        const radius = FRUITS[level].radius;
        const fruit = this.factory.create(level, clamp(x, BOARD.left + radius, BOARD.right - radius), Math.min(y, BOARD.floor - radius));
        fruit.age = 0; fruit.dangerTime = 0;
        fruit.previous = { ...fruit.body.position };
        this.fruits.add(fruit);
        return fruit;
    }

    setAim(x) {
        const radius = FRUITS[this.current].radius;
        this.aim = clamp(x, BOARD.left + radius + 2, BOARD.right - radius - 2);
    }

    drop() {
        if (this.paused || this.over || this.cooldown > 0) return false;
        this.setAim(this.aim);
        const radius = FRUITS[this.current].radius;
        // Never insert a new body through an existing fruit at the opening.
        if ([...this.fruits].some(f => Math.hypot(f.body.position.x - this.aim, f.body.position.y - BOARD.spawn) < f.config.radius + radius + 2)) return false;
        const fruit = this.create(this.current, this.aim, BOARD.spawn);
        M.Body.setVelocity(fruit.body, { x: 0, y: 0.7 });
        this.current = this.next; this.next = randomDropLevel();
        this.cooldown = 0.38;
        this.onEvent({ type: 'drop' });
        return true;
    }

    collisions(event) {
        for (const { bodyA: a, bodyB: b } of event.pairs) {
            const fa = a.fruitRef, fb = b.fruitRef;
            if (event.name === 'collisionStart') {
                const impact = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
                fa?.onImpact(impact); fb?.onImpact(impact);
            }
            if (!fa || !fb || fa.merging || fb.merging || fa.level !== fb.level || fa.level >= MAX_LEVEL) continue;
            // Reserve pairs immediately; each fruit can be consumed exactly once.
            fa.merging = fb.merging = true;
            this.pending.push([fa, fb]);
        }
    }

    step(dt = STEP) {
        if (this.paused || this.over) return;
        const seconds = dt / 1000;
        this.time += seconds;
        this.cooldown = Math.max(0, this.cooldown - seconds);
        for (const fruit of this.fruits) fruit.previous = { ...fruit.body.position };
        M.Engine.update(this.engine, dt);
        for (const [a, b] of this.pending) {
            const x = (a.body.position.x + b.body.position.x) / 2;
            const y = (a.body.position.y + b.body.position.y) / 2;
            const velocity = { x: clamp((a.body.velocity.x + b.body.velocity.x) / 2, -2, 2), y: clamp((a.body.velocity.y + b.body.velocity.y) / 2, -1, 2) };
            this.factory.destroy(a); this.factory.destroy(b);
            this.fruits.delete(a); this.fruits.delete(b);
            const fruit = this.create(a.level + 1, x, y);
            fruit.pop(0.12);
            M.Body.setVelocity(fruit.body, velocity);
            for (const neighbor of this.fruits) {
                if (Math.hypot(neighbor.body.position.x - x, neighbor.body.position.y - y) < neighbor.config.radius + fruit.config.radius + 12) M.Sleeping.set(neighbor.body, false);
            }
            this.score = Math.min(2147483647, this.score + fruit.config.score);
            this.onEvent({ type: 'merge', level: fruit.level, x, y, score: this.score, added: fruit.config.score });
        }
        this.pending.length = 0;
        this.danger = 0;
        for (const fruit of this.fruits) {
            fruit.age += seconds;
            fruit.updateAnim(seconds);
            const body = fruit.body, radius = fruit.config.radius;
            // Fixed substeps and thick walls prevent tunnelling; limit only extreme impulses.
            if (body.speed > 12) M.Body.setVelocity(body, { x: body.velocity.x * 12 / body.speed, y: body.velocity.y * 12 / body.speed });
            if (body.position.x < BOARD.left + radius - 2 || body.position.x > BOARD.right - radius + 2 || body.position.y > BOARD.floor - radius + 2) {
                M.Body.setPosition(body, { x: clamp(body.position.x, BOARD.left + radius, BOARD.right - radius), y: Math.min(body.position.y, BOARD.floor - radius) });
                M.Body.setVelocity(body, { x: body.velocity.x * 0.3, y: Math.min(0, body.velocity.y) });
            }
            const above = body.position.y - radius < BOARD.danger;
            fruit.dangerTime = fruit.age > 1.3 && above ? fruit.dangerTime + seconds : 0;
            this.danger = Math.max(this.danger, fruit.dangerTime / 2.5);
            if (fruit.dangerTime >= 2.5) {
                this.over = true;
                this.onEvent({ type: 'over', score: this.score });
                break;
            }
        }
    }

    destroy() { M.Events.off(this.engine); M.Composite.clear(this.engine.world, false); M.Engine.clear(this.engine); }
}
