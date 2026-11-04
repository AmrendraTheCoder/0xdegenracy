import { H, W, type Dir, type GameFactory } from "./engine";

// Snake: the head is the face. Eat food to grow; hitting a wall or your tail ends the run.
export const snake: GameFactory = (api) => {
  const { speed } = api.cfg.difficulty;
  const CELL = 20;
  const COLS = W / CELL; // 20
  const TOP = 120;
  const ROWS = Math.floor((H - TOP) / CELL); // 24
  const OPP: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };
  const STEP: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  let body = [
    { x: 8, y: 12 },
    { x: 7, y: 12 },
    { x: 6, y: 12 },
  ];
  let dir: Dir = "right";
  const queue: Dir[] = [];
  let acc = 0;
  let food = place();

  function place() {
    for (;;) {
      const f = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
      if (!body.some((b) => b.x === f.x && b.y === f.y)) return f;
    }
  }

  return {
    update(dt, input) {
      // Buffer up to 2 turns so quick double-taps feel responsive; ignore reversals.
      if (input.dir && queue.length < 2) {
        const last = queue.at(-1) ?? dir;
        if (input.dir !== last && input.dir !== OPP[last]) queue.push(input.dir);
      }
      const tick = Math.max(0.055, 0.14 / speed - body.length * 0.0018);
      acc += dt;
      while (acc >= tick) {
        acc -= tick;
        dir = queue.shift() ?? dir;
        const [dx, dy] = STEP[dir];
        const head = { x: body[0].x + dx, y: body[0].y + dy };
        const ate = head.x === food.x && head.y === food.y;
        const tail = ate ? body : body.slice(0, -1);
        if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS || tail.some((b) => b.x === head.x && b.y === head.y)) {
          api.sfx("hit");
          api.end(body[0].x * CELL + CELL / 2, TOP + body[0].y * CELL + CELL / 2);
          return;
        }
        body = [head, ...tail];
        if (ate) {
          const fx = food.x * CELL + CELL / 2;
          const fy = TOP + food.y * CELL + CELL / 2;
          api.addScore(1);
          api.shake(3);
          api.sfx("score");
          api.burst(fx, fy, api.cfg.colors.accent, 12, 160);
          api.pop(fx, fy - 18, "+1", api.cfg.colors.accent);
          food = place();
        }
      }
    },
    draw(g) {
      const { fg, accent, bg } = api.cfg.colors;
      // checkerboard play field
      const light = api.shade(bg, 0.08);
      const dark = api.shade(bg, -0.05);
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) {
          g.fillStyle = (x + y) % 2 ? dark : light;
          g.fillRect(x * CELL, TOP + y * CELL, CELL, CELL);
        }
      g.strokeStyle = fg;
      g.lineWidth = 3;
      g.strokeRect(1.5, TOP - 1.5, W - 3, ROWS * CELL + 3);
      // food: pulsing glow
      const pulse = 1 + Math.sin(performance.now() / 160) * 0.12;
      g.save();
      g.shadowColor = accent;
      g.shadowBlur = 14;
      g.fillStyle = accent;
      g.beginPath();
      g.arc(food.x * CELL + CELL / 2, TOP + food.y * CELL + CELL / 2, (CELL / 2 - 2) * pulse, 0, Math.PI * 2);
      g.fill();
      g.restore();
      api.label(g, api.cfg.goodItemLabel.toUpperCase(), food.x * CELL + CELL / 2, TOP + food.y * CELL - 6, 10);
      // tail: rounded segments that fade toward the tip
      for (let i = body.length - 1; i > 0; i--) {
        const b = body[i];
        const k = i / body.length;
        api.rrect(g, b.x * CELL + 2, TOP + b.y * CELL + 2, CELL - 4, CELL - 4, 6, api.shade(fg, k * 0.35));
      }
      // head = the face, drawn a little larger than a cell
      const h = body[0];
      api.drawHero(g, h.x * CELL + CELL / 2, TOP + h.y * CELL + CELL / 2, CELL * 0.8);
    },
  };
};
