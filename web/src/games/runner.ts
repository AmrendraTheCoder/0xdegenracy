import { circleRect, H, W, type GameFactory } from "./engine";

// Tap/space to jump, hold down to duck. Obstacles speed up over time. Score = distance.
export const runner: GameFactory = (api) => {
  const { speed, gravity, spawnRate } = api.cfg.difficulty;
  const GROUND = H - 110;
  const R = 28;
  const GRAV = 2200 * gravity;
  const JUMP = -820;
  const BASE = 280 * speed;

  const hero = { x: 90, y: GROUND - R, vy: 0 };
  const obs: { x: number; y: number; w: number; h: number; flying: boolean }[] = [];
  let t = 0;
  let spawnIn = 1.2;
  let groundOffset = 0;
  let ducking = false;

  return {
    update(dt, input) {
      t += dt;
      const v = BASE + t * 9; // speeds up over time
      const onGround = hero.y >= GROUND - R - 0.5;
      if (input.tapped && onGround) hero.vy = JUMP;
      if (input.duck && !onGround) hero.vy += GRAV * dt; // fast fall
      hero.vy += GRAV * dt;
      hero.y = Math.min(GROUND - R, hero.y + hero.vy * dt);
      if (hero.y >= GROUND - R) hero.vy = 0;

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
        if (circleRect(hero.x, hy, hr - 3, o.x, o.y, o.w, o.h)) api.end();
      }
      while (obs.length && obs[0].x < -80) obs.shift();
      groundOffset = (groundOffset + v * dt) % 40;
      api.addScore((v * dt) / 30);
    },
    draw(g) {
      const { fg, accent } = api.cfg.colors;
      g.fillStyle = fg;
      g.fillRect(0, GROUND, W, H - GROUND);
      g.fillStyle = accent;
      for (let x = -groundOffset; x < W; x += 40) g.fillRect(x, GROUND + 14, 20, 6);
      for (const o of obs) {
        g.fillStyle = o.flying ? accent : fg;
        g.fillRect(o.x, o.y, o.w, o.h);
        api.label(g, api.cfg.obstacleLabel.toUpperCase(), o.x + o.w / 2, o.y - 12, 12);
      }
      if (ducking) {
        g.save();
        g.translate(hero.x, GROUND - R * 0.6);
        g.scale(1.25, 0.6);
        api.drawHero(g, 0, 0, R);
        g.restore();
      } else api.drawHero(g, hero.x, hero.y, R);
    },
  };
};
