import Phaser from 'phaser';
import {
  WEAPONS,
  type FxEvent,
  type WeaponType,
  type ZombieType,
} from '../../../shared/game-types';
import type { AudioService } from '../core/audio.service';
import { WEAPON_MUZZLE } from './textures';
import type { Bolt } from './views';

/**
 * Everything that is only there to look and sound good: particles, shockwaves,
 * muzzle flashes, blood decals, corpses and chain lightning.
 */
export class EffectLayer {
  private readonly emitters: Record<string, Phaser.GameObjects.Particles.ParticleEmitter> = {};
  private readonly decals: Phaser.GameObjects.Image[] = [];
  private readonly bolts: Bolt[] = [];
  private lightning!: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly audio: AudioService,
  ) {}

  create() {
    const definitions: Array<
      [string, string, Phaser.Types.GameObjects.Particles.ParticleEmitterConfig]
    > = [
      [
        'spark',
        'fx-spark',
        {
          speed: { min: 60, max: 250 },
          lifespan: { min: 120, max: 320 },
          scale: { start: 0.75, end: 0 },
          blendMode: Phaser.BlendModes.ADD,
        },
      ],
      [
        'blood',
        'fx-blood',
        {
          speed: { min: 40, max: 190 },
          lifespan: { min: 200, max: 460 },
          scale: { start: 1.05, end: 0.1 },
          alpha: { start: 0.95, end: 0 },
          gravityY: 0,
        },
      ],
      [
        'smoke',
        'fx-smoke',
        {
          speed: { min: 12, max: 90 },
          lifespan: { min: 420, max: 900 },
          scale: { start: 0.6, end: 2.1 },
          alpha: { start: 0.42, end: 0 },
        },
      ],
      [
        'flame',
        'fx-flame',
        {
          speed: { min: 20, max: 140 },
          lifespan: { min: 200, max: 480 },
          scale: { start: 1, end: 0.1 },
          alpha: { start: 0.9, end: 0 },
          blendMode: Phaser.BlendModes.ADD,
        },
      ],
      [
        'shard',
        'fx-shard',
        {
          speed: { min: 70, max: 260 },
          lifespan: { min: 260, max: 620 },
          scale: { start: 1, end: 0.2 },
          rotate: { start: 0, end: 320 },
          alpha: { start: 1, end: 0.1 },
        },
      ],
      [
        'energy',
        'fx-energy',
        {
          speed: { min: 40, max: 210 },
          lifespan: { min: 180, max: 420 },
          scale: { start: 0.9, end: 0 },
          blendMode: Phaser.BlendModes.ADD,
        },
      ],
    ];

    for (const [name, texture, config] of definitions) {
      this.emitters[name] = this.scene.add
        .particles(0, 0, texture, { ...config, emitting: false })
        .setDepth(60);
    }
    this.lightning = this.scene.add.graphics().setDepth(72);
  }

  burst(name: string, count: number, x: number, y: number) {
    this.emitters[name]?.explode(count, x, y);
  }

  play(event: FxEvent) {
    switch (event.k) {
      case 'hit':
        this.burst('spark', event.s === 'wall' ? 4 : 6, event.x, event.y);
        if (event.s !== 'wall') this.burst('blood', 3, event.x, event.y);
        this.audio.play('hit', 0.5);
        break;
      case 'blood':
        this.burst('blood', event.s === 'down' ? 22 : 8, event.x, event.y);
        if (event.s === 'down') this.addDecal(event.x, event.y, 70);
        this.audio.play('hurt', 0.7);
        break;
      // The blow was dodged, so it stays bright and bloodless.
      case 'deflect':
        this.burst('energy', 5, event.x, event.y);
        this.shockwave(
          event.x,
          event.y,
          event.s === 'front-shield' ? 56 : 46,
          event.s === 'front-shield' ? 0xffd166 : 0x9fdcff,
        );
        this.audio.play('deflect', 0.55);
        break;
      case 'death':
        this.burst('blood', 12 + Math.round((event.r ?? 18) / 2), event.x, event.y);
        this.addDecal(event.x, event.y, (event.r ?? 18) * 2.6);
        this.addCorpse(event.x, event.y, (event.s as ZombieType) ?? 'normal');
        this.audio.play('zombie-death', 0.45);
        break;
      case 'explosion': {
        const radius = event.r ?? 100;
        // Acid does not burn, it splatters — so it gets the cold particles and
        // no smoke, and nobody mistakes it for a fire blast any more.
        const acidBurst = event.s === 'acid' || event.s === 'turret_acid';
        const gravityBurst = event.s === 'gravity' || event.s === 'turret_gravity_well';
        const chronoBurst = event.s === 'turret_chrono';
        const energyBlast = gravityBurst || chronoBurst || event.s === 'nova' || acidBurst;
        this.burst(
          energyBlast ? 'energy' : 'flame',
          Math.min(26, 10 + radius / 8),
          event.x,
          event.y,
        );
        if (!energyBlast) this.burst('smoke', Math.min(20, 8 + radius / 10), event.x, event.y);
        this.burst('shard', acidBurst ? 4 : 10, event.x, event.y);
        const color = acidBurst
          ? 0x2eeaff
          : gravityBurst
            ? 0xa67cff
            : chronoBurst
              ? 0x6cecff
              : event.s === 'nova'
                ? 0xff9ee0
                : event.s === 'mortar' || event.s === 'ability_mortar'
                  ? 0xff4f6b
                  : 0xffb347;
        this.shockwave(event.x, event.y, radius, color);
        this.audio.play(
          acidBurst ? 'shot-flame' : 'explosion',
          acidBurst ? 0.5 : event.s === 'grenade-mini' ? 0.36 : 0.9,
        );
        break;
      }
      case 'warning':
        this.mortarWarning(event);
        break;
      case 'burn':
        this.burst(event.s === 'acid' ? 'energy' : 'flame', 4, event.x, event.y);
        break;
      case 'chain':
        this.bolts.push({
          x1: event.x,
          y1: event.y,
          x2: event.x2 ?? event.x,
          y2: event.y2 ?? event.y,
          life: 150,
          seed: Math.random() * 1000,
        });
        this.burst('energy', 5, event.x2 ?? event.x, event.y2 ?? event.y);
        break;
      case 'muzzle':
        this.muzzleFlash(event);
        break;
      case 'melee':
        this.meleeSwing(event);
        break;
      case 'structure':
        this.burst('shard', 3, event.x, event.y);
        break;
      case 'wreck':
        this.burst('shard', 14, event.x, event.y);
        this.burst('smoke', 6, event.x, event.y);
        this.audio.play('build', 0.6);
        break;
      case 'boss':
        this.bossCue(event);
        break;
      case 'heal':
        this.burst('energy', 12, event.x, event.y);
        this.audio.play('heal', 0.6);
        break;
      // Somebody climbed in or out, or hit the nitro.
      case 'engine':
        this.burst('smoke', 5, event.x, event.y);
        this.audio.play('engine', 0.55);
        break;
      case 'dash':
        this.dashTrail(event);
        break;
      // The dash cut an enemy open and took a piece of shield with it.
      case 'shield':
        this.burst('blood', 4, event.x, event.y);
        this.burst('energy', 6, event.x, event.y);
        this.shockwave(event.x, event.y, 42, 0x9fdcff);
        this.audio.play('deflect', 0.45);
        break;
    }
  }

  private bossCue(event: FxEvent) {
    const color =
      event.s === 'pull' || event.s === 'push'
        ? 0x4ce0d5
        : event.s === 'split'
          ? 0xff6fd8
          : 0xff4f6b;
    this.shockwave(event.x, event.y, (event.r ?? 60) * 2.4, color);
    if (event.s === 'spawn') this.audio.play('boss-roar', 0.9);
    if (event.s === 'mortar' || event.s === 'split') this.audio.play('explosion', 0.4);
  }

  /** Full blast radius plus a closing ring make the delayed shell readable. */
  private mortarWarning(event: FxEvent) {
    const radius = event.r ?? 110;
    const grenadeFragment = event.s === 'grenade-mini';
    const precise = event.s === 'precision_mortar' || event.s === 'ability_mortar';
    const color = grenadeFragment ? 0xffb347 : precise ? 0xffd35c : 0xff9d52;
    const area = this.scene.add
      .circle(event.x, event.y, radius, color, grenadeFragment ? 0.1 : 0.055)
      .setStrokeStyle(grenadeFragment ? 1 : 2, color, grenadeFragment ? 0.76 : 0.58)
      .setDepth(8);
    const countdown = this.scene.add
      .circle(event.x, event.y, radius, color, 0)
      .setStrokeStyle(grenadeFragment ? 2 : 3, color, 0.95)
      .setDepth(9);
    this.scene.tweens.add({
      targets: countdown,
      scale: grenadeFragment ? 0.18 : 0.08,
      alpha: 0.35,
      duration: Math.max(150, (event.d ?? 0.8) * 1000),
      ease: 'Linear',
      onComplete: () => {
        countdown.destroy();
        area.destroy();
      },
    });
  }

  private dashTrail(event: FxEvent) {
    const angle = event.a ?? 0;
    for (let index = 0; index < 4; index += 1) {
      const trail = this.scene.add
        .image(
          event.x - Math.cos(angle) * index * 14,
          event.y - Math.sin(angle) * index * 14,
          'fx-glow',
        )
        .setTint(0x9fdcff)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.5 - index * 0.09)
        .setAlpha(0.6 - index * 0.12)
        .setDepth(19);
      this.scene.tweens.add({
        targets: trail,
        alpha: 0,
        scaleX: 0.1,
        scaleY: 0.1,
        duration: 220 + index * 40,
        onComplete: () => trail.destroy(),
      });
    }
    this.burst('energy', 6, event.x, event.y);
    this.audio.play('reload', 0.35);
  }

  private muzzleFlash(event: FxEvent) {
    const angle = event.a ?? 0;
    const source = event.s ?? '';
    const weapon = source as WeaponType;
    const extra = WEAPON_MUZZLE[weapon] ? WEAPON_MUZZLE[weapon] - 26 : 12;
    const x = event.x + Math.cos(angle) * extra;
    const y = event.y + Math.sin(angle) * extra;
    const flash = this.scene.add
      .image(x, y, 'fx-glow')
      .setTint(
        source === 'plasma'
          ? 0x7eeaff
          : source === 'ring' || weapon === 'sun'
            ? 0xffd35c
            : source === 'drone'
              ? 0x4ce0d5
              : weapon === 'ionstorm'
                ? 0x62d9ff
                : weapon === 'railgun'
                  ? 0xbaf7ff
                  : weapon === 'gravity'
                    ? 0xa67cff
                    : weapon === 'nova'
                      ? 0xff9ee0
                      : weapon === 'laser'
                        ? 0xff8fd8
                        : weapon === 'acid'
                          ? 0x42e9ff
                          : weapon === 'tesla'
                            ? 0x9fdcff
                            : weapon === 'cryo'
                              ? 0xaef0ff
                              : 0xffd489,
      )
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.42, 0.3)
      .setRotation(angle)
      .setDepth(45);
    if (weapon === 'railgun') {
      const beam = this.scene.add
        .image(x, y, 'fx-glow')
        .setOrigin(0, 0.5)
        .setTint(0xbaf7ff)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(640, 17)
        .setRotation(angle)
        .setAlpha(0.82)
        .setDepth(44);
      this.scene.tweens.add({
        targets: beam,
        alpha: 0,
        scaleY: 0.25,
        duration: 150,
        onComplete: () => beam.destroy(),
      });
    }
    this.scene.tweens.add({
      targets: flash,
      scaleX: 0.1,
      scaleY: 0.08,
      alpha: 0,
      duration: 90,
      onComplete: () => flash.destroy(),
    });
    if (weapon && WEAPONS[weapon]) this.audio.play(this.audio.weaponSound(weapon), 0.55);
    else this.audio.play('shot', 0.28);
  }

  private meleeSwing(event: FxEvent) {
    const weapon = event.s as WeaponType;
    const config = WEAPONS[weapon];
    if (!config) return;
    const angle = event.a ?? 0;
    const radius = event.r ?? config.range;
    const arc = config.meleeArc ?? Math.PI / 2;
    const color =
      weapon === 'worldbreaker'
        ? 0xffd35c
        : weapon === 'phaselance'
          ? 0x7eeaff
          : weapon === 'chainsaw'
            ? 0xff7a4a
            : weapon === 'fireaxe'
              ? 0xffcc66
              : 0xd8dfdb;
    const slash = this.scene.add.graphics().setDepth(74);
    slash.lineStyle(7, color, 0.92);
    slash.beginPath();
    slash.arc(event.x, event.y, radius, angle - arc / 2, angle + arc / 2);
    slash.strokePath();
    slash.lineStyle(2, 0xffffff, 0.78);
    slash.beginPath();
    slash.arc(event.x, event.y, radius - 7, angle - arc / 2, angle + arc / 2);
    slash.strokePath();
    this.scene.tweens.add({
      targets: slash,
      alpha: 0,
      duration: Math.min(180, Math.max(75, config.fireDelay * 0.22)),
      ease: 'Quad.Out',
      onComplete: () => slash.destroy(),
    });
    const tipX = event.x + Math.cos(angle) * radius;
    const tipY = event.y + Math.sin(angle) * radius;
    this.burst(
      weapon === 'phaselance' || weapon === 'worldbreaker' ? 'energy' : 'spark',
      5,
      tipX,
      tipY,
    );
    this.audio.play(this.audio.weaponSound(weapon), 0.58);
  }

  shockwave(x: number, y: number, radius: number, color: number) {
    const ring = this.scene.add.circle(x, y, 14).setStrokeStyle(5, color, 0.95).setDepth(74);
    this.scene.tweens.add({
      targets: ring,
      radius,
      alpha: 0,
      duration: 420,
      ease: 'Quad.Out',
      onComplete: () => ring.destroy(),
    });
    const flash = this.scene.add
      .image(x, y, 'fx-glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setScale(radius / 40)
      .setDepth(73);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: radius / 22,
      scaleY: radius / 22,
      duration: 330,
      onComplete: () => flash.destroy(),
    });
  }

  private addDecal(x: number, y: number, size: number) {
    const decal = this.scene.add
      .image(x, y, 'decor-blood')
      .setDisplaySize(size, size * 0.8)
      .setRotation(Math.random() * Math.PI * 2)
      .setAlpha(0.62)
      .setDepth(-8);
    this.decals.push(decal);
    while (this.decals.length > 70) this.decals.shift()?.destroy();
  }

  private addCorpse(x: number, y: number, type: ZombieType) {
    if (!this.scene.textures.exists(`zombie-${type}`)) return;
    const corpse = this.scene.add
      .image(x, y, `zombie-${type}`)
      .setRotation(Math.random() * Math.PI * 2)
      .setTint(0x6b7264)
      .setAlpha(0.85)
      .setDepth(-7);
    this.scene.tweens.add({
      targets: corpse,
      alpha: 0,
      scaleX: 0.85,
      scaleY: 0.85,
      duration: 5200,
      delay: 1600,
      onComplete: () => corpse.destroy(),
    });
  }

  updateBolts(deltaMs: number) {
    this.lightning.clear();
    if (this.bolts.length === 0) return;
    for (let index = this.bolts.length - 1; index >= 0; index -= 1) {
      const bolt = this.bolts[index];
      bolt.life -= deltaMs;
      if (bolt.life <= 0) {
        this.bolts.splice(index, 1);
        continue;
      }
      const alpha = Math.max(0, bolt.life / 150);
      this.lightning.lineStyle(3, 0x9fdcff, alpha);
      this.lightning.beginPath();
      this.lightning.moveTo(bolt.x1, bolt.y1);
      const steps = 5;
      for (let step = 1; step < steps; step += 1) {
        const t = step / steps;
        const jitter = Math.sin(bolt.seed + step * 2.1 + bolt.life * 0.05) * 14;
        const nx = -(bolt.y2 - bolt.y1);
        const ny = bolt.x2 - bolt.x1;
        const length = Math.hypot(nx, ny) || 1;
        this.lightning.lineTo(
          bolt.x1 + (bolt.x2 - bolt.x1) * t + (nx / length) * jitter,
          bolt.y1 + (bolt.y2 - bolt.y1) * t + (ny / length) * jitter,
        );
      }
      this.lightning.lineTo(bolt.x2, bolt.y2);
      this.lightning.strokePath();
    }
  }
}
