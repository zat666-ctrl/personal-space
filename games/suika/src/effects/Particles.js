// Lightweight particle system rendered on Canvas 2D (object-pooled).
// Supports dots, sparkles, confetti, expanding shockwave rings and soft flashes.

const POOL_SIZE = 180;

class Particle {
  constructor() {
    this.alive = false;
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.life = 0; this.maxLife = 0;
    this.color = '#fff';
    this.size = 4;
    this.gravity = 0;
    this.fade = true;
    this.shape = 'circle'; // circle | sparkle | rect | ring | flash
    this.growth = 0;       // ring radius growth / s
    this.lineWidth = 3;
    this.spin = 0;
    this.rot = 0;
  }
}

export class ParticleSystem {
  constructor() {
    this.pool = Array.from({ length: POOL_SIZE }, () => new Particle());
  }

  _spawn() {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.alive) { p.alive = true; return p; }
    }
    return null;
  }

  // Colorful merge burst. colors: array of hex.
  burst(x, y, colors, level = 1) {
    const palette = Array.isArray(colors) ? colors : [colors];
    const count = Math.min(34, 14 + level * 1.6);
    for (let i = 0; i < count; i++) {
      const p = this._spawn();
      if (!p) break;
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const speed = 90 + Math.random() * 240 + level * 9;
      p.x = x; p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 70;
      p.maxLife = 0.5 + Math.random() * 0.55;
      p.life = p.maxLife;
      p.color = palette[(Math.random() * palette.length) | 0];
      p.size = 3 + Math.random() * 4;
      p.gravity = 620;
      p.fade = true;
      p.shape = Math.random() < 0.55 ? 'sparkle' : 'circle';
    }
  }

  // Expanding ring (shockwave) — great for "merge punch".
  shockwave(x, y, color = '#fff', maxR = 90, lineWidth = 4) {
    const p = this._spawn();
    if (!p) return;
    p.x = x; p.y = y;
    p.vx = 0; p.vy = 0;
    p.maxLife = 0.42; p.life = p.maxLife;
    p.color = color;
    p.size = 6;
    p.growth = (maxR - 6) / p.maxLife;
    p.lineWidth = lineWidth;
    p.gravity = 0;
    p.shape = 'ring';
  }

  // Soft radial flash.
  flash(x, y, r = 70, color = '#ffffff') {
    const p = this._spawn();
    if (!p) return;
    p.x = x; p.y = y;
    p.maxLife = 0.28; p.life = p.maxLife;
    p.color = color;
    p.size = r;
    p.shape = 'flash';
    p.gravity = 0;
  }

  confetti(x, y, colors) {
    const palette = colors || ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#ffadad'];
    for (let i = 0; i < 26; i++) {
      const p = this._spawn();
      if (!p) break;
      p.x = x + (Math.random() - 0.5) * 60;
      p.y = y;
      p.vx = (Math.random() - 0.5) * 380;
      p.vy = -220 - Math.random() * 220;
      p.maxLife = 0.9 + Math.random() * 0.7;
      p.life = p.maxLife;
      p.color = palette[(Math.random() * palette.length) | 0];
      p.size = 4 + Math.random() * 5;
      p.gravity = 720;
      p.shape = 'rect';
      p.spin = (Math.random() - 0.5) * 18;
      p.rot = Math.random() * Math.PI;
    }
  }

  drop(x, y, color = '#ffffff') {
    for (let i = 0; i < 7; i++) {
      const p = this._spawn();
      if (!p) break;
      const a = Math.random() * Math.PI - Math.PI;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * 50;
      p.vy = Math.sin(a) * 22 - 18;
      p.maxLife = 0.32; p.life = p.maxLife;
      p.color = color; p.size = 2.2;
      p.gravity = 220; p.shape = 'circle';
    }
  }

  update(dt) {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      if (p.shape === 'ring' || p.shape === 'flash') {
        p.size += p.growth * dt;
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      if (p.spin) p.rot += p.spin * dt;
    }
  }

  draw(ctx) {
    ctx.save();
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;
      const t = Math.max(0, p.life / p.maxLife);

      if (p.shape === 'ring') {
        ctx.globalAlpha = t * 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.lineWidth * t + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      if (p.shape === 'flash') {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        g.addColorStop(0, p.color);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = t * 0.8;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      ctx.globalAlpha = p.fade ? t : 1;
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'rect') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      } else if (p.shape === 'sparkle') {
        const s = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - s);
        ctx.lineTo(p.x + s * 0.32, p.y - s * 0.32);
        ctx.lineTo(p.x + s, p.y);
        ctx.lineTo(p.x + s * 0.32, p.y + s * 0.32);
        ctx.lineTo(p.x, p.y + s);
        ctx.lineTo(p.x - s * 0.32, p.y + s * 0.32);
        ctx.lineTo(p.x - s, p.y);
        ctx.lineTo(p.x - s * 0.32, p.y - s * 0.32);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
