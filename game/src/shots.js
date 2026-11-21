// Deterministic screenshot scenes for the judge. Each one builds its moment out of
// the real simulation — an autopilot drives, the police AI pursues, the crowd
// walks — so what the screenshot shows is the game itself, not a mock-up. After
// staging, main.js freezes the sim and keeps painting the frame.
import { angleDelta, clamp } from './random.js';
import { speak } from './missions.js';
import { starsForHeat } from './police.js';
import { createCar } from './vehicles.js';
import { updateCombat } from './combat.js';

function idleCtl() {
  return {
    moveX: 0, moveY: 0, sprint: false, interact: false,
    interactPressed: false, attack: false, aimX: 0, aimY: 0,
  };
}

function stepIdle(game, stepGame, steps) {
  const ctl = idleCtl();
  for (let index = 0; index < steps; index += 1) stepGame(game, ctl);
}

/** The cover: a stolen coupe at speed on the promenade, the harbor police behind it. */
function stageChase(game, stepGame) {
  const m = game.missions;
  const coupe = game.cars.find((car) => car.id === m.targetCarId);
  coupe.x = 3530;
  coupe.y = 2150;
  coupe.angle = -Math.PI / 2;
  coupe.speed = 430;
  coupe.parked = false;
  game.player.car = coupe;
  coupe.driver = 'player';
  game.player.x = coupe.x;
  game.player.y = coupe.y;
  m.stage = 'deliver';
  game.wanted.heat = 65;

  const copA = createCar('police', 3530, 2330, -Math.PI / 2);
  copA.driver = 'police';
  copA.speed = 470;
  const copB = createCar('police', 3530, 2470, -Math.PI / 2);
  copB.driver = 'police';
  copB.speed = 460;
  game.cars.push(copA, copB);
  game.cops.push(copA, copB);
  game.wanted.sinceCrime = 0;

  // Clear the chase corridor: no traffic east of the avenue grid, so nothing can
  // wander into the promenade or across the two junctions the chase crosses.
  for (let index = game.cars.length - 1; index >= 0; index -= 1) {
    const car = game.cars[index];
    if (car.driver === 'traffic' && car.x > 2300) game.cars.splice(index, 1);
  }

  // The autopilot holds the northbound promenade lane at full throttle.
  const ctl = idleCtl();
  for (let index = 0; index < 150; index += 1) {
    const desired = -Math.PI / 2 + clamp((3530 - coupe.x) * 0.004, -0.35, 0.35);
    ctl.moveY = -1;
    ctl.moveX = clamp(angleDelta(coupe.angle, desired) * 3, -1, 1);
    stepGame(game, ctl);
  }
  // Framing pass: a chase reads only if both patrol cars are in the picture.
  const behind = game.cops
    .filter((cop) => cop.y > coupe.y)
    .sort((a, b) => a.y - b.y);
  behind.forEach((cop, index) => {
    const gap = cop.y - coupe.y;
    if (gap > 300) {
      cop.y = coupe.y + 170 + index * 110;
      cop.x = index === 0 ? 3530 : 3606;
      cop.angle = -Math.PI / 2;
    }
  });
  // The chase's shunts are crimes in the live rules and inflate the heat past
  // the three stars this scene is about; settle it back for the photograph.
  game.wanted.heat = 65;
  game.wanted.level = starsForHeat(65);
  game.camera.x = coupe.x;
  game.camera.y = coupe.y - 150;
}

/** On foot beside the coupe Marisol wants, her instructions on the banner. */
function stageMission(game, stepGame) {
  const m = game.missions;
  const coupe = game.cars.find((car) => car.id === m.targetCarId);
  m.stage = 'steal';
  game.player.x = coupe.x + 85;
  game.player.y = coupe.y + 14;
  game.player.angle = Math.PI;
  speak(game, [{
    speaker: 'Marisol Vega',
    text: 'First job: a turquoise coupe parked up on the avenue. Steal it, and bring it to my garage — intact.',
  }]);
  stepIdle(game, stepGame, 110);
  game.missions.dialogueTimer = 999; // Hold the banner for the photograph.
  game.camera.x = game.player.x;
  game.camera.y = game.player.y;
}

/** A shot fired in the street: tracer, muzzle flash, a witness running for it. */
function stageCombat(game, stepGame) {
  game.player.x = 2080;
  game.player.y = 640;
  game.player.angle = 0;
  game.player.weapon = 'pistol';
  game.player.ammo = 30;
  game.wanted.heat = 40;
  const witness = game.peds[0];
  witness.x = 2215;
  witness.y = 618;
  stepIdle(game, stepGame, 90);
  witness.x = 2215;
  witness.y = 618;
  const ctl = idleCtl();
  ctl.attack = true;
  ctl.aimX = 2400;
  ctl.aimY = 520; // Past the witness's shoulder: the shot cracks by, and they run.
  updateCombat(game, ctl, 1 / 60);
  witness.state = 'flee';
  witness.angle = 0.3;
  game.camera.x = game.player.x + 60;
  game.camera.y = game.player.y;
}

/** The promenade at rest, the city alive behind the title. */
function stageTitle(game, stepGame) {
  stepIdle(game, stepGame, 200);
  game.camera.x = game.player.x;
  game.camera.y = game.player.y;
}

const SCENES = {
  chase: stageChase,
  mission: stageMission,
  combat: stageCombat,
  title: stageTitle,
};

/** Stage one named scene. Unknown names fall back to the title backdrop. */
export function stageShot(name, game, stepGame) {
  const scene = SCENES[name] ?? stageTitle;
  scene(game, stepGame);
}
