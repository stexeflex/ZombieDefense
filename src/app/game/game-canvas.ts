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
  VIEWPORT,
  type DefenseSnapshot,
  type GameSnapshot,
  type PlayerInput,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type ZombieSnapshot,
} from '../../../shared/game-types';
import { GameService } from '../core/game.service';

interface EntityView {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Shape;
  actor?: Phaser.GameObjects.Container;
  health?: Phaser.GameObjects.Rectangle;
  label?: Phaser.GameObjects.Text;
  reviveBackground?: Phaser.GameObjects.Rectangle;
  reviveBar?: Phaser.GameObjects.Rectangle;
  reviveText?: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
}

class ArenaScene extends Phaser.Scene {
  private snapshot?: GameSnapshot;
  private readonly players = new Map<string, EntityView>();
  private readonly zombies = new Map<string, EntityView>();
  private readonly defenses = new Map<string, EntityView>();
  private readonly projectiles = new Map<string, EntityView>();
  private readonly subscriptions = new Subscription();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private sendTimer = 0;
  private inputHeartbeat = 0;
  private lastSentInput?: PlayerInput;
  private reloadQueued = false;
  private shooting = false;
  private crosshair!: Phaser.GameObjects.Container;
  private placementGhost!: Phaser.GameObjects.Rectangle;

  constructor(private readonly gameService: GameService) {
    super({ key: 'arena' });
  }

  create() {
    this.drawArena();
    this.keys = this.input.keyboard!.addKeys(
      'W,S,A,D,UP,DOWN,LEFT,RIGHT,R,G',
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    this.createCrosshair();
    this.placementGhost = this.add
      .rectangle(0, 0, 58, 32, 0x69f0ae, 0.15)
      .setStrokeStyle(2, 0x69f0ae, 0.85)
      .setVisible(false)
      .setDepth(30);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() && this.gameService.selectedBuild()) {
        this.gameService.selectBuild(null);
        this.shooting = false;
        return;
      }
      if (pointer.leftButtonDown()) {
        if (this.snapshot?.phase === 'build' && this.gameService.selectedBuild()) {
          this.gameService.placeDefense(
            this.gameService.selectedBuild()!,
            pointer.worldX,
            pointer.worldY,
          );
        } else {
          this.shooting = true;
        }
      }
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonReleased()) this.shooting = false;
    });
    this.game.canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    this.subscriptions.add(
      this.gameService.snapshot$.subscribe((snapshot) => {
        this.snapshot = snapshot;
        this.reconcile(snapshot);
      }),
    );
    this.subscriptions.add(
      this.gameService.explosion$.subscribe((explosion) =>
        this.showExplosion(explosion.x, explosion.y, explosion.radius),
      ),
    );
    const current = this.gameService.snapshot();
    if (current) {
      this.snapshot = current;
      this.reconcile(current);
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.subscriptions.unsubscribe());
  }

  override update(_time: number, deltaMs: number) {
    const rotateOrReload = Phaser.Input.Keyboard.JustDown(this.keys['R']);
    if (
      rotateOrReload &&
      this.snapshot?.phase === 'build' &&
      this.gameService.selectedBuild() === 'barricade'
    ) {
      this.gameService.rotateBuild();
    } else if (rotateOrReload && this.snapshot?.phase === 'combat') {
      this.reloadQueued = true;
    }

    const input = this.buildInput();
    this.movePlayerViews(deltaMs, input);
    this.moveViews(this.zombies, 8.5, deltaMs);
    this.moveViews(this.defenses, 30, deltaMs);
    this.moveViews(this.projectiles, 18, deltaMs);
    this.updatePointer();

    this.sendTimer += deltaMs;
    this.inputHeartbeat += deltaMs;
    if (
      this.sendTimer >= 50 &&
      (this.inputChanged(input, this.lastSentInput) || this.inputHeartbeat >= 250)
    ) {
      this.sendTimer = 0;
      this.inputHeartbeat = 0;
      this.gameService.sendInput(input);
      this.lastSentInput = { ...input };
      this.reloadQueued = false;
    }
    if (
      this.snapshot?.phase === 'combat' &&
      Phaser.Input.Keyboard.JustDown(this.keys['G'])
    ) {
      this.gameService.throwGrenade(this.input.activePointer.worldX, this.input.activePointer.worldY);
    }
  }

  private drawArena() {
    this.cameras.main.setBackgroundColor('#07100d');
    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height);
    this.cameras.main.centerOn(ARENA.width / 2, ARENA.height / 2);
    this.cameras.main.setDeadzone(230, 150);
    const graphics = this.add.graphics().setDepth(-10);
    graphics.fillStyle(0x0a1511, 1);
    graphics.fillRect(0, 0, ARENA.width, ARENA.height);
    graphics.lineStyle(1, 0x17251f, 0.55);
    for (let x = 0; x <= ARENA.width; x += 64) graphics.lineBetween(x, 0, x, ARENA.height);
    for (let y = 0; y <= ARENA.height; y += 64) graphics.lineBetween(0, y, ARENA.width, y);
    graphics.lineStyle(3, 0x284238, 1);
    graphics.strokeRect(18, 18, ARENA.width - 36, ARENA.height - 36);
    graphics.lineStyle(1, 0x69f0ae, 0.25);
    graphics.strokeRect(31, 31, ARENA.width - 62, ARENA.height - 62);

    graphics.fillStyle(0x0d1b16, 0.86);
    graphics.fillRect(ARENA.width / 2 - 310, 0, 620, ARENA.height);
    graphics.fillRect(0, ARENA.height / 2 - 220, ARENA.width, 440);
    graphics.lineStyle(2, 0x243b32, 0.8);
    graphics.strokeCircle(ARENA.width / 2, ARENA.height / 2, 250);
    graphics.lineStyle(1, 0x69f0ae, 0.18);
    graphics.strokeCircle(ARENA.width / 2, ARENA.height / 2, 205);

    const stains = [
      [180, 145, 52],
      [1020, 212, 34],
      [1860, 260, 66],
      [2200, 1180, 44],
      [940, 1380, 66],
      [335, 1120, 42],
      [1510, 1210, 58],
      [710, 520, 29],
      [1760, 760, 46],
    ];
    for (const [x, y, radius] of stains) {
      graphics.fillStyle(0x15211c, 0.75);
      graphics.fillCircle(x, y, radius);
      graphics.fillStyle(0x07100d, 0.55);
      graphics.fillCircle(x + 8, y - 5, radius * 0.72);
    }

    this.add
      .text(48, 46, 'SEKTOR 07  /  ÄUSSERE VERTEIDIGUNGSZONE', {
        color: '#385248',
        fontFamily: 'monospace',
        fontSize: '12px',
        letterSpacing: 2,
      })
      .setDepth(-5);
    this.add
      .text(ARENA.width / 2, ARENA.height / 2 - 285, 'KERNZONE', {
        color: '#42675a',
        fontFamily: 'monospace',
        fontSize: '13px',
        letterSpacing: 5,
      })
      .setOrigin(0.5)
      .setDepth(-5);
  }

  private createCrosshair() {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x9fffc0, 0.9);
    graphics.strokeCircle(0, 0, 8);
    graphics.lineBetween(-14, 0, -6, 0);
    graphics.lineBetween(6, 0, 14, 0);
    graphics.lineBetween(0, -14, 0, -6);
    graphics.lineBetween(0, 6, 0, 14);
    this.crosshair = this.add.container(0, 0, [graphics]).setDepth(100);
    this.input.setDefaultCursor('none');
  }

  private updatePointer() {
    const pointer = this.input.activePointer;
    this.crosshair.setPosition(pointer.worldX, pointer.worldY);
    const selected = this.gameService.selectedBuild();
    const showGhost = this.snapshot?.phase === 'build' && Boolean(selected);
    this.placementGhost
      .setVisible(showGhost)
      .setPosition(pointer.worldX, pointer.worldY)
      .setSize(selected === 'turret' ? 46 : 58, selected === 'turret' ? 46 : 32)
      .setRotation(selected === 'barricade' ? this.gameService.placementRotation() : 0);
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

  private syncEntities<T extends { id: string; x: number; y: number }>(
    views: Map<string, EntityView>,
    entities: Record<string, T>,
    create: (entity: T) => EntityView,
    update: (view: EntityView, entity: T) => void,
  ) {
    const active = new Set(Object.keys(entities));
    for (const [id, view] of views.entries()) {
      if (!active.has(id)) {
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

  private createPlayer(player: PlayerSnapshot): EntityView {
    const color = Phaser.Display.Color.HexStringToColor(player.color).color;
    const shadow = this.add.ellipse(2, 6, 44, 31, 0x000000, 0.38);
    const leftBoot = this.add
      .rectangle(-11, -8, 14, 8, 0x0c1512)
      .setStrokeStyle(1, 0x3b4c45, 0.8);
    const rightBoot = this.add
      .rectangle(-11, 8, 14, 8, 0x0c1512)
      .setStrokeStyle(1, 0x3b4c45, 0.8);
    const backpack = this.add
      .rectangle(-7, 0, 14, 25, 0x1c2924)
      .setStrokeStyle(2, 0x52645c, 0.75);
    const body = this.add
      .rectangle(1, 0, 30, 27, color)
      .setStrokeStyle(2, 0xe5fff0, 0.42);
    const shoulderA = this.add.circle(3, -16, 7, color).setStrokeStyle(2, 0xe5fff0, 0.32);
    const shoulderB = this.add.circle(3, 16, 7, color).setStrokeStyle(2, 0xe5fff0, 0.32);
    const vest = this.add
      .rectangle(0, 0, 18, 21, 0x10251c, 0.9)
      .setStrokeStyle(1, 0x69f0ae, 0.25);
    const head = this.add
      .circle(15, 0, 10, 0x26372f)
      .setStrokeStyle(2, 0xcde8db, 0.55);
    const visor = this.add.rectangle(20, 0, 5, 13, 0x8fffc1, 0.9);
    const arm = this.add
      .rectangle(14, 0, 19, 7, color)
      .setStrokeStyle(1, 0xe5fff0, 0.32);
    const gun = this.add
      .rectangle(22, 0, 30, 6, 0xdce8df, 1)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x21302a, 0.9);
    const muzzle = this.add.rectangle(51, 0, 6, 8, 0x6b7c74);
    const actor = this.add.container(0, 0, [
      leftBoot,
      rightBoot,
      backpack,
      body,
      shoulderA,
      shoulderB,
      vest,
      head,
      visor,
      arm,
      gun,
      muzzle,
    ]);
    const label = this.add
      .text(0, -43, player.name, {
        color: '#e8f4ed',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        fontSize: '12px',
        stroke: '#07100d',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const healthBg = this.add.rectangle(0, 34, 48, 5, 0x260e14, 0.9);
    const health = this.add.rectangle(-24, 34, 48, 5, 0x69f0ae, 1).setOrigin(0, 0.5);
    const reviveBg = this.add
      .rectangle(0, 44, 52, 7, 0x07100d, 0.94)
      .setStrokeStyle(1, 0xe8f4ed, 0.28)
      .setVisible(false);
    const reviveBar = this.add
      .rectangle(-25, 44, 50, 5, 0x69f0ae, 1)
      .setOrigin(0, 0.5)
      .setVisible(false);
    const reviveText = this.add
      .text(0, 54, 'In die Nähe gehen', {
        color: '#b9d1c5',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        fontSize: '10px',
        stroke: '#07100d',
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
        health,
        reviveBg,
        reviveBar,
        reviveText,
      ])
      .setDepth(20);
    if (player.id === this.gameService.sessionId()) {
      const localRing = this.add
        .circle(0, 0, 29)
        .setStrokeStyle(2, 0x69f0ae, 0.62);
      root.addAt(localRing, 1);
      this.cameras.main.startFollow(root, true, 0.12, 0.12);
    }
    return {
      root,
      body,
      actor,
      health,
      label,
      reviveBackground: reviveBg,
      reviveBar,
      reviveText,
      targetX: player.x,
      targetY: player.y,
    };
  }

  private updatePlayer(view: EntityView, player: PlayerSnapshot) {
    const ratio = Math.max(0, player.health / player.maxHealth);
    view.actor?.setRotation(player.rotation);
    view.health?.setDisplaySize(48 * ratio, 5);
    view.health?.setFillStyle(ratio < 0.3 ? 0xff5f71 : 0x69f0ae);
    view.root.setAlpha(player.alive ? 1 : 0.62);
    view.body.setFillStyle(
      player.alive ? Phaser.Display.Color.HexStringToColor(player.color).color : 0x63716b,
      1,
    );
    const reviveVisible = !player.alive;
    view.reviveBackground?.setVisible(reviveVisible);
    view.reviveBar?.setVisible(reviveVisible);
    view.reviveBar?.setDisplaySize(50 * player.reviveProgress, 5);
    view.reviveText
      ?.setVisible(reviveVisible)
      .setText(
        player.reviveProgress > 0
          ? `Wiederbelebung ${Math.round(player.reviveProgress * 100)} %`
          : 'Mitspieler muss nahe stehen',
      );
    view.label?.setText(player.alive ? player.name : `${player.name} · am Boden`);
  }

  private createZombie(zombie: ZombieSnapshot): EntityView {
    const style = {
      normal: { color: 0x76a84b, radius: 18 },
      fast: { color: 0xd0db55, radius: 14 },
      big: { color: 0x8b4b3e, radius: 29 },
    }[zombie.type];
    const shadow = this.add.ellipse(3, 7, style.radius * 2.1, style.radius * 1.4, 0x000000, 0.35);
    const body = this.add.circle(0, 0, style.radius, style.color, 1).setStrokeStyle(2, 0x1e2b1a, 1);
    const eyeA = this.add.circle(style.radius * 0.38, -5, zombie.type === 'big' ? 3 : 2, 0xffcf6b);
    const eyeB = this.add.circle(style.radius * 0.38, 5, zombie.type === 'big' ? 3 : 2, 0xffcf6b);
    const healthBg = this.add.rectangle(0, -style.radius - 10, style.radius * 2, 4, 0x260e14);
    const health = this.add
      .rectangle(-style.radius, -style.radius - 10, style.radius * 2, 4, 0xff6b6b)
      .setOrigin(0, 0.5);
    const root = this.add
      .container(zombie.x, zombie.y, [shadow, body, eyeA, eyeB, healthBg, health])
      .setDepth(12);
    root.setData('eyes', [eyeA, eyeB]);
    return { root, body, health, targetX: zombie.x, targetY: zombie.y };
  }

  private updateZombie(view: EntityView, zombie: ZombieSnapshot) {
    const eyes = view.root.getData('eyes') as Phaser.GameObjects.Arc[];
    for (const eye of eyes) eye.setRotation(zombie.rotation);
    view.root.setRotation(zombie.rotation);
    const width = zombie.type === 'big' ? 58 : zombie.type === 'fast' ? 28 : 36;
    view.health?.setDisplaySize(width * Math.max(0, zombie.health / zombie.maxHealth), 4);
  }

  private createDefense(defense: DefenseSnapshot): EntityView {
    let body: Phaser.GameObjects.Shape;
    let barrel: Phaser.GameObjects.Rectangle | undefined;
    const structureChildren: Phaser.GameObjects.GameObject[] = [];
    if (defense.type === 'barricade') {
      body = this.add.rectangle(0, 0, 58, 32, 0x71513a).setStrokeStyle(3, 0xb98a5f);
      structureChildren.push(body);
      for (const y of [-10, 0, 10]) {
        structureChildren.push(this.add.rectangle(0, y, 54, 3, 0xd1a06d, 0.7));
      }
    } else {
      body = this.add.circle(0, 0, 22, 0x344740).setStrokeStyle(3, 0x739487);
      barrel = this.add.rectangle(20, 0, 32, 6, 0xa5bcb2).setOrigin(0, 0.5);
      structureChildren.push(body, barrel);
      structureChildren.push(this.add.circle(0, 0, 10, 0x17231e));
      structureChildren.push(this.add.circle(0, 0, 4, 0x69f0ae));
    }
    const structure = this.add.container(0, 0, structureChildren);
    const healthBg = this.add.rectangle(0, -31, 58, 4, 0x260e14);
    const health = this.add.rectangle(-29, -31, 58, 4, 0x57b8ff).setOrigin(0, 0.5);
    const root = this.add
      .container(defense.x, defense.y, [structure, healthBg, health])
      .setDepth(10);
    root.setData('structure', structure);
    root.setData('barrel', barrel);
    return { root, body, health, targetX: defense.x, targetY: defense.y };
  }

  private updateDefense(view: EntityView, defense: DefenseSnapshot) {
    const structure = view.root.getData('structure') as Phaser.GameObjects.Container | undefined;
    const barrel = view.root.getData('barrel') as Phaser.GameObjects.Rectangle | undefined;
    if (structure) structure.rotation = defense.type === 'barricade' ? defense.rotation : 0;
    if (barrel) barrel.rotation = defense.rotation;
    view.health?.setDisplaySize(58 * Math.max(0, defense.health / defense.maxHealth), 4);
  }

  private createProjectile(projectile: ProjectileSnapshot): EntityView {
    const color = projectile.kind === 'turret' ? 0x57b8ff : 0xfff3c4;
    const body = this.add.circle(0, 0, projectile.kind === 'shotgun' ? 2 : 3, color);
    const root = this.add.container(projectile.x, projectile.y, [body]).setDepth(25);
    return { root, body, targetX: projectile.x, targetY: projectile.y };
  }

  private updateProjectile(view: EntityView, projectile: ProjectileSnapshot) {
    view.root.setRotation(Math.atan2(projectile.vy, projectile.vx));
  }

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
        view.root.x = Phaser.Math.Clamp(
          view.root.x + dx * this.gameService.localMoveSpeed() * delta,
          ARENA.padding,
          ARENA.width - ARENA.padding,
        );
        view.root.y = Phaser.Math.Clamp(
          view.root.y + dy * this.gameService.localMoveSpeed() * delta,
          ARENA.padding,
          ARENA.height - ARENA.padding,
        );
        view.actor?.setRotation(Math.atan2(input.aimY - view.root.y, input.aimX - view.root.x));

        const error = Math.hypot(view.targetX - view.root.x, view.targetY - view.root.y);
        if (!isMoving || error > 45) {
          const correction = isMoving
            ? Math.min(1, delta * 14)
            : 1 - Math.exp(-12 * delta);
          view.root.x += (view.targetX - view.root.x) * correction;
          view.root.y += (view.targetY - view.root.y) * correction;
        }
        continue;
      }

      const smoothing = 1 - Math.exp(-11 * delta);
      view.root.x = Phaser.Math.Linear(view.root.x, view.targetX, smoothing);
      view.root.y = Phaser.Math.Linear(view.root.y, view.targetY, smoothing);
    }
  }

  private moveViews(views: Map<string, EntityView>, rate: number, deltaMs: number) {
    const amount = 1 - Math.exp((-rate * Math.min(deltaMs, 100)) / 1000);
    for (const view of views.values()) {
      view.root.x = Phaser.Math.Linear(view.root.x, view.targetX, amount);
      view.root.y = Phaser.Math.Linear(view.root.y, view.targetY, amount);
    }
  }

  private showExplosion(x: number, y: number, radius: number) {
    const flash = this.add
      .circle(x, y, 18, 0xffb347, 0.72)
      .setStrokeStyle(4, 0xffdf75, 0.95)
      .setDepth(90);
    this.tweens.add({
      targets: flash,
      displayWidth: radius * 2,
      displayHeight: radius * 2,
      alpha: 0,
      duration: 430,
      ease: 'Quad.Out',
      onComplete: () => flash.destroy(),
    });
    this.cameras.main.shake(150, 0.006);
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
    :host { overflow: hidden; background: #07100d; }
    :host ::ng-deep canvas { display: block; max-width: 100%; max-height: 100%; }
  `,
})
export class GameCanvas implements AfterViewInit, OnDestroy {
  @ViewChild('gameHost', { static: true }) gameHost!: ElementRef<HTMLDivElement>;
  private readonly gameService = inject(GameService);
  private game?: Phaser.Game;

  ngAfterViewInit() {
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.gameHost.nativeElement,
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      backgroundColor: '#07100d',
      antialias: true,
      scene: [new ArenaScene(this.gameService)],
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
