import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import Phaser from 'phaser';
import { Subscription } from 'rxjs';
import {
  ARENA,
  DEFENSES,
  DEFENSE_REACH,
  PLACE_RANGE,
  PLAYER_RADIUS,
  VIEWPORT,
  WEAPONS,
  ZOMBIES,
  canPlaceDefense,
  defenseFootprint,
  distanceToDefense,
  findMap,
  repairCost,
  snapDefense,
  type DefenseSnapshot,
  type DefenseType,
  type FxEvent,
  type GameMap,
  type GameSnapshot,
  type PlacedDefense,
  type PlayerInput,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type WeaponType,
  type ZombieSnapshot,
  type ZombieType,
} from '../../../shared/game-types';
import { AudioService } from '../core/audio.service';
import { GameService } from '../core/game.service';
import { WEAPON_MUZZLE, createGameTextures, playerTextureIndex } from './textures';

type ViewRoot = Phaser.GameObjects.GameObject & {
  x: number;
  y: number;
  destroy(fromScene?: boolean): void;
};

interface BaseView {
  root: ViewRoot;
  targetX: number;
  targetY: number;
}

interface PlayerView extends BaseView {
  root: Phaser.GameObjects.Container;
  actor: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  head: Phaser.GameObjects.Image;
  weapon: Phaser.GameObjects.Image;
  legs: Phaser.GameObjects.Image[];
  label: Phaser.GameObjects.Text;
  healthBar: Phaser.GameObjects.Rectangle;
  reviveBackground: Phaser.GameObjects.Rectangle;
  reviveBar: Phaser.GameObjects.Rectangle;
  reviveText: Phaser.GameObjects.Text;
  walk: number;
  weaponKey: WeaponType;
  colorIndex: number;
  lastX: number;
  lastY: number;
}

interface ZombieView extends BaseView {
  root: Phaser.GameObjects.Container;
  actor: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  limbs: Phaser.GameObjects.Image[];
  healthBar: Phaser.GameObjects.Rectangle;
  healthBackground: Phaser.GameObjects.Rectangle;
  aura?: Phaser.GameObjects.Arc;
  walk: number;
  type: ZombieType;
  radius: number;
  lastHealth: number;
  flameTimer: number;
}

interface DefenseView extends BaseView {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  gun?: Phaser.GameObjects.Image;
  healthBar: Phaser.GameObjects.Rectangle;
  type: DefenseType;
}

interface ProjectileView extends BaseView {
  root: Phaser.GameObjects.Image;
  kind: string;
  smoke: number;
}

interface Bolt {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  seed: number;
}

const PROJECTILE_STYLE: Record<
  string,
  { texture: string; tint: number; scaleX: number; scaleY: number }
> = {
  pistol: { texture: 'fx-spark', tint: 0xfff0b8, scaleX: 1.5, scaleY: 0.42 },
  smg: { texture: 'fx-spark', tint: 0xffe89a, scaleX: 1.3, scaleY: 0.4 },
  rifle: { texture: 'fx-spark', tint: 0xfff3c4, scaleX: 1.9, scaleY: 0.4 },
  shotgun: { texture: 'fx-spark', tint: 0xffd591, scaleX: 1.1, scaleY: 0.38 },
  sniper: { texture: 'fx-spark', tint: 0xd8fbff, scaleX: 3.4, scaleY: 0.42 },
  lmg: { texture: 'fx-spark', tint: 0xfff0b8, scaleX: 2.1, scaleY: 0.45 },
  flamer: { texture: 'fx-flame', tint: 0xffa04a, scaleX: 1.5, scaleY: 1.5 },
  rocket: { texture: 'fx-glow', tint: 0xffb066, scaleX: 0.55, scaleY: 0.4 },
  tesla: { texture: 'fx-energy', tint: 0x9fdcff, scaleX: 1.4, scaleY: 1.1 },
  laser: { texture: 'fx-spark', tint: 0xff8fd8, scaleX: 4.2, scaleY: 0.6 },
  turret_mg: { texture: 'fx-spark', tint: 0x9fe8ff, scaleX: 1.7, scaleY: 0.42 },
  turret_marksman: { texture: 'fx-spark', tint: 0xc9ffe0, scaleX: 3, scaleY: 0.45 },
  turret_launcher: { texture: 'fx-glow', tint: 0xffb066, scaleX: 0.5, scaleY: 0.4 },
};

class ArenaScene extends Phaser.Scene {
  private snapshot?: GameSnapshot;
  private readonly players = new Map<string, PlayerView>();
  private readonly zombies = new Map<string, ZombieView>();
  private readonly defenses = new Map<string, DefenseView>();
  private readonly projectiles = new Map<string, ProjectileView>();
  private readonly subscriptions = new Subscription();
  private readonly decals: Phaser.GameObjects.Image[] = [];
  private readonly bolts: Bolt[] = [];

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private sendTimer = 0;
  private inputHeartbeat = 0;
  private lastSentInput?: PlayerInput;
  private reloadQueued = false;
  private shooting = false;
  private crosshair!: Phaser.GameObjects.Container;
  private ghost!: Phaser.GameObjects.Image;
  private ghostRange!: Phaser.GameObjects.Arc;
  private placement?: PlacedDefense;
  private focusOutline!: Phaser.GameObjects.Graphics;
  private focusLabel!: Phaser.GameObjects.Text;
  private focusPulse = 0;
  private lightning!: Phaser.GameObjects.Graphics;
  private world?: Phaser.GameObjects.Container;
  private worldMapId = '';
  private map: GameMap = findMap(undefined);
  private emitters: Record<string, Phaser.GameObjects.Particles.ParticleEmitter> = {};

  constructor(
    private readonly gameService: GameService,
    private readonly audio: AudioService,
  ) {
    super({ key: 'arena' });
  }

  create() {
    createGameTextures(this);
    this.cameras.main.setBackgroundColor('#05100c');
    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height);
    this.cameras.main.centerOn(ARENA.width / 2, ARENA.height / 2);
    this.cameras.main.setDeadzone(220, 140);

    this.keys = this.input.keyboard!.addKeys(
      'W,S,A,D,UP,DOWN,LEFT,RIGHT,R,G,F,V,ONE,TWO,THREE,FOUR,FIVE,SIX,SEVEN,EIGHT,NINE,ZERO',
    ) as Record<string, Phaser.Input.Keyboard.Key>;

    this.createEmitters();
    this.lightning = this.add.graphics().setDepth(72);
    this.createCrosshair();

    this.ghostRange = this.add
      .circle(0, 0, 100)
      .setStrokeStyle(2, 0x69f0ae, 0.35)
      .setVisible(false)
      .setDepth(29);
    this.ghost = this.add
      .image(0, 0, 'defense-wood')
      .setAlpha(0.62)
      .setVisible(false)
      .setDepth(30);
    this.createFocusHighlight();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.audio.unlock();
      if (pointer.rightButtonDown() && this.gameService.selectedBuild()) {
        this.gameService.selectBuild(null);
        this.shooting = false;
        return;
      }
      if (pointer.leftButtonDown()) {
        const selected = this.gameService.selectedBuild();
        if (this.snapshot?.phase === 'build' && selected) {
          const spot = this.placement;
          this.gameService.placeDefense(
            selected,
            spot ? spot.x : pointer.worldX,
            spot ? spot.y : pointer.worldY,
          );
        } else {
          this.shooting = true;
        }
      }
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonReleased()) this.shooting = false;
    });
    this.input.on(
      'wheel',
      (_pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
        if (dy !== 0) this.gameService.cycleWeapon(dy > 0 ? 1 : -1);
      },
    );
    this.game.canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    this.subscriptions.add(
      this.gameService.snapshot$.subscribe((snapshot) => {
        this.snapshot = snapshot;
        this.ensureWorld(snapshot.mapId);
        this.reconcile(snapshot);
      }),
    );
    this.subscriptions.add(
      this.gameService.fx$.subscribe((events) => {
        for (const event of events) this.playFx(event);
      }),
    );

    const current = this.gameService.snapshot();
    this.ensureWorld(current?.mapId ?? this.gameService.preferredMap());
    if (current) {
      this.snapshot = current;
      this.reconcile(current);
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.subscriptions.unsubscribe());
  }

  override update(_time: number, deltaMs: number) {
    const rotateOrReload = Phaser.Input.Keyboard.JustDown(this.keys['R']);
    const selected = this.gameService.selectedBuild();
    if (rotateOrReload && this.snapshot?.phase === 'build' && selected) {
      this.gameService.rotateBuild();
    } else if (rotateOrReload && this.snapshot?.phase === 'combat') {
      this.reloadQueued = true;
      this.audio.play('reload', 0.7);
    }

    if (this.snapshot?.phase === 'build') {
      if (Phaser.Input.Keyboard.JustDown(this.keys['F'])) this.gameService.repairFocused();
      if (Phaser.Input.Keyboard.JustDown(this.keys['V'])) this.gameService.sellFocused();
    }
    this.checkWeaponSlots();

    const input = this.buildInput();
    this.movePlayerViews(deltaMs, input);
    this.animateZombies(deltaMs);
    this.moveViews(this.defenses, 30, deltaMs);
    this.moveProjectiles(deltaMs);
    this.updatePointer();
    this.updateFocusHighlight(deltaMs);
    this.updateBolts(deltaMs);

    this.sendTimer += deltaMs;
    this.inputHeartbeat += deltaMs;
    // Pressing and releasing the trigger goes out at once; waiting for the next
    // send window would add a noticeable delay to the first shot.
    const urgent =
      !this.lastSentInput || input.shoot !== this.lastSentInput.shoot || input.reload;
    if (
      urgent ||
      (this.sendTimer >= 50 &&
        (this.inputChanged(input, this.lastSentInput) || this.inputHeartbeat >= 250))
    ) {
      this.sendTimer = 0;
      this.inputHeartbeat = 0;
      this.gameService.sendInput(input);
      this.lastSentInput = { ...input };
      this.reloadQueued = false;
    }
    if (this.snapshot?.phase === 'combat' && Phaser.Input.Keyboard.JustDown(this.keys['G'])) {
      this.gameService.throwGrenade(
        this.input.activePointer.worldX,
        this.input.activePointer.worldY,
      );
    }
  }

  // ------------------------------------------------------------------- world

  private ensureWorld(mapId: string) {
    if (this.worldMapId === mapId) return;
    this.worldMapId = mapId;
    this.map = findMap(mapId);
    this.world?.destroy(true);
    this.world = this.add.container(0, 0).setDepth(-20);

    const ground = this.add
      .tileSprite(0, 0, ARENA.width, ARENA.height, `ground-${this.map.id}`)
      .setOrigin(0, 0);
    this.world.add(ground);

    for (const decor of this.map.decor) {
      const image = this.add
        .image(decor.x, decor.y, `decor-${decor.kind}`)
        .setRotation(decor.rotation)
        .setDisplaySize(decor.r * 2, decor.r * 2)
        .setAlpha(0.5);
      this.world.add(image);
    }

    const border = this.add.graphics();
    const edge = Phaser.Display.Color.HexStringToColor(this.map.theme.edge).color;
    const accent = Phaser.Display.Color.HexStringToColor(this.map.theme.accent).color;
    border.lineStyle(6, edge, 1);
    border.strokeRect(14, 14, ARENA.width - 28, ARENA.height - 28);
    border.lineStyle(2, accent, 0.25);
    border.strokeRect(30, 30, ARENA.width - 60, ARENA.height - 60);
    this.world.add(border);

    for (const obstacle of this.map.obstacles) {
      const rotated = obstacle.rotation !== 0;
      const drawWidth = rotated ? obstacle.h : obstacle.w;
      const drawHeight = rotated ? obstacle.w : obstacle.h;
      const shadow = this.add.ellipse(
        obstacle.x + 6,
        obstacle.y + 8,
        obstacle.w * 1.04,
        obstacle.h * 1.04,
        0x000000,
        0.35,
      );
      const image = this.add
        .image(obstacle.x, obstacle.y, `obstacle-${obstacle.kind}`)
        .setDisplaySize(drawWidth, drawHeight)
        .setRotation(obstacle.rotation);
      this.world.add(shadow);
      this.world.add(image);
    }
  }

  private createEmitters() {
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
      this.emitters[name] = this.add
        .particles(0, 0, texture, { ...config, emitting: false })
        .setDepth(60);
    }
  }

  private createCrosshair() {
    const graphics = this.add.graphics();
    graphics.lineStyle(2, 0x9fffc0, 0.9);
    graphics.strokeCircle(0, 0, 9);
    graphics.lineStyle(2, 0xffffff, 0.55);
    graphics.lineBetween(-16, 0, -7, 0);
    graphics.lineBetween(7, 0, 16, 0);
    graphics.lineBetween(0, -16, 0, -7);
    graphics.lineBetween(0, 7, 0, 16);
    graphics.fillStyle(0xff5f71, 0.9);
    graphics.fillCircle(0, 0, 1.6);
    this.crosshair = this.add.container(0, 0, [graphics]).setDepth(100);
    this.input.setDefaultCursor('none');
  }

  private updatePointer() {
    const pointer = this.input.activePointer;
    this.crosshair.setPosition(pointer.worldX, pointer.worldY);
    const selected = this.gameService.selectedBuild();
    const showGhost = this.snapshot?.phase === 'build' && Boolean(selected);
    if (!showGhost || !selected) {
      this.placement = undefined;
      this.ghost.setVisible(false);
      this.ghostRange.setVisible(false);
      return;
    }
    const config = DEFENSES[selected];
    const turret = config.kind === 'turret';
    const others = Object.values(this.snapshot?.defenses ?? {});
    const spot = snapDefense(
      {
        type: selected,
        x: Math.round(pointer.worldX),
        y: Math.round(pointer.worldY),
        rotation: turret ? 0 : this.gameService.placementRotation(),
      },
      others,
      this.map.obstacles,
    );
    this.placement = spot;

    const me = this.players.get(this.gameService.sessionId());
    const inRange = me
      ? Math.hypot(me.root.x - spot.x, me.root.y - spot.y) <= PLACE_RANGE
      : true;
    const affordable = (this.snapshot?.players[this.gameService.sessionId()]?.money ?? 0) >= config.cost;
    const valid = inRange && affordable && canPlaceDefense(spot, others, this.map.obstacles);

    this.ghost
      .setVisible(true)
      .setTexture(turret ? `turret-base-${selected}` : `defense-${selected}`)
      .setPosition(spot.x, spot.y)
      .setDisplaySize(config.width, config.height)
      .setRotation(spot.rotation)
      .setAlpha(valid ? 0.62 : 0.4);
    if (valid) this.ghost.clearTint();
    else this.ghost.setTint(0xff5f71);
    this.ghostRange
      .setVisible(turret)
      .setPosition(spot.x, spot.y)
      .setRadius(config.range ?? 100);
  }

  // ------------------------------------------------------------ build focus

  private createFocusHighlight() {
    this.focusOutline = this.add.graphics().setDepth(31).setVisible(false);
    this.focusLabel = this.add
      .text(0, 0, '', {
        align: 'center',
        color: '#e8f4ed',
        fontFamily: 'Inter, Arial, sans-serif',
        fontStyle: 'bold',
        fontSize: '12px',
        stroke: '#04100b',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(32)
      .setVisible(false);
  }

  /**
   * Marks the structure the player can work on and shows what repairing or
   * selling it costs, so both the panel and the field mean the same piece.
   */
  private updateFocusHighlight(deltaMs: number) {
    const snapshot = this.snapshot;
    const me = this.players.get(this.gameService.sessionId());
    let target: DefenseSnapshot | undefined;
    if (snapshot?.phase === 'build' && me) {
      let bestDistance = DEFENSE_REACH;
      for (const defense of Object.values(snapshot.defenses)) {
        const distance = distanceToDefense(me.root.x, me.root.y, defense);
        if (distance > bestDistance) continue;
        bestDistance = distance;
        target = defense;
      }
    }
    this.gameService.setFocusedDefense(target?.id ?? '');

    if (!target) {
      this.focusOutline.setVisible(false);
      this.focusLabel.setVisible(false);
      return;
    }

    this.focusPulse += deltaMs / 1000;
    const size = defenseFootprint(target.type, target.rotation);
    const width = size.w + 14;
    const height = size.h + 14;
    const alpha = 0.55 + Math.sin(this.focusPulse * 5) * 0.2;
    this.focusOutline
      .setVisible(true)
      .clear()
      .lineStyle(2, 0x69f0ae, alpha)
      .strokeRect(target.x - width / 2, target.y - height / 2, width, height);

    const repair = repairCost(target);
    const full = target.refund >= DEFENSES[target.type].cost;
    this.focusLabel
      .setVisible(true)
      // clears the structure's own health bar, which sits just above it
      .setPosition(target.x, target.y - height / 2 - 16)
      .setText(
        `${DEFENSES[target.type].label}  ${Math.round(target.health)} / ${target.maxHealth}\n` +
          `[F] ${repair > 0 ? `Reparieren $${repair}` : 'ganz repariert'}   ` +
          `[V] Verkaufen +$${target.refund}${full ? ' (voller Preis)' : ''}`,
      );
  }

  /** Number keys pick a weapon from the arsenal, in the order it was bought. */
  private checkWeaponSlots() {
    const slots = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'ZERO'];
    for (let index = 0; index < slots.length; index += 1) {
      const key = this.keys[slots[index]];
      if (key && Phaser.Input.Keyboard.JustDown(key)) this.gameService.selectWeaponSlot(index + 1);
    }
  }

  private buildInput(): PlayerInput {
    const pointer = this.input.activePointer;
    return {
      up: this.keys['W'].isDown || this.keys['UP'].isDown,
      down: this.keys['S'].isDown || this.keys['DOWN'].isDown,
      left: this.keys['A'].isDown || this.keys['LEFT'].isDown,
      right: this.keys['D'].isDown || this.keys['RIGHT'].isDown,
      shoot: this.shooting && this.snapshot?.phase === 'combat',
      reload: this.reloadQueued,
      aimX: pointer.worldX,
      aimY: pointer.worldY,
    };
  }

  private inputChanged(input: PlayerInput, previous?: PlayerInput) {
    if (!previous) return true;
    return (
      input.up !== previous.up ||
      input.down !== previous.down ||
      input.left !== previous.left ||
      input.right !== previous.right ||
      input.shoot !== previous.shoot ||
      input.reload ||
      Math.hypot(input.aimX - previous.aimX, input.aimY - previous.aimY) > 3
    );
  }

  // ------------------------------------------------------------- reconcile

  private reconcile(snapshot: GameSnapshot) {
    this.syncEntities(
      this.players,
      snapshot.players,
      (player) => this.createPlayer(player),
      (view, player) => this.updatePlayer(view, player),
    );
    this.syncEntities(
      this.zombies,
      snapshot.zombies,
      (zombie) => this.createZombie(zombie),
      (view, zombie) => this.updateZombie(view, zombie),
    );
    this.syncEntities(
      this.defenses,
      snapshot.defenses,
      (defense) => this.createDefense(defense),
      (view, defense) => this.updateDefense(view, defense),
    );
    this.syncEntities(
      this.projectiles,
      snapshot.projectiles,
      (projectile) => this.createProjectile(projectile),
      (view, projectile) => this.updateProjectile(view, projectile),
    );
  }

  private syncEntities<T extends { id: string; x: number; y: number }, V extends BaseView>(
    views: Map<string, V>,
    entities: Record<string, T>,
    create: (entity: T) => V,
    update: (view: V, entity: T) => void,
  ) {
    for (const [id, view] of views.entries()) {
      if (!(id in entities)) {
        view.root.destroy(true);
        views.delete(id);
      }
    }
    for (const [id, entity] of Object.entries(entities)) {
      let view = views.get(id);
      if (!view) {
        view = create(entity);
        views.set(id, view);
      }
      view.targetX = entity.x;
      view.targetY = entity.y;
      update(view, entity);
    }
  }

  // ------------------------------------------------------------------ player

  private createPlayer(player: PlayerSnapshot): PlayerView {
    const colorIndex = playerTextureIndex(player.color);
    const shadow = this.add.ellipse(3, 7, 46, 34, 0x000000, 0.4);
    const legA = this.add.image(-4, -11, `player-leg-${colorIndex}`);
    const legB = this.add.image(-4, 11, `player-leg-${colorIndex}`);
    const body = this.add.image(0, 0, `player-body-${colorIndex}`);
    const weapon = this.add.image(10, 6, `weapon-${player.weapon}`).setOrigin(0.18, 0.5);
    const head = this.add.image(9, 0, `player-head-${colorIndex}`);
    const actor = this.add.container(0, 0, [legA, legB, body, weapon, head]);

    const label = this.add
      .text(0, -44, player.name, {
        color: '#e8f4ed',
        fontFamily: 'Inter, Arial, sans-serif',
        fontStyle: 'bold',
        fontSize: '12px',
        stroke: '#04100b',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const healthBg = this.add.rectangle(0, 34, 48, 6, 0x260e14, 0.92);
    const healthBar = this.add.rectangle(-24, 34, 48, 6, 0x69f0ae, 1).setOrigin(0, 0.5);
    const reviveBg = this.add
      .rectangle(0, 46, 54, 8, 0x04100b, 0.94)
      .setStrokeStyle(1, 0xe8f4ed, 0.28)
      .setVisible(false);
    const reviveBar = this.add
      .rectangle(-26, 46, 52, 6, 0x69f0ae, 1)
      .setOrigin(0, 0.5)
      .setVisible(false);
    const reviveText = this.add
      .text(0, 58, 'Mitspieler muss nahe stehen', {
        color: '#b9d1c5',
        fontFamily: 'Inter, Arial, sans-serif',
        fontStyle: 'bold',
        fontSize: '10px',
        stroke: '#04100b',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setVisible(false);

    const root = this.add
      .container(player.x, player.y, [
        shadow,
        actor,
        label,
        healthBg,
        healthBar,
        reviveBg,
        reviveBar,
        reviveText,
      ])
      .setDepth(20);

    if (player.id === this.gameService.sessionId()) {
      this.cameras.main.startFollow(root, true, 0.14, 0.14);
    }

    return {
      root,
      actor,
      body,
      head,
      weapon,
      legs: [legA, legB],
      label,
      healthBar,
      reviveBackground: reviveBg,
      reviveBar,
      reviveText,
      walk: 0,
      weaponKey: player.weapon,
      colorIndex,
      targetX: player.x,
      targetY: player.y,
      lastX: player.x,
      lastY: player.y,
    };
  }

  private updatePlayer(view: PlayerView, player: PlayerSnapshot) {
    const ratio = Math.max(0, player.health / player.maxHealth);
    view.healthBar.setDisplaySize(48 * ratio, 6);
    view.healthBar.setFillStyle(ratio < 0.3 ? 0xff5f71 : ratio < 0.6 ? 0xffcc66 : 0x69f0ae);
    view.root.setAlpha(player.alive ? 1 : 0.6);

    if (view.weaponKey !== player.weapon) {
      view.weaponKey = player.weapon;
      view.weapon.setTexture(`weapon-${player.weapon}`);
    }
    view.weapon.setVisible(player.alive);
    view.weapon.x = player.firing > 0 ? 6 : 10;

    if (player.hurt > 0) view.body.setTint(0xff8a8a);
    else if (!player.alive) view.body.setTint(0x8a9a92);
    else view.body.clearTint();

    const reviveVisible = !player.alive;
    view.reviveBackground.setVisible(reviveVisible);
    view.reviveBar.setVisible(reviveVisible).setDisplaySize(52 * player.reviveProgress, 6);
    view.reviveText
      .setVisible(reviveVisible)
      .setText(
        player.reviveProgress > 0
          ? `Wiederbelebung ${Math.round(player.reviveProgress * 100)} %`
          : 'Mitspieler muss nahe stehen',
      );
    view.label.setText(
      player.alive ? player.name : `${player.name} · am Boden`,
    );
    view.actor.setRotation(player.rotation);
  }

  // ------------------------------------------------------------------ zombie

  private createZombie(zombie: ZombieSnapshot): ZombieView {
    const config = ZOMBIES[zombie.type];
    const radius = config.radius;
    const shadow = this.add.ellipse(3, 6, radius * 2.3, radius * 1.6, 0x000000, 0.38);
    const limbs: Phaser.GameObjects.Image[] = [];
    for (let index = 0; index < 4; index += 1) {
      limbs.push(this.add.image(0, 0, `zombie-limb-${zombie.type}`).setOrigin(0.1, 0.5));
    }
    const body = this.add.image(0, 0, `zombie-${zombie.type}`);
    const actor = this.add.container(0, 0, [...limbs, body]);

    const healthBackground = this.add.rectangle(0, -radius - 13, radius * 2.2, 5, 0x260e14, 0.9);
    const healthBar = this.add
      .rectangle(-radius * 1.1, -radius - 13, radius * 2.2, 5, 0xff6b6b)
      .setOrigin(0, 0.5);

    const children: Phaser.GameObjects.GameObject[] = [shadow, actor, healthBackground, healthBar];
    let aura: Phaser.GameObjects.Arc | undefined;
    if (config.rank === 'mini' || config.rank === 'boss') {
      aura = this.add
        .circle(0, 0, radius + 12)
        .setStrokeStyle(3, config.rank === 'boss' ? 0xff4f6b : 0xff5f9e, 0.55);
      children.unshift(aura);
    }

    const root = this.add
      .container(zombie.x, zombie.y, children)
      .setDepth(config.rank === 'boss' ? 16 : config.rank === 'mini' ? 15 : 12);

    return {
      root,
      actor,
      body,
      limbs,
      healthBar,
      healthBackground,
      aura,
      walk: Math.random() * Math.PI * 2,
      type: zombie.type,
      radius,
      lastHealth: zombie.health,
      flameTimer: 0,
      targetX: zombie.x,
      targetY: zombie.y,
    };
  }

  private updateZombie(view: ZombieView, zombie: ZombieSnapshot) {
    view.actor.setRotation(zombie.rotation);
    const ratio = Math.max(0, zombie.health / zombie.maxHealth);
    view.healthBar.setDisplaySize(view.radius * 2.2 * ratio, 5);
    const damaged = zombie.health < view.lastHealth;
    view.lastHealth = zombie.health;

    if (zombie.burning > 0) view.body.setTint(0xffab5c);
    else if (damaged) view.body.setTint(0xffdede);
    else view.body.clearTint();

    if (view.aura) {
      view.aura.setScale(zombie.charging > 0 ? 1.18 : 1);
      view.aura.setStrokeStyle(3, zombie.charging > 0 ? 0xffd166 : 0xff4f6b, 0.6);
    }
  }

  private animateZombies(deltaMs: number) {
    const delta = Math.min(deltaMs, 60) / 1000;
    const smoothing = 1 - Math.exp(-9 * delta);
    for (const [id, view] of this.zombies) {
      const zombie = this.snapshot?.zombies[id];
      const dx = view.targetX - view.root.x;
      const dy = view.targetY - view.root.y;
      const moving = Math.hypot(dx, dy) > 1.2;
      view.root.x = Phaser.Math.Linear(view.root.x, view.targetX, smoothing);
      view.root.y = Phaser.Math.Linear(view.root.y, view.targetY, smoothing);

      const rate = view.type === 'fast' ? 15 : view.type === 'boss' ? 5 : 9;
      view.walk += delta * (moving ? rate : 2.5);
      const swing = Math.sin(view.walk);
      const attack = zombie && zombie.attacking > 0 ? 1 : 0;
      const reach = view.radius * (0.86 + attack * 0.32);
      view.limbs[0].setPosition(reach, -view.radius * 0.52).setRotation(-0.35 + swing * 0.32 - attack * 0.3);
      view.limbs[1].setPosition(reach, view.radius * 0.52).setRotation(0.35 - swing * 0.32 + attack * 0.3);
      view.limbs[2]
        .setPosition(-view.radius * 0.55 + swing * view.radius * 0.24, -view.radius * 0.42)
        .setRotation(Math.PI + swing * 0.2);
      view.limbs[3]
        .setPosition(-view.radius * 0.55 - swing * view.radius * 0.24, view.radius * 0.42)
        .setRotation(Math.PI - swing * 0.2);

      if (zombie && zombie.burning > 0) {
        view.flameTimer -= deltaMs;
        if (view.flameTimer <= 0) {
          view.flameTimer = 90;
          this.emitters['flame']?.explode(2, view.root.x, view.root.y - 4);
        }
      }
    }
  }

  // ----------------------------------------------------------------- defense

  private createDefense(defense: DefenseSnapshot): DefenseView {
    const config = DEFENSES[defense.type];
    const turret = config.kind === 'turret';
    const shadow = this.add.ellipse(3, 6, config.width * 1.05, config.height * 1.05, 0x000000, 0.34);
    const body = this.add
      .image(0, 0, turret ? `turret-base-${defense.type}` : `defense-${defense.type}`)
      .setDisplaySize(config.width, config.height);
    const children: Phaser.GameObjects.GameObject[] = [shadow, body];
    let gun: Phaser.GameObjects.Image | undefined;
    if (turret) {
      gun = this.add.image(0, 0, `turret-gun-${defense.type}`).setOrigin(0.22, 0.5);
      children.push(gun);
    }
    const healthBackground = this.add.rectangle(0, -config.height / 2 - 10, config.width, 5, 0x260e14, 0.9);
    const healthBar = this.add
      .rectangle(-config.width / 2, -config.height / 2 - 10, config.width, 5, 0x57b8ff)
      .setOrigin(0, 0.5);
    children.push(healthBackground, healthBar);

    const root = this.add.container(defense.x, defense.y, children).setDepth(10);
    if (!turret) body.setRotation(defense.rotation);

    return {
      root,
      body,
      gun,
      healthBar,
      type: defense.type,
      targetX: defense.x,
      targetY: defense.y,
    };
  }

  private updateDefense(view: DefenseView, defense: DefenseSnapshot) {
    const config = DEFENSES[defense.type];
    if (config.kind === 'barricade') view.body.setRotation(defense.rotation);
    view.gun?.setRotation(defense.rotation);
    const ratio = Math.max(0, defense.health / defense.maxHealth);
    view.healthBar.setDisplaySize(config.width * ratio, 5);
    view.healthBar.setFillStyle(ratio < 0.35 ? 0xff5f71 : 0x57b8ff);
  }

  // --------------------------------------------------------------- projectile

  private createProjectile(projectile: ProjectileSnapshot): ProjectileView {
    const style = PROJECTILE_STYLE[projectile.kind] ?? PROJECTILE_STYLE['pistol'];
    const image = this.add
      .image(projectile.x, projectile.y, style.texture)
      .setTint(style.tint)
      .setScale(style.scaleX, style.scaleY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(25);
    return {
      root: image,
      kind: projectile.kind,
      smoke: 0,
      targetX: projectile.x,
      targetY: projectile.y,
    };
  }

  private updateProjectile(view: ProjectileView, projectile: ProjectileSnapshot) {
    view.root.setRotation(Math.atan2(projectile.vy, projectile.vx));
  }

  private moveProjectiles(deltaMs: number) {
    const amount = 1 - Math.exp((-26 * Math.min(deltaMs, 100)) / 1000);
    for (const view of this.projectiles.values()) {
      view.root.x = Phaser.Math.Linear(view.root.x, view.targetX, amount);
      view.root.y = Phaser.Math.Linear(view.root.y, view.targetY, amount);
      if (view.kind === 'rocket' || view.kind === 'turret_launcher') {
        view.smoke -= deltaMs;
        if (view.smoke <= 0) {
          view.smoke = 55;
          this.emitters['smoke']?.explode(1, view.root.x, view.root.y);
        }
      }
      if (view.kind === 'flamer') {
        view.root.setScale(
          view.root.scaleX + deltaMs * 0.0022,
          view.root.scaleY + deltaMs * 0.0022,
        );
        view.root.setAlpha(Math.max(0.25, view.root.alpha - deltaMs * 0.0012));
      }
    }
  }

  // ------------------------------------------------------------ local motion

  private movePlayerViews(deltaMs: number, input: PlayerInput) {
    const delta = Math.min(deltaMs, 50) / 1000;
    const localId = this.gameService.sessionId();
    const phaseAllowsMovement =
      this.snapshot?.phase === 'combat' || this.snapshot?.phase === 'build';

    for (const [id, view] of this.players) {
      const player = this.snapshot?.players[id];
      if (id === localId && player?.alive && phaseAllowsMovement) {
        let dx = Number(input.right) - Number(input.left);
        let dy = Number(input.down) - Number(input.up);
        const isMoving = dx !== 0 || dy !== 0;
        const length = Math.hypot(dx, dy) || 1;
        dx /= length;
        dy /= length;
        const speed = this.gameService.localMoveSpeed();
        view.root.x = Phaser.Math.Clamp(
          view.root.x + dx * speed * delta,
          ARENA.padding,
          ARENA.width - ARENA.padding,
        );
        view.root.y = Phaser.Math.Clamp(
          view.root.y + dy * speed * delta,
          ARENA.padding,
          ARENA.height - ARENA.padding,
        );
        this.pushOutOfObstacles(view.root);
        view.actor.setRotation(Math.atan2(input.aimY - view.root.y, input.aimX - view.root.x));

        const error = Math.hypot(view.targetX - view.root.x, view.targetY - view.root.y);
        if (!isMoving || error > 45) {
          const correction = isMoving ? Math.min(1, delta * 14) : 1 - Math.exp(-12 * delta);
          view.root.x += (view.targetX - view.root.x) * correction;
          view.root.y += (view.targetY - view.root.y) * correction;
        }
        this.animatePlayer(view, delta, isMoving);
        continue;
      }

      const smoothing = 1 - Math.exp(-11 * delta);
      const moved = Math.hypot(view.targetX - view.root.x, view.targetY - view.root.y) > 1.5;
      view.root.x = Phaser.Math.Linear(view.root.x, view.targetX, smoothing);
      view.root.y = Phaser.Math.Linear(view.root.y, view.targetY, smoothing);
      this.animatePlayer(view, delta, moved);
    }
  }

  private animatePlayer(view: PlayerView, delta: number, moving: boolean) {
    view.walk += delta * (moving ? 12 : 3);
    const swing = Math.sin(view.walk) * (moving ? 1 : 0.25);
    view.legs[0].setPosition(-4 + swing * 5, -11).setRotation(swing * 0.22);
    view.legs[1].setPosition(-4 - swing * 5, 11).setRotation(-swing * 0.22);
    view.body.y = Math.sin(view.walk * 2) * (moving ? 0.8 : 0.25);
    view.head.y = view.body.y * 0.6;
  }

  private pushOutOfObstacles(root: Phaser.GameObjects.Container) {
    for (const rect of this.map.obstacles) {
      const closestX = Phaser.Math.Clamp(root.x, rect.x - rect.w / 2, rect.x + rect.w / 2);
      const closestY = Phaser.Math.Clamp(root.y, rect.y - rect.h / 2, rect.y + rect.h / 2);
      let offsetX = root.x - closestX;
      let offsetY = root.y - closestY;
      const distance = Math.hypot(offsetX, offsetY);
      if (distance >= PLAYER_RADIUS) continue;
      if (distance === 0) {
        const pushX = rect.w / 2 + PLAYER_RADIUS - Math.abs(root.x - rect.x);
        const pushY = rect.h / 2 + PLAYER_RADIUS - Math.abs(root.y - rect.y);
        if (pushX < pushY) root.x += (root.x < rect.x ? -1 : 1) * pushX;
        else root.y += (root.y < rect.y ? -1 : 1) * pushY;
        continue;
      }
      offsetX /= distance;
      offsetY /= distance;
      root.x += offsetX * (PLAYER_RADIUS - distance);
      root.y += offsetY * (PLAYER_RADIUS - distance);
    }
  }

  private moveViews(views: Map<string, DefenseView>, rate: number, deltaMs: number) {
    const amount = 1 - Math.exp((-rate * Math.min(deltaMs, 100)) / 1000);
    for (const view of views.values()) {
      view.root.x = Phaser.Math.Linear(view.root.x, view.targetX, amount);
      view.root.y = Phaser.Math.Linear(view.root.y, view.targetY, amount);
    }
  }

  // --------------------------------------------------------------------- fx

  private playFx(event: FxEvent) {
    switch (event.k) {
      case 'hit':
        this.emitters['spark']?.explode(event.s === 'wall' ? 4 : 6, event.x, event.y);
        if (event.s !== 'wall') this.emitters['blood']?.explode(3, event.x, event.y);
        this.audio.play('hit', 0.5);
        break;
      case 'blood':
        this.emitters['blood']?.explode(event.s === 'down' ? 22 : 8, event.x, event.y);
        if (event.s === 'down') this.addDecal(event.x, event.y, 70);
        this.audio.play('hurt', 0.7);
        this.cameras.main.shake(120, 0.004);
        break;
      case 'death':
        this.emitters['blood']?.explode(12 + Math.round((event.r ?? 18) / 2), event.x, event.y);
        this.addDecal(event.x, event.y, (event.r ?? 18) * 2.6);
        this.addCorpse(event.x, event.y, (event.s as ZombieType) ?? 'normal');
        this.audio.play('zombie-death', 0.45);
        break;
      case 'explosion': {
        const radius = event.r ?? 100;
        this.emitters['flame']?.explode(Math.min(26, 10 + radius / 8), event.x, event.y);
        this.emitters['smoke']?.explode(Math.min(20, 8 + radius / 10), event.x, event.y);
        this.emitters['shard']?.explode(10, event.x, event.y);
        this.shockwave(event.x, event.y, radius, 0xffb347);
        this.audio.play('explosion', 0.9);
        this.cameras.main.shake(220, Math.min(0.014, 0.004 + radius / 22000));
        break;
      }
      case 'burn':
        this.emitters['flame']?.explode(4, event.x, event.y);
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
        this.emitters['energy']?.explode(5, event.x2 ?? event.x, event.y2 ?? event.y);
        break;
      case 'muzzle':
        this.muzzleFlash(event);
        break;
      case 'structure':
        this.emitters['shard']?.explode(3, event.x, event.y);
        break;
      case 'wreck':
        this.emitters['shard']?.explode(14, event.x, event.y);
        this.emitters['smoke']?.explode(6, event.x, event.y);
        this.audio.play('build', 0.6);
        break;
      case 'boss':
        this.shockwave(event.x, event.y, (event.r ?? 60) * 2.4, 0xff4f6b);
        this.cameras.main.shake(320, 0.01);
        if (event.s === 'spawn') this.audio.play('boss-roar', 0.9);
        break;
      case 'heal':
        this.emitters['energy']?.explode(12, event.x, event.y);
        this.audio.play('heal', 0.6);
        break;
    }
  }

  private muzzleFlash(event: FxEvent) {
    const angle = event.a ?? 0;
    const weapon = event.s as WeaponType;
    const extra = WEAPON_MUZZLE[weapon] ? WEAPON_MUZZLE[weapon] - 26 : 12;
    const x = event.x + Math.cos(angle) * extra;
    const y = event.y + Math.sin(angle) * extra;
    const flash = this.add
      .image(x, y, 'fx-glow')
      .setTint(weapon === 'laser' ? 0xff8fd8 : weapon === 'tesla' ? 0x9fdcff : 0xffd489)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.42, 0.3)
      .setRotation(angle)
      .setDepth(45);
    this.tweens.add({
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

  private shockwave(x: number, y: number, radius: number, color: number) {
    const ring = this.add
      .circle(x, y, 14)
      .setStrokeStyle(5, color, 0.95)
      .setDepth(74);
    this.tweens.add({
      targets: ring,
      radius,
      alpha: 0,
      duration: 420,
      ease: 'Quad.Out',
      onComplete: () => ring.destroy(),
    });
    const flash = this.add
      .image(x, y, 'fx-glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setScale(radius / 40)
      .setDepth(73);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: radius / 22,
      scaleY: radius / 22,
      duration: 330,
      onComplete: () => flash.destroy(),
    });
  }

  private addDecal(x: number, y: number, size: number) {
    const decal = this.add
      .image(x, y, 'decor-blood')
      .setDisplaySize(size, size * 0.8)
      .setRotation(Math.random() * Math.PI * 2)
      .setAlpha(0.62)
      .setDepth(-8);
    this.decals.push(decal);
    while (this.decals.length > 70) this.decals.shift()?.destroy();
  }

  private addCorpse(x: number, y: number, type: ZombieType) {
    if (!this.textures.exists(`zombie-${type}`)) return;
    const corpse = this.add
      .image(x, y, `zombie-${type}`)
      .setRotation(Math.random() * Math.PI * 2)
      .setTint(0x6b7264)
      .setAlpha(0.85)
      .setDepth(-7);
    this.tweens.add({
      targets: corpse,
      alpha: 0,
      scaleX: 0.85,
      scaleY: 0.85,
      duration: 5200,
      delay: 1600,
      onComplete: () => corpse.destroy(),
    });
  }

  private updateBolts(deltaMs: number) {
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

@Component({
  selector: 'app-game-canvas',
  template: '<div #gameHost class="game-host" aria-label="Spielfeld"></div>',
  styles: `
    :host, .game-host {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      min-height: 0;
    }
    :host { overflow: hidden; background: #05100c; }
    :host ::ng-deep canvas { display: block; max-width: 100%; max-height: 100%; }
  `,
})
export class GameCanvas implements AfterViewInit, OnDestroy {
  @ViewChild('gameHost', { static: true }) gameHost!: ElementRef<HTMLDivElement>;
  private readonly gameService = inject(GameService);
  private readonly audio = inject(AudioService);
  private game?: Phaser.Game;

  ngAfterViewInit() {
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.gameHost.nativeElement,
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      backgroundColor: '#05100c',
      antialias: true,
      scene: [new ArenaScene(this.gameService, this.audio)],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: VIEWPORT.width,
        height: VIEWPORT.height,
      },
      render: {
        pixelArt: false,
        roundPixels: true,
      },
    });
  }

  ngOnDestroy() {
    this.game?.destroy(true);
  }
}
