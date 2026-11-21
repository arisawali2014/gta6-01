// Boot and the one loop. main.js owns the game's assembly — city, traffic, crowds,
// the coupe Marisol wants — and its step order: the player, the traffic, the
// collisions, the police, the crowds, combat, the story, and finally the event
// queue that turns simulation moments into sound, shake and screens. Input is
// read every frame; the world advances in fixed 1/60 s steps; the renderer and
// the HUD paint what is there.
//
// Screens: title, play, paused, busted, wasted. Progress (cash, mission, position)
// is saved to localStorage and offered back as Continue on the title screen.
//
// ?seed=N fixes the city. ?shot=chase|mission|combat|title (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { CAR, CAR_KINDS, PLAYER, STEP, VIEW } from './config.js';
import { createRandom, clamp } from './random.js';
import { createCity } from './city.js';
import { createCar, createParkedCar, placeCarOnRoad, resolveCarCollisions, stepCarPhysics, updateTrafficCar } from './vehicles.js';
import { createCrowd, createPedestrian, updatePedestrians } from './pedestrians.js';
import { createWanted, reportCrime, updatePolice } from './police.js';
import { createPlayer, enterCar, exitCar, nearestEnterableCar, updatePlayer } from './player.js';
import { createCombat, createEffects, createPickups, spawnParticles, updateCombat } from './combat.js';
import { createMissions, updateMissions } from './missions.js';
import { createAudio } from './audio.js';
import {
  createRenderer, updateCamera,
  SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED,
} from './render.js';
import { createHud } from './hud.js';
import {
  ACTION_CONFIRM, ACTION_FISTS, ACTION_INTERACT, ACTION_PAUSE, ACTION_PISTOL, createInput,
} from './input.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const TRAFFIC_KINDS = ['sedan', 'sedan', 'sedan', 'taxi', 'coupe', 'van'];

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const hud = createHud(canvas);

/** Assemble a fresh Vice Harbor: city, traffic, parked cars, crowds, the mark. */
function createGame(gameSeed) {
  const rng = createRandom(gameSeed);
  const city = createCity(rng);
  const spawn = city.landmarks.spawn;
  const game = {
    rng,
    city,
    time: 0,
    screen: SCREEN_TITLE,
    player: createPlayer(spawn.x, spawn.y),
    cars: [],
    peds: createCrowd(rng, city, 42),
    cops: [],
    wanted: createWanted(),
    camera: { x: spawn.x, y: spawn.y },
    shake: 0,
    events: [],
    lastShot: null,
    effects: createEffects(),
    pickups: createPickups(city),
    combat: createCombat(),
    missions: createMissions(),
    audio: createAudio(),
    prompt: null,
    lastFine: 0,
    storyCompleteAt: -99,
    saveExists: false,
  };

  for (let index = 0; index < CAR.trafficCount; index += 1) {
    const kind = rng.pick(TRAFFIC_KINDS);
    const car = createCar(kind, 0, 0, 0, rng.pick(CAR_KINDS[kind].colors));
    placeCarOnRoad(rng, city, car, spawn.x, spawn.y, 500, 2600);
    car.driver = 'traffic';
    game.cars.push(car);
  }
  for (let index = 0; index < CAR.parkedCount; index += 1) {
    const parked = createParkedCar(rng, city, rng.pick(TRAFFIC_KINDS));
    if (parked) game.cars.push(parked);
  }
  // The turquoise coupe of the first job: parked like any other car, but marked.
  let target = null;
  for (let attempt = 0; attempt < 12 && !target; attempt += 1) {
    target = createParkedCar(rng, city, 'coupe');
  }
  if (target) {
    target.color = '#00e5c7';
    game.cars.push(target);
    game.missions.targetCarId = target.id;
  }
  return game;
}

// ---- Save and continue -------------------------------------------------------

function readSave() {
  try {
    const raw = window.localStorage.getItem(PLAYER.saveKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave(game) {
  try {
    window.localStorage.setItem(PLAYER.saveKey, JSON.stringify({
      cash: game.player.cash,
      ammo: game.player.ammo,
      missionIndex: game.missions.missionIndex,
      storyDone: game.missions.storyDone,
      x: Math.round(game.player.x),
      y: Math.round(game.player.y),
    }));
  } catch {
    // Storage can be off (private windows): the run then lasts this visit only.
  }
}

function clearSave() {
  try {
    window.localStorage.removeItem(PLAYER.saveKey);
  } catch {
    // Nothing to clear.
  }
}

function applySave(game, save) {
  game.player.cash = save.cash | 0;
  game.player.ammo = Math.max(0, save.ammo | 0);
  game.missions.missionIndex = clamp(save.missionIndex | 0, 0, 3);
  game.missions.storyDone = Boolean(save.storyDone);
  game.missions.stage = game.missions.storyDone ? 'free' : 'toGarage';
  game.player.x = save.x;
  game.player.y = save.y;
  game.camera.x = save.x;
  game.camera.y = save.y;
}

// ---- The simulation step ------------------------------------------------------

/** What the E key would do right now, as a prompt line for the HUD. */
function computePrompt(game) {
  const player = game.player;
  if (game.screen !== SCREEN_PLAY) {
    game.prompt = null;
    return;
  }
  if (player.car) {
    game.prompt = 'E — Exit car';
    return;
  }
  const car = nearestEnterableCar(game, 66);
  if (car) {
    game.prompt = car.id === game.missions.targetCarId ? 'E — Steal the coupe' : 'E — Enter car';
    return;
  }
  game.prompt = null;
}

/** Turn the step's events into sound, shake, crime reports and screen changes. */
function processEvents(game) {
  const player = game.player;
  for (const event of game.events) {
    switch (event.type) {
      case 'shot': game.audio.shot(); break;
      case 'dryFire': game.audio.dryFire(); break;
      case 'melee': game.audio.melee(); break;
      case 'pickup': case 'package': game.audio.pickup(); break;
      case 'enterCar': case 'missionStart': game.audio.click(); break;
      case 'honk': {
        if (Math.hypot(event.car.x - player.x, event.car.y - player.y) < 640) game.audio.honk();
        break;
      }
      case 'pedHit': {
        if (event.car.driver === 'player') {
          reportCrime(game, 'hitPed');
          game.shake = Math.min(16, game.shake + 4);
          game.audio.crash(0.22);
        }
        break;
      }
      case 'carCrash': {
        const { a, b, impact } = event;
        const involved = a === player.car || b === player.car;
        spawnParticles(game, (a.x + b.x) / 2, (a.y + b.y) / 2, {
          count: impact > 260 ? 12 : 5,
          color: ['#ffd60a', '#e9e2cf', '#9aa0a6'],
          speed: 240,
          size: 2.8,
        });
        if (involved) {
          const other = a === player.car ? b : a;
          reportCrime(game, other.kind === 'police' ? 'hitCop' : 'hitCar');
          game.audio.crash(clamp(impact / 520, 0.12, 0.5));
        }
        break;
      }
      case 'playerCrash': {
        game.audio.crash(clamp(event.impact / 560, 0.12, 0.5));
        const car = player.car;
        if (car) {
          spawnParticles(game, car.x, car.y, {
            count: 8, color: ['#e9e2cf', '#ffb703'], speed: 200, size: 2.6,
          });
        }
        break;
      }
      case 'driverBails': {
        const car = event.car;
        const ped = createPedestrian(game.rng, [
          { x: car.x - 30, y: car.y + 30 },
          { x: car.x - 260, y: car.y + 190 },
        ], false);
        ped.x = car.x - 26;
        ped.y = car.y + 20;
        ped.state = 'flee';
        if (game.peds.length < 80) game.peds.push(ped);
        break;
      }
      case 'missionCarWrecked': {
        const old = game.cars.find((car) => car.id === game.missions.targetCarId);
        if (old) game.cars.splice(game.cars.indexOf(old), 1);
        const fresh = createParkedCar(game.rng, game.city, 'coupe');
        if (fresh) {
          fresh.color = '#00e5c7';
          game.cars.push(fresh);
          game.missions.targetCarId = fresh.id;
        }
        break;
      }
      case 'missionComplete': {
        game.audio.jingle();
        if (event.mission === 2) game.storyCompleteAt = game.time;
        writeSave(game);
        break;
      }
      case 'busted': {
        game.lastFine = Math.min(player.cash, 120 + game.wanted.level * 60);
        player.cash -= game.lastFine;
        game.wanted.heat = 0;
        game.wanted.bust = 0;
        game.screen = SCREEN_BUSTED;
        game.audio.sting();
        break;
      }
      case 'wasted': {
        game.screen = SCREEN_WASTED;
        game.audio.sting();
        break;
      }
      default:
        break;
    }
  }
  game.events.length = 0;
}

/** Advance the whole world one fixed step. `ctl` is the step's control state. */
function stepGame(game, ctl) {
  const dt = STEP;
  game.time += dt;
  updatePlayer(game, ctl, dt);
  for (const car of game.cars) {
    if (car.driver !== 'traffic') continue;
    const control = updateTrafficCar(car, dt, game);
    stepCarPhysics(car, control, dt, game);
  }
  resolveCarCollisions(game, game.events);
  updatePolice(game, dt);
  updatePedestrians(game, dt);
  updateCombat(game, ctl, dt);
  updateMissions(game, ctl, dt);
  processEvents(game);
  game.shake = Math.max(0, game.shake - 55 * dt);
  updateCamera(game, dt);
  computePrompt(game);
  game.audio.update(game, dt);
}

// ---- Shot mode -----------------------------------------------------------------

function runShot(name) {
  const game = createGame(seed);
  game.screen = name === 'title' ? SCREEN_TITLE : SCREEN_PLAY;
  stageShot(name, game, stepGame);
  let painted = 0;
  function paint() {
    renderer.draw(game);
    hud.draw(game, renderer.view);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

// ---- Live mode -----------------------------------------------------------------

function runGame() {
  const input = createInput(canvas);
  let game = createGame(seed);
  game.saveExists = Boolean(readSave());
  let accumulator = 0;
  let last = performance.now();
  let saveTimer = 0;
  let attackLatch = false;

  function announce(message) {
    status.textContent = message;
  }

  function freshGame(apply) {
    const save = apply ? readSave() : null;
    game = createGame(seed);
    game.saveExists = Boolean(readSave());
    if (save) applySave(game, save);
    game.screen = SCREEN_PLAY;
    accumulator = 0;
    attackLatch = true;
    announce('Playing Vice Harbor.');
  }

  function backOnStreet() {
    // After a bust or a wasting: the car is impounded, the heat is gone, the
    // player wakes by the promenade with their health and their story intact.
    const player = game.player;
    if (player.car) {
      player.car.driver = null;
      player.car.parked = true;
      player.car.speed = 0;
      player.car = null;
    }
    for (let index = game.cars.length - 1; index >= 0; index -= 1) {
      if (game.cars[index].driver === 'police') game.cars.splice(index, 1);
    }
    game.cops = [];
    game.wanted.heat = 0;
    game.wanted.bust = 0;
    player.health = 100;
    player.x = game.city.landmarks.spawn.x;
    player.y = game.city.landmarks.spawn.y;
    game.camera.x = player.x;
    game.camera.y = player.y;
    game.screen = SCREEN_PLAY;
    writeSave(game);
    announce('Back on the street.');
  }

  function handleActions(actions) {
    if (actions) game.audio.init();
    if (game.screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) freshGame(game.saveExists);
      return;
    }
    if (game.screen === SCREEN_BUSTED || game.screen === SCREEN_WASTED) {
      if (actions & ACTION_CONFIRM) backOnStreet();
      return;
    }
    if (actions & ACTION_PAUSE) {
      game.screen = game.screen === SCREEN_PLAY ? SCREEN_PAUSED : SCREEN_PLAY;
      announce(game.screen === SCREEN_PAUSED ? 'Paused.' : 'Playing.');
      return;
    }
    if (game.screen !== SCREEN_PLAY) return;
    if (actions & ACTION_FISTS) game.player.weapon = 'fists';
    if (actions & ACTION_PISTOL) game.player.weapon = 'pistol';
    if (actions & ACTION_INTERACT) {
      if (game.player.car) exitCar(game);
      else {
        const car = nearestEnterableCar(game, 66);
        if (car) enterCar(game, car);
      }
    }
  }

  window.addEventListener('keydown', (event) => {
    game.audio.init();
    if (event.code === 'KeyN' && game.screen === SCREEN_TITLE) {
      clearSave();
      freshGame(false);
    }
  });
  window.addEventListener('pointerdown', () => game.audio.init());

  function buildCtl(actions) {
    const cam = game.camera;
    return {
      moveX: input.axisX(),
      moveY: input.axisY(),
      sprint: input.sprint(),
      interact: false,
      interactPressed: Boolean(actions & ACTION_INTERACT),
      attack: input.mouse.down && !attackLatch,
      aimX: input.mouse.x + cam.x - VIEW.width / 2,
      aimY: input.mouse.y + cam.y - VIEW.height / 2,
    };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameSeconds = Math.min((now - last) / 1000, MAX_FRAME);
    const actions = input.takeActions();
    handleActions(actions);
    if (!input.mouse.down) attackLatch = false;
    accumulator += frameSeconds;
    last = now;
    if (game.screen === SCREEN_PLAY) {
      const ctl = buildCtl(actions);
      while (accumulator >= STEP) {
        stepGame(game, ctl);
        ctl.interactPressed = false;
        accumulator -= STEP;
      }
      saveTimer += frameSeconds;
      if (saveTimer > 6) {
        saveTimer = 0;
        writeSave(game);
      }
    } else if (game.screen === SCREEN_TITLE) {
      // The city idles behind the title: traffic rolls, crowds stroll.
      const ctl = {
        moveX: 0, moveY: 0, sprint: false, interact: false,
        interactPressed: false, attack: false, aimX: 0, aimY: 0,
      };
      while (accumulator >= STEP) {
        game.time += STEP;
        for (const car of game.cars) {
          if (car.driver !== 'traffic') continue;
          const control = updateTrafficCar(car, STEP, game);
          stepCarPhysics(car, control, STEP, game);
        }
        resolveCarCollisions(game, game.events);
        game.events.length = 0;
        updatePedestrians(game, STEP);
        updateCamera(game, STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(game);
    hud.draw(game, renderer.view);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.screen === SCREEN_PLAY) {
      game.screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Vice Harbor. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
