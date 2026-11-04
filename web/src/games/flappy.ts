import { circleRect, H, W, type GameFactory } from "./engine";

// Tap to flap. Pipes scroll left with a gap. Score = pipes passed.
export const flappy: GameFactory = (api) => {
  const { speed, gravity, spawnRate } = api.cfg.difficulty;
  const { fg, accent, bg } = api.cfg.colors;
  const GRAV = 1500 * gravity;
  const FLAP = -460;
  const SCROLL = 170 * speed;
  const GAP = 190 - (speed - 1) * 50;
  const SPACING = 230 / spawnRate;
  const PIPE_W = 72;
  const FLOOR = H - 40;
  const R = 26;
  const pipeFill = fg;
  const pipeHi = api.shade(fg, 0.25);
  const cap = accent;

  const hero = { x: 110, y: H / 2, vy: 0 };
  const pipes: { x: number; gapY: number; passed: boolean }[] = [];
  const clouds = Array.from({ length: 5 }, (_, i) => ({ x: i * 110 + Math.random() * 60, y: 130 + Math.random() * 250, w: 60 + Math.random() * 50 }));
  let floorX = 0;
  let trail = 0;

  return {
    update(dt, input) {
      if (input.tapped) {
        hero.vy = FLAP;
        api.sfx("jump");
        api.burst(hero.x - R, hero.y + 8, api.shade(bg, 0.5), 5, 90);
      }
      hero.vy += GRAV * dt;
      hero.y += hero.vy * dt;

      const lastPipe = pipes.at(-1);
      if (!lastPipe || lastPipe.x <= W + 60 - SPACING) {
        pipes.push({ x: lastPipe ? lastPipe.x + SPACING : W + 60, gapY: api.rand(150, FLOOR - 150), passed: false });
      }
      for (const p of pipes) {
        p.x -= SCROLL * dt;
        if (!p.passed && p.x + PIPE_W < hero.x - R) {
          p.passed = true;
          api.addScore(1);
          api.shake(3);
          api.sfx("score");
          api.pop(hero.x, hero.y - R - 14, "+1", accent);
        }
        const top = p.gapY - GAP / 2;
        if (circleRect(hero.x, hero.y, R - 3, p.x, -10, PIPE_W, top + 10) || circleRect(hero.x, hero.y, R - 3, p.x, top + GAP, PIPE_W, H)) {
          api.sfx("hit");
          api.end(hero.x, hero.y);
        }
      }
      while (pipes.length && pipes[0].x < -PIPE_W) pipes.shift();
      if (hero.y + R > FLOOR || hero.y < -R * 2) {
        api.sfx("hit");
        api.end(hero.x, Math.min(hero.y, FLOOR - R));
      }

      for (const c of clouds) c.x = c.x < -c.w ? W + 20 : c.x - SCROLL * 0.25 * dt;
      floorX = (floorX + SCROLL * dt) % 40;
      trail += dt;
      if (trail > 0.05) {
        trail = 0;
        api.burst(hero.x - R + 4, hero.y, api.shade(accent, 0.4), 1, 40);
      }
    },
    draw(g) {
      // parallax clouds
      g.fillStyle = "rgba(255,255,255,0.35)";
      for (const c of clouds) {
        g.beginPath();
        g.ellipse(c.x, c.y, c.w / 2, c.w / 5, 0, 0, Math.PI * 2);
        g.ellipse(c.x + c.w / 4, c.y - 10, c.w / 3, c.w / 6, 0, 0, Math.PI * 2);
        g.fill();
      }
      for (const p of pipes) {
        const top = p.gapY - GAP / 2;
        api.rrect(g, p.x, -20, PIPE_W, top + 20, 10, pipeFill);
        api.rrect(g, p.x, top + GAP, PIPE_W, H - top - GAP + 20, 10, pipeFill);
        g.fillStyle = pipeHi;
        g.fillRect(p.x + 8, 0, 8, top - 22);
        g.fillRect(p.x + 8, top + GAP + 24, 8, H - top - GAP);
        api.rrect(g, p.x - 7, top - 24, PIPE_W + 14, 24, 6, cap, fg);
        api.rrect(g, p.x - 7, top + GAP, PIPE_W + 14, 24, 6, cap, fg);
        g.save();
        g.translate(p.x + PIPE_W / 2, top - 80);
        g.rotate(-Math.PI / 2);
        api.label(g, api.cfg.obstacleLabel.toUpperCase(), 0, 0, 16, bg);
        g.restore();
      }
      // striped floor
      g.fillStyle = fg;
      g.fillRect(0, FLOOR, W, H - FLOOR);
      g.fillStyle = accent;
      for (let x = -floorX; x < W; x += 40) g.fillRect(x, FLOOR + 6, 20, 6);
      g.save();
      g.translate(hero.x, hero.y);
      g.rotate(Math.max(-0.5, Math.min(1.2, hero.vy / 700)));
      api.drawHero(g, 0, 0, R);
      g.restore();
    },
  };
};
