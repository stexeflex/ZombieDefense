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
  health?: Phaser.GameObjects.Rectangle;
  label?: Phaser.GameObjects.Text;
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
  private shooting = false;
  private crosshair!: Phaser.GameObjects.Container;
  private placementGhost!: Phaser.GameObjects.Rectangle;

  constructor(private readonly gameService: GameService) {
    super({ key: 'arena' });
  }

  create() {
    this.drawArena();
    this.keys = this.input.keyboard!.addKeys(
      'W,S,A,D,UP,DOWN,LEFT,RIGHT,R,E,G',
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    this.createCrosshair();
    this.placementGhost = this.add
      .rectangle(0, 0, 58, 32, 0x69f0ae, 0.15)
      .setStrokeStyle(2, 0x69f0ae, 0.85)
      .setVisible(false)
      .setDepth(30);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
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
    this.moveViews(this.players, 0.42);
    this.moveViews(this.zombies, 0.34);
    this.moveViews(this.defenses, 1);
    this.moveViews(this.projectiles, 0.68);
    this.updatePointer();

    this.sendTimer += deltaMs;
    if (this.sendTimer >= 50) {
      this.sendTimer = 0;
      this.gameService.sendInput(this.buildInput());
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys['G'])) {
      this.gameService.throwGrenade(this.input.activePointer.worldX, this.input.activePointer.worldY);
    }
  }

  private drawArena() {
    this.cameras.main.setBackgroundColor('#07100d');
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

    const stains = [
      [180, 145, 52],
      [1020, 212, 34],
      [940, 580, 66],
      [335, 562, 42],
      [710, 120, 29],
    ];
    for (const [x, y, radius] of stains) {
      graphics.fillStyle(0x15211c, 0.75);
      graphics.fillCircle(x, y, radius);
      graphics.fillStyle(0x07100d, 0.55);
      graphics.fillCircle(x + 8, y - 5, radius * 0.72);
    }

    this.add
      .text(48, 46, 'SEKTOR 07  /  VERTEIDIGUNGSRING', {
        color: '#385248',
        fontFamily: 'monospace',
        fontSize: '12px',
        letterSpacing: 2,
      })
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
      .setSize(selected === 'turret' ? 46 : 58, selected === 'turret' ? 46 : 32);
  }

  private buildInput(): PlayerInput {
    const pointer = this.input.activePointer;
    return {
      up: this.keys['W'].isDown || this.keys['UP'].isDown,
      down: this.keys['S'].isDown || this.keys['DOWN'].isDown,
      left: this.keys['A'].isDown || this.keys['LEFT'].isDown,
      right: this.keys['D'].isDown || this.keys['RIGHT'].isDown,
      shoot: this.shooting && this.snapshot?.phase === 'combat',
      reload: Phaser.Input.Keyboard.JustDown(this.keys['R']),
      interact: this.keys['E'].isDown,
      aimX: pointer.worldX,
      aimY: pointer.worldY,
    };
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
    const shadow = this.add.circle(3, 5, 20, 0x000000, 0.35);
    const body = this.add.circle(0, 0, 18, color, 1).setStrokeStyle(3, 0xe5fff0, 0.32);
    const vest = this.add.rectangle(0, 3, 14, 10, 0x10251c, 0.82);
    const gun = this.add.rectangle(22, 0, 24, 5, 0xdce8df, 1).setOrigin(0, 0.5);
    const label = this.add
      .text(0, -36, player.name, {
        color: '#e8f4ed',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        fontSize: '12px',
        stroke: '#07100d',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const healthBg = this.add.rectangle(0, 29, 42, 4, 0x260e14, 0.9);
    const health = this.add.rectangle(-21, 29, 42, 4, 0x69f0ae, 1).setOrigin(0, 0.5);
    const root = this.add
      .container(player.x, player.y, [shadow, gun, body, vest, label, healthBg, health])
      .setDepth(20);
    if (player.id === this.gameService.sessionId()) {
      const localRing = this.add.circle(0, 0, 25).setStrokeStyle(1, 0x69f0ae, 0.75);
      root.addAt(localRing, 1);
    }
    root.setData('gun', gun);
    return { root, body, health, label, targetX: player.x, targetY: player.y };
  }

  private updatePlayer(view: EntityView, player: PlayerSnapshot) {
    const gun = view.root.getData('gun') as Phaser.GameObjects.Rectangle;
    gun.setRotation(player.rotation);
    gun.setPosition(Math.cos(player.rotation) * 15, Math.sin(player.rotation) * 15);
    const ratio = Math.max(0, player.health / player.maxHealth);
    view.health?.setDisplaySize(42 * ratio, 4);
    view.health?.setFillStyle(ratio < 0.3 ? 0xff5f71 : 0x69f0ae);
    view.root.setAlpha(player.alive ? 1 : 0.45);
    view.body.setFillStyle(
      player.alive ? Phaser.Display.Color.HexStringToColor(player.color).color : 0x63716b,
      1,
    );
    view.label?.setText(player.alive ? player.name : `${player.name} · E halten`);
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
    const children: Phaser.GameObjects.GameObject[] = [];
    if (defense.type === 'barricade') {
      body = this.add.rectangle(0, 0, 58, 32, 0x71513a).setStrokeStyle(3, 0xb98a5f);
      children.push(body);
      for (const y of [-10, 0, 10]) {
        children.push(this.add.rectangle(0, y, 54, 3, 0xd1a06d, 0.7));
      }
    } else {
      body = this.add.circle(0, 0, 22, 0x344740).setStrokeStyle(3, 0x739487);
      const barrel = this.add.rectangle(20, 0, 32, 6, 0xa5bcb2).setOrigin(0, 0.5);
      children.push(body, barrel);
      children.push(this.add.circle(0, 0, 10, 0x17231e));
      children.push(this.add.circle(0, 0, 4, 0x69f0ae));
      body.setData('barrel', barrel);
    }
    const healthBg = this.add.rectangle(0, -31, 58, 4, 0x260e14);
    const health = this.add.rectangle(-29, -31, 58, 4, 0x57b8ff).setOrigin(0, 0.5);
    children.push(healthBg, health);
    const root = this.add.container(defense.x, defense.y, children).setDepth(10);
    return { root, body, health, targetX: defense.x, targetY: defense.y };
  }

  private updateDefense(view: EntityView, defense: DefenseSnapshot) {
    const barrel = view.body.getData('barrel') as Phaser.GameObjects.Rectangle | undefined;
    barrel?.setRotation(defense.rotation);
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

  private moveViews(views: Map<string, EntityView>, amount: number) {
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
    :host, .game-host { display: block; width: 100%; height: 100%; min-height: 0; }
    :host { overflow: hidden; background: #07100d; }
    :host ::ng-deep canvas { display: block; width: 100% !important; height: 100% !important; }
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
      width: ARENA.width,
      height: ARENA.height,
      backgroundColor: '#07100d',
      antialias: true,
      scene: [new ArenaScene(this.gameService)],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: ARENA.width,
        height: ARENA.height,
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
