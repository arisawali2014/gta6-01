// Drawing the world: the camera follows the player through Vice Harbor and paints
// what it sees — water and sand, roads and crosswalks, pastel blocks with shadowed
// buildings, palms, traffic, crowds, the player, and the light of the story's
// markers. Everything is flat canvas shapes in the warm palette; nothing here
// changes the game, it only reads it. HUD and menus live in hud.js.
import { CAR, CITY, PALETTE, VIEW, WORLD } from './config.js';
import { createRandom, clamp } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

/** Move the camera toward the player, looking a little way ahead of their motion. */
export function updateCamera(game, dt) {
  const cam = game.camera;
  const player = game.player;
  const px = player.car ? player.car.x : player.x;
  const py = player.car ? player.car.y : player.y;
  const lead = 0.38;
  const tx = px + player.vx * lead;
  const ty = py + player.vy * lead;
  const blend = Math.min(1, 5.2 * dt);
  cam.x += (tx - cam.x) * blend;
  cam.y += (ty - cam.y) * blend;
  cam.x = clamp(cam.x, VIEW.width / 2 - 40, WORLD.width - VIEW.width / 2 + 430);
  cam.y = clamp(cam.y, VIEW.height / 2 - 30, WORLD.height - VIEW.height / 2 + 30);
}

/** A hex colour scaled toward black (f<1) or left alone: cheap shading for roofs and walls. */
function shade(hex, f) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align = 'left', weight = '') {
    const key = `${size}${weight}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${'system-ui, sans-serif'}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function visible(game, pad) {
    return {
      x0: game.camera.x - VIEW.width / 2 - pad,
      y0: game.camera.y - VIEW.height / 2 - pad,
      x1: game.camera.x + VIEW.width / 2 + pad,
      y1: game.camera.y + VIEW.height / 2 + pad,
    };
  }

  function drawGround(game, v) {
    const { city } = game;
    // Sea first: it is also everything past the world's east edge.
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(CITY.waterX, v.y0, v.x1 - CITY.waterX, v.y1 - v.y0);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = Math.floor(v.y0 / 90) * 90; y < v.y1; y += 90) {
      const off = Math.sin(game.time * 0.7 + y * 0.05) * 14;
      ctx.moveTo(CITY.waterX + 30 + off, y);
      ctx.lineTo(Math.min(v.x1, CITY.waterX + 190 + off), y);
    }
    ctx.stroke();
    // Sand, then the land's warm base.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(CITY.sandX, v.y0, CITY.waterX - CITY.sandX, v.y1 - v.y0);
    ctx.fillStyle = PALETTE.sandWet;
    ctx.fillRect(CITY.waterX - 26, v.y0, 26, v.y1 - v.y0);
    ctx.fillStyle = '#a79b7d';
    ctx.fillRect(v.x0, v.y0, CITY.sandX - v.x0, v.y1 - v.y0);

    // Blocks: sidewalk rim, then the interior ground.
    for (const block of city.blocks) {
      if (block.x > v.x1 || block.x + block.w < v.x0 || block.y > v.y1 || block.y + block.h < v.y0) continue;
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(block.x, block.y, block.w, block.h);
      ctx.fillStyle = block === city.plazaBlock ? '#c4b393' : PALETTE.blockGround;
      const s = CITY.sidewalk;
      ctx.fillRect(block.x + s, block.y + s, block.w - s * 2, block.h - s * 2);
    }

    // Roads, with edge lines, dashed centres and crosswalks at the junctions.
    ctx.fillStyle = PALETTE.asphalt;
    for (const road of city.vRoads) ctx.fillRect(road.x - road.half, v.y0, road.half * 2, v.y1 - v.y0);
    for (const road of city.hRoads) ctx.fillRect(v.x0, road.y - road.half, CITY.promenadeX + CITY.promenadeHalf - v.x0, road.half * 2);
    ctx.strokeStyle = PALETTE.asphaltEdge;
    ctx.lineWidth = 3;
    for (const road of city.vRoads) {
      ctx.beginPath();
      ctx.moveTo(road.x - road.half, v.y0); ctx.lineTo(road.x - road.half, v.y1);
      ctx.moveTo(road.x + road.half, v.y0); ctx.lineTo(road.x + road.half, v.y1);
      ctx.stroke();
    }
    ctx.strokeStyle = PALETTE.laneMark;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 22]);
    ctx.beginPath();
    for (const road of city.vRoads) { ctx.moveTo(road.x, v.y0); ctx.lineTo(road.x, v.y1); }
    for (const road of city.hRoads) { ctx.moveTo(v.x0, road.y); ctx.lineTo(CITY.promenadeX, road.y); }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = PALETTE.crosswalk;
    for (const vr of city.vRoads) {
      for (const hr of city.hRoads) {
        if (vr.x < v.x0 - 90 || vr.x > v.x1 + 90 || hr.y < v.y0 - 90 || hr.y > v.y1 + 90) continue;
        for (let s = -3; s <= 3; s += 1) {
          ctx.fillRect(vr.x - vr.half + 6, hr.y + s * 20 - 5, 16, 10);
          ctx.fillRect(vr.x + vr.half - 22, hr.y + s * 20 - 5, 16, 10);
        }
      }
    }

    // The garage bay: a painted apron with a border, so deliveries read at a glance.
    const bay = city.landmarks.garageBay;
    ctx.fillStyle = '#8f8a7c';
    ctx.fillRect(bay.x, bay.y, bay.w, bay.h);
    ctx.strokeStyle = PALETTE.accent;
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(bay.x + 3, bay.y + 3, bay.w - 6, bay.h - 6);
    ctx.setLineDash([]);

    // The marina pier: planks over the water, and three boats tied alongside.
    ctx.fillStyle = '#9a6b46';
    ctx.fillRect(CITY.waterX, 1392, 270, 96);
    ctx.strokeStyle = 'rgba(60,35,15,0.5)';
    ctx.lineWidth = 2;
    for (let x = CITY.waterX + 22; x < CITY.waterX + 270; x += 22) {
      ctx.beginPath(); ctx.moveTo(x, 1392); ctx.lineTo(x, 1488); ctx.stroke();
    }
    drawBoat(CITY.waterX + 60, 1330, '#f4f6f8');
    drawBoat(CITY.waterX + 170, 1520, '#06d6a0');
    drawBoat(CITY.waterX + 250, 1345, '#ffd166');
  }

  function drawBoat(x, y, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(x + 5, y + 6, 44, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(x, y, 44, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e9e2cf';
    ctx.fillRect(x - 14, y - 6, 26, 12);
  }

  function drawBuildings(game, v) {
    for (const b of game.city.buildings) {
      if (b.x > v.x1 || b.x + b.w < v.x0 || b.y > v.y1 || b.y + b.h < v.y0) continue;
      ctx.fillStyle = 'rgba(40,25,10,0.20)';
      ctx.fillRect(b.x + 9, b.y + 13, b.w, b.h);
      ctx.fillStyle = shade(b.wall, 0.82);
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      // Roof furniture, placed by the building's own seed: air-con boxes, a skylight.
      const rng = createRandom(b.seed);
      const boxes = 1 + Math.floor(rng() * 3);
      ctx.fillStyle = 'rgba(70,72,78,0.55)';
      for (let index = 0; index < boxes; index += 1) {
        const bw = 14 + rng() * 16;
        ctx.fillRect(b.x + 12 + rng() * Math.max(1, b.w - 24 - bw), b.y + 12 + rng() * Math.max(1, b.h - 24 - bw), bw, bw * 0.7);
      }
      if (b.kind === 'garage') {
        text("VEGA'S GARAGE", b.x + b.w / 2, b.y + b.h / 2 + 11, 30, '#fdf6e3', 'center', '700');
      } else if (b.kind === 'club') {
        ctx.fillStyle = 'rgba(24,153,176,0.75)';
        ctx.fillRect(b.x + b.w * 0.55, b.y + b.h * 0.5, b.w * 0.34, b.h * 0.36);
      }
    }
  }

  function drawNature(game, v) {
    for (const lamp of game.city.lamps) {
      if (lamp.x < v.x0 || lamp.x > v.x1 || lamp.y < v.y0 || lamp.y > v.y1) continue;
      ctx.fillStyle = '#5a5148';
      ctx.fillRect(lamp.x - 2, lamp.y - 2, 4, 4);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(lamp.x - 1, lamp.y - 1, 2, 2);
    }
    for (const palm of game.city.palms) {
      if (palm.x < v.x0 - 40 || palm.x > v.x1 + 40 || palm.y < v.y0 - 40 || palm.y > v.y1 + 40) continue;
      const s = palm.s;
      ctx.fillStyle = 'rgba(40,25,10,0.18)';
      ctx.beginPath(); ctx.ellipse(palm.x + 7, palm.y + 9, 15 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2e7d4f';
      ctx.lineWidth = 3.4 * s;
      ctx.beginPath();
      for (let frond = 0; frond < 6; frond += 1) {
        const a = (frond / 6) * Math.PI * 2 + palm.x * 0.01;
        ctx.moveTo(palm.x, palm.y);
        ctx.quadraticCurveTo(
          palm.x + Math.cos(a) * 13 * s, palm.y + Math.sin(a) * 13 * s - 3,
          palm.x + Math.cos(a) * 21 * s, palm.y + Math.sin(a) * 21 * s + 4,
        );
      }
      ctx.stroke();
      ctx.fillStyle = '#7a5230';
      ctx.beginPath(); ctx.arc(palm.x, palm.y, 3.4 * s, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawMarkers(game) {
    const m = game.missions;
    const pulse = 0.72 + Math.sin(game.time * 4) * 0.28;
    // The waypoint beacon: a column of light the player can steer by.
    if (m.waypoint && game.screen === 'play') {
      const { x, y } = m.waypoint;
      ctx.fillStyle = `rgba(255, 209, 102, ${0.16 * pulse})`;
      ctx.fillRect(x - 13, y - 560, 26, 560);
      ctx.strokeStyle = `rgba(255, 209, 102, ${0.9 * pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 26 + Math.sin(game.time * 4) * 4, 0, Math.PI * 2); ctx.stroke();
    }
    // The coupe Marisol wants wears a ring until it is delivered.
    if (m.stage === 'steal' || m.stage === 'deliver') {
      const car = game.cars.find((c) => c.id === m.targetCarId);
      if (car) {
        ctx.strokeStyle = `rgba(0, 229, 199, ${0.85 * pulse})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(car.x, car.y, 42, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // Packages glow where they wait.
    if (m.stage === 'collect') {
      for (const pack of m.packages) {
        if (pack.taken) continue;
        const bob = Math.sin(game.time * 3 + pack.x) * 3;
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(pack.x - 10, pack.y - 10 + bob, 20, 20);
        ctx.strokeStyle = '#7a4b12';
        ctx.lineWidth = 2;
        ctx.strokeRect(pack.x - 10, pack.y - 10 + bob, 20, 20);
        ctx.strokeStyle = `rgba(255, 209, 102, ${0.7 * pulse})`;
        ctx.beginPath(); ctx.arc(pack.x, pack.y, 30, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // The marina holdout circle.
    if (m.stage === 'escape' || m.stage === 'holdout') {
      const zone = game.city.landmarks.marina;
      ctx.fillStyle = `rgba(6, 214, 160, ${0.10 * pulse})`;
      ctx.beginPath(); ctx.arc(zone.x, zone.y, 130, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(6, 214, 160, ${0.9 * pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(zone.x, zone.y, 130, 0, Math.PI * 2); ctx.stroke();
    }
    // Ammunition pickups: a green crate with a cross.
    for (const pickup of game.pickups) {
      if (pickup.taken) continue;
      const bob = Math.sin(game.time * 2.4 + pickup.x * 0.1) * 2;
      ctx.fillStyle = '#386641';
      ctx.fillRect(pickup.x - 11, pickup.y - 11 + bob, 22, 22);
      ctx.fillStyle = '#f4f6f8';
      ctx.fillRect(pickup.x - 2, pickup.y - 7 + bob, 4, 14);
      ctx.fillRect(pickup.x - 7, pickup.y - 2 + bob, 14, 4);
    }
  }

  function drawCar(game, car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(30,20,10,0.25)';
    rrect(-CAR.length / 2 + 3, -CAR.width / 2 + 5, CAR.length, CAR.width, 7);
    ctx.fill();
    // Wheels.
    ctx.fillStyle = '#15181c';
    const wx = CAR.length / 2 - 11;
    const wy = CAR.width / 2 - 2;
    ctx.fillRect(-wx - 5, -wy - 2, 11, 5);
    ctx.fillRect(wx - 6, -wy - 2, 11, 5);
    ctx.fillRect(-wx - 5, wy - 3, 11, 5);
    ctx.fillRect(wx - 6, wy - 3, 11, 5);
    // Body and glass.
    ctx.fillStyle = car.color;
    rrect(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(18,28,38,0.85)';
    rrect(2, -CAR.width / 2 + 4, 11, CAR.width - 8, 3); // Windshield.
    ctx.fill();
    rrect(-15, -CAR.width / 2 + 4, 7, CAR.width - 8, 3); // Rear window.
    ctx.fill();
    if (car.kind === 'police') {
      ctx.fillStyle = '#212529';
      ctx.fillRect(-CAR.length / 2, -CAR.width / 2, 13, CAR.width);
      ctx.fillRect(11, -CAR.width / 2, 9, CAR.width);
      const phase = Math.floor(game.time * 2.4 + car.id) % 2;
      ctx.fillStyle = phase ? '#ff2e4d' : '#5e2b33';
      ctx.fillRect(-5, -CAR.width / 2 + 2, 9, 9);
      ctx.fillStyle = phase ? '#274b73' : '#2e9bff';
      ctx.fillRect(-5, CAR.width / 2 - 11, 9, 9);
    } else if (car.kind === 'taxi') {
      ctx.fillStyle = '#fdf6e3';
      ctx.fillRect(-6, -5, 12, 10);
      ctx.fillStyle = '#212529';
      ctx.fillRect(-3, -2, 6, 4);
      ctx.fillStyle = car.color;
      rrect(-13, -CAR.width / 2 + 6, 15, CAR.width - 12, 3);
      ctx.fill();
    } else if (car.kind === 'coupe') {
      ctx.fillStyle = shade(car.color, 0.72);
      rrect(-12, -CAR.width / 2 + 5, 14, CAR.width - 10, 3);
      ctx.fill();
      ctx.fillStyle = '#212529';
      ctx.fillRect(-CAR.length / 2 + 1, -CAR.width / 2 + 2, 4, CAR.width - 4); // Spoiler.
    } else if (car.kind === 'van') {
      ctx.fillStyle = shade(car.color, 0.9);
      rrect(-CAR.length / 2 + 3, -CAR.width / 2 + 3, CAR.length - 16, CAR.width - 6, 3);
      ctx.fill();
    } else {
      ctx.fillStyle = shade(car.color, 0.88);
      rrect(-12, -CAR.width / 2 + 5, 15, CAR.width - 10, 3);
      ctx.fill();
    }
    // Headlights.
    ctx.fillStyle = '#fff6c9';
    ctx.fillRect(CAR.length / 2 - 2, -CAR.width / 2 + 3, 3, 5);
    ctx.fillRect(CAR.length / 2 - 2, CAR.width / 2 - 8, 3, 5);
    ctx.restore();

    if (car.health < 38) {
      const wobble = Math.sin(game.time * 6 + car.id * 2) * 3;
      ctx.fillStyle = 'rgba(60,60,60,0.35)';
      ctx.beginPath(); ctx.arc(car.x + wobble, car.y - 14, 8 + (38 - car.health) * 0.14, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawPed(game, ped) {
    ctx.fillStyle = 'rgba(30,20,10,0.22)';
    ctx.beginPath(); ctx.ellipse(ped.x + 2, ped.y + 4, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
    if (ped.state === 'down') {
      ctx.save();
      ctx.translate(ped.x, ped.y);
      ctx.rotate(ped.angle + 0.5);
      ctx.fillStyle = ped.shirt;
      ctx.beginPath(); ctx.ellipse(0, 0, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ped.skin;
      ctx.beginPath(); ctx.arc(15, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    const bob = ped.state === 'flee' ? Math.sin(game.time * 16 + ped.phase) * 1.6 : Math.sin(game.time * 9 + ped.phase) * 1.1;
    ctx.fillStyle = ped.shirt;
    ctx.beginPath(); ctx.arc(ped.x, ped.y + bob * 0.3, 8.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(ped.x, ped.y - 2 + bob * 0.3, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(ped.x, ped.y);
    ctx.lineTo(ped.x + Math.cos(ped.angle) * 10, ped.y + Math.sin(ped.angle) * 10);
    ctx.stroke();
  }

  function drawPlayer(game) {
    const player = game.player;
    if (player.car) return;
    ctx.fillStyle = 'rgba(30,20,10,0.25)';
    ctx.beginPath(); ctx.ellipse(player.x + 2, player.y + 5, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    const bob = Math.sin(player.walkPhase) * 1.4;
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath(); ctx.arc(player.x, player.y + bob * 0.3, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = PALETTE.playerSkin;
    ctx.beginPath(); ctx.arc(player.x, player.y - 2 + bob * 0.3, 5.6, 0, Math.PI * 2); ctx.fill();
    if (player.weapon === 'pistol') {
      ctx.strokeStyle = '#212529';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(player.x + Math.cos(player.angle) * 17, player.y + Math.sin(player.angle) * 17);
      ctx.stroke();
    }
  }

  function drawEffects(game) {
    const effects = game.effects;
    for (const p of effects.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const tracer of effects.tracers) {
      ctx.globalAlpha = Math.max(0, tracer.life / tracer.maxLife) * 0.9;
      ctx.strokeStyle = '#ffe66d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tracer.x1, tracer.y1);
      ctx.lineTo(tracer.x2, tracer.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const flash of effects.flashes) {
      ctx.save();
      ctx.translate(flash.x, flash.y);
      ctx.rotate(flash.angle);
      ctx.globalAlpha = Math.max(0, flash.life / flash.maxLife);
      ctx.fillStyle = '#ffd60a';
      ctx.beginPath();
      for (let spike = 0; spike < 6; spike += 1) {
        const a = (spike / 6) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * 15, Math.sin(a) * 15);
        const b = a + Math.PI / 6;
        ctx.lineTo(Math.cos(b) * 6, Math.sin(b) * 6);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** Paint one frame of the world (HUD and menus are hud.js, in view space). */
  function draw(game) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = game.shake > 0.1 ? (Math.random() - 0.5) * game.shake : 0;
    const shakeY = game.shake > 0.1 ? (Math.random() - 0.5) * game.shake : 0;
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    ctx.translate(VIEW.width / 2 - game.camera.x + shakeX, VIEW.height / 2 - game.camera.y + shakeY);
    const v = visible(game, 90);
    drawGround(game, v);
    drawBuildings(game, v);
    drawNature(game, v);
    drawMarkers(game);
    for (const car of game.cars) {
      if (car.x < v.x0 - 60 || car.x > v.x1 + 60 || car.y < v.y0 - 60 || car.y > v.y1 + 60) continue;
      drawCar(game, car);
    }
    for (const ped of game.peds) {
      if (ped.x < v.x0 || ped.x > v.x1 || ped.y < v.y0 || ped.y > v.y1) continue;
      drawPed(game, ped);
    }
    drawPlayer(game);
    drawEffects(game);
    // Warm sunlight wash over the world.
    ctx.fillStyle = 'rgba(255, 166, 66, 0.055)';
    ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, view };
}
