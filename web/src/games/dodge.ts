import { H, W, type GameFactory } from "./engine";

// Move left/right (keys, drag, tilt or on-screen buttons). Catch good items, dodge bad ones. 3 lives.
export const dodge: GameFactory = (api) => {
  const { speed, spawnRate } = api.cfg.difficulty;
  const { fg, accent } = api.cfg.colors;
  const R = 30;
  const Y = H - 70;
  const MOVE = 460;

  const hero = { x: W / 2, lean: 0 };
  const items: { x: number; y: number; vy: number; good: boolean; r: number; rot: number }[] = [];
  let lives = 3;
  let t = 0;
  let spawnIn = 0.6;
  let hurtFlash = 0;
  let combo = 0;

  return {
    update(dt, input) {
      t += dt;
      const before = hero.x;
      if (input.pointerX !== null) hero.x += (input.pointerX - hero.x) * Math.min(1, dt * 14);
      else hero.x += input.axis * MOVE * dt;
      hero.x = Math.max(R, Math.min(W - R, hero.x));
      hero.lean += ((hero.x - before) / Math.max(dt, 0.001) / 1500 - hero.lean) * Math.min(1, dt * 10);

      spawnIn -= dt;
      if (spawnIn <= 0) {
        const good = Math.random() < 0.62;
        items.push({ x: api.rand(24, W - 24), y: -30, vy: (190 + t * 6) * speed * api.rand(0.85, 1.25), good, r: good ? 18 : 22, rot: 0 });
        spawnIn = api.rand(0.35, 0.8) / spawnRate / Math.min(2, 1 + t / 45);
      }

      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.y += it.vy * dt;
        it.rot += dt * (it.good ? 2 : -3);
        if ((it.x - hero.x) ** 2 + (it.y - Y) ** 2 < (it.r + R - 4) ** 2) {
          items.splice(i, 1);
          if (it.good) {
            combo++;
            const pts = combo >= 5 ? 2 : 1;
            api.addScore(pts);
            api.shake(2);
            api.sfx("score");
            api.burst(it.x, it.y, accent, 10, 160);
            api.pop(it.x, it.y - 20, pts > 1 ? `+${pts} COMBO` : "+1", accent);
          } else {
            combo = 0;
            lives--;
            hurtFlash = 0.25;
            api.shake(10);
            api.sfx("hit");
            api.burst(it.x, it.y, fg, 16, 220);
            if (lives <= 0) api.end(hero.x, Y);
          }
        } else if (it.y > H + 40) {
          if (it.good) combo = 0; // missed one
          items.splice(i, 1);
        }
      }
      hurtFlash = Math.max(0, hurtFlash - dt);
    },
    draw(g) {
      for (const it of items) {
        g.save();
        g.translate(it.x, it.y);
        g.rotate(it.rot);
        if (it.good) {
          g.shadowColor = accent;
          g.shadowBlur = 12;
          g.fillStyle = accent;
          g.beginPath();
          g.arc(0, 0, it.r, 0, Math.PI * 2);
          g.fill();
          g.shadowBlur = 0;
          g.fillStyle = "rgba(255,255,255,0.5)";
          g.beginPath();
          g.arc(-it.r / 3, -it.r / 3, it.r / 3, 0, Math.PI * 2);
          g.fill();
        } else {
          api.rrect(g, -it.r, -it.r, it.r * 2, it.r * 2, 6, fg, accent);
          g.strokeStyle = accent;
          g.lineWidth = 4;
          g.lineCap = "round";
          g.beginPath();
          g.moveTo(-it.r / 2.2, -it.r / 2.2);
          g.lineTo(it.r / 2.2, it.r / 2.2);
          g.moveTo(it.r / 2.2, -it.r / 2.2);
          g.lineTo(-it.r / 2.2, it.r / 2.2);
          g.stroke();
        }
        g.restore();
        api.label(g, (it.good ? api.cfg.goodItemLabel : api.cfg.obstacleLabel).toUpperCase(), it.x, it.y - it.r - 10, 11);
      }
      // ground shadow + hero leaning into movement
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.beginPath();
      g.ellipse(hero.x, Y + R + 6, R, 7, 0, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(hero.x, Y);
      g.rotate(Math.max(-0.35, Math.min(0.35, hero.lean)));
      api.drawHero(g, 0, 0, R);
      g.restore();
      api.hearts(g, W - 14, 29, Math.max(0, lives));
      if (combo >= 3) api.label(g, `COMBO x${combo}`, W / 2, 118, 14, accent);
      if (hurtFlash > 0) {
        g.fillStyle = `rgba(255,0,0,${hurtFlash})`;
        g.fillRect(0, 0, W, H);
      }
    },
  };
};
