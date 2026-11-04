import { H, W, type GameFactory } from "./engine";

// Whack-a-mole: the face pops out of holes; tap it before it hides. Don't tap the bombs. 3 lives.
export const whack: GameFactory = (api) => {
  const { speed, spawnRate } = api.cfg.difficulty;
  const COLS = 3;
  const ROWS = 3;
  const R = 40;
  const holes = Array.from({ length: COLS * ROWS }, (_, i) => ({
    x: 70 + (i % COLS) * 130,
    y: 200 + Math.floor(i / COLS) * 135,
    up: 0, // seconds left visible
    rise: 0, // 0..1 pop animation
    bad: false,
    hit: false,
  }));
  let lives = 3;
  let t = 0;
  let spawnIn = 0.8;
  let flash = 0;

  return {
    update(dt, input) {
      t += dt;
      // Gentle start (faces linger ~1.8s), ramping to about 2x after a minute.
      const pace = Math.min(2.2, 0.75 + t / 45) * speed;

      spawnIn -= dt;
      if (spawnIn <= 0) {
        const free = holes.filter((h) => h.up <= 0);
        if (free.length) {
          const h = free[Math.floor(Math.random() * free.length)];
          h.up = api.rand(0.9, 1.4) / pace;
          h.rise = 0;
          h.bad = t > 5 && Math.random() < 0.22;
          h.hit = false;
        }
        spawnIn = api.rand(0.35, 0.75) / pace / spawnRate;
      }

      if (input.tap) {
        const { x, y } = input.tap;
        const h = holes.find((h) => h.up > 0 && !h.hit && (x - h.x) ** 2 + (y - (h.y - 18 * h.rise)) ** 2 < (R + 12) ** 2);
        if (h) {
          h.hit = true;
          h.up = Math.min(h.up, 0.12);
          if (h.bad) {
            api.shake(14);
            api.sfx("hit");
            api.burst(h.x, h.y, "#ff9f1c", 30, 340);
            api.end(h.x, h.y);
          } else {
            api.addScore(1);
            api.shake(4);
            api.sfx("bonk");
            api.burst(h.x, h.y - 10, api.cfg.colors.accent, 14, 200);
            api.pop(h.x, h.y - 60, "+1", api.cfg.colors.accent);
          }
        } else {
          api.burst(x, y, api.shade(api.cfg.colors.fg, 0.3), 4, 80); // whiff
        }
      }

      for (const h of holes) {
        if (h.up <= 0) continue;
        h.rise = Math.min(1, h.rise + dt * 8);
        h.up -= dt;
        if (h.up <= 0 && !h.hit && !h.bad) {
          lives--; // the face got away
          flash = 0.25;
          api.shake(8);
          api.sfx("hit");
          api.pop(h.x, h.y - 40, "MISSED", api.cfg.colors.fg);
          if (lives <= 0) api.end(h.x, h.y);
        }
      }
      flash = Math.max(0, flash - dt);
    },
    draw(g) {
      const { fg, accent } = api.cfg.colors;
      // grassy field behind the holes
      api.rrect(g, 12, 150, W - 24, 430, 24, api.shade(api.cfg.colors.bg, -0.08));
      for (const h of holes) {
        // dirt mound rim, then the dark hole
        g.fillStyle = api.shade(fg, 0.35);
        g.beginPath();
        g.ellipse(h.x, h.y + 28, R + 14, 22, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = fg;
        g.beginPath();
        g.ellipse(h.x, h.y + 26, R + 6, 16, 0, 0, Math.PI * 2);
        g.fill();
        if (h.up > 0) {
          const y = h.y + 30 - 48 * h.rise;
          g.save();
          g.beginPath();
          g.rect(h.x - R - 10, h.y - R - 60, (R + 10) * 2, R + 86); // clip to above the hole rim
          g.clip();
          if (h.bad) {
            g.fillStyle = fg;
            g.beginPath();
            g.arc(h.x, y, R - 4, 0, Math.PI * 2);
            g.fill();
            api.label(g, "💣", h.x, y, 34);
          } else {
            api.drawHero(g, h.x, y, R);
            if (h.hit) api.label(g, "BONK", h.x, y - R - 6, 18, accent);
          }
          g.restore();
          if (h.bad) api.label(g, api.cfg.obstacleLabel.toUpperCase(), h.x, h.y + 56, 11);
        }
      }
      api.label(g, "♥".repeat(Math.max(0, lives)), W - 50, 30, 22, accent);
      if (flash > 0) {
        g.fillStyle = `rgba(255,0,0,${flash})`;
        g.fillRect(0, 0, W, H);
      }
    },
  };
};
