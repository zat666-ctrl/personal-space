// Fruit entity — wraps a Matter.js body + drawing data + spring animations.

import { getFruit } from '../config/fruits.js';

let _idCounter = 1;

export class Fruit {
  constructor(body, level) {
    this.id = _idCounter++;
    this.body = body;
    this.level = level;
    this.config = getFruit(level);
    this.spawnTime = performance.now();
    this.merging = false;
    this.bornFromMerge = false;

    // uniform pop spring (merge / spawn)
    this.popScale = 1;
    this.popVel = 0;

    // non-uniform squash-&-stretch spring (impacts)
    this.squash = 0;     // >0 = flatten vertically, widen horizontally
    this.squashVel = 0;

    this.aboveLineSince = 0;
    this.lastImpactAt = 0;

    body.fruitRef = this;
    body.label = `fruit_${level}`;
  }

  pop(amount = 0.3) {
    this.popScale = 1 + amount;
    this.popVel = -2;
  }

  // Called on collision; speed is the impact (relative) speed.
  onImpact(speed) {
    const now = performance.now();
    if (now - this.lastImpactAt < 60) return; // debounce
    this.lastImpactAt = now;
    // smaller fruits deform more; scale impact to a tasteful range
    const sizeFactor = 1.1 - Math.min(0.6, this.level * 0.05);
    const s = Math.min(0.28, speed * 0.018 * sizeFactor);
    if (s > this.squash) {
      this.squash = s;
      this.squashVel = 0;
    }
  }

  updateAnim(dt) {
    // clamp dt for stable springs
    const h = Math.min(dt, 0.032);

    // uniform pop spring → 1.0
    {
      const stiffness = 26, damping = 7;
      const acc = (1 - this.popScale) * stiffness - this.popVel * damping;
      this.popVel += acc * h;
      this.popScale += this.popVel * h;
    }
    // squash spring → 0
    {
      const stiffness = 32, damping = 8;
      const acc = (0 - this.squash) * stiffness - this.squashVel * damping;
      this.squashVel += acc * h;
      this.squash += this.squashVel * h;
      if (Math.abs(this.squash) < 0.001 && Math.abs(this.squashVel) < 0.001) this.squash = 0;
    }
  }

  // Effective draw scales (combine pop + squash)
  get scaleX() { return this.popScale * (1 + this.squash * 0.9); }
  get scaleY() { return this.popScale * (1 - this.squash); }
}
