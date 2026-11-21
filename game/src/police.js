// The law of Vice Harbor. Crimes add heat; heat makes stars; stars bring patrol cars
// that hunt the player across the road grid and grab them when they are close and
// slow. Stay unseen and quiet and the heat cools — that is the whole wanted system,
// and the missions lean on it as much as free play does.
import { WANTED } from './config.js';
import { createCar, placeCarOnRoad, stepCarPhysics } from './vehicles.js';
import { angleDelta, clamp, dist2 } from './random.js';

export function createWanted() {
  return { heat: 0, level: 0, sinceCrime: 99, bust: 0, seen: false, spawnTimer: 0 };
}

/** How many stars a heat total earns, 0 to 5. */
export function starsForHeat(heat) {
  let level = 0;
  for (let star = 1; star <= 5; star += 1) {
    if (heat >= WANTED.thresholds[star]) level = star;
  }
  return level;
}

/** Record one of the player's crimes: the heat rises and the clock restarts. */
export function reportCrime(game, kind) {
  const add = WANTED.crimeHeat[kind] ?? 0;
  if (add <= 0) return;
  game.wanted.heat = Math.min(WANTED.maxHeat, game.wanted.heat + add);
  game.wanted.sinceCrime = 0;
  game.wanted.level = starsForHeat(game.wanted.heat);
}

/** Force the wanted level to at least `stars` (a mission's ambush, a witnessed theft). */
export function setWantedAtLeast(game, stars) {
  const floor = WANTED.thresholds[stars] + 1;
  if (game.wanted.heat < floor) {
    game.wanted.heat = floor;
    game.wanted.sinceCrime = 0;
    game.wanted.level = starsForHeat(game.wanted.heat);
  }
}

function playerSpeed(game) {
  const player = game.player;
  if (player.car) return Math.abs(player.car.speed);
  return Math.hypot(player.vx, player.vy);
}

/** Where the player is heading, a moment ahead: what a pursuing driver aims at. */
function pursuitTarget(game) {
  const player = game.player;
  if (player.car) {
    return {
      x: player.car.x + Math.cos(player.car.angle) * player.car.speed * 0.35,
      y: player.car.y + Math.sin(player.car.angle) * player.car.speed * 0.35,
    };
  }
  return { x: player.x + player.vx * 0.35, y: player.y + player.vy * 0.35 };
}

/** Steer one patrol car after the player; reverse out when wedged against a wall. */
function pursuitControl(cop, game, dt) {
  const player = game.player;
  const px = player.car ? player.car.x : player.x;
  const py = player.car ? player.car.y : player.y;
  const dist = Math.hypot(px - cop.x, py - cop.y);
  const target = pursuitTarget(game);

  let aimX = target.x;
  let aimY = target.y;
  if (dist < 150) {
    // Close up, aim at the player rather than ahead of them: no PIT geometry.
    aimX = px + (aimX - px) * 0.3;
    aimY = py + (aimY - py) * 0.3;
  }
  // Far away, a patrol car gets back to a road rather than grinding along a facade.
  if (dist > 260) {
    const aheadX = cop.x + Math.cos(cop.angle) * 120;
    const aheadY = cop.y + Math.sin(cop.angle) * 120;
    if (game.city.surfaceAt(aheadX, aheadY) === 'ground') {
      const road = game.city.nearestRoadPoint(cop.x, cop.y);
      aimX = road.x;
      aimY = road.y;
    }
  }

  if (cop.reverseFor > 0) {
    cop.reverseFor -= dt;
    const back = Math.atan2(cop.y - aimY, cop.x - aimX);
    return { throttle: -1, steer: clamp(angleDelta(cop.angle, back) * 2.4, -1, 1) };
  }
  if (Math.abs(cop.speed) < 26) {
    cop.stuckFor += dt;
    if (cop.stuckFor > 1.1) {
      cop.stuckFor = 0;
      cop.reverseFor = 0.7;
    }
  } else cop.stuckFor = 0;

  const delta = angleDelta(cop.angle, Math.atan2(aimY - cop.y, aimX - cop.x));
  let throttle = 1;
  const pSpeed = playerSpeed(game);
  if (dist < 130 && pSpeed > 60) {
    // On the player's tail at speed: pace them, applying pressure without
    // driving through the car ahead.
    throttle = cop.speed < pSpeed * 0.99 ? 0.55 : -0.25;
  }
  if (dist < 74 && pSpeed < 60) throttle = 0.15; // Creep in for the grab.
  if (Math.abs(delta) > 2.4 && dist < 120) throttle = -0.6; // Turned around: back up and swing.
  return { throttle, steer: clamp(delta * 2.4, -1, 1) };
}

function removeCar(game, car) {
  game.cars.splice(game.cars.indexOf(car), 1);
  const copIndex = game.cops.indexOf(car);
  if (copIndex >= 0) game.cops.splice(copIndex, 1);
}

export function updatePolice(game, dt) {
  const wanted = game.wanted;
  const player = game.player;
  const px = player.car ? player.car.x : player.x;
  const py = player.car ? player.car.y : player.y;

  wanted.sinceCrime += dt;
  wanted.seen = game.cops.some((cop) => dist2(cop.x, cop.y, px, py) < WANTED.copSightRange * WANTED.copSightRange);
  if (wanted.sinceCrime > WANTED.quietSeconds && !wanted.seen && wanted.heat > 0) {
    wanted.heat = Math.max(0, wanted.heat - WANTED.decayPerSecond * dt);
  }
  wanted.level = starsForHeat(wanted.heat);

  // Keep the patrol strength matched to the stars, spawning out of sight on roads.
  const wanted_cops = wanted.level;
  wanted.spawnTimer -= dt;
  if (game.cops.length < wanted_cops && wanted.spawnTimer <= 0) {
    wanted.spawnTimer = 1.1;
    const cop = createCar('police', 0, 0, 0, '#f4f6f8');
    cop.driver = 'police';
    if (placeCarOnRoad(game.rng, game.city, cop, px, py, WANTED.spawnMin, WANTED.spawnMax + 400)) {
      game.cars.push(cop);
      game.cops.push(cop);
    }
  }
  for (const cop of [...game.cops]) {
    const d2 = dist2(cop.x, cop.y, px, py);
    if (d2 > WANTED.despawnRange * WANTED.despawnRange) removeCar(game, cop);
    else if (wanted.level === 0 && d2 > 620 * 620) removeCar(game, cop);
  }

  for (const cop of game.cops) {
    if (wanted.level === 0) {
      // No longer hunting: cruise straight and let the despawn rules take them.
      stepCarPhysics(cop, { throttle: cop.speed < 200 ? 0.7 : 0, steer: 0 }, dt, game);
    } else {
      stepCarPhysics(cop, pursuitControl(cop, game, dt), dt, game);
    }
  }

  // The grab: a patrol car close by while the player is slow or on foot fills the meter.
  let nearest = Infinity;
  for (const cop of game.cops) nearest = Math.min(nearest, Math.hypot(cop.x - px, cop.y - py));
  const speed = playerSpeed(game);
  const grabbed = wanted.level > 0 && ((player.car && speed < 70 && nearest < WANTED.bustRangeCar)
    || (!player.car && nearest < 62));
  if (grabbed) wanted.bust = Math.min(1, wanted.bust + dt / WANTED.bustFillSeconds);
  else wanted.bust = Math.max(0, wanted.bust - dt / WANTED.bustDrainSeconds);
  if (wanted.bust >= 1) {
    wanted.bust = 0;
    game.events.push({ type: 'busted' });
  }
}
