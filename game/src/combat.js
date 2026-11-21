// Fighting: fists for close work, a hitscan pistol for everything else, and the
// particle-and-tracer language every impact in the game speaks. Shots are loud —
// they stamp game.lastShot, which frightens the crowds, and they are crimes, which
// the police hear about. Ammunition comes from pickups left around the city.
import { CAR, WEAPON } from './config.js';
import { reportCrime } from './police.js';
import { dist2 } from './random.js';

export function createEffects() {
  return { tracers: [], flashes: [], particles: [] };
}

/** Ammunition boxes at fixed spots: the garage apron, the pier, the plaza, the avenues. */
export function createPickups(city) {
  const spots = [
    { x: city.landmarks.garagePoint.x, y: 1245 },
    { x: city.landmarks.pierEnd.x, y: city.landmarks.pierEnd.y },
    { x: 2304, y: 576 },
    { x: 864, y: 470 },
    { x: 3568, y: 2050 },
    { x: 2016, y: 2500 },
  ];
  return spots.map((spot) => ({ x: spot.x, y: spot.y, taken: false, respawn: 0 }));
}

/** A burst of sparks, dust or spray: the universal impact effect. */
export function spawnParticles(game, x, y, options) {
  const particles = game.effects.particles;
  const count = options.count ?? 8;
  for (let index = 0; index < count; index += 1) {
    if (particles.length > 420) return;
    const angle = game.rng() * Math.PI * 2;
    const speed = (options.speed ?? 190) * (0.3 + game.rng() * 0.9);
    const life = (options.life ?? 0.55) * (0.5 + game.rng() * 0.8);
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life, maxLife: life,
      size: (options.size ?? 3) * (0.6 + game.rng() * 0.8),
      color: Array.isArray(options.color) ? options.color[index % options.color.length] : options.color,
      grav: options.grav ?? 0,
      drag: options.drag ?? 2.4,
    });
  }
}

function pointInBuilding(game, x, y) {
  for (const b of game.city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

/** Fire the pistol from the player toward (aimX, aimY): the first thing the ray meets. */
function firePistol(game, aimX, aimY) {
  const player = game.player;
  player.ammo -= 1;
  const base = Math.atan2(aimY - player.y, aimX - player.x);
  const angle = base + (game.rng() - 0.5) * 2 * WEAPON.spread;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  player.angle = base;

  // March the ray in short steps, testing people and cars by their distance to it.
  let hitT = WEAPON.range;
  let hitPed = null;
  let hitCar = null;
  for (const ped of game.peds) {
    if (ped.state === 'down') continue;
    const rx = ped.x - player.x;
    const ry = ped.y - player.y;
    const along = rx * dx + ry * dy;
    if (along < 0 || along > hitT) continue;
    const side = Math.abs(rx * -dy + ry * dx);
    if (side < 17) { hitT = along; hitPed = ped; hitCar = null; }
  }
  for (const car of game.cars) {
    if (car === player.car) continue;
    const rx = car.x - player.x;
    const ry = car.y - player.y;
    const along = rx * dx + ry * dy;
    if (along < 0 || along > hitT) continue;
    const side = Math.abs(rx * -dy + ry * dx);
    if (side < CAR.radius + 5) { hitT = along; hitCar = car; hitPed = null; }
  }
  // Buildings stop the ray where the march reaches one.
  for (let t = 12; t < hitT; t += 9) {
    if (pointInBuilding(game, player.x + dx * t, player.y + dy * t)) { hitT = t; hitPed = null; hitCar = null; break; }
  }

  const endX = player.x + dx * hitT;
  const endY = player.y + dy * hitT;
  game.effects.tracers.push({ x1: player.x + dx * 20, y1: player.y + dy * 20, x2: endX, y2: endY, life: 0.07, maxLife: 0.07 });
  game.effects.flashes.push({ x: player.x + dx * 22, y: player.y + dy * 22, angle, life: 0.055, maxLife: 0.055 });
  game.lastShot = { x: player.x, y: player.y, at: game.time };
  game.shake = Math.min(14, game.shake + 1.6);
  reportCrime(game, 'shot');
  game.events.push({ type: 'shot' });

  if (hitPed) {
    hitPed.state = 'down';
    hitPed.downFor = 7;
    reportCrime(game, 'hitPed');
    spawnParticles(game, endX, endY, { count: 7, color: ['#ffd166', '#f4f1de'], speed: 150, size: 2.6 });
  } else if (hitCar) {
    hitCar.health -= 16;
    if (hitCar.kind === 'police') reportCrime(game, 'hitCop');
    spawnParticles(game, endX, endY, { count: 9, color: ['#ffd60a', '#ffffff', '#ffb703'], speed: 260, size: 2.6 });
    game.events.push({ type: 'carShot', car: hitCar });
  } else {
    spawnParticles(game, endX, endY, { count: 4, color: ['#e9e2cf'], speed: 110, size: 2.2 });
  }
}

/** A swing of the fists toward (aimX, aimY): whoever is close and in front goes down. */
function swingFists(game, aimX, aimY) {
  const player = game.player;
  const base = Math.atan2(aimY - player.y, aimX - player.x);
  player.angle = base;
  game.events.push({ type: 'melee' });
  for (const ped of game.peds) {
    if (ped.state === 'down') continue;
    if (dist2(player.x, player.y, ped.x, ped.y) > WEAPON.meleeRange * WEAPON.meleeRange) continue;
    const to = Math.atan2(ped.y - player.y, ped.x - player.x);
    if (Math.abs(((to - base + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 1.0) {
      ped.state = 'down';
      ped.downFor = 5;
      reportCrime(game, 'hitPed');
      spawnParticles(game, ped.x, ped.y, { count: 5, color: ['#ffd166'], speed: 130, size: 2.4 });
    }
  }
}

/**
 * Advance combat one step: decay the effects, respawn and collect the pickups, and
 * turn the player's attack input into a swing or a shot. `ctl.attack` with the aim
 * point is the whole interface, for the keyboard and the screenshot scripts alike.
 */
export function updateCombat(game, ctl, dt) {
  const effects = game.effects;
  for (const list of [effects.tracers, effects.flashes]) {
    for (let index = list.length - 1; index >= 0; index -= 1) {
      list[index].life -= dt;
      if (list[index].life <= 0) list.splice(index, 1);
    }
  }
  for (let index = effects.particles.length - 1; index >= 0; index -= 1) {
    const p = effects.particles[index];
    p.life -= dt;
    if (p.life <= 0) { effects.particles.splice(index, 1); continue; }
    p.vy += (p.grav ?? 0) * dt;
    p.vx -= p.vx * (p.drag ?? 0) * dt;
    p.vy -= p.vy * (p.drag ?? 0) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  for (const pickup of game.pickups) {
    if (pickup.taken) {
      pickup.respawn -= dt;
      if (pickup.respawn <= 0) pickup.taken = false;
      continue;
    }
    const p = game.player;
    const px = p.car ? p.car.x : p.x;
    const py = p.car ? p.car.y : p.y;
    if (dist2(px, py, pickup.x, pickup.y) < 34 * 34) {
      pickup.taken = true;
      pickup.respawn = 30;
      p.ammo += WEAPON.pickupAmmo;
      game.events.push({ type: 'pickup', x: pickup.x, y: pickup.y });
    }
  }

  game.combat.cooldown -= dt;
  const player = game.player;
  if (!ctl.attack || player.car || game.combat.cooldown > 0) return;
  if (player.weapon === 'pistol' && player.ammo > 0) {
    game.combat.cooldown = WEAPON.cooldown;
    firePistol(game, ctl.aimX, ctl.aimY);
  } else {
    game.combat.cooldown = WEAPON.meleeCooldown;
    swingFists(game, ctl.aimX, ctl.aimY);
    if (player.weapon === 'pistol' && player.ammo <= 0) game.events.push({ type: 'dryFire' });
  }
}

export function createCombat() {
  return { cooldown: 0 };
}
