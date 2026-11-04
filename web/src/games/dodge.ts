import { H, W, type GameFactory } from "./engine";

// Move left/right (keys, drag or tilt). Catch good items, dodge bad ones. 3 lives.
export const dodge: GameFactory = (api) => {
  const { speed, spawnRate } = api.cfg.difficulty;
  const R = 30;
  const Y = H - 70;
  const MOVE = 460;

  const hero = { x: W / 2 };
  const items: { x: number; y: number; vy: number; good: boolean; r: number }[] = [];
  let lives = 3;
  let t = 0;
  let spawnIn = 0.6;
  let hurtFlash = 0;

  return {
    update(dt, input) {
      t += dt;
      if (input.pointerX !== null) hero.x += (input.pointerX - hero.x) * Math.min(1, dt * 14);
      else hero.x += input.axis * MOVE * dt;
      hero.x = Math.max(R, Math.min(W - R, hero.x));

      spawnIn -= dt;
      if (spawnIn <= 0) {
        const good = Math.random() < 0.62;
        items.push({ x: api.rand(24, W - 24), y: -30, vy: (190 + t * 6) * speed * api.rand(0.85, 1.25), good, r: good ? 18 : 22 });
        spawnIn = api.rand(0.35, 0.8) / spawnRate / Math.min(2, 1 + t / 45);
      }

      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.y += it.vy * dt;
        if ((it.x - hero.x) ** 2 + (it.y - Y) ** 2 < (it.r + R - 4) ** 2) {
          items.splice(i, 1);
          if (it.good) {
            api.addScore(1);
            api.shake(2);
          } else {
            lives--;
            hurtFlash = 0.25;
            api.shake(10);
            if (lives <= 0) api.end();
          }
        } else if (it.y > H + 40) items.splice(i, 1);
      }
      hurtFlash = Math.max(0, hurtFlash - dt);
    },
    draw(g) {
      const { fg, accent } = api.cfg.colors;
      for (const it of items) {
        if (it.good) {
          g.fillStyle = accent;
          g.beginPath();
          g.arc(it.x, it.y, it.r, 0, Math.PI * 2);
          g.fill();
          api.label(g, api.cfg.goodItemLabel.toUpperCase(), it.x, it.y - it.r - 10, 11);
        } else {
          g.fillStyle = fg;
          g.fillRect(it.x - it.r, it.y - it.r, it.r * 2, it.r * 2);
          api.label(g, "✕", it.x, it.y, 22, accent);
          api.label(g, api.cfg.obstacleLabel.toUpperCase(), it.x, it.y - it.r - 10, 11);
        }
      }
      api.drawHero(g, hero.x, Y, R);
      api.label(g, "♥".repeat(Math.max(0, lives)), W - 50, 30, 22, accent);
      if (hurtFlash > 0) {
        g.fillStyle = `rgba(255,0,0,${hurtFlash})`;
        g.fillRect(0, 0, W, H);
      }
    },
  };
};
