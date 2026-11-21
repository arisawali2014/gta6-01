// A seeded random number generator (mulberry32) with the small helpers the city builder
// and the crowds use. The same seed always gives the same city and the same screenshot
// scenes, which is what makes the staged shots repeatable.

export function createRandom(seed) {
  let a = seed | 0;

  function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** A float in [min, max). */
  random.range = function range(min, max) {
    return min + random() * (max - min);
  };

  /** An integer in [min, max], both ends included. */
  random.int = function int(min, max) {
    return min + Math.floor(random() * (max - min + 1));
  };

  /** One element of the array. */
  random.pick = function pick(list) {
    return list[Math.floor(random() * list.length)];
  };

  /** True with probability p. */
  random.chance = function chance(p) {
    return random() < p;
  };

  return random;
}

/** Clamp a value into [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** The shortest signed turn from one angle to another, in (-PI, PI]. */
export function angleDelta(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** Squared distance between two points: the cheap comparison most range checks want. */
export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
