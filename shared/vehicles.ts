import { ARENA } from './arena.js';
import { boxesOverlap, defenseBox, type PlacedDefense } from './defenses.js';
import type { MapObstacle } from './maps.js';

export type VehicleType = 'quad' | 'car' | 'van' | 'pickup' | 'workshop' | 'apc' | 'tank';

/** Mounted weapon that aims and fires on its own while somebody is on board. */
export interface VehicleGun {
  damage: number;
  /** seconds between shots */
  fireDelay: number;
  range: number;
  speed: number;
  pierce: number;
  splashRadius?: number;
  splashDamage?: number;
  burn?: number;
  burnSeconds?: number;
}

export interface VehicleConfig {
  label: string;
  short: string;
  cost: number;
  health: number;
  width: number;
  height: number;
  /** How many players fit in at the same time. */
  seats: number;
  /** Top speed while driving. */
  speed: number;
  /** How quickly the hull reaches that speed and comes to a stop again. */
  grip: number;
  /** How fast the hull swings around towards the driving direction. */
  turn: number;
  /** Damage dealt to a zombie the hull runs into at full speed. */
  ram: number;
  gun?: VehicleGun;
  /** Health per second for the crew. */
  heal?: number;
  /** Health per second for every barricade and turret in range. */
  repair?: number;
  repairRange?: number;
  /** Spare rounds per second for the crew. */
  resupply?: number;
  /** Extra top speed while the dash key is held. */
  boost?: number;
  /** The one thing this vehicle does that no other one does. */
  perk: string;
  description: string;
}

/**
 * On foot the game is about walking and dodging, so a vehicle never replaces
 * that: it trades the instant dash for a hull that soaks damage, carries the
 * squad and runs enemies over. Every one of them wears down while it does it.
 */
export const VEHICLES: Record<VehicleType, VehicleConfig> = {
  quad: {
    label: 'Quad',
    short: '🏍',
    cost: 850,
    health: 800,
    width: 54,
    height: 34,
    seats: 1,
    speed: 250,
    grip: 7.5,
    turn: 7,
    ram: 38,
    boost: 140,
    perk: 'Nitro auf der Dash-Taste',
    description: 'Wendiger Einsitzer, dünnes Blech, dafür schnell wieder aus der Gefahr',
  },
  car: {
    label: 'Geländewagen',
    short: '🚙',
    cost: 1500,
    health: 1600,
    width: 86,
    height: 44,
    seats: 2,
    speed: 190,
    grip: 5.2,
    turn: 4.6,
    ram: 68,
    perk: 'Allrounder für zwei',
    description: 'Solide Karosserie, gutes Tempo, hält zwei Überlebende zusammen',
  },
  van: {
    label: 'Mannschaftswagen',
    short: '🚐',
    cost: 2300,
    health: 2400,
    width: 100,
    height: 50,
    seats: 4,
    speed: 165,
    grip: 3.8,
    turn: 3.4,
    ram: 52,
    heal: 4.5,
    perk: 'Bordlazarett heilt die Besatzung',
    description: 'Der ganze Trupp passt rein und wird während der Fahrt versorgt',
  },
  pickup: {
    label: 'Kampf-Pickup',
    short: '🛻',
    cost: 2900,
    health: 1900,
    width: 92,
    height: 44,
    seats: 2,
    speed: 185,
    grip: 4.8,
    turn: 4.2,
    ram: 74,
    gun: { damage: 17, fireDelay: 0.2, range: 430, speed: 900, pierce: 0 },
    perk: 'MG auf der Ladefläche feuert selbst',
    description: 'Fährt mit einem Maschinengewehr, das von allein auf die Horde hält',
  },
  workshop: {
    label: 'Werkstattwagen',
    short: '🚚',
    cost: 3700,
    health: 2800,
    width: 104,
    height: 52,
    seats: 3,
    speed: 150,
    grip: 3.4,
    turn: 3,
    ram: 48,
    repair: 26,
    repairRange: 260,
    resupply: 2.2,
    perk: 'Repariert Bauten und füllt Munition auf',
    description:
      'Fahrende Werkstatt: flickt Barrikaden und Türme in der Nähe und liefert Nachschub',
  },
  apc: {
    label: 'Schützenpanzer',
    short: '🚛',
    cost: 5200,
    health: 5000,
    width: 108,
    height: 54,
    seats: 4,
    speed: 130,
    grip: 3,
    turn: 2.6,
    ram: 105,
    gun: { damage: 34, fireDelay: 0.42, range: 540, speed: 1050, pierce: 2 },
    perk: 'Schwere Panzerung für vier',
    description: 'Rollende Festung mit Bordkanone — langsam, aber kaum kleinzukriegen',
  },
  tank: {
    label: 'Kampfpanzer',
    short: '🛡',
    cost: 8200,
    health: 7600,
    width: 118,
    height: 60,
    seats: 2,
    speed: 105,
    grip: 2.4,
    turn: 1.9,
    ram: 165,
    gun: {
      damage: 60,
      fireDelay: 1.6,
      range: 700,
      speed: 700,
      pierce: 0,
      splashRadius: 150,
      splashDamage: 120,
    },
    perk: 'Sprengkanone walzt ganze Reihen nieder',
    description: 'Endgame: kriecht über das Feld und räumt mit Kettenkanone und Gewicht auf',
  },
};

export const VEHICLE_ORDER: VehicleType[] = [
  'quad',
  'car',
  'van',
  'pickup',
  'workshop',
  'apc',
  'tank',
];

/** How far from the hull a player may get in, repair or sell it. */
export const VEHICLE_REACH = 104;
/** Every armour level keeps this share of incoming damage off the hull. */
export const VEHICLE_ARMOR_STEP = 0.01;
/** Hüllenschutz stays capped so even an upgraded vehicle still wears down. */
export const VEHICLE_MAX_ARMOR_REDUCTION = 0.35;
/** Motor upgrades help positioning without turning a protected hull into an escape tool again. */
export const VEHICLE_SPEED_STEP = 0.01;
export const VEHICLE_MAX_SPEED_BONUS = 0.4;
/** Seconds before the same zombie can be run over again. */
export const VEHICLE_RAM_COOLDOWN = 0.45;
/** Share of the ram damage the hull takes itself — driving through wears it out. */
export const VEHICLE_RAM_SELF = 0.14;
/** Damage everyone inside takes when the hull goes up. */
export const VEHICLE_WRECK_DAMAGE = 45;
/** Below this share of the top speed a ram is just a nudge. */
export const VEHICLE_RAM_MIN_SPEED = 0.35;
/** How long one nitro burst lasts — it costs a dash charge. */
export const VEHICLE_BOOST_SECONDS = 1.1;

export function vehicleMaxHealth(type: VehicleType, healthLevel = 0) {
  return Math.round(VEHICLES[type].health * (1 + healthLevel * 0.02));
}

export function vehicleTopSpeed(type: VehicleType, speedLevel = 0) {
  const bonus = Math.min(
    VEHICLE_MAX_SPEED_BONUS,
    Math.max(0, Math.floor(speedLevel)) * VEHICLE_SPEED_STEP,
  );
  return VEHICLES[type].speed * (1 + bonus);
}

export function vehicleRamDamage(type: VehicleType, ramLevel = 0) {
  return VEHICLES[type].ram * (1 + ramLevel * 0.02);
}

export function vehicleGunDamage(damage: number, gunLevel = 0) {
  return damage * (1 + gunLevel * 0.02);
}

/** Share of incoming damage removed by the permanent hull-armour upgrade. */
export function vehicleArmorReduction(armorLevel = 0) {
  return Math.min(
    VEHICLE_MAX_ARMOR_REDUCTION,
    Math.max(0, Math.floor(armorLevel)) * VEHICLE_ARMOR_STEP,
  );
}

/** Same rule as for structures: only real damage lowers the sale value. */
export function vehicleSellValue(type: VehicleType, health: number, maxHealth: number) {
  const condition = maxHealth > 0 ? Math.max(0, Math.min(1, health / maxHealth)) : 0;
  return Math.round(VEHICLES[type].cost * condition);
}

export interface PlacedVehicle {
  type: VehicleType;
  x: number;
  y: number;
  rotation: number;
}

/** Axis aligned size of a parked vehicle; it may be dropped off turned by 90°. */
export function vehicleFootprint(type: VehicleType, rotation: number) {
  const config = VEHICLES[type];
  const turned = Math.abs(Math.sin(rotation)) > 0.5;
  return {
    w: turned ? config.height : config.width,
    h: turned ? config.width : config.height,
  };
}

function vehicleBox(vehicle: PlacedVehicle) {
  const size = vehicleFootprint(vehicle.type, vehicle.rotation);
  return { x: vehicle.x, y: vehicle.y, w: size.w, h: size.h };
}

/** A vehicle needs its parking space free of walls, buildings and other hulls. */
export function canPlaceVehicle(
  candidate: PlacedVehicle,
  defenses: Iterable<PlacedDefense>,
  vehicles: Iterable<PlacedVehicle>,
  obstacles: readonly MapObstacle[],
) {
  const box = vehicleBox(candidate);
  if (
    box.x - box.w / 2 < 30 ||
    box.x + box.w / 2 > ARENA.width - 30 ||
    box.y - box.h / 2 < 30 ||
    box.y + box.h / 2 > ARENA.height - 30
  ) {
    return false;
  }
  for (const rect of obstacles) if (boxesOverlap(box, rect)) return false;
  for (const defense of defenses) if (boxesOverlap(box, defenseBox(defense))) return false;
  for (const other of vehicles) if (boxesOverlap(box, vehicleBox(other))) return false;
  return true;
}

/** A point in the vehicle's own frame, so a turned hull stays a rectangle. */
function localPoint(vehicle: PlacedVehicle, x: number, y: number) {
  const cos = Math.cos(-vehicle.rotation);
  const sin = Math.sin(-vehicle.rotation);
  const dx = x - vehicle.x;
  const dy = y - vehicle.y;
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

/** Distance from a point to the hull, 0 while standing on it. */
export function distanceToVehicle(x: number, y: number, vehicle: PlacedVehicle) {
  const config = VEHICLES[vehicle.type];
  const local = localPoint(vehicle, x, y);
  return Math.hypot(
    Math.max(Math.abs(local.x) - config.width / 2, 0),
    Math.max(Math.abs(local.y) - config.height / 2, 0),
  );
}

export function circleOverlapsVehicle(
  x: number,
  y: number,
  radius: number,
  vehicle: PlacedVehicle,
) {
  return distanceToVehicle(x, y, vehicle) < radius;
}

/**
 * Push a circle out of a hull, the way players and zombies are kept from
 * standing inside one. Returns the corrected position.
 */
export function pushOutOfVehicle(
  x: number,
  y: number,
  radius: number,
  vehicle: PlacedVehicle,
): { x: number; y: number } {
  const config = VEHICLES[vehicle.type];
  const local = localPoint(vehicle, x, y);
  const halfWidth = config.width / 2;
  const halfHeight = config.height / 2;
  const closestX = Math.max(-halfWidth, Math.min(halfWidth, local.x));
  const closestY = Math.max(-halfHeight, Math.min(halfHeight, local.y));
  let offsetX = local.x - closestX;
  let offsetY = local.y - closestY;
  const distance = Math.hypot(offsetX, offsetY);
  if (distance >= radius) return { x, y };

  if (distance === 0) {
    // Dead centre: leave over the closest edge instead of picking a corner.
    const pushX = halfWidth + radius - Math.abs(local.x);
    const pushY = halfHeight + radius - Math.abs(local.y);
    if (pushX < pushY) local.x += (local.x < 0 ? -1 : 1) * pushX;
    else local.y += (local.y < 0 ? -1 : 1) * pushY;
  } else {
    offsetX /= distance;
    offsetY /= distance;
    local.x += offsetX * (radius - distance);
    local.y += offsetY * (radius - distance);
  }

  const cos = Math.cos(vehicle.rotation);
  const sin = Math.sin(vehicle.rotation);
  return {
    x: vehicle.x + local.x * cos - local.y * sin,
    y: vehicle.y + local.x * sin + local.y * cos,
  };
}

/**
 * The two circles a hull is treated as while driving. A capsule is close enough
 * to a car and far cheaper than turning every wall into an oriented box.
 */
export function vehicleWheels(vehicle: PlacedVehicle) {
  const config = VEHICLES[vehicle.type];
  const radius = config.height / 2;
  const reach = Math.max(0, config.width / 2 - radius);
  const cos = Math.cos(vehicle.rotation) * reach;
  const sin = Math.sin(vehicle.rotation) * reach;
  return {
    radius,
    points: [
      { x: vehicle.x + cos, y: vehicle.y + sin },
      { x: vehicle.x - cos, y: vehicle.y - sin },
    ],
  };
}

export interface VehicleMotion {
  x: number;
  y: number;
  rotation: number;
  vx: number;
  vy: number;
}

/**
 * One driving step, shared by server and browser so the local prediction and
 * the authoritative hull agree. Heavy vehicles keep their momentum — that
 * weight is what makes them a trade against the instant dodge of a dash.
 */
export function driveVehicle(
  motion: VehicleMotion,
  dirX: number,
  dirY: number,
  config: VehicleConfig,
  delta: number,
  topSpeed: number,
) {
  const length = Math.hypot(dirX, dirY);
  const targetX = length > 0 ? (dirX / length) * topSpeed : 0;
  const targetY = length > 0 ? (dirY / length) * topSpeed : 0;
  const grip = 1 - Math.exp(-config.grip * delta);
  motion.vx += (targetX - motion.vx) * grip;
  motion.vy += (targetY - motion.vy) * grip;
  // Rolling out forever would leave hulls drifting across the map on their own.
  if (length === 0 && Math.hypot(motion.vx, motion.vy) < 6) {
    motion.vx = 0;
    motion.vy = 0;
  }
  motion.x += motion.vx * delta;
  motion.y += motion.vy * delta;

  const speed = Math.hypot(motion.vx, motion.vy);
  if (speed > 8) {
    let difference = Math.atan2(motion.vy, motion.vx) - motion.rotation;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    const step = config.turn * delta;
    motion.rotation += Math.max(-step, Math.min(step, difference));
  }
  return speed;
}
