// The player: a person on foot who becomes a driver when they climb into a car.
// On foot they walk and sprint with a little inertia; in a car their input becomes
// throttle and steering for the shared car physics. This module owns entering and
// leaving cars (theft included), crash and harm damage, and health recovery.
import { FOOT, PLAYER } from './config.js';
import { stepCarPhysics } from './vehicles.js';
import { reportCrime } from './police.js';
import { clamp, dist2 } from './random.js';

export function createPlayer(x, y) {
  return {
    x, y,
    vx: 0, vy: 0,
    angle: -Math.PI / 2,
    car: null,
    health: PLAYER.maxHealth,
    cash: 0,
    weapon: 'pistol',
    ammo: 36,
    sinceHurt: 99,
    walkPhase: 0,
  };
}

/** The nearest car the player could climb into, or null: empty, and close enough. */
export function nearestEnterableCar(game, range) {
  const player = game.player;
  let best = null;
  let bestD = range * range;
  for (const car of game.cars) {
    if (car.driver === 'player' || car.driver === 'police') continue;
    if (car.health <= 0) continue;
    const d = dist2(player.x, player.y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** Climb into a car. A traffic driver bails out and runs; the theft is a crime. */
export function enterCar(game, car) {
  const player = game.player;
  if (car.driver === 'traffic') {
    game.events.push({ type: 'driverBails', car });
  }
  if (!car.ownedByPlayer) {
    reportCrime(game, 'steal');
    car.ownedByPlayer = true;
  }
  car.driver = 'player';
  car.parked = false;
  car.route = null;
  car.waypoint = null;
  player.car = car;
  game.events.push({ type: 'enterCar', car });
}

/** Climb out, leaving the car where it stands with the handbrake on. */
export function exitCar(game) {
  const player = game.player;
  const car = player.car;
  if (!car) return;
  car.driver = null;
  car.parked = true;
  car.speed = 0;
  player.car = null;
  // Step out on the left side of the car, clear of its body and any wall.
  const sideX = Math.cos(car.angle - Math.PI / 2);
  const sideY = Math.sin(car.angle - Math.PI / 2);
  player.x = car.x + sideX * 40;
  player.y = car.y + sideY * 40;
  const [nx, ny] = game.city.collideCircle(player.x, player.y, FOOT.radius);
  player.x = nx;
  player.y = ny;
  player.vx = 0;
  player.vy = 0;
  game.events.push({ type: 'exitCar', car });
}

export function hurtPlayer(game, amount) {
  const player = game.player;
  if (amount <= 0) return;
  player.health = Math.max(0, player.health - amount);
  player.sinceHurt = 0;
  if (player.health <= 0) game.events.push({ type: 'wasted' });
}

/**
 * Advance the player one step. `ctl` is {moveX, moveY, sprint} — from the keyboard
 * in play, or from a script in the screenshot scenes.
 */
export function updatePlayer(game, ctl, dt) {
  const player = game.player;
  player.sinceHurt += dt;
  if (player.health > 0 && player.health < PLAYER.maxHealth && player.sinceHurt > PLAYER.regenDelay) {
    player.health = Math.min(PLAYER.maxHealth, player.health + PLAYER.regenPerSecond * dt);
  }

  if (player.car) {
    const car = player.car;
    const control = {
      throttle: ctl.moveY < 0 ? 1 : ctl.moveY > 0 ? -1 : 0,
      steer: ctl.moveX,
    };
    const impact = stepCarPhysics(car, control, dt, game);
    if (impact > 0) {
      game.shake = Math.min(14, game.shake + impact * 0.02);
      hurtPlayer(game, impact * PLAYER.crashDamage);
      game.events.push({ type: 'playerCrash', impact });
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.vx = Math.cos(car.angle) * car.speed;
    player.vy = Math.sin(car.angle) * car.speed;
    return;
  }

  const speed = ctl.sprint ? FOOT.sprintSpeed : FOOT.walkSpeed;
  const mag = Math.hypot(ctl.moveX, ctl.moveY);
  let tx = 0;
  let ty = 0;
  if (mag > 0.01) {
    tx = (ctl.moveX / Math.max(1, mag)) * speed;
    ty = (ctl.moveY / Math.max(1, mag)) * speed;
    player.angle = Math.atan2(ty, tx);
  }
  const blend = clamp(16 * dt, 0, 1);
  player.vx += (tx - player.vx) * blend;
  player.vy += (ty - player.vy) * blend;
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  if (mag > 0.01) player.walkPhase += dt * (ctl.sprint ? 13 : 10);
  const [nx, ny] = game.city.collideCircle(player.x, player.y, FOOT.radius);
  player.x = nx;
  player.y = ny;
}
