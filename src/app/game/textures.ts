import Phaser from 'phaser';
import {
  BARRICADE_ORDER,
  DEFENSES,
  MAPS,
  VEHICLES,
  ZOMBIES,
  ZOMBIE_TYPES,
  type DefenseType,
  type ObstacleKind,
  type VehicleType,
  type WeaponType,
  type ZombieType,
} from '../../../shared/game-types';

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

export const PLAYER_COLORS = ['#69f0ae', '#57b8ff', '#ffcc66', '#ff6b8a'];

/** Distance from the player centre to the muzzle of each weapon. */
export const WEAPON_MUZZLE: Record<WeaponType, number> = {
  pistol: 30,
  crowbar: 58,
  smg: 38,
  rifle: 48,
  shotgun: 46,
  fireaxe: 62,
  nailgun: 48,
  magnum: 40,
  sniper: 58,
  acid: 44,
  lmg: 52,
  elephant: 60,
  flamer: 40,
  chainsaw: 54,
  cryo: 44,
  rocket: 50,
  firerocket: 54,
  tesla: 42,
  laser: 48,
  railgun: 62,
  phaselance: 68,
  gravity: 50,
  nova: 52,
  ionstorm: 54,
  worldbreaker: 64,
  sun: 60,
};

export const OBSTACLE_TEXTURE_SIZE: Record<ObstacleKind, { w: number; h: number }> = {
  car: { w: 116, h: 58 },
  container: { w: 190, h: 78 },
  crate: { w: 54, h: 54 },
  rock: { w: 76, h: 68 },
  barrel: { w: 42, h: 42 },
  tree: { w: 58, h: 58 },
  wall: { w: 210, h: 34 },
  sandbag: { w: 96, h: 40 },
  pipe: { w: 150, h: 44 },
  ruin: { w: 132, h: 118 },
};

function make(scene: Phaser.Scene, key: string, w: number, h: number, paint: Painter) {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, Math.ceil(w), Math.ceil(h));
  if (!texture) return;
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, w, h);
  paint(ctx, w, h);
  texture.refresh();
}

function rounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillRounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke?: string,
  lineWidth = 2,
) {
  rounded(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function circle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  stroke?: string,
  lineWidth = 2,
) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function shade(hex: string, amount: number) {
  const color = Phaser.Display.Color.HexStringToColor(hex);
  const mix = amount < 0 ? 0 : 255;
  const ratio = Math.abs(amount);
  const r = Math.round(color.red + (mix - color.red) * ratio);
  const g = Math.round(color.green + (mix - color.green) * ratio);
  const b = Math.round(color.blue + (mix - color.blue) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

function noise(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  count: number,
  colors: string[],
  min = 1,
  max = 3,
  seed = 1,
) {
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let index = 0; index < count; index += 1) {
    ctx.fillStyle = colors[Math.floor(random() * colors.length)];
    const size = min + random() * (max - min);
    ctx.fillRect(random() * w, random() * h, size, size);
  }
}

// ------------------------------------------------------------------- ground

function paintGround(theme: (typeof MAPS)[number]['theme']): Painter {
  return (ctx, w, h) => {
    ctx.fillStyle = theme.ground;
    ctx.fillRect(0, 0, w, h);

    const gradient = ctx.createRadialGradient(w * 0.35, h * 0.3, 10, w * 0.5, h * 0.5, w * 0.8);
    gradient.addColorStop(0, theme.groundAlt);
    gradient.addColorStop(1, theme.ground);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    noise(ctx, w, h, 900, [theme.groundAlt, theme.grid, theme.ground], 1, 3, 7);

    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.65;
    for (let index = 0; index <= w; index += 64) {
      ctx.beginPath();
      ctx.moveTo(index + 0.5, 0);
      ctx.lineTo(index + 0.5, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, index + 0.5);
      ctx.lineTo(w, index + 0.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5;
    let state = 99;
    const random = () => {
      state = (state * 1103515245 + 12345) >>> 0;
      return state / 4294967296;
    };
    for (let index = 0; index < 7; index += 1) {
      ctx.beginPath();
      let x = random() * w;
      let y = random() * h;
      ctx.moveTo(x, y);
      for (let step = 0; step < 5; step += 1) {
        x += (random() - 0.5) * 60;
        y += (random() - 0.5) * 60;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };
}

// ------------------------------------------------------------------- player

function paintPlayerBody(color: string): Painter {
  return (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.save();
    ctx.translate(cx, cy);

    // backpack
    fillRounded(ctx, -22, -13, 16, 26, 5, '#1b2621', '#0d1512', 2);
    // arms
    fillRounded(ctx, 2, -20, 22, 9, 4, shade(color, -0.25), '#0d1512', 2);
    fillRounded(ctx, 2, 11, 22, 9, 4, shade(color, -0.25), '#0d1512', 2);
    // torso
    fillRounded(ctx, -14, -16, 30, 32, 9, color, '#0b110f', 2.5);
    // shoulder highlights
    ctx.globalAlpha = 0.35;
    fillRounded(ctx, -12, -14, 26, 10, 6, shade(color, 0.35));
    ctx.globalAlpha = 1;
    // vest
    fillRounded(ctx, -8, -12, 18, 24, 5, '#16221d', '#2e4038', 2);
    fillRounded(ctx, -6, -10, 6, 8, 2, '#2b3d35');
    fillRounded(ctx, -6, 2, 6, 8, 2, '#2b3d35');
    circle(ctx, 5, -5, 2.5, shade(color, 0.5));
    circle(ctx, 5, 5, 2.5, shade(color, 0.5));
    // belt
    ctx.fillStyle = '#0e1714';
    ctx.fillRect(-14, -2, 30, 4);

    ctx.restore();
  };
}

function paintPlayerHead(color: string): Painter {
  return (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    circle(ctx, cx, cy, 11, '#2a3931', '#0d1512', 2);
    // helmet shading
    const gradient = ctx.createLinearGradient(cx - 11, cy, cx + 11, cy);
    gradient.addColorStop(0, 'rgba(0,0,0,0.35)');
    gradient.addColorStop(1, 'rgba(255,255,255,0.18)');
    circle(ctx, cx, cy, 11, gradient as unknown as string);
    // visor
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx + 4, cy - 7);
    ctx.lineTo(cx + 11, cy - 4);
    ctx.lineTo(cx + 11, cy + 4);
    ctx.lineTo(cx + 4, cy + 7);
    ctx.closePath();
    ctx.fillStyle = shade(color, 0.35);
    ctx.fill();
    ctx.strokeStyle = '#0d1512';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    // antenna
    ctx.strokeStyle = '#0d1512';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 8);
    ctx.lineTo(cx - 10, cy - 14);
    ctx.stroke();
  };
}

function paintPlayerLeg(color: string): Painter {
  return (ctx, w, h) => {
    fillRounded(ctx, 1, 1, w - 2, h - 2, 4, shade(color, -0.45), '#0b110f', 2);
    ctx.fillStyle = '#0b110f';
    ctx.fillRect(w - 7, 2, 5, h - 4);
  };
}

// ------------------------------------------------------------------ weapons

const WEAPON_PAINTERS: Record<WeaponType, Painter> = {
  pistol: (ctx) => {
    fillRounded(ctx, 8, 10, 22, 7, 2, '#c8d4cd', '#1b2723', 1.5);
    fillRounded(ctx, 4, 12, 8, 12, 2, '#8f9d96', '#1b2723', 1.5);
  },
  crowbar: (ctx) => {
    ctx.strokeStyle = '#c8d1cc';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(8, 24);
    ctx.lineTo(59, 8);
    ctx.lineTo(67, 4);
    ctx.stroke();
    ctx.strokeStyle = '#7e8b85';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(59, 8);
    ctx.lineTo(68, 14);
    ctx.stroke();
    ctx.lineCap = 'butt';
  },
  smg: (ctx) => {
    fillRounded(ctx, 6, 9, 34, 8, 2, '#3d4a44', '#141d19', 1.5);
    fillRounded(ctx, 34, 10, 14, 5, 2, '#9aa8a1', '#141d19', 1.5);
    fillRounded(ctx, 14, 16, 7, 14, 2, '#2b3630', '#141d19', 1.5);
    fillRounded(ctx, 2, 10, 8, 6, 2, '#57665f');
  },
  rifle: (ctx) => {
    fillRounded(ctx, 2, 10, 46, 8, 2, '#41504a', '#141d19', 1.5);
    fillRounded(ctx, 44, 11, 18, 5, 2, '#a8b6ae', '#141d19', 1.5);
    fillRounded(ctx, 20, 17, 8, 15, 2, '#2b3630', '#141d19', 1.5);
    fillRounded(ctx, 14, 5, 16, 5, 2, '#68786f');
  },
  shotgun: (ctx) => {
    fillRounded(ctx, 4, 10, 40, 9, 3, '#5b4130', '#1c1410', 1.5);
    fillRounded(ctx, 40, 9, 20, 10, 3, '#95a49c', '#141d19', 1.5);
    fillRounded(ctx, 18, 19, 16, 7, 3, '#3c2c20');
  },
  fireaxe: (ctx) => {
    fillRounded(ctx, 5, 14, 56, 6, 3, '#8a5633', '#2a170c', 1.5);
    ctx.fillStyle = '#cbd3cf';
    ctx.strokeStyle = '#4d5a54';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(53, 4);
    ctx.lineTo(70, 8);
    ctx.lineTo(66, 26);
    ctx.lineTo(52, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  },
  nailgun: (ctx) => {
    fillRounded(ctx, 3, 8, 38, 12, 3, '#545f58', '#161d19', 1.5);
    fillRounded(ctx, 38, 11, 22, 6, 2, '#c0c8c3', '#161d19', 1.5);
    fillRounded(ctx, 13, 19, 10, 13, 2, '#303a34', '#161d19', 1.5);
    fillRounded(ctx, 8, 3, 25, 6, 2, '#7d8a83');
    ctx.fillStyle = '#d8dfdb';
    for (let x = 12; x < 32; x += 6) ctx.fillRect(x, 4, 2, 4);
  },
  magnum: (ctx) => {
    fillRounded(ctx, 6, 10, 20, 9, 3, '#4a5049', '#151a16', 1.5);
    fillRounded(ctx, 24, 11, 22, 7, 3, '#c3ccc5', '#151a16', 1.5);
    circle(ctx, 22, 14.5, 6, '#8f9d96', '#151a16', 1.5);
    circle(ctx, 22, 14.5, 2, '#202722');
    fillRounded(ctx, 8, 17, 9, 15, 3, '#3a2a20', '#1a120c', 1.5);
    ctx.fillStyle = '#e6ecdf';
    ctx.fillRect(44, 12, 3, 5);
  },
  sniper: (ctx) => {
    fillRounded(ctx, 0, 11, 54, 7, 2, '#3a463f', '#121a16', 1.5);
    fillRounded(ctx, 50, 12, 22, 5, 2, '#b3c1b9', '#121a16', 1.5);
    fillRounded(ctx, 22, 4, 20, 7, 3, '#1d2723', '#5f7169', 1.5);
    circle(ctx, 41, 7.5, 3, '#8fffc1');
    fillRounded(ctx, 24, 18, 8, 14, 2, '#2b3630');
  },
  acid: (ctx) => {
    fillRounded(ctx, 1, 7, 20, 19, 7, '#17485a', '#071b24', 2);
    circle(ctx, 11, 16, 6, '#2eaec4', '#8ff5ff', 1.5);
    fillRounded(ctx, 18, 10, 28, 9, 3, '#315866', '#0d2028', 1.5);
    fillRounded(ctx, 44, 8, 14, 13, 5, '#3d8795', '#0d2028', 1.5);
    circle(ctx, 56, 14.5, 4, '#42e9ff');
    fillRounded(ctx, 22, 18, 8, 13, 2, '#183743');
  },
  lmg: (ctx) => {
    fillRounded(ctx, 2, 9, 44, 10, 3, '#333d38', '#111815', 1.5);
    fillRounded(ctx, 44, 11, 22, 6, 2, '#a3b1a9', '#111815', 1.5);
    fillRounded(ctx, 12, 17, 20, 16, 3, '#242e29', '#111815', 1.5);
    fillRounded(ctx, 40, 20, 4, 12, 2, '#4a5a52');
    fillRounded(ctx, 50, 20, 4, 12, 2, '#4a5a52');
  },
  elephant: (ctx) => {
    fillRounded(ctx, 0, 11, 60, 9, 3, '#3d3127', '#160f0a', 2);
    fillRounded(ctx, 48, 10, 22, 11, 4, '#9d835f', '#21160e', 2);
    fillRounded(ctx, 15, 7, 36, 5, 2, '#6f5a43', '#21160e', 1.5);
    fillRounded(ctx, 7, 18, 22, 8, 3, '#6b4329', '#21160e', 1.5);
    fillRounded(ctx, 25, 20, 9, 12, 2, '#3a2a20', '#17100b', 1.5);
    circle(ctx, 69, 15.5, 3.5, '#ffd489', '#8f5a2a', 1.5);
  },
  flamer: (ctx) => {
    fillRounded(ctx, 0, 6, 18, 20, 6, '#7a3324', '#1d0f0b', 2);
    fillRounded(ctx, 16, 11, 30, 7, 3, '#43504a', '#141d19', 1.5);
    fillRounded(ctx, 44, 8, 14, 12, 4, '#8f5a2a', '#241407', 1.5);
    circle(ctx, 56, 14, 4, '#ffb347');
  },
  chainsaw: (ctx) => {
    fillRounded(ctx, 2, 10, 26, 15, 5, '#9a3428', '#2a100c', 2);
    fillRounded(ctx, 24, 8, 45, 12, 5, '#9da7a2', '#252d29', 2);
    ctx.strokeStyle = '#dbe2de';
    ctx.lineWidth = 2;
    for (let x = 30; x < 66; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, 7);
      ctx.lineTo(x + 3, 3);
      ctx.stroke();
    }
    fillRounded(ctx, 4, 23, 16, 8, 3, '#3d4742', '#171d1a', 1.5);
  },
  cryo: (ctx) => {
    fillRounded(ctx, 0, 7, 16, 18, 5, '#2b4a5a', '#0e1c24', 2);
    fillRounded(ctx, 14, 11, 28, 7, 3, '#3d4f57', '#121d22', 1.5);
    fillRounded(ctx, 40, 8, 16, 12, 5, '#5f8fa8', '#122029', 1.5);
    circle(ctx, 52, 14, 4, '#d8f7ff');
    fillRounded(ctx, 18, 19, 8, 13, 2, '#243239');
  },
  rocket: (ctx) => {
    fillRounded(ctx, 2, 8, 56, 14, 6, '#3f4a3a', '#141a12', 2);
    fillRounded(ctx, 54, 10, 12, 10, 4, '#20281f');
    fillRounded(ctx, 18, 2, 12, 8, 2, '#57665a');
    circle(ctx, 8, 15, 4, '#242c22');
  },
  firerocket: (ctx) => {
    fillRounded(ctx, 2, 7, 54, 16, 7, '#5a3524', '#1c0f08', 2);
    fillRounded(ctx, 52, 10, 14, 10, 4, '#2a1810');
    fillRounded(ctx, 16, 1, 14, 8, 2, '#7a4a2c');
    // fuel bottle under the tube
    fillRounded(ctx, 10, 21, 20, 9, 4, '#8f5a2a', '#241407', 1.5);
    circle(ctx, 8, 15, 4.5, '#ff8f4a', '#ffd489', 1.5);
    circle(ctx, 62, 15, 3.5, '#ffb347');
  },
  tesla: (ctx) => {
    fillRounded(ctx, 4, 10, 30, 10, 3, '#2b3a4a', '#101820', 1.5);
    circle(ctx, 44, 15, 10, '#1b2b3a', '#5fa8ff', 2);
    circle(ctx, 44, 15, 4, '#9fdcff');
    fillRounded(ctx, 16, 19, 8, 13, 2, '#22303c');
  },
  laser: (ctx) => {
    fillRounded(ctx, 2, 9, 40, 11, 4, '#2e2b3e', '#121019', 1.5);
    fillRounded(ctx, 40, 11, 22, 7, 3, '#5d5478', '#121019', 1.5);
    circle(ctx, 60, 14.5, 4.5, '#ff8fd8');
    fillRounded(ctx, 14, 4, 14, 6, 2, '#4a4361');
    fillRounded(ctx, 18, 19, 8, 13, 2, '#241f31');
  },
  railgun: (ctx) => {
    fillRounded(ctx, 0, 11, 62, 8, 3, '#263b43', '#0c161a', 1.5);
    fillRounded(ctx, 18, 7, 42, 4, 2, '#52798a', '#15242a', 1);
    fillRounded(ctx, 18, 19, 42, 4, 2, '#52798a', '#15242a', 1);
    circle(ctx, 62, 15, 5, '#baf7ff', '#4ce0ff', 2);
    fillRounded(ctx, 11, 19, 9, 13, 2, '#1d2c32');
  },
  phaselance: (ctx) => {
    fillRounded(ctx, 0, 12, 24, 7, 3, '#263a42', '#0b171c', 1.5);
    fillRounded(ctx, 21, 10, 11, 11, 4, '#3d6672', '#10232a', 1.5);
    ctx.strokeStyle = '#7eeaff';
    ctx.lineWidth = 6;
    ctx.shadowColor = '#7eeaff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(30, 15);
    ctx.lineTo(70, 15);
    ctx.stroke();
    ctx.shadowBlur = 0;
  },
  gravity: (ctx) => {
    fillRounded(ctx, 1, 8, 34, 14, 5, '#29243e', '#100d1a', 2);
    circle(ctx, 37, 15, 12, '#171126', '#a67cff', 2);
    circle(ctx, 37, 15, 5, '#efe1ff');
    fillRounded(ctx, 45, 11, 18, 8, 4, '#51436f', '#171126', 1.5);
    fillRounded(ctx, 13, 21, 9, 11, 2, '#211b31');
  },
  nova: (ctx) => {
    fillRounded(ctx, 2, 9, 38, 12, 4, '#3a2738', '#160d15', 2);
    for (let index = 0; index < 5; index += 1) {
      const y = 6 + index * 4.5;
      fillRounded(ctx, 38, y, 25, 3.5, 1.5, '#a44f80', '#32152a', 0.8);
    }
    circle(ctx, 35, 15, 6, '#ff9ee0', '#ffd7f1', 1.5);
    fillRounded(ctx, 14, 20, 9, 12, 2, '#2d1c2c');
  },
  ionstorm: (ctx) => {
    fillRounded(ctx, 1, 7, 34, 16, 6, '#18344d', '#07131e', 2);
    circle(ctx, 19, 15, 8, '#245a79', '#62d9ff', 2);
    for (const y of [7, 14, 21]) {
      fillRounded(ctx, 32, y, 27, 4, 2, '#4f91b5', '#102b3d', 1.2);
      circle(ctx, 59, y + 2, 3.5, '#baf5ff', '#62d9ff', 1.2);
    }
    fillRounded(ctx, 10, 21, 9, 11, 2, '#122b3d');
  },
  worldbreaker: (ctx) => {
    fillRounded(ctx, 0, 13, 44, 7, 3, '#6a4827', '#201307', 2);
    fillRounded(ctx, 38, 3, 30, 27, 7, '#48535a', '#151c20', 2);
    circle(ctx, 54, 16, 8, '#5c4931', '#ffd35c', 2);
    ctx.strokeStyle = '#ffd35c';
    ctx.lineWidth = 2;
    for (let index = 0; index < 4; index += 1) {
      const angle = (index * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(54 + Math.cos(angle) * 9, 16 + Math.sin(angle) * 9);
      ctx.lineTo(54 + Math.cos(angle) * 13, 16 + Math.sin(angle) * 13);
      ctx.stroke();
    }
  },
  sun: (ctx) => {
    fillRounded(ctx, 1, 6, 43, 19, 8, '#50351b', '#1b0e05', 2);
    fillRounded(ctx, 40, 9, 24, 12, 5, '#94632a', '#2a1608', 2);
    circle(ctx, 61, 15, 7, '#ffb52e', '#fff1a3', 2);
    circle(ctx, 18, 15, 8, '#6f431d', '#ffd35c', 2);
    ctx.strokeStyle = '#ffd35c';
    ctx.lineWidth = 2;
    for (let index = 0; index < 6; index += 1) {
      const angle = (index * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(18 + Math.cos(angle) * 9, 15 + Math.sin(angle) * 9);
      ctx.lineTo(18 + Math.cos(angle) * 12, 15 + Math.sin(angle) * 12);
      ctx.stroke();
    }
    fillRounded(ctx, 9, 23, 10, 9, 2, '#352212');
  },
};

// ------------------------------------------------------------------ zombies

interface ZombieSkin {
  skin: string;
  cloth: string;
  accent: string;
  eye: string;
}

const ZOMBIE_SKINS: Record<ZombieType, ZombieSkin> = {
  normal: { skin: '#7fa356', cloth: '#3c4a35', accent: '#5b7a3c', eye: '#ffd166' },
  fast: { skin: '#c3cf63', cloth: '#4b4b2c', accent: '#8f9a3c', eye: '#ff8f5a' },
  crawler: { skin: '#9ab86a', cloth: '#38402c', accent: '#6d8a3c', eye: '#ffe08a' },
  big: { skin: '#a5674f', cloth: '#4a3128', accent: '#7d4634', eye: '#ff6b6b' },
  exploder: { skin: '#c64b32', cloth: '#242426', accent: '#ffd23f', eye: '#fff1a8' },
  armored: { skin: '#7a8390', cloth: '#2f353d', accent: '#aab6c2', eye: '#7fd8ff' },
  shieldbearer: { skin: '#6f8060', cloth: '#303a42', accent: '#ffd166', eye: '#fff0a8' },
  phaseguard: { skin: '#608f91', cloth: '#243d42', accent: '#73f7e5', eye: '#d8fffb' },
  evasive: { skin: '#a7bb56', cloth: '#26372a', accent: '#d7ff63', eye: '#f5ffb8' },
  phantom: { skin: '#4b8f86', cloth: '#172f31', accent: '#70f5df', eye: '#d6fffa' },
  spitter: { skin: '#6fae7a', cloth: '#2c4433', accent: '#9dff8a', eye: '#c6ff5a' },
  screamer: { skin: '#b98fa8', cloth: '#4a2e3f', accent: '#ff9ed8', eye: '#ffe08a' },
  brute: { skin: '#8a5f7a', cloth: '#3a2635', accent: '#c05f8f', eye: '#ff5f9e' },
  warden: { skin: '#6b7d8a', cloth: '#2b3540', accent: '#9fd0ff', eye: '#7fd8ff' },
  stalker: { skin: '#a8a05a', cloth: '#40391f', accent: '#ffd166', eye: '#ff8f5a' },
  mortar: { skin: '#7f6a4a', cloth: '#3a2f1e', accent: '#ffa04a', eye: '#ffd166' },
  broodling: { skin: '#8f6f8a', cloth: '#3a2a38', accent: '#d08fc0', eye: '#ff8fd8' },
  butcher: { skin: '#9d3f4a', cloth: '#38181f', accent: '#ff4f6b', eye: '#ffd166' },
  brood: { skin: '#8a4a7d', cloth: '#331a30', accent: '#ff6fd8', eye: '#ffd166' },
  warlord: { skin: '#8f7a3f', cloth: '#3a3018', accent: '#ffcc66', eye: '#fff0a8' },
  artillery: { skin: '#7a5a3a', cloth: '#332616', accent: '#ff9a4a', eye: '#ffd166' },
  vortex: { skin: '#3f7a8a', cloth: '#16303a', accent: '#4ce0d5', eye: '#b8fff6' },
  slag: { skin: '#9d5230', cloth: '#3a1c0e', accent: '#ff8f4a', eye: '#ffe08a' },
  render: { skin: '#6a4f9d', cloth: '#26183a', accent: '#b58cff', eye: '#e0d0ff' },
  swarmqueen: { skin: '#5f8a3f', cloth: '#22331a', accent: '#9be36f', eye: '#e8ff9a' },
  plague: { skin: '#4a8a5f', cloth: '#183322', accent: '#8dff6b', eye: '#d8ffb8' },
  omega: { skin: '#8a2f6a', cloth: '#2e0f26', accent: '#ff5fd0', eye: '#fff0ff' },
  bastion: { skin: '#59616b', cloth: '#20262d', accent: '#ffbd59', eye: '#fff2b3' },
  siren: { skin: '#694b8f', cloth: '#241936', accent: '#67f6ff', eye: '#d8ffff' },
  tunneler: { skin: '#75573c', cloth: '#2e2117', accent: '#a8ff63', eye: '#f2ff9a' },
  roadking: { skin: '#8f3d2f', cloth: '#331713', accent: '#ff6f45', eye: '#ffe078' },
  eclipse: { skin: '#29264d', cloth: '#0d0b20', accent: '#ff477e', eye: '#7cf7ff' },
};

function paintZombieBody(type: ZombieType, radius: number): Painter {
  const skin = ZOMBIE_SKINS[type];
  const rank = ZOMBIES[type].rank;
  const plated =
    rank === 'mini' ||
    rank === 'boss' ||
    type === 'armored' ||
    type === 'shieldbearer' ||
    type === 'phaseguard';
  const crowned = rank === 'boss';
  const explosive = type === 'exploder';
  const glowing = type === 'spitter';
  return (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.save();
    ctx.translate(cx, cy);

    const bodyW = radius * (explosive ? 2.08 : 1.75);
    const bodyH = radius * (explosive ? 2.12 : 1.95);

    // torso
    fillRounded(
      ctx,
      -bodyW / 2,
      -bodyH / 2,
      bodyW,
      bodyH,
      radius * 0.55,
      skin.skin,
      explosive ? '#3a100c' : '#1d2416',
      2.5,
    );
    // tattered shirt
    ctx.save();
    rounded(ctx, -bodyW / 2, -bodyH / 2, bodyW, bodyH, radius * 0.55);
    ctx.clip();
    ctx.fillStyle = skin.cloth;
    ctx.beginPath();
    ctx.moveTo(-bodyW / 2, -bodyH / 2);
    ctx.lineTo(bodyW * 0.1, -bodyH / 2);
    ctx.lineTo(bodyW * 0.02, -bodyH * 0.1);
    ctx.lineTo(bodyW * 0.16, bodyH * 0.2);
    ctx.lineTo(bodyW * 0.05, bodyH / 2);
    ctx.lineTo(-bodyW / 2, bodyH / 2);
    ctx.closePath();
    ctx.fill();
    // wounds
    ctx.fillStyle = skin.accent;
    ctx.beginPath();
    ctx.ellipse(bodyW * 0.12, -bodyH * 0.18, radius * 0.28, radius * 0.16, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(bodyW * 0.05, bodyH * 0.24, radius * 0.2, radius * 0.13, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // shading
    const gradient = ctx.createLinearGradient(0, -bodyH / 2, 0, bodyH / 2);
    gradient.addColorStop(0, 'rgba(0,0,0,0.28)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = gradient;
    ctx.fillRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH);
    ctx.restore();

    if (explosive) {
      // A black demolition harness, warning stripes and a hot detonator make
      // this silhouette readable even in a dense green acid horde.
      fillRounded(
        ctx,
        -bodyW / 2 + 2,
        -radius * 0.17,
        bodyW - 4,
        radius * 0.34,
        radius * 0.1,
        '#171719',
      );
      fillRounded(
        ctx,
        -radius * 0.17,
        -bodyH / 2 + 2,
        radius * 0.34,
        bodyH - 4,
        radius * 0.1,
        '#171719',
      );
      ctx.save();
      rounded(ctx, -bodyW / 2, -bodyH / 2, bodyW, bodyH, radius * 0.55);
      ctx.clip();
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = Math.max(3, radius * 0.2);
      for (let stripe = -2; stripe <= 2; stripe += 1) {
        ctx.beginPath();
        ctx.moveTo(-bodyW * 0.62, stripe * radius * 0.48 - radius * 0.34);
        ctx.lineTo(-bodyW * 0.28, stripe * radius * 0.48 + radius * 0.34);
        ctx.stroke();
      }
      ctx.restore();
      circle(ctx, radius * 0.06, 0, radius * 0.54, '#4b1110', '#ff713f', 3);
      circle(ctx, radius * 0.06, 0, radius * 0.3, '#ff9f32', '#fff1a8', 2);
      circle(ctx, radius * 0.06, 0, radius * 0.11, '#fff7d6');
      ctx.strokeStyle = '#201719';
      ctx.lineWidth = Math.max(2, radius * 0.11);
      ctx.beginPath();
      ctx.moveTo(-radius * 0.12, -radius * 0.46);
      ctx.quadraticCurveTo(-radius * 0.5, -radius * 0.78, -radius * 0.72, -radius * 0.56);
      ctx.stroke();
      circle(ctx, -radius * 0.76, -radius * 0.58, radius * 0.13, '#fff1a8', '#ff5a36', 2);
    }
    if (glowing) {
      circle(ctx, 0, 0, radius * 0.62, 'rgba(196, 255, 79, 0.35)', skin.accent, 2);
      circle(ctx, -radius * 0.1, -radius * 0.15, radius * 0.22, '#e4ff9a');
    }
    if (plated) {
      // armour plates
      ctx.fillStyle = '#2a1f26';
      ctx.fillRect(-bodyW * 0.18, -bodyH / 2 + 2, bodyW * 0.2, bodyH - 4);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(-bodyW * 0.18, -bodyH / 2 + 2, bodyW * 0.06, bodyH - 4);
      for (let index = -2; index <= 2; index += 1) {
        circle(ctx, -bodyW * 0.08, index * radius * 0.32, radius * 0.07, '#c9b48f');
      }
    }

    // head
    const headX = radius * 0.72;
    circle(ctx, headX, 0, radius * 0.62, skin.skin, '#1d2416', 2.5);
    ctx.save();
    ctx.beginPath();
    ctx.arc(headX, 0, radius * 0.62, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(headX - radius, -radius, radius, radius * 2);
    ctx.fillStyle = skin.accent;
    ctx.beginPath();
    ctx.ellipse(
      headX + radius * 0.1,
      -radius * 0.2,
      radius * 0.2,
      radius * 0.1,
      0.6,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
    // eyes
    circle(ctx, headX + radius * 0.26, -radius * 0.22, radius * 0.13, skin.eye);
    circle(ctx, headX + radius * 0.26, radius * 0.22, radius * 0.13, skin.eye);
    // jaw
    ctx.strokeStyle = '#1d2416';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(headX + radius * 0.5, -radius * 0.18);
    ctx.lineTo(headX + radius * 0.66, 0);
    ctx.lineTo(headX + radius * 0.5, radius * 0.18);
    ctx.stroke();

    if (crowned) {
      // crown of spikes
      ctx.fillStyle = '#e8d9b0';
      for (let index = -2; index <= 2; index += 1) {
        ctx.save();
        ctx.translate(headX - radius * 0.1, index * radius * 0.24);
        ctx.rotate(Math.PI);
        ctx.beginPath();
        ctx.moveTo(0, -radius * 0.09);
        ctx.lineTo(radius * 0.42, 0);
        ctx.lineTo(0, radius * 0.09);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  };
}

function paintZombieLimb(type: ZombieType, length: number, thickness: number): Painter {
  const skin = ZOMBIE_SKINS[type];
  return (ctx, w, h) => {
    fillRounded(ctx, 1, 1, length - 2, thickness - 2, thickness / 2, skin.skin, '#1d2416', 2);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(2, h / 2, length - 4, h / 2 - 1);
    ctx.fillStyle = skin.cloth;
    ctx.fillRect(2, 2, Math.max(4, length * 0.32), h - 4);
    void w;
  };
}

// ----------------------------------------------------------------- defenses

const DEFENSE_PAINTERS: Partial<Record<DefenseType, Painter>> = {
  crate: (ctx, w, h) => {
    fillRounded(ctx, 1, 1, w - 2, h - 2, 3, '#825b35', '#2b1b0e', 2.5);
    ctx.strokeStyle = '#4f321b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(4, 4);
    ctx.lineTo(w - 4, h - 4);
    ctx.moveTo(w - 4, 4);
    ctx.lineTo(4, h - 4);
    ctx.stroke();
    ctx.strokeRect(4, 4, w - 8, h - 8);
  },
  block: (ctx, w, h) => {
    fillRounded(ctx, 1, 1, w - 2, h - 2, 5, '#60666a', '#23272a', 3);
    fillRounded(ctx, 7, 7, w - 14, h - 14, 3, '#747b7f', '#454b4f', 2);
    ctx.strokeStyle = 'rgba(25, 29, 31, 0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(8, h * 0.64);
    ctx.lineTo(w * 0.34, h * 0.45);
    ctx.lineTo(w * 0.56, h * 0.55);
    ctx.lineTo(w - 8, h * 0.32);
    ctx.stroke();
    noise(ctx, w, h, 50, ['rgba(0,0,0,0.2)', 'rgba(255,255,255,0.08)'], 1, 2, 71);
  },
  mine: (ctx, w, h) => {
    circle(ctx, w / 2, h / 2, w / 2 - 2, '#272b2d', '#0d1011', 3);
    circle(ctx, w / 2, h / 2, w * 0.25, '#8a2f25', '#ff704d', 2);
    circle(ctx, w / 2, h / 2, w * 0.1, '#ffd166');
    ctx.strokeStyle = '#9ca5aa';
    ctx.lineWidth = 3;
    for (let index = 0; index < 8; index += 1) {
      const angle = (index * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.cos(angle) * w * 0.3, h / 2 + Math.sin(angle) * h * 0.3);
      ctx.lineTo(w / 2 + Math.cos(angle) * w * 0.46, h / 2 + Math.sin(angle) * h * 0.46);
      ctx.stroke();
    }
  },
  wood: (ctx, w, h) => {
    fillRounded(ctx, 1, 1, w - 2, h - 2, 3, '#6b4a30', '#2c1c11', 2);
    ctx.fillStyle = '#8a6440';
    for (let index = 0; index < 3; index += 1) {
      ctx.fillRect(3, 4 + index * ((h - 8) / 3), w - 6, (h - 10) / 3.4);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let index = 0; index < 3; index += 1) {
      ctx.fillRect(3, 4 + index * ((h - 8) / 3) + (h - 10) / 4.2, w - 6, 2);
    }
    ctx.fillStyle = '#3b2a1c';
    ctx.fillRect(w * 0.22, 2, 4, h - 4);
    ctx.fillRect(w * 0.72, 2, 4, h - 4);
    noise(ctx, w, h, 50, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.08)'], 1, 2, 21);
  },
  wire: (ctx, w, h) => {
    ctx.strokeStyle = '#aebbb4';
    ctx.lineWidth = 2;
    for (const y of [h * 0.34, h * 0.66]) {
      ctx.beginPath();
      ctx.moveTo(2, y);
      ctx.lineTo(w - 2, y);
      ctx.stroke();
      for (let x = 7; x < w - 3; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x - 3, y - 4);
        ctx.lineTo(x + 3, y + 4);
        ctx.moveTo(x - 3, y + 4);
        ctx.lineTo(x + 3, y - 4);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#4a3925';
    ctx.fillRect(5, 1, 4, h - 2);
    ctx.fillRect(w - 9, 1, 4, h - 2);
  },
  spike: (ctx, w, h) => {
    ctx.fillStyle = '#4b3722';
    ctx.fillRect(2, h * 0.3, w - 4, h * 0.4);
    ctx.strokeStyle = '#241a10';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, h * 0.3, w - 4, h * 0.4);
    const spikes = 7;
    for (let index = 0; index < spikes; index += 1) {
      const x = 4 + index * ((w - 8) / (spikes - 1));
      ctx.fillStyle = '#c6ccc4';
      ctx.beginPath();
      ctx.moveTo(x - 4, h * 0.32);
      ctx.lineTo(x, 1);
      ctx.lineTo(x + 4, h * 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 4, h * 0.68);
      ctx.lineTo(x, h - 1);
      ctx.lineTo(x + 4, h * 0.68);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(180, 40, 50, 0.55)';
      ctx.fillRect(x - 1.5, 2, 3, 5);
    }
  },
  stone: (ctx, w, h) => {
    fillRounded(ctx, 1, 1, w - 2, h - 2, 4, '#6f7377', '#2b2e30', 2);
    ctx.strokeStyle = '#4a4e51';
    ctx.lineWidth = 2;
    const rows = 3;
    for (let row = 0; row < rows; row += 1) {
      const y = 2 + row * ((h - 4) / rows);
      ctx.beginPath();
      ctx.moveTo(2, y);
      ctx.lineTo(w - 2, y);
      ctx.stroke();
      const offset = row % 2 === 0 ? 0 : (w - 4) / 6;
      for (let col = 0; col < 3; col += 1) {
        const x = 2 + offset + col * ((w - 4) / 3);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + (h - 4) / rows);
        ctx.stroke();
      }
    }
    noise(ctx, w, h, 90, ['rgba(255,255,255,0.09)', 'rgba(0,0,0,0.28)'], 1, 3, 33);
  },
  blastwall: (ctx, w, h) => {
    fillRounded(ctx, 1, 1, w - 2, h - 2, 4, '#4c5551', '#171d1a', 2);
    ctx.fillStyle = '#d1a933';
    for (let x = 5; x < w - 5; x += 16) ctx.fillRect(x, 3, 8, h - 6);
    ctx.fillStyle = '#2a302d';
    for (let x = 13; x < w - 5; x += 16) ctx.fillRect(x, 3, 8, h - 6);
    fillRounded(ctx, w / 2 - 12, 5, 24, h - 10, 5, '#8e302d', '#30100f', 1.5);
    circle(ctx, w / 2, h / 2, 5, '#ff765f', '#ffd166', 1.5);
  },
  steel: (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#8b969c');
    gradient.addColorStop(0.45, '#5d686e');
    gradient.addColorStop(1, '#39434a');
    fillRounded(ctx, 1, 1, w - 2, h - 2, 4, gradient as unknown as string, '#1b2126', 2);
    ctx.fillStyle = '#3d474d';
    ctx.fillRect(w * 0.16, 2, 5, h - 4);
    ctx.fillRect(w * 0.5 - 2.5, 2, 5, h - 4);
    ctx.fillRect(w * 0.84 - 5, 2, 5, h - 4);
    ctx.fillStyle = '#c6d0d4';
    for (const x of [6, w - 8]) {
      for (const y of [5, h - 6]) circle(ctx, x, y, 2.2, '#c6d0d4');
    }
    ctx.fillStyle = 'rgba(255, 200, 80, 0.16)';
    ctx.fillRect(2, h * 0.42, w - 4, 3);
    noise(ctx, w, h, 40, ['rgba(255,255,255,0.12)', 'rgba(0,0,0,0.2)'], 1, 2, 55);
  },
  shockwall: (ctx, w, h) => {
    fillRounded(ctx, 1, 1, w - 2, h - 2, 5, '#263933', '#0d1713', 2);
    ctx.strokeStyle = '#69f0ae';
    ctx.lineWidth = 2;
    for (let x = 8; x < w - 6; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, 4);
      ctx.lineTo(x + 5, h / 2);
      ctx.lineTo(x, h - 4);
      ctx.stroke();
    }
    circle(ctx, 6, h / 2, 3, '#d6ffe7', '#69f0ae', 1);
    circle(ctx, w - 6, h / 2, 3, '#d6ffe7', '#69f0ae', 1);
  },
  cryowall: (ctx, w, h) => {
    fillRounded(ctx, 1, 1, w - 2, h - 2, 6, '#31515e', '#10242c', 2);
    ctx.fillStyle = '#83dff2';
    for (let x = 5; x < w - 4; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, h - 4);
      ctx.lineTo(x + 7, 4);
      ctx.lineTo(x + 13, h - 4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(220,250,255,0.62)';
    ctx.fillRect(4, 4, w - 8, 3);
  },
  titanwall: (ctx, w, h) => {
    fillRounded(ctx, 1, 1, w - 2, h - 2, 7, '#343c42', '#101519', 3);
    ctx.fillStyle = '#59656c';
    for (const x of [7, w / 2 - 3, w - 13]) ctx.fillRect(x, 3, 6, h - 6);
    fillRounded(ctx, w / 2 - 13, 6, 26, h - 12, 7, '#5b4529', '#211608', 2);
    circle(ctx, w / 2, h / 2, 7, '#ffb52e', '#fff0a6', 2);
    ctx.strokeStyle = '#ffcc66';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, w - 8, h - 8);
  },
};

function paintTurretBase(accent: string, size: number): Painter {
  return (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    circle(ctx, cx, cy, size / 2 - 1, '#2c3a34', '#131c18', 2.5);
    circle(ctx, cx, cy, size / 2 - 6, '#3b4c44');
    ctx.strokeStyle = '#131c18';
    ctx.lineWidth = 2;
    for (let index = 0; index < 4; index += 1) {
      const angle = (Math.PI / 2) * index + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * (size / 2 - 8), cy + Math.sin(angle) * (size / 2 - 8));
      ctx.lineTo(cx + Math.cos(angle) * (size / 2 - 1), cy + Math.sin(angle) * (size / 2 - 1));
      ctx.stroke();
    }
    circle(ctx, cx, cy, size * 0.16, '#16211c', accent, 2);
  };
}

const TURRET_GUN_PAINTERS: Partial<Record<DefenseType, Painter>> = {
  mg: (ctx) => {
    fillRounded(ctx, 0, 6, 26, 12, 4, '#41504a', '#131c18', 2);
    fillRounded(ctx, 24, 8, 20, 7, 3, '#9fb0a8', '#131c18', 2);
    fillRounded(ctx, 6, 1, 10, 6, 2, '#5d6d65');
  },
  marksman: (ctx) => {
    fillRounded(ctx, 0, 7, 22, 10, 4, '#39463f', '#121a16', 2);
    fillRounded(ctx, 20, 9, 34, 6, 2, '#b3c1b9', '#121a16', 2);
    fillRounded(ctx, 6, 2, 16, 6, 2, '#1d2723', '#8fffc1', 1.5);
  },
  launcher: (ctx) => {
    fillRounded(ctx, 0, 4, 24, 18, 5, '#3f4a3a', '#141a12', 2);
    fillRounded(ctx, 22, 6, 22, 6, 3, '#59665a', '#141a12', 2);
    fillRounded(ctx, 22, 15, 22, 6, 3, '#59665a', '#141a12', 2);
    circle(ctx, 44, 9, 3, '#ff8f5a');
    circle(ctx, 44, 18, 3, '#ff8f5a');
  },
  triple: (ctx) => {
    fillRounded(ctx, 0, 5, 22, 17, 6, '#33422d', '#111811', 2);
    for (const y of [5, 13, 21]) {
      fillRounded(ctx, 19, y, 27, 5, 2, '#6d8a5c', '#182114', 1.5);
      circle(ctx, 47, y + 2.5, 3.5, '#c9f7a8', '#f0ffd8', 1.2);
    }
    circle(ctx, 9, 13, 5, '#1c2718', '#a8d98a', 2);
  },
  /**
   * The hangar keeps no gun of its own, only a landing pad. Painted as the
   * "gun" sprite anyway so it turns towards whatever the drones are hunting.
   */
  drone: (ctx) => {
    fillRounded(ctx, 4, 6, 26, 15, 6, '#1d3230', '#0a1413', 2);
    ctx.fillStyle = '#4ce0d5';
    ctx.globalAlpha = 0.5;
    ctx.fillRect(10, 12, 14, 3);
    ctx.globalAlpha = 1;
    circle(ctx, 34, 13.5, 4, '#0e1c1b', '#4ce0d5', 1.5);
  },
  precision_mortar: (ctx) => {
    fillRounded(ctx, 0, 3, 28, 22, 7, '#343d42', '#101518', 2.5);
    fillRounded(ctx, 20, 6, 31, 15, 6, '#66747b', '#151d21', 2);
    circle(ctx, 50, 13.5, 8, '#12181b', '#ffd35c', 2.5);
    fillRounded(ctx, 4, 0, 16, 6, 2, '#695a2f', '#ffd35c', 1.2);
    circle(ctx, 11, 13.5, 4.5, '#213038', '#aeeeff', 1.5);
  },
  flame: (ctx) => {
    fillRounded(ctx, 0, 5, 20, 16, 6, '#7a3324', '#1d0f0b', 2);
    fillRounded(ctx, 18, 9, 24, 8, 3, '#43504a', '#141d19', 2);
    fillRounded(ctx, 40, 6, 12, 14, 5, '#8f5a2a', '#241407', 2);
    circle(ctx, 50, 13, 4, '#ffb347');
    circle(ctx, 8, 13, 3.5, '#ff7a3a');
  },
  frost: (ctx) => {
    fillRounded(ctx, 0, 6, 22, 15, 5, '#294555', '#0d1b23', 2);
    fillRounded(ctx, 20, 9, 28, 8, 3, '#5d879b', '#10212a', 2);
    circle(ctx, 47, 13, 6, '#d8f7ff', '#70cbe8', 2);
    ctx.strokeStyle = '#b8f2ff';
    ctx.lineWidth = 1.5;
    for (let index = 0; index < 4; index += 1) {
      const angle = (Math.PI / 2) * index;
      ctx.beginPath();
      ctx.moveTo(47 + Math.cos(angle) * 4, 13 + Math.sin(angle) * 4);
      ctx.lineTo(47 + Math.cos(angle) * 9, 13 + Math.sin(angle) * 9);
      ctx.stroke();
    }
  },
  scatter: (ctx) => {
    fillRounded(ctx, 0, 5, 23, 17, 5, '#4a4238', '#191611', 2);
    for (let index = 0; index < 3; index += 1) {
      fillRounded(ctx, 20, 6 + index * 6, 31, 5, 2, '#9d9688', '#25221d', 1.5);
    }
    circle(ctx, 9, 13, 4, '#d4b16a');
  },
  shotgun: (ctx) => {
    fillRounded(ctx, 0, 4, 24, 19, 6, '#4b392d', '#17110d', 2);
    fillRounded(ctx, 21, 6, 33, 7, 3, '#b9aaa0', '#28201b', 2);
    fillRounded(ctx, 21, 15, 33, 7, 3, '#8f8279', '#28201b', 2);
    fillRounded(ctx, 7, 1, 12, 6, 2, '#6e5140', '#24170f', 1.5);
    circle(ctx, 52, 9.5, 2.5, '#ffd591');
    circle(ctx, 52, 18.5, 2.5, '#ffd591');
  },
  acid: (ctx) => {
    fillRounded(ctx, 0, 5, 22, 17, 6, '#174454', '#071b24', 2);
    circle(ctx, 10, 13, 6, '#289aae', '#42e9ff', 2);
    fillRounded(ctx, 20, 9, 26, 9, 3, '#3d7180', '#0d2028', 2);
    circle(ctx, 46, 13.5, 5, '#5eeeff', '#c9fbff', 1.5);
  },
  tesla: (ctx) => {
    fillRounded(ctx, 0, 8, 24, 10, 4, '#2b3a4a', '#101820', 2);
    circle(ctx, 36, 13, 11, '#1b2b3a', '#5fa8ff', 2.5);
    circle(ctx, 36, 13, 5, '#9fdcff');
    ctx.strokeStyle = '#9fdcff';
    ctx.lineWidth = 2;
    for (let index = 0; index < 4; index += 1) {
      const angle = (Math.PI / 2) * index + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(36 + Math.cos(angle) * 7, 13 + Math.sin(angle) * 7);
      ctx.lineTo(36 + Math.cos(angle) * 13, 13 + Math.sin(angle) * 13);
      ctx.stroke();
    }
  },
  mortar: (ctx) => {
    fillRounded(ctx, 0, 5, 25, 18, 6, '#3d463a', '#121811', 2);
    fillRounded(ctx, 18, 7, 28, 13, 5, '#687064', '#1a2018', 2);
    circle(ctx, 45, 13.5, 7, '#171d16', '#ff9d52', 2);
    circle(ctx, 9, 13.5, 4, '#b8783d', '#ffd09b', 1.5);
  },
  laser: (ctx) => {
    fillRounded(ctx, 0, 7, 26, 14, 5, '#2e2b3e', '#121019', 2);
    fillRounded(ctx, 24, 10, 30, 8, 3, '#5d5478', '#121019', 2);
    fillRounded(ctx, 6, 2, 14, 6, 2, '#4a4361');
    circle(ctx, 52, 14, 4.5, '#ff8fd8');
    circle(ctx, 12, 14, 3, '#ffb8ea');
  },
  plasma: (ctx) => {
    fillRounded(ctx, 0, 4, 27, 20, 7, '#25364d', '#0b111c', 2.5);
    fillRounded(ctx, 24, 8, 30, 12, 5, '#536f91', '#101929', 2);
    ctx.strokeStyle = '#7eeaff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(30, 6);
    ctx.lineTo(48, 3);
    ctx.lineTo(55, 13);
    ctx.lineTo(48, 23);
    ctx.lineTo(30, 20);
    ctx.stroke();
    circle(ctx, 53, 13, 6, '#72ddff', '#e2fbff', 2);
    circle(ctx, 11, 14, 5, '#16243a', '#7eeaff', 2);
  },
  ring: (ctx) => {
    circle(ctx, 17, 13, 11, '#4b3519', '#ffd35c', 2.5);
    circle(ctx, 17, 13, 5, '#fff1a3', '#ffb52e', 1.5);
    ctx.strokeStyle = '#c58a37';
    ctx.lineWidth = 4;
    for (let index = 0; index < 6; index += 1) {
      const angle = (index * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(17 + Math.cos(angle) * 9, 13 + Math.sin(angle) * 9);
      ctx.lineTo(17 + Math.cos(angle) * 20, 13 + Math.sin(angle) * 20);
      ctx.stroke();
    }
    fillRounded(ctx, 32, 9, 23, 8, 3, '#8b6634', '#2a1a0b', 1.5);
    circle(ctx, 54, 13, 4, '#ffd35c', '#fff1a3', 1.5);
  },
};

// ------------------------------------------------------------------- drones

/** The flying hull of a hunter drone, nose pointing right like every sprite. */
function paintDroneBody(): Painter {
  return (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.beginPath();
    ctx.moveTo(cx + 11, cy);
    ctx.lineTo(cx - 4, cy - 8);
    ctx.lineTo(cx - 8, cy);
    ctx.lineTo(cx - 4, cy + 8);
    ctx.closePath();
    ctx.fillStyle = '#2b4a48';
    ctx.fill();
    ctx.strokeStyle = '#0b1514';
    ctx.lineWidth = 2;
    ctx.stroke();
    // arms out to the rotors
    ctx.strokeStyle = '#1b302f';
    ctx.lineWidth = 3;
    for (const [x, y] of [
      [-9, -9],
      [-9, 9],
      [7, -9],
      [7, 9],
    ]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + x, cy + y);
      ctx.stroke();
    }
    circle(ctx, cx + 5, cy, 2.6, '#4ce0d5');
    circle(ctx, cx - 4, cy, 2, '#0e1c1b');
  };
}

/** One rotor disc; two of them counter-rotate under the drone. */
function paintDroneRotor(): Painter {
  return (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    circle(ctx, cx, cy, w / 2 - 1, 'rgba(76, 224, 213, 0.12)');
    ctx.strokeStyle = 'rgba(197, 255, 249, 0.7)';
    ctx.lineWidth = 2;
    for (let index = 0; index < 2; index += 1) {
      const angle = (Math.PI / 2) * index;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(angle) * (w / 2 - 2), cy - Math.sin(angle) * (h / 2 - 2));
      ctx.lineTo(cx + Math.cos(angle) * (w / 2 - 2), cy + Math.sin(angle) * (h / 2 - 2));
      ctx.stroke();
    }
  };
}

// ----------------------------------------------------------------- vehicles

/** Four wheels just outside the chassis, drawn top down like everything else. */
function wheels(ctx: CanvasRenderingContext2D, w: number, h: number, inset: number, size: number) {
  for (const x of [inset, w - inset - size]) {
    for (const y of [1, h - 6]) fillRounded(ctx, x, y, size, 5, 2, '#14181a');
  }
}

const VEHICLE_PAINTERS: Record<VehicleType, Painter> = {
  quad: (ctx, w, h) => {
    wheels(ctx, w, h, 3, 13);
    fillRounded(ctx, 8, 7, w - 16, h - 14, 6, '#8a4a2a', '#2a1409', 2);
    fillRounded(ctx, w * 0.24, h * 0.3, w * 0.3, h * 0.4, 4, '#241a14');
    // handlebar
    ctx.fillStyle = '#3d464a';
    ctx.fillRect(w * 0.66, 5, 4, h - 10);
    circle(ctx, w - 7, h / 2, 4, '#ffd489', '#2a1409', 1.5);
    noise(ctx, w, h, 30, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.07)'], 1, 2, 13);
  },
  car: (ctx, w, h) => {
    wheels(ctx, w, h, 9, 17);
    fillRounded(ctx, 3, 5, w - 6, h - 10, 9, '#2f5f4a', '#101f18', 2.5);
    fillRounded(ctx, w * 0.5, 8, w * 0.3, h - 16, 5, '#16242b', '#0a1114', 1.5);
    fillRounded(ctx, w * 0.2, 9, w * 0.26, h - 18, 4, '#3c6d57');
    // roof rack
    ctx.fillStyle = '#1c3a2d';
    ctx.fillRect(w * 0.24, 6, 3, h - 12);
    ctx.fillRect(w * 0.4, 6, 3, h - 12);
    circle(ctx, w - 8, h * 0.28, 3.5, '#ffe6ae');
    circle(ctx, w - 8, h * 0.72, 3.5, '#ffe6ae');
    noise(ctx, w, h, 60, ['rgba(0,0,0,0.28)', 'rgba(255,255,255,0.07)'], 1, 3, 19);
  },
  van: (ctx, w, h) => {
    wheels(ctx, w, h, 12, 18);
    fillRounded(ctx, 2, 4, w - 4, h - 8, 7, '#b8bdb4', '#20241f', 2.5);
    fillRounded(ctx, w * 0.62, 7, w * 0.3, h - 14, 4, '#17242a', '#0a1114', 1.5);
    // red cross on the roof
    ctx.fillStyle = '#c8404a';
    ctx.fillRect(w * 0.26, h / 2 - 3, 22, 6);
    ctx.fillRect(w * 0.26 + 8, h / 2 - 10, 6, 20);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(4, h - 12, w - 8, 4);
    circle(ctx, w - 7, h * 0.26, 3, '#ffe6ae');
    circle(ctx, w - 7, h * 0.74, 3, '#ffe6ae');
    noise(ctx, w, h, 60, ['rgba(0,0,0,0.2)', 'rgba(255,255,255,0.08)'], 1, 3, 23);
  },
  pickup: (ctx, w, h) => {
    wheels(ctx, w, h, 11, 18);
    fillRounded(ctx, 3, 5, w - 6, h - 10, 6, '#4a5540', '#161b13', 2.5);
    // open bed with the gun ring
    fillRounded(ctx, 6, 8, w * 0.4, h - 16, 3, '#2c3426', '#151a12', 1.5);
    circle(ctx, w * 0.28, h / 2, 9, '#20281c', '#7d8a6c', 2);
    fillRounded(ctx, w * 0.56, 7, w * 0.3, h - 14, 4, '#16242b', '#0a1114', 1.5);
    circle(ctx, w - 8, h * 0.28, 3.5, '#ffe6ae');
    circle(ctx, w - 8, h * 0.72, 3.5, '#ffe6ae');
    noise(ctx, w, h, 60, ['rgba(0,0,0,0.28)', 'rgba(255,255,255,0.06)'], 1, 3, 29);
  },
  workshop: (ctx, w, h) => {
    wheels(ctx, w, h, 13, 19);
    fillRounded(ctx, 2, 4, w - 4, h - 8, 6, '#c08a2c', '#2b1f08', 2.5);
    fillRounded(ctx, 6, 7, w * 0.5, h - 14, 4, '#8a6420', '#241a06', 1.5);
    // warning stripes on the box
    ctx.fillStyle = '#1a1a16';
    for (let x = 9; x < w * 0.54; x += 12) ctx.fillRect(x, 8, 6, h - 16);
    fillRounded(ctx, w * 0.62, 7, w * 0.3, h - 14, 4, '#17242a', '#0a1114', 1.5);
    // little crane arm
    ctx.fillStyle = '#57606a';
    ctx.fillRect(w * 0.2, h / 2 - 2, w * 0.36, 4);
    circle(ctx, w - 7, h / 2, 3.5, '#ffe6ae');
    noise(ctx, w, h, 70, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.08)'], 1, 3, 31);
  },
  steamroller: (ctx, w, h) => {
    wheels(ctx, w, h, 9, 20);
    fillRounded(ctx, 4, 7, w * 0.58, h - 14, 7, '#7a4c27', '#241509', 2.5);
    fillRounded(ctx, w * 0.25, 11, w * 0.28, h - 22, 4, '#253039', '#0d1317', 2);
    const drumX = w * 0.79;
    fillRounded(ctx, drumX - 13, 2, 26, h - 4, 12, '#555f64', '#171d20', 3);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(drumX - 7, 5, 5, h - 10);
    ctx.strokeStyle = '#2a3033';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w * 0.56, h * 0.28);
    ctx.lineTo(drumX - 10, h * 0.22);
    ctx.moveTo(w * 0.56, h * 0.72);
    ctx.lineTo(drumX - 10, h * 0.78);
    ctx.stroke();
    noise(ctx, w, h, 60, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.06)'], 1, 3, 73);
  },
  bulldozer: (ctx, w, h) => {
    for (const y of [1, h - 13]) {
      fillRounded(ctx, 5, y, w - 26, 12, 4, '#242821', '#0d100c', 2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      for (let x = 10; x < w - 28; x += 10) ctx.fillRect(x, y + 2, 6, 8);
    }
    fillRounded(ctx, 10, 13, w - 38, h - 26, 5, '#b27a22', '#2b1c06', 2.5);
    fillRounded(ctx, w * 0.38, 10, w * 0.25, h - 20, 4, '#28343b', '#0d1519', 2);
    ctx.strokeStyle = '#675024';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(w - 34, h * 0.3);
    ctx.lineTo(w - 13, h * 0.18);
    ctx.moveTo(w - 34, h * 0.7);
    ctx.lineTo(w - 13, h * 0.82);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w - 13, 4);
    ctx.lineTo(w - 2, 10);
    ctx.lineTo(w - 2, h - 10);
    ctx.lineTo(w - 13, h - 4);
    ctx.closePath();
    ctx.fillStyle = '#5f676b';
    ctx.fill();
    ctx.strokeStyle = '#1b2022';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    for (let y = 11; y < h - 8; y += 12) ctx.fillRect(w - 8, y, 4, 6);
  },
  apc: (ctx, w, h) => {
    wheels(ctx, w, h, 8, 15);
    ctx.beginPath();
    ctx.moveTo(6, 4);
    ctx.lineTo(w - 14, 4);
    ctx.lineTo(w - 2, h * 0.32);
    ctx.lineTo(w - 2, h * 0.68);
    ctx.lineTo(w - 14, h - 4);
    ctx.lineTo(6, h - 4);
    ctx.closePath();
    ctx.fillStyle = '#4c5a47';
    ctx.fill();
    ctx.strokeStyle = '#161d14';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    fillRounded(ctx, 10, 9, w * 0.22, h - 18, 3, '#3b4737');
    // vision slits
    ctx.fillStyle = '#131a11';
    ctx.fillRect(w * 0.68, h * 0.24, 12, 4);
    ctx.fillRect(w * 0.68, h * 0.66, 12, 4);
    circle(ctx, w * 0.46, h / 2, 11, '#39452f', '#7d8a6c', 2);
    noise(ctx, w, h, 70, ['rgba(0,0,0,0.3)', 'rgba(255,255,255,0.06)'], 1, 3, 37);
  },
  tank: (ctx, w, h) => {
    // tracks along both flanks
    for (const y of [0, h - 12]) {
      fillRounded(ctx, 4, y, w - 8, 12, 4, '#20241f', '#0d100c', 2);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      for (let x = 8; x < w - 10; x += 9) ctx.fillRect(x, y + 2, 5, 8);
    }
    fillRounded(ctx, 8, 11, w - 16, h - 22, 5, '#54604a', '#161d14', 2.5);
    fillRounded(ctx, w * 0.62, h * 0.3, w * 0.24, h * 0.4, 3, '#3f4a38');
    circle(ctx, w * 0.44, h / 2, 14, '#46533c', '#8b9a78', 2.5);
    circle(ctx, w * 0.44, h / 2, 5, '#2a3324');
    noise(ctx, w, h, 80, ['rgba(0,0,0,0.3)', 'rgba(255,255,255,0.06)'], 1, 3, 43);
  },
};

/** Mounted guns sit on their own sprite so they can track a target. */
const VEHICLE_GUN_PAINTERS: Partial<Record<VehicleType, Painter>> = {
  pickup: (ctx) => {
    fillRounded(ctx, 0, 8, 18, 10, 4, '#3d4a3c', '#131a12', 2);
    fillRounded(ctx, 16, 11, 22, 5, 2, '#a3b1a0', '#131a12', 1.5);
    fillRounded(ctx, 5, 3, 9, 5, 2, '#5d6d5a');
  },
  apc: (ctx) => {
    fillRounded(ctx, 0, 6, 22, 14, 5, '#46533c', '#161d14', 2);
    fillRounded(ctx, 20, 10, 28, 6, 2, '#b3c1a9', '#161d14', 2);
    circle(ctx, 8, 13, 4, '#2a3324', '#8b9a78', 1.5);
  },
  tank: (ctx) => {
    fillRounded(ctx, 0, 3, 28, 20, 7, '#4e5a44', '#141a12', 2.5);
    fillRounded(ctx, 26, 9, 32, 8, 3, '#8b9a78', '#141a12', 2);
    fillRounded(ctx, 52, 7, 8, 12, 3, '#b3c1a9', '#141a12', 1.5);
    circle(ctx, 10, 13, 5, '#2a3324', '#8b9a78', 2);
  },
};

// ---------------------------------------------------------------- obstacles

const OBSTACLE_PAINTERS: Record<ObstacleKind, Painter> = {
  car: (ctx, w, h) => {
    fillRounded(ctx, 2, 4, w - 4, h - 8, 10, '#5b2f34', '#1d0f11', 2.5);
    fillRounded(ctx, w * 0.2, 6, w * 0.42, h - 12, 6, '#20262b', '#0e1114', 2);
    fillRounded(ctx, w * 0.24, 9, w * 0.34, h - 18, 4, '#4a5a66');
    ctx.fillStyle = '#2a1418';
    ctx.fillRect(w * 0.08, 2, 10, h - 4);
    ctx.fillRect(w * 0.72, 2, 10, h - 4);
    circle(ctx, w - 10, h * 0.3, 4, '#d9c27a');
    circle(ctx, w - 10, h * 0.7, 4, '#d9c27a');
    noise(ctx, w, h, 90, ['rgba(0,0,0,0.3)', 'rgba(255,255,255,0.06)'], 1, 3, 11);
  },
  container: (ctx, w, h) => {
    fillRounded(ctx, 1, 1, w - 2, h - 2, 4, '#2f5d64', '#0f1e21', 3);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    for (let x = 8; x < w - 6; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, 4);
      ctx.lineTo(x, h - 4);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(3, 3, w - 6, 6);
    ctx.fillStyle = '#8a6a3a';
    ctx.fillRect(w * 0.42, h * 0.3, w * 0.16, h * 0.4);
    noise(ctx, w, h, 140, ['rgba(120,60,30,0.35)', 'rgba(0,0,0,0.25)'], 1, 4, 17);
  },
  crate: (ctx, w, h) => {
    fillRounded(ctx, 1, 1, w - 2, h - 2, 3, '#7a5a34', '#2b1e10', 2.5);
    ctx.strokeStyle = '#5a3f22';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(3, 3);
    ctx.lineTo(w - 3, h - 3);
    ctx.moveTo(w - 3, 3);
    ctx.lineTo(3, h - 3);
    ctx.stroke();
    ctx.strokeRect(4, 4, w - 8, h - 8);
    noise(ctx, w, h, 40, ['rgba(0,0,0,0.28)'], 1, 2, 23);
  },
  rock: (ctx, w, h) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(w * 0.1, h * 0.55);
    ctx.lineTo(w * 0.3, h * 0.12);
    ctx.lineTo(w * 0.72, h * 0.08);
    ctx.lineTo(w * 0.95, h * 0.48);
    ctx.lineTo(w * 0.74, h * 0.94);
    ctx.lineTo(w * 0.28, h * 0.9);
    ctx.closePath();
    ctx.fillStyle = '#4e5257';
    ctx.fill();
    ctx.strokeStyle = '#22262a';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, 0, w, h * 0.42);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(0, h * 0.62, w, h * 0.4);
    noise(ctx, w, h, 70, ['rgba(255,255,255,0.1)', 'rgba(0,0,0,0.25)'], 1, 3, 29);
    ctx.restore();
  },
  barrel: (ctx, w, h) => {
    circle(ctx, w / 2, h / 2, w / 2 - 2, '#8a5320', '#2a1808', 2.5);
    circle(ctx, w / 2, h / 2, w / 2 - 7, '#a9682c');
    circle(ctx, w / 2, h / 2, w / 2 - 12, '#7a4a1c');
    ctx.fillStyle = '#f0c674';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('☣', w / 2, h / 2 + 1);
  },
  tree: (ctx, w, h) => {
    circle(ctx, w / 2, h / 2, w / 2 - 2, '#243d24', '#101c10', 2);
    circle(ctx, w * 0.42, h * 0.42, w * 0.3, '#31512f');
    circle(ctx, w * 0.62, h * 0.58, w * 0.24, '#1d331d');
    circle(ctx, w / 2, h / 2, 5, '#3c2a18');
    noise(ctx, w, h, 60, ['rgba(0,0,0,0.3)', 'rgba(120,180,120,0.15)'], 1, 3, 41);
  },
  wall: (ctx, w, h) => {
    fillRounded(ctx, 1, 1, w - 2, h - 2, 2, '#57544d', '#22201d', 2.5);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    for (let x = 14; x < w - 6; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, 3);
      ctx.lineTo(x, h - 3);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(3, h / 2);
    ctx.lineTo(w - 3, h / 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(2, 2, w - 4, 4);
    noise(ctx, w, h, 90, ['rgba(0,0,0,0.25)'], 1, 3, 47);
  },
  sandbag: (ctx, w, h) => {
    for (let row = 0; row < 2; row += 1) {
      const offset = row === 0 ? 0 : 11;
      for (let index = 0; index < 5; index += 1) {
        const x = 3 + offset + index * ((w - 12) / 4.4);
        fillRounded(
          ctx,
          x,
          3 + row * (h / 2 - 2),
          (w - 10) / 4.6,
          h / 2 - 6,
          7,
          '#8c7f5c',
          '#3b3524',
          2,
        );
      }
    }
    noise(ctx, w, h, 60, ['rgba(0,0,0,0.22)', 'rgba(255,255,255,0.08)'], 1, 2, 53);
  },
  pipe: (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#7b8288');
    gradient.addColorStop(0.4, '#4e565c');
    gradient.addColorStop(1, '#2e3438');
    fillRounded(ctx, 1, 3, w - 2, h - 6, h / 2 - 3, gradient as unknown as string, '#191d20', 2.5);
    ctx.fillStyle = '#333b40';
    ctx.fillRect(w * 0.28, 3, 7, h - 6);
    ctx.fillRect(w * 0.66, 3, 7, h - 6);
    ctx.fillStyle = 'rgba(180, 90, 40, 0.28)';
    ctx.fillRect(w * 0.1, h * 0.3, w * 0.16, h * 0.4);
  },
  ruin: (ctx, w, h) => {
    ctx.fillStyle = '#3f3c37';
    ctx.beginPath();
    ctx.moveTo(4, h - 4);
    ctx.lineTo(6, h * 0.3);
    ctx.lineTo(w * 0.36, h * 0.12);
    ctx.lineTo(w * 0.62, h * 0.34);
    ctx.lineTo(w - 6, h * 0.22);
    ctx.lineTo(w - 4, h - 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1c1a17';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#211f1c';
    ctx.fillRect(w * 0.2, h * 0.42, w * 0.2, h * 0.3);
    ctx.fillRect(w * 0.58, h * 0.5, w * 0.18, h * 0.26);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(6, h * 0.3, w - 12, 6);
    noise(ctx, w, h, 120, ['rgba(0,0,0,0.3)', 'rgba(255,255,255,0.06)'], 1, 3, 61);
  },
};

// ---------------------------------------------------------------- particles

function paintSoftCircle(color: string): Painter {
  return (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.45, color.replace('1)', '0.55)'));
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  };
}

const DECOR_PAINTERS: Record<string, Painter> = {
  puddle: (ctx, w, h) => {
    ctx.fillStyle = 'rgba(30, 48, 56, 0.55)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2 - 2, h / 2.6, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(140, 190, 210, 0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();
  },
  crack: (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(2, h / 2);
    ctx.lineTo(w * 0.3, h * 0.34);
    ctx.lineTo(w * 0.55, h * 0.62);
    ctx.lineTo(w - 2, h * 0.4);
    ctx.moveTo(w * 0.3, h * 0.34);
    ctx.lineTo(w * 0.36, h * 0.08);
    ctx.moveTo(w * 0.55, h * 0.62);
    ctx.lineTo(w * 0.62, h * 0.94);
    ctx.stroke();
  },
  grass: (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(90, 130, 70, 0.5)';
    ctx.lineWidth = 2;
    for (let index = 0; index < 9; index += 1) {
      const x = 4 + (index * (w - 8)) / 8;
      ctx.beginPath();
      ctx.moveTo(x, h - 3);
      ctx.quadraticCurveTo(
        x + (index % 2 === 0 ? 4 : -4),
        h / 2,
        x + (index % 2 === 0 ? 2 : -2),
        3,
      );
      ctx.stroke();
    }
  },
  bones: (ctx, w, h) => {
    ctx.fillStyle = 'rgba(214, 208, 190, 0.5)';
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(0.5);
    fillRounded(ctx, -w / 3, -3, (w * 2) / 3, 6, 3, 'rgba(214, 208, 190, 0.55)');
    circle(ctx, -w / 3, -4, 4, 'rgba(214, 208, 190, 0.55)');
    circle(ctx, -w / 3, 4, 4, 'rgba(214, 208, 190, 0.55)');
    circle(ctx, w / 3, -4, 4, 'rgba(214, 208, 190, 0.55)');
    circle(ctx, w / 3, 4, 4, 'rgba(214, 208, 190, 0.55)');
    ctx.restore();
  },
  blood: (ctx, w, h) => {
    ctx.fillStyle = 'rgba(96, 18, 26, 0.5)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2.4, h / 3, 0.7, 0, Math.PI * 2);
    ctx.fill();
    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI * 2 * index) / 6;
      circle(
        ctx,
        w / 2 + Math.cos(angle) * w * 0.36,
        h / 2 + Math.sin(angle) * h * 0.3,
        2 + (index % 3),
        'rgba(96, 18, 26, 0.4)',
      );
    }
  },
  rubble: (ctx, w, h) => {
    for (let index = 0; index < 8; index += 1) {
      const x = (index * 37) % (w - 8);
      const y = (index * 53) % (h - 8);
      ctx.fillStyle = index % 2 === 0 ? 'rgba(90, 92, 88, 0.5)' : 'rgba(60, 62, 58, 0.5)';
      ctx.fillRect(x, y, 5 + (index % 3) * 2, 4 + (index % 2) * 3);
    }
  },
  marking: (ctx, w, h) => {
    ctx.fillStyle = 'rgba(210, 190, 90, 0.16)';
    ctx.fillRect(0, h / 2 - 3, w, 6);
    ctx.fillStyle = 'rgba(10, 12, 10, 0.2)';
    for (let x = 0; x < w; x += 18) ctx.fillRect(x + 9, h / 2 - 3, 9, 6);
  },
};

function paintShard(color: string): Painter {
  return (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w, h * 0.6);
    ctx.lineTo(w * 0.4, h);
    ctx.closePath();
    ctx.fill();
  };
}

// -------------------------------------------------------------------- entry

export function createGameTextures(scene: Phaser.Scene) {
  for (const map of MAPS) make(scene, `ground-${map.id}`, 256, 256, paintGround(map.theme));

  PLAYER_COLORS.forEach((color, index) => {
    make(scene, `player-body-${index}`, 64, 56, paintPlayerBody(color));
    make(scene, `player-head-${index}`, 32, 32, paintPlayerHead(color));
    make(scene, `player-leg-${index}`, 18, 10, paintPlayerLeg(color));
  });

  for (const [weapon, painter] of Object.entries(WEAPON_PAINTERS)) {
    make(scene, `weapon-${weapon}`, 72, 34, painter);
  }

  for (const type of ZOMBIE_TYPES) {
    const radius = ZOMBIES[type].radius;
    make(scene, `zombie-${type}`, radius * 3.4, radius * 3.4, paintZombieBody(type, radius));
    make(
      scene,
      `zombie-limb-${type}`,
      Math.round(radius * 1.15),
      Math.round(radius * 0.5),
      paintZombieLimb(type, Math.round(radius * 1.15), Math.round(radius * 0.5)),
    );
  }

  for (const type of BARRICADE_ORDER) {
    const config = DEFENSES[type];
    make(scene, `defense-${type}`, config.width, config.height, DEFENSE_PAINTERS[type]!);
  }

  const TURRET_ACCENTS: Record<string, string> = {
    mg: '#69f0ae',
    flame: '#ff8f4a',
    frost: '#aef0ff',
    scatter: '#d4b16a',
    marksman: '#8fffc1',
    shotgun: '#ffd591',
    acid: '#42e9ff',
    tesla: '#9fdcff',
    mortar: '#ff9d52',
    launcher: '#ff8f5a',
    triple: '#c9f7a8',
    drone: '#4ce0d5',
    precision_mortar: '#ffd35c',
    laser: '#ff8fd8',
    plasma: '#7eeaff',
    ring: '#ffd35c',
  };
  for (const [type, painter] of Object.entries(TURRET_GUN_PAINTERS)) {
    const config = DEFENSES[type as DefenseType];
    make(
      scene,
      `turret-base-${type}`,
      config.width,
      config.height,
      paintTurretBase(TURRET_ACCENTS[type] ?? '#69f0ae', config.width),
    );
    make(scene, `turret-gun-${type}`, 58, 26, painter!);
  }

  for (const [type, painter] of Object.entries(VEHICLE_PAINTERS)) {
    const config = VEHICLES[type as VehicleType];
    make(scene, `vehicle-${type}`, config.width, config.height, painter);
  }
  for (const [type, painter] of Object.entries(VEHICLE_GUN_PAINTERS)) {
    make(scene, `vehicle-gun-${type}`, 62, 26, painter!);
  }

  make(scene, 'drone-body', 30, 30, paintDroneBody());
  make(scene, 'drone-rotor', 14, 14, paintDroneRotor());

  for (const [kind, painter] of Object.entries(OBSTACLE_PAINTERS)) {
    const size = OBSTACLE_TEXTURE_SIZE[kind as ObstacleKind];
    make(scene, `obstacle-${kind}`, size.w, size.h, painter);
  }

  for (const [kind, painter] of Object.entries(DECOR_PAINTERS)) {
    make(scene, `decor-${kind}`, 96, 96, painter);
  }

  make(scene, 'fx-spark', 16, 16, paintSoftCircle('rgba(255, 235, 170, 1)'));
  make(scene, 'fx-smoke', 32, 32, paintSoftCircle('rgba(140, 150, 145, 1)'));
  make(scene, 'fx-blood', 14, 14, paintSoftCircle('rgba(190, 40, 55, 1)'));
  make(scene, 'fx-flame', 26, 26, paintSoftCircle('rgba(255, 150, 60, 1)'));
  make(scene, 'fx-energy', 20, 20, paintSoftCircle('rgba(150, 220, 255, 1)'));
  make(scene, 'fx-shard', 12, 12, paintShard('#c8d0cc'));
  make(scene, 'fx-glow', 64, 64, paintSoftCircle('rgba(255, 200, 120, 1)'));
  make(scene, 'fx-pool', 128, 128, paintPool());
}

/** Ground pool for lava and poison; the colour comes from the tint. */
function paintPool(): Painter {
  return (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.1, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    noise(ctx, w, h, 200, ['rgba(255,255,255,0.35)', 'rgba(0,0,0,0.25)'], 2, 6, 91);
    ctx.globalAlpha = 1;
  };
}

export function playerTextureIndex(color: string) {
  const index = PLAYER_COLORS.indexOf(color.toLowerCase());
  return index < 0 ? 0 : index;
}
