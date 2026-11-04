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
          api.sfx("jump");
        }

        for (const b of bricks) {
          if (!b.alive || !circleRect(ball.x, ball.y, BR, b.x, b.y, BW - 4, BH)) continue;
          b.alive = false;
          api.addScore(1);
          api.shake(3);
          api.sfx("bonk");
          api.burst(b.x + BW / 2, b.y + BH / 2, b.row % 2 ? api.cfg.colors.accent : api.cfg.colors.fg, 12, 180);
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
        api.sfx("hit");
        if (lives <= 0) return api.end(ball.x, H - 20);
        api.pop(W / 2, H / 2 + 60, `${lives} ${lives === 1 ? "LIFE" : "LIVES"} LEFT`, api.cfg.colors.accent);
        ball.stuck = true;
      }
      if (bricks.every((b) => !b.alive)) {
        api.sfx("start");
        api.pop(W / 2, H / 2, `WAVE ${wave + 2}!`, api.cfg.colors.accent);
        wave++;
        buildWave();
        ball.stuck = true;
      }
    },
    draw(g) {
      const { fg, accent, bg } = api.cfg.colors;
      for (const b of bricks) {
        if (!b.alive) continue;
        const base = b.row % 2 ? accent : fg;
        api.rrect(g, b.x, b.y, BW - 4, BH, 5, base);
        g.fillStyle = api.shade(base, 0.3);
        g.fillRect(b.x + 4, b.y + 3, BW - 12, 4); // bevel highlight
      }
      api.label(g, api.cfg.obstacleLabel.toUpperCase(), W / 2, TOP - 14, 12);
      api.rrect(g, paddleX - PW / 2, PY, PW, PH, 7, fg);
      api.rrect(g, paddleX - PW / 2 + 4, PY + 3, PW - 8, PH - 8, 4, bg);
      // motion trail behind the face-ball
      if (!ball.stuck) {
        g.fillStyle = api.shade(accent, 0.3);
        for (let i = 1; i <= 3; i++) {
          g.globalAlpha = 0.25 / i;
          g.beginPath();
          g.arc(ball.x - (ball.vx * i) / 60, ball.y - (ball.vy * i) / 60, BR, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
      }
      api.drawHero(g, ball.x, ball.y, BR);
      api.hearts(g, W - 14, 29, Math.max(0, lives));
      if (ball.stuck) api.label(g, "TAP OR MOVE TO SERVE", W / 2, PY - 60, 14);
    },
  };
};
