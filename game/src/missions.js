// The story of Vice Harbor, in three jobs for the fixer Marisol Vega. Between jobs
// the player is sent to the garage; walking in starts the briefing dialogue, and
// the mission that follows is a small state machine: steal and deliver a car, run
// three packages while the heat rises, then escape to the marina and hold out.
// Objectives and waypoints are recomputed every step, so the HUD and the minimap
// always point at the live target — including a car that is being driven away.
import { REWARDS } from './config.js';
import { setWantedAtLeast } from './police.js';
import { dist2 } from './random.js';

const BRIEFINGS = [
  [
    { speaker: 'Marisol Vega', text: "You're the new driver everyone's talking about? I'm Marisol Vega. I move cars in this harbor. No questions, ever." },
    { speaker: 'Marisol Vega', text: 'First job: a turquoise coupe parked up on the avenue. Steal it, and bring it to my garage — intact.' },
    { speaker: 'You', text: 'And if the owner objects?' },
    { speaker: 'Marisol Vega', text: 'Then drive faster, baby.' },
  ],
  [
    { speaker: 'Marisol Vega', text: 'Three packages washed up around the harbor. Collect every one and bring them back here.' },
    { speaker: 'Marisol Vega', text: 'The police are watching the water today. Every package makes you more interesting to them.' },
  ],
  [
    { speaker: 'Marisol Vega', text: "Last job, and it's loud: the whole harbor will come after you. Reach my boat at the marina." },
    { speaker: 'Marisol Vega', text: 'Stay in the circle at the pier for twenty seconds while my people wave you off. Survive that, and we are rich.' },
  ],
];

const THANKS = [
  [{ speaker: 'Marisol Vega', text: "Clean paint, clean work. $500. You're hired." }],
  [{ speaker: 'Marisol Vega', text: '$900. You handle angry cops like you were born to it.' }],
  [{ speaker: 'Marisol Vega', text: 'You made it. $1500 — and Vice Harbor is yours now. Come by whenever you want work.' }],
];

/** Package spots for the second job: the pier, an inland sidewalk, the beach parking. */
const PACKAGE_SPOTS = [
  { x: 4060, y: 1440 },
  { x: 1700, y: 2100 },
  { x: 3350, y: 700 },
];

export function createMissions() {
  return {
    missionIndex: 0,
    storyDone: false,
    stage: 'toGarage',
    objective: '',
    waypoint: null,
    dialogue: [],
    dialogueTimer: 0,
    targetCarId: -1,
    bayTimer: 0,
    packages: [],
    packagesTaken: 0,
    holdoutLeft: 0,
  };
}

/** Put lines on the dialogue banner; they advance on a timer or the interact key. */
export function speak(game, lines) {
  game.missions.dialogue = lines.map((line) => ({ ...line }));
  game.missions.dialogueTimer = 3.4;
}

export function currentDialogue(game) {
  return game.missions.dialogue.length > 0 ? game.missions.dialogue[0] : null;
}

function startMission(game) {
  const m = game.missions;
  const index = m.missionIndex;
  speak(game, BRIEFINGS[index]);
  if (index === 0) {
    m.stage = 'steal';
  } else if (index === 1) {
    m.stage = 'collect';
    m.packages = PACKAGE_SPOTS.map((spot) => ({ ...spot, taken: false }));
    m.packagesTaken = 0;
  } else {
    m.stage = 'escape';
    setWantedAtLeast(game, 3);
  }
  game.events.push({ type: 'missionStart', mission: index });
}

function completeMission(game) {
  const m = game.missions;
  const index = m.missionIndex;
  const reward = [REWARDS.firstWheels, REWARDS.packageRun, REWARDS.harborHeat][index];
  game.player.cash += reward;
  speak(game, THANKS[index]);
  game.events.push({ type: 'missionComplete', mission: index, reward });
  m.missionIndex += 1;
  if (m.missionIndex >= 3) {
    m.storyDone = true;
    m.stage = 'free';
    game.wanted.heat = 0;
  } else {
    m.stage = 'toGarage';
  }
}

function targetCar(game) {
  return game.cars.find((car) => car.id === game.missions.targetCarId) ?? null;
}

/**
 * Advance the story one step. `ctl.interactPressed` skips the current dialogue
 * line. Everything else is positions and timers, checked against the live world.
 */
export function updateMissions(game, ctl, dt) {
  const m = game.missions;
  const player = game.player;
  const garage = game.city.landmarks;

  if (m.dialogue.length > 0) {
    m.dialogueTimer -= dt;
    if (m.dialogueTimer <= 0 || ctl.interactPressed) {
      m.dialogue.shift();
      m.dialogueTimer = 3.4;
    }
  }

  m.objective = '';
  m.waypoint = null;

  switch (m.stage) {
    case 'toGarage': {
      m.objective = 'Meet Marisol at Vega\u2019s Garage';
      m.waypoint = garage.garagePoint;
      if (!player.car && m.dialogue.length === 0
        && dist2(player.x, player.y, garage.garagePoint.x, garage.garagePoint.y) < 58 * 58) {
        startMission(game);
      }
      break;
    }
    case 'steal': {
      const car = targetCar(game);
      m.objective = 'Steal the turquoise coupe';
      if (car) {
        m.waypoint = { x: car.x, y: car.y };
        if (car.health <= 0) {
          // The mark is wrecked: Marisol finds another, and the job restarts.
          speak(game, [{ speaker: 'Marisol Vega', text: 'That coupe is scrap now. I found you another — try keeping it pretty.' }]);
          game.events.push({ type: 'missionCarWrecked' });
          m.stage = 'steal';
        } else if (player.car === car) {
          m.stage = 'deliver';
        }
      }
      break;
    }
    case 'deliver': {
      const car = targetCar(game);
      m.objective = 'Deliver the coupe to Vega\u2019s Garage';
      m.waypoint = { x: garage.garageBay.x + garage.garageBay.w / 2, y: garage.garageBay.y + garage.garageBay.h / 2 };
      if (car && player.car === car) {
        const bay = garage.garageBay;
        const inBay = car.x > bay.x && car.x < bay.x + bay.w && car.y > bay.y && car.y < bay.y + bay.h;
        if (inBay && Math.abs(car.speed) < 25) {
          m.bayTimer += dt;
          if (m.bayTimer > 0.8) {
            m.bayTimer = 0;
            car.ownedByPlayer = true;
            completeMission(game);
          }
        } else m.bayTimer = 0;
      }
      break;
    }
    case 'collect': {
      let nearest = null;
      let nearestD = Infinity;
      for (const pack of m.packages) {
        if (pack.taken) continue;
        const d = dist2(player.x, player.y, pack.x, pack.y);
        if (d < nearestD) { nearestD = d; nearest = pack; }
      }
      m.objective = `Collect the packages (${m.packagesTaken}/3)`;
      if (nearest) {
        m.waypoint = { x: nearest.x, y: nearest.y };
        if (!player.car && nearestD < 36 * 36) {
          nearest.taken = true;
          m.packagesTaken += 1;
          game.events.push({ type: 'package', taken: m.packagesTaken });
          if (m.packagesTaken === 2) setWantedAtLeast(game, 1);
          if (m.packagesTaken === 3) {
            setWantedAtLeast(game, 2);
            m.stage = 'return';
          }
        }
      }
      break;
    }
    case 'return': {
      m.objective = 'Return to Vega\u2019s Garage';
      m.waypoint = garage.garagePoint;
      if (!player.car && dist2(player.x, player.y, garage.garagePoint.x, garage.garagePoint.y) < 58 * 58) {
        completeMission(game);
      }
      break;
    }
    case 'escape': {
      m.objective = 'Escape to the marina';
      m.waypoint = garage.marina;
      setWantedAtLeast(game, 3);
      const px = player.car ? player.car.x : player.x;
      const py = player.car ? player.car.y : player.y;
      if (dist2(px, py, garage.marina.x, garage.marina.y) < 130 * 130) {
        m.stage = 'holdout';
        m.holdoutLeft = 20;
      }
      break;
    }
    case 'holdout': {
      setWantedAtLeast(game, 3);
      const px = player.car ? player.car.x : player.x;
      const py = player.car ? player.car.y : player.y;
      const inside = dist2(px, py, garage.marina.x, garage.marina.y) < 150 * 150;
      if (inside) m.holdoutLeft -= dt;
      m.objective = inside
        ? `Hold out at the marina — ${Math.max(0, Math.ceil(m.holdoutLeft))}s`
        : 'Get back to the marina circle!';
      m.waypoint = garage.marina;
      if (m.holdoutLeft <= 0) completeMission(game);
      break;
    }
    case 'free': {
      m.objective = game.missions.storyDone ? 'Free roam — the harbor is yours' : '';
      break;
    }
    default:
      break;
  }
}
