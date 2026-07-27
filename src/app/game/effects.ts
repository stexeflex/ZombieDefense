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
        this.scene.cameras.main.shake(120, 0.004);
        break;
      // The blow was dodged, so it stays bright and bloodless.
      case 'deflect':
        this.burst('energy', 5, event.x, event.y);
        this.shockwave(event.x, event.y, 46, 0x9fdcff);
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
        const energyBlast = event.s === 'gravity' || event.s === 'nova';
        this.burst(
          energyBlast ? 'energy' : 'flame',
          Math.min(26, 10 + radius / 8),
          event.x,
          event.y,
        );
        if (!energyBlast) this.burst('smoke', Math.min(20, 8 + radius / 10), event.x, event.y);
        this.burst('shard', 10, event.x, event.y);
        const color =
          event.s === 'gravity'
            ? 0xa67cff
            : event.s === 'nova'
              ? 0xff9ee0
              : event.s === 'mortar'
                ? 0xff4f6b
                : 0xffb347;
        this.shockwave(event.x, event.y, radius, color);
        this.audio.play('explosion', 0.9);
        this.scene.cameras.main.shake(220, Math.min(0.014, 0.004 + radius / 22000));
        break;
      }
      case 'burn':
        this.burst('flame', 4, event.x, event.y);
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
    this.scene.cameras.main.shake(320, 0.01);
    if (event.s === 'spawn') this.audio.play('boss-roar', 0.9);
    if (event.s === 'mortar' || event.s === 'split') this.audio.play('explosion', 0.4);
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
          : source === 'drone'
            ? 0x4ce0d5
            : weapon === 'railgun'
              ? 0xbaf7ff
              : weapon === 'gravity'
                ? 0xa67cff
                : weapon === 'nova'
                  ? 0xff9ee0
                  : weapon === 'laser'
                    ? 0xff8fd8
                    : weapon === 'acid'
                      ? 0xb8ff71
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
