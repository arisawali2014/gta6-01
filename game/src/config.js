// Every tuning number and colour for Vice Harbor in one place. The view is a fixed 1280x720
// logical area that the renderer scales to the window; the world is a much larger coastal
// city the camera moves through, so no rule below depends on the screen size.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The whole map, in world units: land, beach and the water past the shoreline. */
export const WORLD = { width: 4160, height: 2880 };

/**
 * The street plan. Avenues run north-south, streets east-west, both on a 576 pitch with
 * their centres listed; the promenade is the last north-south road, along the beach.
 * East of the promenade: sand, then open water to the world's edge.
 */
export const CITY = {
  pitch: 576,
  roadHalf: 75,
  avenues: [288, 864, 1440, 2016, 2592, 3168],
  streets: [288, 864, 1440, 2016, 2592],
  promenadeX: 3568,
  promenadeHalf: 55,
  sandX: 3623,
  waterX: 3880,
  sidewalk: 26,
  laneOffset: 38,
};

/** On-foot movement for the player and the crowds. Speeds are world units per second. */
export const FOOT = {
  radius: 14,
  walkSpeed: 235,
  sprintSpeed: 355,
  pedSpeed: 95,
  pedFleeSpeed: 265,
};

/** Arcade car handling, shared by the player's car, traffic and the police. */
export const CAR = {
  length: 48,
  width: 24,
  radius: 25,
  accel: 330,
  brake: 560,
  reverseMax: 170,
  drag: 0.55,
  rollDrag: 1.6,
  steerRate: 2.45,
  grip: 9,
  offroadFactor: 0.55,
  trafficCount: 14,
  trafficSpeed: 295,
  parkedCount: 17,
};

/** Per-kind top speeds: a stolen sports coupe should feel faster than a taxi. */
export const CAR_KINDS = {
  sedan: { topSpeed: 500, accel: 320, colors: ['#3f88c5', '#e0e1dd', '#778da9', '#c97c5d'] },
  taxi: { topSpeed: 470, accel: 300, colors: ['#ffba08'] },
  coupe: { topSpeed: 640, accel: 430, colors: ['#d90429', '#00bbf9', '#06d6a0', '#9b5de5'] },
  van: { topSpeed: 430, accel: 260, colors: ['#e8c07d', '#8a9a5b', '#bc6c25'] },
  police: { topSpeed: 615, accel: 415, colors: ['#f4f6f8'] },
};

/** Wanted heat: crimes add heat, stars unlock at the thresholds, heat cools when unseen. */
export const WANTED = {
  thresholds: [0, 10, 35, 60, 85, 110],
  maxHeat: 135,
  crimeHeat: { steal: 22, hitPed: 30, shot: 9, hitCop: 34, hitCar: 9, hitProp: 4 },
  quietSeconds: 6,
  decayPerSecond: 4.5,
  copSightRange: 430,
  spawnMin: 780,
  spawnMax: 1080,
  despawnRange: 1500,
  bustRangeCar: 105,
  bustRangeFoot: 78,
  bustFillSeconds: 2.4,
  bustDrainSeconds: 1.6,
};

/** The pistol: hitscan, a short tracer, and ammunition that pickups refill. */
export const WEAPON = {
  range: 580,
  spread: 0.035,
  cooldown: 0.24,
  startAmmo: 36,
  pickupAmmo: 24,
  meleeRange: 58,
  meleeCooldown: 0.34,
};

export const PLAYER = {
  maxHealth: 100,
  regenDelay: 5,
  regenPerSecond: 7,
  crashDamage: 0.055,
  saveKey: 'vice-harbor.save.v1',
};

/** The warm, sun-soaked palette the whole game is drawn from. */
export const PALETTE = {
  water: '#1899b0',
  waterDeep: '#0f7d99',
  sand: '#f0dc9f',
  sandWet: '#e3cb85',
  grass: '#79a85b',
  blockGround: '#c9bda3',
  sidewalk: '#ddd5c3',
  asphalt: '#3b4048',
  asphaltEdge: '#2f333a',
  laneMark: '#e9e2cf',
  crosswalk: '#d8d8d2',
  player: '#ff5964',
  playerSkin: '#f2c29b',
  pedShirts: ['#ffd166', '#8ecae6', '#ffb703', '#90be6d', '#f9c74f', '#43aa8b', '#577590', '#f3722c'],
  panel: 'rgba(16, 22, 30, 0.88)',
  panelEdge: '#ffd166',
  text: '#fdf6e3',
  muted: '#b8c0b0',
  accent: '#ffd166',
  danger: '#ef476f',
  good: '#06d6a0',
  star: '#ffd60a',
  starOff: 'rgba(255, 214, 10, 0.22)',
  minimapBg: 'rgba(10, 18, 24, 0.78)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Mission money, in dollars, paid by Marisol Vega on completion. */
export const REWARDS = { firstWheels: 500, packageRun: 900, harborHeat: 1500 };
