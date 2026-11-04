import { circleRect, H, W, type GameFactory } from "./engine";

// Breakout: the ball is the face. Move the paddle (drag / arrows / tilt) and smash every brick. 3 lives.
export const breakout: GameFactory = (api) => {
  const { speed } = api.cfg.difficulty;
  const PW = 86;
  const PH = 14;
  const PY = H - 56;
  const BR = 14; // ball radius
  const COLS = 7;
  const ROWS = 6;
  const BW = (W - 20) / COLS;
  const BH = 22;
  const TOP = 130;

  let paddleX = W / 2;
  let lives = 3;
  let wave = 0;
  let bricks: { x: number; y: number; alive: boolean; row: number }[] = [];
  const ball = { x: W / 2, y: PY - BR - 2, vx: 0, vy: 0, stuck: true };

  function buildWave() {
    bricks = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) bricks.push({ x: 10 + c * BW, y: TOP + r * (BH + 6), alive: true, row: r });
  }
  function serve() {
    const v = (330 + wave * 40) * speed;
    const a = api.rand(-0.5, 0.5);
    ball.vx = Math.sin(a) * v;
    ball.vy = -Math.cos(a) * v;
    ball.stuck = false;
  }
  buildWave();

  return {
    update(dt, input) {
      if (input.pointerX !== null) paddleX += (input.pointerX - paddleX) * Math.min(1, dt * 18);
      else paddleX += input.axis * 520 * dt;
      paddleX = Math.max(PW / 2, Math.min(W - PW / 2, paddleX));

      if (ball.stuck) {
        ball.x = paddleX;
        ball.y = PY - BR - 2;
        if (input.tapped || input.axis !== 0 || input.pointerX !== null) serve();
        return;
      }

      // Sub-step so a fast ball cannot tunnel through a brick.
      const steps = Math.ceil((Math.hypot(ball.vx, ball.vy) * dt) / 6);
      for (let s = 0; s < steps; s++) {
        const sdt = dt / steps;
        ball.x += ball.vx * sdt;
        ball.y += ball.vy * sdt;
        if (ball.x < BR) { ball.x = BR; ball.vx = Math.abs(ball.vx); }
        if (ball.x > W - BR) { ball.x = W - BR; ball.vx = -Math.abs(ball.vx); }
        if (ball.y < TOP - 30) { ball.y = TOP - 30; ball.vy = Math.abs(ball.vy); }

        // paddle: bounce angle depends on where it hit
        if (ball.vy > 0 && circleRect(ball.x, ball.y, BR, paddleX - PW / 2, PY, PW, PH)) {
          const off = (ball.x - paddleX) / (PW / 2);
          const v = Math.hypot(ball.vx, ball.vy) * 1.01;
          ball.vx = v * Math.sin(off * 1.05);
          ball.vy = -v * Math.cos(off * 1.05);
          ball.y = PY - BR - 1;
          api.shake(2);
        }

        for (const b of bricks) {
          if (!b.alive || !circleRect(ball.x, ball.y, BR, b.x, b.y, BW - 4, BH)) continue;
          b.alive = false;
          api.addScore(1);
          api.shake(3);
          // reflect on the axis of least penetration
          const cx = Math.max(b.x, Math.min(ball.x, b.x + BW - 4));
          const cy = Math.max(b.y, Math.min(ball.y, b.y + BH));
          if (Math.abs(ball.x - cx) > Math.abs(ball.y - cy)) ball.vx = -ball.vx;
          else ball.vy = -ball.vy;
          break;
        }
      }

      if (ball.y > H + BR) {
        lives--;
        api.shake(10);
        if (lives <= 0) return api.end();
        ball.stuck = true;
      }
      if (bricks.every((b) => !b.alive)) {
        wave++;
        buildWave();
        ball.stuck = true;
      }
    },
    draw(g) {
      const { fg, accent, bg } = api.cfg.colors;
      for (const b of bricks) {
        if (!b.alive) continue;
        g.fillStyle = b.row % 2 ? accent : fg;
        g.fillRect(b.x, b.y, BW - 4, BH);
      }
      api.label(g, api.cfg.obstacleLabel.toUpperCase(), W / 2, TOP - 14, 12);
      g.fillStyle = fg;
      g.fillRect(paddleX - PW / 2, PY, PW, PH);
      g.fillStyle = bg;
      g.fillRect(paddleX - PW / 2 + 4, PY + 4, PW - 8, PH - 8);
      api.drawHero(g, ball.x, ball.y, BR);
      api.label(g, "♥".repeat(Math.max(0, lives)), W - 50, 30, 22, accent);
      if (ball.stuck) api.label(g, "TAP OR MOVE TO SERVE", W / 2, PY - 60, 14);
    },
  };
};
