// FruitFactory — creates Matter.js bodies + Fruit wrapper.

import { Fruit } from './Fruit.js';
import { getFruit } from '../config/fruits.js';

const M = globalThis.Matter;

export class FruitFactory {
  constructor(engine) {
    this.engine = engine;
  }

  create(level, x, y, opts = {}) {
    const cfg = getFruit(level);
    // Realistic feel: bigger fruit = heavier, less bouncy, more grippy (less slide).
    // Smaller fruit = a touch livelier. Values tuned for a juicy-but-stable pile.
    const t = (level - 1) / 10; // 0..1 across the chain
    const restitution = 0.20 - t * 0.15;          // 0.20 (cherry) → 0.05 (watermelon)
    const friction = 0.22 + t * 0.20;             // 0.22 → 0.42
    const density = 0.0013 + level * 0.00016;     // heavier as it grows
    const body = M.Bodies.circle(x, y, cfg.radius, {
      label: `fruit_${level}`,
      restitution,
      friction,
      frictionStatic: 0.4,
      frictionAir: 0.003,
      density,
      slop: 0.02,
      sleepThreshold: 90,
      render: { visible: false },
      ...opts,
    });
    const fruit = new Fruit(body, level);
    M.World.add(this.engine.world, body);
    return fruit;
  }

  destroy(fruit) {
    if (!fruit || !fruit.body) return;
    M.World.remove(this.engine.world, fruit.body);
    fruit.body.fruitRef = null;
  }
}
