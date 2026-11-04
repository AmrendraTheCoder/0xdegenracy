import { circleRect, H, W, type GameFactory } from "./engine";

// Space shooter: the face is the ship. It auto-fires; move to aim. Clear waves of invaders. 3 lives.
export const shooter: GameFactory = (api) => {
  const { speed, spawnRate } = api.cfg.difficulty;
  const SY = H - 60;
  const SR = 24;
  const EW = 34;
  const EH = 24;

  let shipX = W / 2;
  let lives = 3;
  let wave = 0;
  let fireIn = 0;
  let invuln = 0;
  let enemies: { x: number; y: number; alive: boolean }[] = [];
  let dirX = 1;
  const bullets: { x: number; y: number }[] = [];
  const shots: { x: number; y: number }[] = []; // enemy fire
  const stars = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 2 + 1 }));

  function spawnWave() {
    enemies = [];
    const cols = 6;
    const rows = Math.min(5, 3 + Math.floor(wave / 2));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) enemies.push({ x: 40 + c * 56, y: 130 + r * 40, alive: true });
    dirX = 1;
  }
  spawnWave();

  return {
    update(dt, input) {
      if (input.pointerX !== null) shipX += (input.pointerX - shipX) * Math.min(1, dt * 14);
      else shipX += input.axis * 400 * dt;
      shipX = Math.max(SR, Math.min(W - SR, shipX));

      for (const s of stars) s.y = (s.y + s.s * 40 * dt) % H;

      fireIn -= dt;
      if (fireIn <= 0) {
        bullets.push({ x: shipX, y: SY - SR });
        fireIn = 0.28;
        api.sfx("shoot");
      }
      for (const b of bullets) b.y -= 620 * dt;
      while (bullets.length && bullets[0].y < 90) bullets.shift();

      // formation marches sideways and steps down at the edges
      const alive = enemies.filter((e) => e.alive);
      const march = (45 + wave * 12 + (18 - alive.length) * 3) * speed;
      let hitEdge = false;
      for (const e of alive) {
        e.x += dirX * march * dt;
        if (e.x < 10 || e.x + EW > W - 10) hitEdge = true;
      }
      if (hitEdge) {
        dirX = -dirX;
        for (const e of alive) {
          e.y += 18;
          e.x += dirX * 4;
        }
      }

      // enemy fire from a random bottom-ish invader
      if (alive.length && Math.random() < dt * (0.9 + wave * 0.3) * spawnRate) {
        const e = alive[Math.floor(Math.random() * alive.length)];
        shots.push({ x: e.x + EW / 2, y: e.y + EH });
      }
      for (const s of shots) s.y += 260 * speed * dt;
      for (let i = shots.length - 1; i >= 0; i--) if (shots[i].y > H) shots.splice(i, 1);

      // bullets vs enemies
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        const e = alive.find((e) => e.alive && b.x > e.x && b.x < e.x + EW && b.y > e.y && b.y < e.y + EH);
        if (e) {
          e.alive = false;
          bullets.splice(i, 1);
          api.addScore(1);
          api.shake(3);
          api.sfx("bonk");
          api.burst(e.x + EW / 2, e.y + EH / 2, api.cfg.colors.accent, 14, 200);
          api.burst(e.x + EW / 2, e.y + EH / 2, api.cfg.colors.fg, 6, 140);
        }
      }

      // getting hit
      invuln = Math.max(0, invuln - dt);
      const hitByShot = shots.findIndex((s) => (s.x - shipX) ** 2 + (s.y - SY) ** 2 < (SR + 3) ** 2);
      const invaded = alive.some((e) => e.alive && (e.y + EH >= SY - SR || circleRect(shipX, SY, SR, e.x, e.y, EW, EH)));
      if (invaded) {
        api.sfx("hit");
        return api.end(shipX, SY);
      }
      if (hitByShot >= 0 && invuln === 0) {
        shots.splice(hitByShot, 1);
        lives--;
        invuln = 1.2;
        api.shake(12);
        api.sfx("hit");
        api.burst(shipX, SY, api.cfg.colors.fg, 14, 200);
        if (lives <= 0) return api.end(shipX, SY);
      }

      if (enemies.every((e) => !e.alive)) {
        wave++;
        api.addScore(5); // wave bonus
        api.sfx("start");
        api.pop(W / 2, H / 2, `WAVE ${wave + 1} · +5`, api.cfg.colors.accent);
        spawnWave();
      }
    },
    draw(g) {
      const { fg, accent } = api.cfg.colors;
      g.fillStyle = fg;
      for (const s of stars) g.fillRect(s.x, s.y, s.s, s.s);
      for (const e of enemies) {
        if (!e.alive) continue;
        // chunky invader: body, eyes, legs
        g.fillStyle = fg;
        g.fillRect(e.x + 4, e.y, EW - 8, EH - 8);
        g.fillRect(e.x, e.y + 6, EW, 8);
        g.fillRect(e.x + 2, e.y + EH - 8, 6, 8);
        g.fillRect(e.x + EW - 8, e.y + EH - 8, 6, 8);
        g.fillStyle = accent;
        g.fillRect(e.x + 9, e.y + 5, 5, 5);
        g.fillRect(e.x + EW - 14, e.y + 5, 5, 5);
      }
      if (enemies.some((e) => e.alive)) {
        const first = enemies.find((e) => e.alive)!;
        api.label(g, api.cfg.obstacleLabel.toUpperCase(), first.x + EW / 2, first.y - 10, 11);
      }
      g.fillStyle = accent;
      for (const b of bullets) g.fillRect(b.x - 2, b.y - 10, 4, 12);
      g.fillStyle = fg;
      for (const s of shots) g.fillRect(s.x - 3, s.y - 6, 6, 12);
      if (invuln === 0 || Math.floor(invuln * 10) % 2 === 0) {
        // thruster flame + the face as the ship
        g.fillStyle = accent;
        g.beginPath();
        g.moveTo(shipX - 10, SY + SR - 4);
        g.lineTo(shipX + 10, SY + SR - 4);
        g.lineTo(shipX, SY + SR + 14 + Math.random() * 6);
        g.fill();
        api.drawHero(g, shipX, SY, SR);
      }
      api.label(g, "♥".repeat(Math.max(0, lives)), W - 50, 30, 22, accent);
    },
  };
};
