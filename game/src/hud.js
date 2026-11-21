// Everything drawn over the world: the health bar and cash, the wanted stars, the
// weapon readout, the current objective and Marisol's dialogue banner, the BUSTED
// meter, the interact prompt, the off-screen waypoint arrow — and the minimap, a
// little chart of the whole harbor with the player, the police and the mission
// marker on it. The full-screen panels (title, pause, busted, wasted) live here
// too. Like render.js, this module only reads the game.
import { PALETTE, VIEW, WORLD } from './config.js';
import { currentDialogue } from './missions.js';
import { SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_TITLE, SCREEN_WASTED } from './render.js';

const MAP_W = 208;
const MAP_H = 144;
const MAP_SCALE = MAP_W / WORLD.width;

function wrapText(ctx, value, maxWidth) {
  const words = value.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export function createHud(canvas) {
  const ctx = canvas.getContext('2d');

  function setFont(size, weight = '') {
    ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  }

  function panel(x, y, w, h, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
  }

  function bar(x, y, w, h, fraction, color, back = 'rgba(10,12,16,0.55)') {
    ctx.fillStyle = back;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.max(0, w * Math.min(1, fraction)), h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  }

  function drawMinimap(game) {
    const x0 = 14;
    const y0 = VIEW.height - MAP_H - 14;
    panel(x0 - 4, y0 - 4, MAP_W + 8, MAP_H + 8, 'rgba(8,12,18,0.62)');
    const { city } = game;
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(x0, y0, MAP_W, MAP_H);
    ctx.fillStyle = '#b6a888';
    ctx.fillRect(x0, y0, city.landmarks.marina.x * MAP_SCALE, MAP_H);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(x0 + 3623 * MAP_SCALE, y0, (3880 - 3623) * MAP_SCALE, MAP_H);
    ctx.strokeStyle = 'rgba(240,240,240,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const road of city.vRoads) {
      ctx.moveTo(x0 + road.x * MAP_SCALE, y0);
      ctx.lineTo(x0 + road.x * MAP_SCALE, y0 + MAP_H);
    }
    for (const road of city.hRoads) {
      ctx.moveTo(x0, y0 + road.y * MAP_SCALE);
      ctx.lineTo(x0 + 3568 * MAP_SCALE, y0 + road.y * MAP_SCALE);
    }
    ctx.stroke();
    const toMap = (wx, wy) => [x0 + wx * MAP_SCALE, y0 + wy * MAP_SCALE];
    // Mission marker first, so the player arrow lands on top.
    const m = game.missions;
    if (m.waypoint) {
      const [mx, my] = toMap(m.waypoint.x, m.waypoint.y);
      ctx.fillStyle = PALETTE.accent;
      ctx.beginPath(); ctx.arc(mx, my, 4.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,209,102,0.8)';
      ctx.beginPath(); ctx.arc(mx, my, 7 + Math.sin(game.time * 4) * 1.6, 0, Math.PI * 2); ctx.stroke();
    }
    if (m.stage === 'collect') {
      ctx.fillStyle = '#ffe66d';
      for (const pack of m.packages) {
        if (pack.taken) continue;
        const [px, py] = toMap(pack.x, pack.y);
        ctx.fillRect(px - 2.4, py - 2.4, 4.8, 4.8);
      }
    }
    ctx.fillStyle = '#ff2e4d';
    for (const cop of game.cops) {
      const [cx, cy] = toMap(cop.x, cop.y);
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    }
    const player = game.player;
    const [px, py] = toMap(player.car ? player.car.x : player.x, player.car ? player.car.y : player.y);
    const heading = player.car ? player.car.angle : player.angle;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(6.4, 0);
    ctx.lineTo(-4.4, -4);
    ctx.lineTo(-4.4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    setFont(9, '700');
    ctx.textAlign = 'left';
    ctx.fillText('VICE HARBOR', x0 + 2, y0 - 8);
  }

  function drawWaypointArrow(game) {
    const wp = game.missions.waypoint;
    if (!wp) return;
    const sx = wp.x - game.camera.x + VIEW.width / 2;
    const sy = wp.y - game.camera.y + VIEW.height / 2;
    const margin = 54;
    if (sx > margin && sx < VIEW.width - margin && sy > margin && sy < VIEW.height - margin) return;
    const cx = VIEW.width / 2;
    const cy = VIEW.height / 2;
    const angle = Math.atan2(sy - cy, sx - cx);
    const ax = Math.min(Math.max(sx, margin), VIEW.width - margin);
    const ay = Math.min(Math.max(sy, margin), VIEW.height - margin);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.fillStyle = PALETTE.accent;
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(-8, -8);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const dist = Math.hypot(wp.x - game.player.x, wp.y - game.player.y);
    ctx.fillStyle = '#ffffff';
    setFont(12, '700');
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(dist / 10)}m`, ax, ay + 26);
  }

  function drawHud(game) {
    const player = game.player;
    // Health and cash, top-left.
    ctx.textAlign = 'left';
    setFont(11, '700');
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('HEALTH', 16, 24);
    const healthFrac = player.health / 100;
    bar(16, 30, 168, 13, healthFrac, healthFrac > 0.3 ? '#06d6a0' : PALETTE.danger);
    setFont(21, '800');
    ctx.fillStyle = '#7bf1a8';
    ctx.fillText(`$${player.cash.toLocaleString('en-US')}`, 16, 70);

    // Wanted stars, top-right.
    const level = game.wanted.level;
    setFont(27, '800');
    ctx.textAlign = 'right';
    for (let star = 0; star < 5; star += 1) {
      ctx.fillStyle = star < level ? PALETTE.accent : 'rgba(255,255,255,0.28)';
      ctx.fillText('★', VIEW.width - 16 - (4 - star) * 30, 40);
    }

    // Objective, top-center.
    const objective = game.missions.objective;
    if (objective) {
      setFont(16, '700');
      const width = Math.min(560, ctx.measureText(objective).width + 34);
      panel(VIEW.width / 2 - width / 2, 12, width, 32, 'rgba(8,12,18,0.55)');
      ctx.fillStyle = '#ffe9a8';
      ctx.textAlign = 'center';
      ctx.fillText(objective, VIEW.width / 2, 34);
    }

    // Weapon and speed, bottom-right.
    ctx.textAlign = 'right';
    if (player.car) {
      setFont(26, '800');
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${Math.round(Math.abs(player.car.speed) * 0.32)} km/h`, VIEW.width - 16, VIEW.height - 58);
    }
    setFont(16, '700');
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    const weaponText = player.weapon === 'pistol' ? `PISTOL  ·  ${player.ammo}` : 'FISTS';
    ctx.fillText(weaponText, VIEW.width - 16, VIEW.height - 26);
    setFont(11);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('1 fists · 2 pistol', VIEW.width - 16, VIEW.height - 8);

    drawMinimap(game);
    drawWaypointArrow(game);

    // BUSTED meter, centre.
    if (game.wanted.bust > 0.02) {
      setFont(24, '800');
      ctx.fillStyle = PALETTE.danger;
      ctx.textAlign = 'center';
      ctx.fillText('BUSTED', VIEW.width / 2, VIEW.height / 2 - 66);
      bar(VIEW.width / 2 - 130, VIEW.height / 2 - 54, 260, 14, game.wanted.bust, PALETTE.danger);
    }

    // Interact prompt, low centre.
    if (game.prompt) {
      setFont(16, '700');
      const width = ctx.measureText(game.prompt).width + 30;
      panel(VIEW.width / 2 - width / 2, VIEW.height - 118, width, 30, 'rgba(8,12,18,0.6)');
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(game.prompt, VIEW.width / 2, VIEW.height - 97);
    }

    // Dialogue banner, bottom centre.
    const line = currentDialogue(game);
    if (line) {
      const width = 640;
      panel(VIEW.width / 2 - width / 2, VIEW.height - 84, width, 72, 'rgba(8,12,18,0.72)');
      setFont(13, '800');
      ctx.fillStyle = PALETTE.accent;
      ctx.textAlign = 'left';
      ctx.fillText(line.speaker.toUpperCase(), VIEW.width / 2 - width / 2 + 16, VIEW.height - 60);
      setFont(15);
      ctx.fillStyle = '#f4f1de';
      const lines = wrapText(ctx, line.text, width - 32);
      lines.slice(0, 2).forEach((textLine, index) => {
        ctx.fillText(textLine, VIEW.width / 2 - width / 2 + 16, VIEW.height - 38 + index * 19);
      });
    }

    // Story-complete toast.
    if (game.storyCompleteAt > 0 && game.time - game.storyCompleteAt < 7) {
      panel(VIEW.width / 2 - 250, 64, 500, 44, 'rgba(8,40,28,0.8)');
      setFont(17, '800');
      ctx.fillStyle = '#7bf1a8';
      ctx.textAlign = 'center';
      ctx.fillText('STORY COMPLETE — Vice Harbor is yours. Free roam!', VIEW.width / 2, 92);
    }
  }

  function dim(alpha) {
    ctx.fillStyle = `rgba(8,10,18,${alpha})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function drawTitle(game) {
    dim(0.42);
    ctx.textAlign = 'center';
    setFont(84, '900');
    ctx.fillStyle = PALETTE.accent;
    ctx.fillText('VICE', VIEW.width / 2, 168);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('HARBOR', VIEW.width / 2, 248);
    setFont(19);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText('A harbor of sun, sand and stolen cars.', VIEW.width / 2, 288);
    setFont(16);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText("Marisol Vega runs the harbor's quiet business — and she just hired you.", VIEW.width / 2, 330);
    ctx.fillText('Steal the coupe. Run the packages. Outrun the harbor.', VIEW.width / 2, 356);

    setFont(15);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    const controls = [
      'WASD / arrows — walk & drive      Shift — sprint',
      'E / F — enter & exit cars, talk      Mouse — aim, click — punch / shoot',
      '1 / 2 — fists / pistol      P / Esc — pause',
    ];
    controls.forEach((line, index) => ctx.fillText(line, VIEW.width / 2, 420 + index * 24));

    setFont(22, '800');
    ctx.fillStyle = '#7bf1a8';
    if (game.saveExists) {
      ctx.fillText('ENTER — CONTINUE', VIEW.width / 2, 540);
      setFont(15, '700');
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText('N — new game', VIEW.width / 2, 570);
    } else {
      ctx.fillText('ENTER — START', VIEW.width / 2, 540);
    }
  }

  function drawCenterPanel(game) {
    if (game.screen === SCREEN_PAUSED) {
      dim(0.5);
      ctx.textAlign = 'center';
      setFont(52, '900');
      ctx.fillStyle = '#ffffff';
      ctx.fillText('PAUSED', VIEW.width / 2, VIEW.height / 2);
      setFont(16);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText('P / Esc — resume', VIEW.width / 2, VIEW.height / 2 + 36);
    } else if (game.screen === SCREEN_BUSTED) {
      ctx.fillStyle = 'rgba(120,10,30,0.45)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.textAlign = 'center';
      setFont(72, '900');
      ctx.fillStyle = PALETTE.danger;
      ctx.fillText('BUSTED', VIEW.width / 2, VIEW.height / 2 - 10);
      setFont(17);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`The harbor police take $${game.lastFine} for their trouble.`, VIEW.width / 2, VIEW.height / 2 + 30);
      ctx.fillText('ENTER — back on the street', VIEW.width / 2, VIEW.height / 2 + 62);
    } else if (game.screen === SCREEN_WASTED) {
      ctx.fillStyle = 'rgba(40,4,8,0.62)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.textAlign = 'center';
      setFont(72, '900');
      ctx.fillStyle = PALETTE.danger;
      ctx.fillText('WASTED', VIEW.width / 2, VIEW.height / 2 - 10);
      setFont(17);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('The harbor spits you back out by the promenade.', VIEW.width / 2, VIEW.height / 2 + 30);
      ctx.fillText('ENTER — wake up', VIEW.width / 2, VIEW.height / 2 + 62);
    }
  }

  /** Paint the whole overlay for the current screen, in view space. */
  function draw(game, view) {
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    ctx.textBaseline = 'alphabetic';
    if (game.screen === SCREEN_TITLE) {
      drawHud(game);
      drawTitle(game);
    } else {
      drawHud(game);
      drawCenterPanel(game);
    }
    // Vignette.
    const gradient = ctx.createRadialGradient(
      VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.55,
      VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.95,
    );
    gradient.addColorStop(0, 'rgba(20,10,0,0)');
    gradient.addColorStop(1, 'rgba(20,10,0,0.28)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  return { draw };
}
