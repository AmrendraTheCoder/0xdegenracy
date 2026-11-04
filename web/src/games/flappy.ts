import { circleRect, H, W, type GameFactory } from "./engine";

// Tap to flap. Pipes scroll left with a gap. Score = pipes passed.
export const flappy: GameFactory = (api) => {
  const { speed, gravity, spawnRate } = api.cfg.difficulty;
  const GRAV = 1500 * gravity;
  const FLAP = -460;
  const SCROLL = 170 * speed;
  const GAP = 190 - (speed - 1) * 50;
  const SPACING = 230 / spawnRate;
  const PIPE_W = 72;
  const FLOOR = H - 40;
  const R = 26;

  const hero = { x: 110, y: H / 2, vy: 0 };
  const pipes: { x: number; gapY: number; passed: boolean }[] = [];

  return {
    update(dt, input) {
      if (input.tapped) hero.vy = FLAP;
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
        }
        const top = p.gapY - GAP / 2;
        if (circleRect(hero.x, hero.y, R - 3, p.x, -10, PIPE_W, top + 10) ||
            circleRect(hero.x, hero.y, R - 3, p.x, top + GAP, PIPE_W, H)) api.end();
      }
      while (pipes.length && pipes[0].x < -PIPE_W) pipes.shift();
      if (hero.y + R > FLOOR || hero.y < -R * 2) api.end();
    },
    draw(g) {
      const { fg, accent } = api.cfg.colors;
      for (const p of pipes) {
        const top = p.gapY - GAP / 2;
        g.fillStyle = fg;
        g.fillRect(p.x, 0, PIPE_W, top);
        g.fillRect(p.x, top + GAP, PIPE_W, H - top - GAP);
        g.fillStyle = accent;
        g.fillRect(p.x - 6, top - 22, PIPE_W + 12, 22);
        g.fillRect(p.x - 6, top + GAP, PIPE_W + 12, 22);
        g.save();
        g.translate(p.x + PIPE_W / 2, top - 70);
        g.rotate(-Math.PI / 2);
        api.label(g, api.cfg.obstacleLabel.toUpperCase(), 0, 0, 16, api.cfg.colors.bg);
        g.restore();
      }
      g.fillStyle = fg;
      g.fillRect(0, FLOOR, W, H - FLOOR);
      g.save();
      g.translate(hero.x, hero.y);
      g.rotate(Math.max(-0.5, Math.min(1.2, hero.vy / 700)));
      api.drawHero(g, 0, 0, R);
      g.restore();
    },
  };
};
