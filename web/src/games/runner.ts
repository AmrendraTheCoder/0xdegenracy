import { circleRect, H, W, type GameFactory } from "./engine";

// Tap/space to jump, hold down to duck. Obstacles speed up over time. Score = distance.
export const runner: GameFactory = (api) => {
  const { speed, gravity, spawnRate } = api.cfg.difficulty;
  const { fg, accent, bg } = api.cfg.colors;
  const GROUND = H - 110;
  const R = 28;
  const GRAV = 2200 * gravity;
  const JUMP = -820;
  const BASE = 280 * speed;

  const hero = { x: 90, y: GROUND - R, vy: 0 };
  const obs: { x: number; y: number; w: number; h: number; flying: boolean }[] = [];
  const hills = Array.from({ length: 4 }, (_, i) => ({ x: i * 140, h: 40 + Math.random() * 60 }));
  let t = 0;
  let spawnIn = 1.2;
  let groundOffset = 0;
  let ducking = false;
  let wasAir = false;
  let milestone = 100;
  let dist = 0;
  let spin = 0;

  return {
    update(dt, input) {
      t += dt;
      const v = BASE + t * 9; // speeds up over time
      const onGround = hero.y >= GROUND - R - 0.5;
      if (input.tapped && onGround) {
        hero.vy = JUMP;
        api.sfx("jump");
        api.burst(hero.x, GROUND, api.shade(fg, 0.4), 8, 120);
      }
      if (input.duck && !onGround) hero.vy += GRAV * dt; // fast fall
      hero.vy += GRAV * dt;
      hero.y = Math.min(GROUND - R, hero.y + hero.vy * dt);
      if (hero.y >= GROUND - R) {
        if (wasAir) api.burst(hero.x, GROUND, api.shade(fg, 0.4), 6, 90); // landing dust
        hero.vy = 0;
      }
      wasAir = hero.y < GROUND - R - 0.5;
      spin = wasAir ? spin + dt * 9 : 0;

      spawnIn -= dt;
      if (spawnIn <= 0) {
        const flying = t > 8 && Math.random() < 0.3;
        const h = flying ? 34 : api.rand(36, 64);
        obs.push({ x: W + 20, y: flying ? GROUND - 2 * R - 46 : GROUND - h, w: api.rand(34, 56), h, flying });
        spawnIn = api.rand(0.9, 1.7) / spawnRate / Math.min(1.8, 1 + t / 40);
      }

      ducking = input.duck && onGround;
      const hr = ducking ? R * 0.6 : R;
      const hy = ducking ? GROUND - hr : hero.y;
      for (const o of obs) {
        o.x -= v * dt;
        if (circleRect(hero.x, hy, hr - 3, o.x, o.y, o.w, o.h)) {
          api.sfx("hit");
          api.end(hero.x, hy);
        }
      }
      while (obs.length && obs[0].x < -80) obs.shift();
      groundOffset = (groundOffset + v * dt) % 40;
      for (const hl of hills) hl.x = hl.x < -140 ? W + 20 : hl.x - v * 0.2 * dt;
      api.addScore((v * dt) / 30);
      dist += (v * dt) / 30;

      // celebrate every 100 meters
      if (dist >= milestone) {
        api.sfx("score");
        api.pop(W / 2, 140, `${milestone}!`, accent);
        milestone += 100;
      }
    },
    draw(g) {
      // distant hills
      g.fillStyle = api.shade(bg, -0.1);
      for (const hl of hills) {
        g.beginPath();
        g.ellipse(hl.x + 70, GROUND, 90, hl.h, 0, Math.PI, 0);
        g.fill();
      }
      g.fillStyle = fg;
      g.fillRect(0, GROUND, W, H - GROUND);
      g.fillStyle = accent;
      for (let x = -groundOffset; x < W; x += 40) g.fillRect(x, GROUND + 14, 20, 6);
      for (const o of obs) {
        api.rrect(g, o.x, o.y, o.w, o.h, 8, o.flying ? accent : fg, o.flying ? fg : accent);
        if (!o.flying) {
          g.fillStyle = api.shade(fg, 0.25);
          g.fillRect(o.x + 6, o.y + 6, 5, o.h - 12);
        }
        api.label(g, api.cfg.obstacleLabel.toUpperCase(), o.x + o.w / 2, o.y - 12, 12);
      }
      // shadow under the hero shrinks while airborne
      const air = Math.max(0, GROUND - R - hero.y);
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.beginPath();
      g.ellipse(hero.x, GROUND + 2, Math.max(8, R - air / 8), 6, 0, 0, Math.PI * 2);
      g.fill();
      if (ducking) {
        g.save();
        g.translate(hero.x, GROUND - R * 0.6);
        g.scale(1.25, 0.6);
        api.drawHero(g, 0, 0, R);
        g.restore();
      } else {
        g.save();
        g.translate(hero.x, hero.y);
        g.rotate(spin);
        api.drawHero(g, 0, 0, R);
        g.restore();
      }
    },
  };
};
