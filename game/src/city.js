// The city of Vice Harbor, generated once from a seed: a grid of avenues and streets on
// the land, a promenade along the beach, then sand and open water to the east. Blocks
// between the roads carry the buildings (solid rectangles the whole game collides with),
// the sidewalks the crowds walk, and the landmarks the story uses: Vega's Garage, the
// marina pier and the player's beachfront start.
import { CITY, WORLD } from './config.js';
import { clamp } from './random.js';

const ROOF_COLORS = ['#e07a5f', '#d4a373', '#e8c07d', '#c97c5d', '#8a9a5b', '#81b29a', '#f2cc8f', '#bc6c25', '#e5989b', '#faedcd'];
const WALL_COLORS = ['#ffe8d6', '#ffd6a5', '#ffcdb2', '#f4f1de', '#e9edc9', '#fefae0', '#faedcd', '#ccd5ae'];

/** The pier the marina is built around: the one place anyone may stand over the water. */
export const PIER = { x: CITY.waterX, y: 1392, w: 270, h: 96 };

export function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function createCity(rng) {
  // Block columns and rows are the land between neighbouring roads, edge strips included.
  const vRoads = CITY.avenues.map((x) => ({ x, half: CITY.roadHalf }));
  vRoads.push({ x: CITY.promenadeX, half: CITY.promenadeHalf });
  const hRoads = CITY.streets.map((y) => ({ y, half: CITY.roadHalf }));

  const colEdges = [0];
  for (const road of vRoads) {
    colEdges.push(road.x - road.half, road.x + road.half);
  }
  colEdges.push(CITY.sandX);
  const rowEdges = [0];
  for (const road of hRoads) {
    rowEdges.push(road.y - road.half, road.y + road.half);
  }
  rowEdges.push(WORLD.height);

  const blocks = [];
  for (let c = 0; c + 1 < colEdges.length; c += 2) {
    for (let r = 0; r + 1 < rowEdges.length; r += 2) {
      blocks.push({ x: colEdges[c], y: rowEdges[r], w: colEdges[c + 1] - colEdges[c], h: rowEdges[r + 1] - rowEdges[r] });
    }
  }

  // The landmarks are placed by block: the garage fills one block, a plaza stays open.
  const garageBlock = blocks.find((b) => b.x === 939 && b.y === 939);
  const plazaBlock = blocks.find((b) => b.x === 2091 && b.y === 363);
  const garageBay = { x: 1030, y: 1170, w: 240, h: 120 };
  const landmarks = {
    garageBay,
    garagePoint: { x: 1150, y: 1150 },
    marina: { x: 3745, y: 1440 },
    pierEnd: { x: PIER.x + PIER.w - 30, y: PIER.y + PIER.h / 2 },
    spawn: { x: 3490, y: 1560 },
  };

  const buildings = [];
  function addBuilding(x, y, w, h, kind) {
    buildings.push({
      x, y, w, h, kind,
      roof: kind === 'garage' ? '#5b6068' : rng.pick(ROOF_COLORS),
      wall: rng.pick(WALL_COLORS),
      seed: Math.floor(rng.range(1, 2147483646)),
    });
  }

  for (const block of blocks) {
    if (block === garageBlock) {
      // Vega's Garage: one wide workshop across the north of its block, the bay below it.
      addBuilding(block.x + 30, block.y + 26, block.w - 60, 150, 'garage');
      continue;
    }
    if (block === plazaBlock) continue; // The plaza stays open pavement and palms.
    const inner = {
      x: block.x + CITY.sidewalk,
      y: block.y + CITY.sidewalk,
      w: block.w - CITY.sidewalk * 2,
      h: block.h - CITY.sidewalk * 2,
    };
    if (inner.w < 90 || inner.h < 90) continue;
    // Beachfront blocks stay low: clubs and parking, with some left empty as lots.
    const beachfront = block.x >= 3243;
    if (beachfront && rng.chance(0.3)) continue;
    const cols = inner.w > 300 ? 2 : 1;
    const rows = inner.h > 300 ? 2 : 1;
    const gap = 18;
    const lotW = (inner.w - gap * (cols - 1)) / cols;
    const lotH = (inner.h - gap * (rows - 1)) / rows;
    for (let cx = 0; cx < cols; cx += 1) {
      for (let cy = 0; cy < rows; cy += 1) {
        if (rng.chance(beachfront ? 0.25 : 0.08)) continue; // A parking lot, not a building.
        const inset = rng.range(2, 12);
        addBuilding(
          inner.x + cx * (lotW + gap) + inset,
          inner.y + cy * (lotH + gap) + inset,
          lotW - inset * 2,
          (lotH - inset * 2) * (beachfront ? rng.range(0.5, 0.8) : rng.range(0.75, 1)),
          beachfront ? 'club' : 'block',
        );
      }
    }
  }

  // Palms shade the promenade and the beach; lamps line the avenues (drawn, never solid).
  const palms = [];
  for (let y = 60; y < WORLD.height - 40; y += rng.range(80, 130)) {
    palms.push({ x: CITY.sandX + rng.range(14, 60), y, s: rng.range(0.8, 1.25) });
  }
  for (let index = 0; index < 46; index += 1) {
    palms.push({ x: rng.range(CITY.sandX + 30, CITY.waterX - 50), y: rng.range(30, WORLD.height - 30), s: rng.range(0.8, 1.3) });
  }
  if (plazaBlock) {
    for (const [px, py] of [[2120, 392], [2488, 392], [2120, 760], [2488, 760], [2304, 576]]) {
      palms.push({ x: px, y: py, s: 1.1 });
    }
  }
  const lamps = [];
  for (const road of vRoads) {
    for (let y = 130; y < WORLD.height; y += 260) lamps.push({ x: road.x - road.half - 9, y });
  }

  function isWater(x, y) {
    if (x < CITY.waterX) return false;
    return !pointInRect(x, y, PIER);
  }

  /** What is under a point: 'water', 'sand', 'road', 'sidewalk', 'plaza' or 'ground'. */
  function surfaceAt(x, y) {
    if (isWater(x, y)) return 'water';
    if (pointInRect(x, y, PIER)) return 'ground';
    if (x >= CITY.sandX) return 'sand';
    for (const road of vRoads) if (Math.abs(x - road.x) <= road.half) return 'road';
    if (x < CITY.promenadeX + CITY.promenadeHalf) {
      for (const road of hRoads) if (Math.abs(y - road.y) <= road.half) return 'road';
    }
    if (plazaBlock && pointInRect(x, y, plazaBlock)) return 'plaza';
    for (const block of blocks) {
      if (!pointInRect(x, y, block)) continue;
      const nearEdge = x - block.x < CITY.sidewalk || block.x + block.w - x < CITY.sidewalk
        || y - block.y < CITY.sidewalk || block.y + block.h - y < CITY.sidewalk;
      return nearEdge ? 'sidewalk' : 'ground';
    }
    return 'ground';
  }

  /**
   * Push a circle out of every building, the shoreline and the world's edge; returns the
   * corrected [x, y]. Cars and people share it, so nobody enters a building or the sea.
   */
  function collideCircle(x, y, r) {
    // The shoreline: the water blocks everyone, except on the marina pier's deck.
    if (x > CITY.waterX - r) {
      const overDeck = x <= PIER.x + PIER.w && y >= PIER.y - r && y <= PIER.y + PIER.h + r;
      if (overDeck) {
        x = Math.min(x, PIER.x + PIER.w - r);
        y = clamp(y, PIER.y + 2, PIER.y + PIER.h - 2);
      } else {
        x = CITY.waterX - r;
      }
    }
    x = clamp(x, r, WORLD.width - r);
    y = clamp(y, r, WORLD.height - r);
    for (const b of buildings) {
      const nearX = clamp(x, b.x, b.x + b.w);
      const nearY = clamp(y, b.y, b.y + b.h);
      const dx = x - nearX;
      const dy = y - nearY;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nearX + (dx / d) * r;
        y = nearY + (dy / d) * r;
      } else {
        // The centre is inside the building: leave by the shortest side.
        const left = x - b.x;
        const right = b.x + b.w - x;
        const top = y - b.y;
        const bottom = b.y + b.h - y;
        const min = Math.min(left, right, top, bottom);
        if (min === left) x = b.x - r;
        else if (min === right) x = b.x + b.w + r;
        else if (min === top) y = b.y - r;
        else y = b.y + b.h + r;
      }
    }
    return [x, y];
  }

  /** The closest point on any road centre line: where traffic and police think in roads. */
  function nearestRoadPoint(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const road of vRoads) {
      const d = Math.abs(x - road.x);
      if (d < bestD) { bestD = d; best = { x: road.x, y, vertical: road }; }
    }
    for (const road of hRoads) {
      const d = Math.abs(y - road.y);
      if (d < bestD) { bestD = d; best = { x, y: road.y, vertical: null, horizontal: road }; }
    }
    return best;
  }

  return {
    blocks, buildings, palms, lamps, landmarks,
    vRoads, hRoads, plazaBlock,
    isWater, surfaceAt, collideCircle, nearestRoadPoint,
  };
}
