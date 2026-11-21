// Cars: one arcade physics step that the player, the traffic and the police all drive
// through, so every car handles the same way. Traffic follows the road grid from
// waypoint to waypoint; parked cars wait at the kerb to be stolen. Collisions with
// buildings are the city's job; collisions between cars are resolved here and
// reported as events for the wanted system and the damage model.
import { CAR, CAR_KINDS, CITY, WORLD } from './config.js';
import { angleDelta, clamp, dist2 } from './random.js';

let nextCarId = 1;

/** A car. `driver` is null (empty), 'traffic', 'player' or 'police'. */
export function createCar(kind, x, y, angle, color) {
  return {
    id: nextCarId++,
    kind, x, y, angle,
    speed: 0,
    color,
    driver: null,
    parked: false,
    health: 100,
    route: null,
    waypoint: null,
    stuckFor: 0,
    reverseFor: 0,
    honkFor: 0,
  };
}

/** The lane centre for a car travelling `dir` along a road: right-hand traffic. */
export function laneCoord(roadCenter, dir, vertical) {
  if (vertical) return roadCenter + (dir > 0 ? -CITY.laneOffset : CITY.laneOffset);
  return roadCenter + (dir > 0 ? CITY.laneOffset : -CITY.laneOffset);
}

/**
 * Advance one car. `control` is {throttle: -1..1, steer: -1..1}. Buildings and the
 * shoreline push the car out (a hard push at speed is an impact: it costs health and
 * speed, and is returned so the caller can add shake, sparks and crime).
 */
export function stepCarPhysics(car, control, dt, game) {
  const stats = CAR_KINDS[car.kind];
  const surface = game.city.surfaceAt(car.x, car.y);
  const surfaceFactor = surface === 'road' ? 1 : surface === 'sand' ? CAR.offroadFactor : 0.82;
  const topSpeed = stats.topSpeed * surfaceFactor;

  if (control.throttle > 0) {
    car.speed += control.throttle * stats.accel * surfaceFactor * dt;
  } else if (control.throttle < 0) {
    if (car.speed > 12) car.speed += control.throttle * CAR.brake * dt;
    else car.speed = Math.max(-CAR.reverseMax, car.speed + control.throttle * stats.accel * 0.6 * dt);
  }
  car.speed -= car.speed * CAR.drag * dt;
  if (Math.abs(car.speed) > 0.01) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), CAR.rollDrag * dt * 10);
  }
  car.speed = clamp(car.speed, -CAR.reverseMax, topSpeed);

  const steerAuthority = clamp(Math.abs(car.speed) / 130, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.angle += control.steer * CAR.steerRate * steerAuthority * dt * clamp(Math.abs(car.speed) / 300, 0.35, 1);

  const vx = Math.cos(car.angle) * car.speed;
  const vy = Math.sin(car.angle) * car.speed;
  car.x += vx * dt;
  car.y += vy * dt;

  let impact = 0;
  const beforeX = car.x;
  const beforeY = car.y;
  const [nx, ny] = game.city.collideCircle(car.x, car.y, CAR.radius);
  car.x = nx;
  car.y = ny;
  const pushed = Math.hypot(car.x - beforeX, car.y - beforeY);
  if (pushed > 1.2 && Math.abs(car.speed) > 150) {
    impact = Math.abs(car.speed);
    car.health -= impact * 0.045;
    car.speed *= 0.32;
  }
  return impact;
}

/** Push overlapping cars apart and trade speed along the contact normal. */
export function resolveCarCollisions(game, events) {
  const cars = game.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const minDist = CAR.radius * 1.7;
      const d2 = dist2(a.x, a.y, b.x, b.y);
      if (d2 >= minDist * minDist || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = (b.x - a.x) / d;
      const ny = (b.y - a.y) / d;
      const depth = minDist - d;
      // Heavier cars move less: the player's car is the heaviest thing on the road,
      // so patrol cars and traffic bounce off it instead of shoving it around.
      const aWeight = a === game.player.car ? 3 : a.parked ? 2.5 : 1;
      const bWeight = b === game.player.car ? 3 : b.parked ? 2.5 : 1;
      const aMove = depth * (bWeight / (aWeight + bWeight));
      const bMove = depth * (aWeight / (aWeight + bWeight));
      a.x -= nx * aMove;
      a.y -= ny * aMove;
      b.x += nx * bMove;
      b.y += ny * bMove;
      const relSpeed = Math.abs((a.speed * Math.cos(a.angle) - b.speed * Math.cos(b.angle)) * nx
        + (a.speed * Math.sin(a.angle) - b.speed * Math.sin(b.angle)) * ny);
      if (relSpeed > 40) {
        const trade = relSpeed * 0.22;
        a.speed -= trade * Math.sign(a.speed || 1);
        b.speed -= trade * Math.sign(b.speed || 1);
        a.health -= relSpeed * 0.03;
        b.health -= relSpeed * 0.03;
        events.push({ type: 'carCrash', a, b, impact: relSpeed });
      }
    }
  }
}

/** Put a car on a random road, in a random lane, pointing the way its lane travels. */
export function placeCarOnRoad(rng, city, car, nearX, nearY, minDist, maxDist) {
  for (let tries = 0; tries < 24; tries += 1) {
    const vertical = rng.chance(0.55);
    if (vertical) {
      const road = city.vRoads[rng.int(0, city.vRoads.length - 1)];
      const dir = rng.chance(0.5) ? 1 : -1;
      const y = rng.range(80, WORLD.height - 80);
      const x = laneCoord(road.x, dir, true);
      const d = Math.hypot(x - nearX, y - nearY);
      if (d < minDist || d > maxDist) continue;
      car.x = x; car.y = y; car.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      car.route = { vertical: true, road, dir };
      return true;
    }
    const road = city.hRoads[rng.int(0, city.hRoads.length - 1)];
    const dir = rng.chance(0.5) ? 1 : -1;
    const x = rng.range(80, CITY.promenadeX - 60);
    const y = laneCoord(road.y, dir, false);
    const d = Math.hypot(x - nearX, y - nearY);
    if (d < minDist || d > maxDist) continue;
    car.x = x; car.y = y; car.angle = dir > 0 ? 0 : Math.PI;
    car.route = { vertical: false, road, dir };
    return true;
  }
  return false;
}

/** Choose the traffic car's next waypoint: ahead on its road, turning at junctions. */
function nextWaypoint(rng, city, car) {
  const route = car.route;
  const ahead = 300;
  if (route.vertical) {
    const crossY = route.dir > 0
      ? city.hRoads.find((r) => r.y > car.y + 40)
      : [...city.hRoads].reverse().find((r) => r.y < car.y - 40);
    const endY = route.dir > 0 ? WORLD.height - 70 : 70;
    const junctionY = crossY ? crossY.y : endY;
    const distToJunction = Math.abs(junctionY - car.y);
    if (distToJunction < ahead && crossY && rng.chance(0.55)) {
      // Turn onto the crossing street.
      const turnDir = rng.chance(0.5) ? 1 : -1;
      car.route = { vertical: false, road: crossY, dir: turnDir };
      return { x: car.x + turnDir * 260, y: laneCoord(crossY.y, turnDir, false) };
    }
    return { x: laneCoord(route.road.x, route.dir, true), y: car.y + route.dir * ahead };
  }
  const crossX = route.dir > 0
    ? city.vRoads.find((r) => r.x > car.x + 40)
    : [...city.vRoads].reverse().find((r) => r.x < car.x - 40);
  const junctionX = crossX ? crossX.x : (route.dir > 0 ? CITY.promenadeX : 70);
  const distToJunction = Math.abs(junctionX - car.x);
  if (distToJunction < ahead && crossX && rng.chance(0.55)) {
    const turnDir = rng.chance(0.5) ? 1 : -1;
    car.route = { vertical: true, road: crossX, dir: turnDir };
    return { x: laneCoord(crossX.x, turnDir, true), y: car.y + turnDir * 260 };
  }
  return { x: car.x + route.dir * ahead, y: laneCoord(route.road.y, route.dir, false) };
}

/** Drive one traffic car: aim at its waypoint, keep a gap to whatever is ahead. */
export function updateTrafficCar(car, dt, game) {
  if (!car.route) return { throttle: 0, steer: 0 };
  if (!car.waypoint || dist2(car.x, car.y, car.waypoint.x, car.waypoint.y) < 90 * 90) {
    car.waypoint = nextWaypoint(game.rng, game.city, car);
  }
  const targetAngle = Math.atan2(car.waypoint.y - car.y, car.waypoint.x - car.x);
  const delta = angleDelta(car.angle, targetAngle);
  const steer = clamp(delta * 2.2, -1, 1);

  // Slow for anything solid ahead: another car, a pedestrian, the player's car.
  let gap = Infinity;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of game.cars) {
    if (other === car) continue;
    const rx = other.x - car.x;
    const ry = other.y - car.y;
    const forward = rx * fx + ry * fy;
    if (forward < 0 || forward > 110) continue;
    const side = Math.abs(rx * -fy + ry * fx);
    if (side < 34) gap = Math.min(gap, forward);
  }
  for (const ped of game.peds) {
    if (ped.down) continue;
    const rx = ped.x - car.x;
    const ry = ped.y - car.y;
    const forward = rx * fx + ry * fy;
    if (forward < 0 || forward > 90) continue;
    const side = Math.abs(rx * -fy + ry * fx);
    if (side < 30) gap = Math.min(gap, forward);
  }

  let throttle = 1;
  const cruise = CAR.trafficSpeed * (0.85 + (car.id % 5) * 0.06);
  if (car.speed > cruise) throttle = 0;
  if (gap < 95) throttle = car.speed > 30 ? -1 : 0;
  if (gap < 52) throttle = -1;
  if (car.honkFor > 0) car.honkFor -= dt;
  else if (gap < 80 && car.speed < 20) { car.honkFor = 1.6; game.events.push({ type: 'honk', car }); }

  // A car held against the world's edge or a wall for a while turns around.
  if (throttle > 0 && Math.abs(car.speed) < 22) {
    car.stuckFor += dt;
    if (car.stuckFor > 2.5) {
      car.stuckFor = 0;
      car.route.dir *= -1;
      car.waypoint = null;
    }
  } else car.stuckFor = 0;
  return { throttle, steer };
}

/** A parked car at a kerb: angle along the road it sits on, waiting to be stolen. */
export function createParkedCar(rng, city, kind) {
  const vertical = rng.chance(0.5);
  let x;
  let y;
  let angle;
  if (vertical) {
    // Avenues only: the promenade is too narrow to park on without blocking a
    // lane, and it stays clear for chases. Cars sit on the sidewalk at the kerb
    // (just outside the asphalt), never in a driving lane.
    const avenues = city.vRoads.slice(0, -1);
    const road = avenues[rng.int(0, avenues.length - 1)];
    const side = rng.chance(0.5) ? -1 : 1;
    x = road.x + side * (road.half + 14);
    y = rng.range(120, WORLD.height - 120);
    angle = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  } else {
    const road = city.hRoads[rng.int(0, city.hRoads.length - 1)];
    const side = rng.chance(0.5) ? -1 : 1;
    y = road.y + side * (road.half + 14);
    x = rng.range(120, CITY.promenadeX - 120);
    angle = side > 0 ? 0 : Math.PI;
  }
  const stats = CAR_KINDS[kind];
  const car = createCar(kind, x, y, angle, rng.pick(stats.colors));
  car.parked = true;
  return car;
}
