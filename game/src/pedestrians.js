// The crowds of Vice Harbor. Each pedestrian walks a loop: around a city block on its
// sidewalk, or up and down the sand for the beachgoers. They flee gunfire, fast cars
// and fallen strangers, and a car that reaches one knocks them down — which the whole
// street notices, and the police hear about when the driver is the player.
import { CAR, CITY, FOOT, PALETTE, WORLD } from './config.js';
import { clamp, dist2 } from './random.js';

let nextPedId = 1;

/** A pedestrian walking the loop of points (block corners, or a beach segment). */
export function createPedestrian(rng, points, loop) {
  const start = points[0];
  return {
    id: nextPedId++,
    x: start.x, y: start.y,
    angle: rng.range(0, Math.PI * 2),
    points, loop,
    target: 1 % points.length,
    dir: 1,
    state: 'walk',
    fleeFor: 0,
    threatX: 0, threatY: 0,
    downFor: 0,
    shirt: rng.pick(PALETTE.pedShirts),
    skin: rng.pick(['#f2c29b', '#c68863', '#8d5524', '#ffdbac']),
    phase: rng.range(0, Math.PI * 2),
  };
}

/** The four corners of a block's sidewalk, inset to the middle of the pavement. */
export function blockSidewalkPoints(block) {
  const inset = CITY.sidewalk / 2;
  return [
    { x: block.x + inset, y: block.y + inset },
    { x: block.x + block.w - inset, y: block.y + inset },
    { x: block.x + block.w - inset, y: block.y + block.h - inset },
    { x: block.x + inset, y: block.y + block.h - inset },
  ];
}

/** Scatter the starting crowd: most on block sidewalks, a few on the beach. */
export function createCrowd(rng, city, count) {
  const peds = [];
  const blocks = city.blocks.filter((b) => b.w > 120 && b.h > 120);
  for (let index = 0; index < count - 6; index += 1) {
    const block = blocks[rng.int(0, blocks.length - 1)];
    const points = blockSidewalkPoints(block);
    const ped = createPedestrian(rng, points, true);
    const startPoint = points[rng.int(0, points.length - 1)];
    ped.x = startPoint.x;
    ped.y = startPoint.y;
    peds.push(ped);
  }
  for (let index = 0; index < 6; index += 1) {
    const yA = rng.range(200, 2400);
    const points = [
      { x: rng.range(3660, 3820), y: yA },
      { x: rng.range(3660, 3820), y: yA + rng.range(220, 420) },
    ];
    peds.push(createPedestrian(rng, points, false));
  }
  return peds;
}

function moveToward(ped, tx, ty, speed, dt) {
  const dx = tx - ped.x;
  const dy = ty - ped.y;
  const d = Math.hypot(dx, dy);
  if (d < 4) return true;
  ped.angle = Math.atan2(dy, dx);
  ped.x += (dx / d) * speed * dt;
  ped.y += (dy / d) * speed * dt;
  return false;
}

/** The nearest live threat to a pedestrian, or null: gunfire, a fast car, a body. */
function senseThreat(ped, game) {
  if (game.lastShot && game.time - game.lastShot.at < 1.6 && dist2(ped.x, ped.y, game.lastShot.x, game.lastShot.y) < 320 * 320) {
    return game.lastShot;
  }
  for (const car of game.cars) {
    if (Math.abs(car.speed) < 190) continue;
    if (dist2(ped.x, ped.y, car.x, car.y) < 95 * 95) return car;
  }
  for (const other of game.peds) {
    if (other !== ped && other.state === 'down' && dist2(ped.x, ped.y, other.x, other.y) < 110 * 110) return other;
  }
  return null;
}

export function updatePedestrians(game, dt) {
  const { city } = game;
  for (const ped of game.peds) {
    if (ped.state === 'down') {
      ped.downFor -= dt;
      if (ped.downFor <= 0) {
        // The crowd quietly replaces its fallen, far from the player's eyes.
        const block = city.blocks[game.rng.int(0, city.blocks.length - 1)];
        const points = blockSidewalkPoints(block);
        if (dist2(points[0].x, points[0].y, game.player.x, game.player.y) > 700 * 700) {
          ped.points = points;
          ped.x = points[0].x;
          ped.y = points[0].y;
          ped.state = 'walk';
          ped.target = 1;
        } else ped.downFor = 1;
      }
      continue;
    }

    const threat = senseThreat(ped, game);
    if (threat) {
      ped.state = 'flee';
      ped.fleeFor = 2.6;
      ped.threatX = threat.x;
      ped.threatY = threat.y;
    }

    if (ped.state === 'flee') {
      ped.fleeFor -= dt;
      const away = Math.atan2(ped.y - ped.threatY, ped.x - ped.threatX);
      ped.angle = away;
      ped.x += Math.cos(away) * FOOT.pedFleeSpeed * dt;
      ped.y += Math.sin(away) * FOOT.pedFleeSpeed * dt;
      if (ped.fleeFor <= 0) ped.state = 'walk';
    } else {
      const target = ped.points[ped.target];
      if (moveToward(ped, target.x, target.y, FOOT.pedSpeed, dt)) {
        if (ped.loop) ped.target = (ped.target + 1) % ped.points.length;
        else {
          let next = ped.target + ped.dir;
          if (next < 0 || next >= ped.points.length) {
            ped.dir *= -1;
            next = ped.target + ped.dir;
          }
          ped.target = next;
        }
      }
    }

    // Cars reach pedestrians before pedestrians can dodge: a fast hit knocks them down.
    for (const car of game.cars) {
      if (car.parked && !car.driver) continue; // A parked, empty car is scenery: they just walk round it.
      const reach = CAR.radius + 4;
      if (dist2(ped.x, ped.y, car.x, car.y) >= reach * reach) continue;
      if (Math.abs(car.speed) > 130) {
        ped.state = 'down';
        ped.downFor = 7;
        game.events.push({ type: 'pedHit', ped, car });
        break;
      }
      // A slow nudge just shoves them aside and frightens them.
      const away = Math.atan2(ped.y - car.y, ped.x - car.x);
      ped.x += Math.cos(away) * 26;
      ped.y += Math.sin(away) * 26;
      ped.state = 'flee';
      ped.fleeFor = 1.6;
      ped.threatX = car.x;
      ped.threatY = car.y;
    }

    // The player shoulders past rather than through.
    const player = game.player;
    if (!player.car && dist2(ped.x, ped.y, player.x, player.y) < 26 * 26) {
      const away = Math.atan2(ped.y - player.y, ped.x - player.x);
      ped.x += Math.cos(away) * 60 * dt * 4;
      ped.y += Math.sin(away) * 60 * dt * 4;
    }

    const [nx, ny] = city.collideCircle(ped.x, ped.y, FOOT.radius);
    ped.x = nx;
    ped.y = ny;
    ped.x = clamp(ped.x, FOOT.radius, WORLD.width - FOOT.radius);
  }
}
