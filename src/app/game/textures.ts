import Phaser from 'phaser';
import {
  BARRICADE_ORDER,
  DEFENSES,
  MAPS,
  ZOMBIES,
  ZOMBIE_TYPES,
  type DefenseType,
  type ObstacleKind,
  type WeaponType,
  type ZombieType,
} from '../../../shared/game-types';

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

export const PLAYER_COLORS = ['#69f0ae', '#57b8ff', '#ffcc66', '#ff6b8a'];

/** Distance from the player centre to the muzzle of each weapon. */
export const WEAPON_MUZZLE: Record<WeaponType, number> = {
  pistol: 30,
  smg: 38,
  rifle: 48,
  shotgun: 46,
  nailgun: 48,
  sniper: 58,
  acid: 44,
  lmg: 52,
  flamer: 40,
  cryo: 44,
  rocket: 50,
  tesla: 42,
  laser: 48,
  railgun: 62,
  gravity: 50,
  nova: 52,
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
  nailgun: (ctx) => {
    fillRounded(ctx, 3, 8, 38, 12, 3, '#545f58', '#161d19', 1.5);
    fillRounded(ctx, 38, 11, 22, 6, 2, '#c0c8c3', '#161d19', 1.5);
    fillRounded(ctx, 13, 19, 10, 13, 2, '#303a34', '#161d19', 1.5);
    fillRounded(ctx, 8, 3, 25, 6, 2, '#7d8a83');
    ctx.fillStyle = '#d8dfdb';
    for (let x = 12; x < 32; x += 6) ctx.fillRect(x, 4, 2, 4);
  },
  sniper: (ctx) => {
    fillRounded(ctx, 0, 11, 54, 7, 2, '#3a463f', '#121a16', 1.5);
    fillRounded(ctx, 50, 12, 22, 5, 2, '#b3c1b9', '#121a16', 1.5);
    fillRounded(ctx, 22, 4, 20, 7, 3, '#1d2723', '#5f7169', 1.5);
    circle(ctx, 41, 7.5, 3, '#8fffc1');
    fillRounded(ctx, 24, 18, 8, 14, 2, '#2b3630');
  },
  acid: (ctx) => {
    fillRounded(ctx, 1, 7, 20, 19, 7, '#294c33', '#102016', 2);
    circle(ctx, 11, 16, 6, '#65c96f', '#b9ff8f', 1.5);
    fillRounded(ctx, 18, 10, 28, 9, 3, '#3d5142', '#142019', 1.5);
    fillRounded(ctx, 44, 8, 14, 13, 5, '#5e8a57', '#142019', 1.5);
    circle(ctx, 56, 14.5, 4, '#b8ff71');
    fillRounded(ctx, 22, 18, 8, 13, 2, '#29382d');
  },
  lmg: (ctx) => {
    fillRounded(ctx, 2, 9, 44, 10, 3, '#333d38', '#111815', 1.5);
    fillRounded(ctx, 44, 11, 22, 6, 2, '#a3b1a9', '#111815', 1.5);
    fillRounded(ctx, 12, 17, 20, 16, 3, '#242e29', '#111815', 1.5);
    fillRounded(ctx, 40, 20, 4, 12, 2, '#4a5a52');
    fillRounded(ctx, 50, 20, 4, 12, 2, '#4a5a52');
  },
  flamer: (ctx) => {
    fillRounded(ctx, 0, 6, 18, 20, 6, '#7a3324', '#1d0f0b', 2);
    fillRounded(ctx, 16, 11, 30, 7, 3, '#43504a', '#141d19', 1.5);
    fillRounded(ctx, 44, 8, 14, 12, 4, '#8f5a2a', '#241407', 1.5);
    circle(ctx, 56, 14, 4, '#ffb347');
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
  exploder: { skin: '#8fbf5a', cloth: '#3e4a2a', accent: '#c4ff4f', eye: '#d8ff5a' },
  armored: { skin: '#7a8390', cloth: '#2f353d', accent: '#aab6c2', eye: '#7fd8ff' },
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
};

function paintZombieBody(type: ZombieType, radius: number): Painter {
  const skin = ZOMBIE_SKINS[type];
  const rank = ZOMBIES[type].rank;
  const plated = rank === 'mini' || rank === 'boss' || type === 'armored';
  const crowned = rank === 'boss';
  const glowing = type === 'exploder' || type === 'spitter';
  return (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    ctx.save();
    ctx.translate(cx, cy);

    const bodyW = radius * 1.75;
    const bodyH = radius * 1.95;

    // torso
    fillRounded(
      ctx,
      -bodyW / 2,
      -bodyH / 2,
      bodyW,
      bodyH,
      radius * 0.55,
      skin.skin,
      '#1d2416',
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
  drone: (ctx) => {
    fillRounded(ctx, 0, 5, 22, 17, 6, '#263b3a', '#0d1716', 2);
    for (const y of [5, 13, 21]) {
      fillRounded(ctx, 19, y, 27, 5, 2, '#527b78', '#142523', 1.5);
      circle(ctx, 47, y + 2.5, 4, '#4ce0d5', '#c5fff9', 1.2);
    }
    circle(ctx, 9, 13, 5, '#1a2927', '#4ce0d5', 2);
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
    fillRounded(ctx, 0, 5, 22, 17, 6, '#294932', '#102016', 2);
    circle(ctx, 10, 13, 6, '#4fae5d', '#b8ff71', 2);
    fillRounded(ctx, 20, 9, 26, 9, 3, '#55765a', '#16251a', 2);
    circle(ctx, 46, 13.5, 5, '#a6f06e', '#d8ff9a', 1.5);
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
    acid: '#b8ff71',
    tesla: '#9fdcff',
    launcher: '#ff8f5a',
    drone: '#4ce0d5',
    laser: '#ff8fd8',
    plasma: '#7eeaff',
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
