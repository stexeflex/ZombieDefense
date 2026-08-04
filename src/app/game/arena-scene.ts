import Phaser from 'phaser';
import { Subscription } from 'rxjs';
import {
  ARENA,
  DASH_LOCK,
  DASH_SECONDS,
  DEFENSES,
  DEFENSE_REACH,
  PLACE_RANGE,
  PLAYER_RADIUS,
  VEHICLES,
  WEAPONS,
  VEHICLE_BOOST_SECONDS,
  VEHICLE_REACH,
  ZOMBIES,
  canPlaceDefense,
  canPlaceVehicle,
  defenseFootprint,
  distanceToDefense,
  distanceToVehicle,
  driveVehicle,
  findMap,
  isMeleeWeapon,
  repairCost,
  snapDefense,
  vehicleFootprint,
  type DefenseSnapshot,
  type DroneSnapshot,
  type GameMap,
  type GameSnapshot,
  type HazardSnapshot,
  type ObjectiveCoreSnapshot,
  type PlacedDefense,
  type PlayerInput,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type VehicleSnapshot,
  type VehicleType,
  type ZombieSnapshot,
} from '../../../shared/game-types';
import type { AudioService } from '../core/audio.service';
import type { GameService } from '../core/game.service';
import { EffectLayer } from './effects';
import { playerTextureIndex } from './textures';
import {
  HAZARD_STYLE,
  PROJECTILE_STYLE,
  type BaseView,
  type DefenseView,
  type DroneView,
  type HazardView,
  type PlayerView,
  type ProjectileView,
  type VehicleView,
  type ZombieView,
} from './views';

/** Draws the world, predicts the local player and turns input into messages. */
export class ArenaScene extends Phaser.Scene {
  private snapshot?: GameSnapshot;
  private readonly players = new Map<string, PlayerView>();
  private readonly zombies = new Map<string, ZombieView>();
  private readonly defenses = new Map<string, DefenseView>();
  private readonly vehicles = new Map<string, VehicleView>();
  private readonly drones = new Map<string, DroneView>();
  private readonly projectiles = new Map<string, ProjectileView>();
  private readonly hazards = new Map<string, HazardView>();
  private objectiveRoot?: Phaser.GameObjects.Container;
  private objectiveGraphics?: Phaser.GameObjects.Graphics;
  private objectiveLabel?: Phaser.GameObjects.Text;
  private objectiveKind = '';
  private readonly objectiveCores = new Map<
    string,
    {
      root: Phaser.GameObjects.Container;
      graphics: Phaser.GameObjects.Graphics;
      label: Phaser.GameObjects.Text;
    }
  >();
  private readonly subscriptions = new Subscription();
  /** Set once Phaser tore the scene down, see `detach()`. */
  private detached = false;
  private effects!: EffectLayer;

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private sendTimer = 0;
  private inputHeartbeat = 0;
  private lastSentInput?: PlayerInput;
  private reloadQueued = false;
  private dashQueued = false;
  private shooting = false;
  private localDash = 0;
  private localDashLock = 0;
  private localDashX = 1;
  private localDashY = 0;
  /** Alive players are followed; downed players get a freely movable camera. */
  private cameraFollowingLocal = false;
  private crosshair!: Phaser.GameObjects.Container;
  private ghost!: Phaser.GameObjects.Image;
  private ghostRange!: Phaser.GameObjects.Arc;
  private placement?: PlacedDefense;
  private relocationValid = false;
  private focusOutline!: Phaser.GameObjects.Graphics;
  private focusLabel!: Phaser.GameObjects.Text;
  private focusPulse = 0;
  private world?: Phaser.GameObjects.Container;
  private worldMapId = '';
  private map: GameMap = findMap(undefined);

  constructor(
    private readonly gameService: GameService,
    private readonly audio: AudioService,
    private readonly createTextures: (scene: Phaser.Scene) => void,
  ) {
    super({ key: 'arena' });
  }

  create() {
    this.createTextures(this);
    this.cameras.main.setBackgroundColor('#05100c');
    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height);
    this.cameras.main.centerOn(ARENA.width / 2, ARENA.height / 2);
    this.cameras.main.setDeadzone(220, 140);

    this.keys = this.input.keyboard!.addKeys(
      'W,S,A,D,UP,DOWN,LEFT,RIGHT,R,G,F,V,X,E,SPACE,SHIFT,ONE,TWO,THREE,FOUR,FIVE,SIX,SEVEN,EIGHT,NINE,ZERO',
    ) as Record<string, Phaser.Input.Keyboard.Key>;

    this.effects = new EffectLayer(this, this.audio);
    this.effects.create();
    this.createCrosshair();

    this.ghostRange = this.add
      .circle(0, 0, 100)
      .setStrokeStyle(2, 0x69f0ae, 0.35)
      .setVisible(false)
      .setDepth(29);
    this.ghost = this.add.image(0, 0, 'defense-wood').setAlpha(0.62).setVisible(false).setDepth(30);
    this.createFocusHighlight();
    this.bindInput();

    this.subscriptions.add(
      this.gameService.snapshot$.subscribe((snapshot) => {
        if (this.detached) return;
        this.snapshot = snapshot;
        this.ensureWorld(snapshot.mapId);
        this.reconcile(snapshot);
      }),
    );
    this.subscriptions.add(
      this.gameService.fx$.subscribe((events) => {
        if (this.detached) return;
        for (const event of events) this.effects.play(event);
      }),
    );

    const current = this.gameService.snapshot();
    this.ensureWorld(current?.mapId ?? this.gameService.preferredMap());
    if (current) {
      this.snapshot = current;
      this.reconcile(current);
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.detach());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.detach());
  }

  /**
   * A scene that only stops emits SHUTDOWN, but the canvas goes away with the
   * whole game and that path emits DESTROY. Listening to just one of them left
   * the snapshot stream running against a scene whose factory Phaser had
   * already emptied — the next player to join then crashed the view.
   */
  private detach() {
    if (this.detached) return;
    this.detached = true;
    this.subscriptions.unsubscribe();
  }

  private bindInput() {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.audio.unlock();
      const selectedBuild = this.gameService.selectedBuild();
      const selectedVehicle = this.gameService.selectedVehicle();
      const relocating = this.gameService.relocating();
      if (pointer.rightButtonDown() && (selectedBuild || selectedVehicle || relocating)) {
        this.gameService.clearSelection();
        this.shooting = false;
        return;
      }
      if (pointer.leftButtonDown()) {
        const building = this.snapshot?.phase === 'build';
        if (building && relocating) {
          if (!this.relocationValid) return;
          const spot = this.placement;
          this.gameService.moveFocused(
            spot ? spot.x : pointer.worldX,
            spot ? spot.y : pointer.worldY,
          );
        } else if (building && selectedBuild) {
          const spot = this.placement;
          this.gameService.placeDefense(
            selectedBuild,
            spot ? spot.x : pointer.worldX,
            spot ? spot.y : pointer.worldY,
          );
        } else if (building && selectedVehicle) {
          this.gameService.placeVehicle(selectedVehicle, pointer.worldX, pointer.worldY);
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
  }

  override update(_time: number, deltaMs: number) {
    const rotateOrReload = Phaser.Input.Keyboard.JustDown(this.keys['R']);
    const selected =
      this.gameService.selectedBuild() ??
      this.gameService.selectedVehicle() ??
      this.gameService.relocating();
    if (rotateOrReload && this.snapshot?.phase === 'build' && selected) {
      this.gameService.rotateBuild();
    } else if (
      rotateOrReload &&
      (this.snapshot?.phase === 'combat' || this.snapshot?.phase === 'build')
    ) {
      this.reloadQueued = true;
      this.audio.play('reload', 0.7);
    }

    if (this.snapshot?.phase === 'build') {
      if (Phaser.Input.Keyboard.JustDown(this.keys['F'])) this.gameService.repairFocused();
      if (Phaser.Input.Keyboard.JustDown(this.keys['V'])) this.gameService.sellFocused();
      if (Phaser.Input.Keyboard.JustDown(this.keys['X'])) this.gameService.beginMoveFocused();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys['E'])) this.gameService.useVehicle();
    this.checkWeaponSlots();
    this.checkDash(deltaMs);

    const input = this.buildInput();
    this.moveVehicleViews(deltaMs, input);
    this.movePlayerViews(deltaMs, input);
    this.updateSpectatorCamera(deltaMs, input);
    this.animateZombies(deltaMs);
    this.moveDefenseViews(deltaMs);
    this.moveDroneViews(deltaMs);
    this.moveProjectiles(deltaMs);
    this.animateHazards(deltaMs);
    this.updatePointer();
    this.updateFocusHighlight(deltaMs);
    this.effects.updateBolts(deltaMs);

    this.sendTimer += deltaMs;
    this.inputHeartbeat += deltaMs;
    // Pressing and releasing the trigger goes out at once; waiting for the next
    // send window would add a noticeable delay to the first shot.
    const urgent =
      !this.lastSentInput || input.shoot !== this.lastSentInput.shoot || input.reload || input.dash;
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
      this.dashQueued = false;
    }
    if (this.snapshot?.phase === 'combat' && Phaser.Input.Keyboard.JustDown(this.keys['G'])) {
      this.gameService.useAbility(this.input.activePointer.worldX, this.input.activePointer.worldY);
    }
  }

  // -------------------------------------------------------------------- dash

  /**
   * The dash starts locally right away and is confirmed by the server a moment
   * later, so the burst of speed feels instant instead of laggy.
   */
  private checkDash(deltaMs: number) {
    const delta = Math.min(deltaMs, 100) / 1000;
    this.localDash = Math.max(0, this.localDash - delta);
    this.localDashLock = Math.max(0, this.localDashLock - delta);

    const pressed =
      Phaser.Input.Keyboard.JustDown(this.keys['SPACE']) ||
      Phaser.Input.Keyboard.JustDown(this.keys['SHIFT']);
    if (!pressed) return;
    const me = this.snapshot?.players[this.gameService.sessionId()];
    const phase = this.snapshot?.phase;
    if (!me || !me.alive || (phase !== 'combat' && phase !== 'build')) return;
    if (me.dashCharges <= 0 || this.localDash > 0 || this.localDashLock > 0) return;

    // Behind the wheel the same key triggers the hull's movement ability. Nitro
    // is predicted locally; teleportation arrives with the next server snapshot
    // because only the server can validate the landing zone.
    if (me.vehicleId) {
      const view = this.vehicles.get(me.vehicleId);
      const config = view ? VEHICLES[view.type] : undefined;
      if (view && config && (config.boost || config.teleport) && view.driverId === me.id) {
        if (config.boost) view.boost = VEHICLE_BOOST_SECONDS;
        this.localDashLock = DASH_LOCK;
        this.dashQueued = true;
      }
      return;
    }

    let dx =
      Number(this.keys['D'].isDown || this.keys['RIGHT'].isDown) -
      Number(this.keys['A'].isDown || this.keys['LEFT'].isDown);
    let dy =
      Number(this.keys['S'].isDown || this.keys['DOWN'].isDown) -
      Number(this.keys['W'].isDown || this.keys['UP'].isDown);
    if (dx === 0 && dy === 0) {
      const view = this.players.get(this.gameService.sessionId());
      const pointer = this.input.activePointer;
      dx = pointer.worldX - (view?.root.x ?? 0);
      dy = pointer.worldY - (view?.root.y ?? 0);
    }
    const length = Math.hypot(dx, dy) || 1;
    this.localDashX = dx / length;
    this.localDashY = dy / length;
    this.localDash = DASH_SECONDS;
    this.localDashLock = DASH_LOCK;
    this.dashQueued = true;
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

    if (this.map.mission?.kind === 'escort') {
      const route = this.add.graphics();
      const routeColor = Phaser.Display.Color.HexStringToColor(this.map.theme.accent).color;
      route.lineStyle(8, routeColor, 0.12);
      route.beginPath();
      this.map.mission.path.forEach((point, index) => {
        if (index === 0) route.moveTo(point.x, point.y);
        else route.lineTo(point.x, point.y);
      });
      route.strokePath();
      route.lineStyle(2, routeColor, 0.34);
      route.strokePoints(this.map.mission.path, false, false);
      for (const point of this.map.mission.path) {
        route.fillStyle(routeColor, 0.38);
        route.fillCircle(point.x, point.y, 7);
      }
      this.world.add(route);
    }

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
    const building = this.snapshot?.phase === 'build';
    const relocating = this.gameService.relocating();
    if (building && relocating) {
      this.previewRelocation(relocating, pointer);
      return;
    }
    const vehicle = this.gameService.selectedVehicle();
    if (building && vehicle) {
      this.previewVehicle(vehicle, pointer);
      return;
    }
    const selected = this.gameService.selectedBuild();
    const showGhost = building && Boolean(selected);
    if (!showGhost || !selected) {
      this.placement = undefined;
      this.relocationValid = false;
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
    const inRange = me ? Math.hypot(me.root.x - spot.x, me.root.y - spot.y) <= PLACE_RANGE : true;
    const money = this.snapshot?.players[this.gameService.sessionId()]?.money ?? 0;
    const affordable = money >= this.gameService.defensePrice(selected);
    const valid =
      inRange &&
      affordable &&
      this.objectiveClear(spot.x, spot.y, Math.max(config.width, config.height) / 2) &&
      canPlaceDefense(spot, others, this.map.obstacles);

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

  /** A vehicle is parked, not snapped: it needs a free spot, not a neighbour. */
  private previewVehicle(type: VehicleType, pointer: Phaser.Input.Pointer) {
    const config = VEHICLES[type];
    const rotation = this.gameService.placementRotation();
    const spot = {
      type,
      x: Math.round(pointer.worldX),
      y: Math.round(pointer.worldY),
      rotation,
    };
    this.placement = undefined;
    const me = this.players.get(this.gameService.sessionId());
    const inRange = me ? Math.hypot(me.root.x - spot.x, me.root.y - spot.y) <= PLACE_RANGE : true;
    const money = this.snapshot?.players[this.gameService.sessionId()]?.money ?? 0;
    const affordable = money >= this.gameService.vehiclePrice(type);
    const valid =
      inRange &&
      affordable &&
      this.objectiveClear(spot.x, spot.y, Math.max(config.width, config.height) / 2) &&
      canPlaceVehicle(
        spot,
        Object.values(this.snapshot?.defenses ?? {}),
        Object.values(this.snapshot?.vehicles ?? {}),
        this.map.obstacles,
      );

    this.ghost
      .setVisible(true)
      .setTexture(`vehicle-${type}`)
      .setPosition(spot.x, spot.y)
      .setDisplaySize(config.width, config.height)
      .setRotation(rotation)
      .setAlpha(valid ? 0.62 : 0.4);
    if (valid) this.ghost.clearTint();
    else this.ghost.setTint(0xff5f71);
    this.ghostRange.setVisible(false);
  }

  private objectiveClear(x: number, y: number, radius: number) {
    const snapshot = this.snapshot;
    if (!snapshot?.objectiveActive) return true;
    const cores = Object.values(snapshot.objectiveCores ?? {});
    if (cores.length > 0) {
      return cores.every((core) => Math.hypot(core.x - x, core.y - y) > core.radius + radius + 24);
    }
    return (
      Math.hypot((snapshot.objectiveX ?? 0) - x, (snapshot.objectiveY ?? 0) - y) >
      (snapshot.objectiveRadius ?? 0) + radius + 24
    );
  }

  private previewRelocation(
    moving: NonNullable<ReturnType<GameService['relocating']>>,
    pointer: Phaser.Input.Pointer,
  ) {
    const rotation = this.gameService.placementRotation();

    if (moving.kind === 'defense') {
      const type = moving.entity.type;
      const config = DEFENSES[type];
      const turret = config.kind === 'turret';
      const others = Object.values(this.snapshot?.defenses ?? {}).filter(
        (defense) => defense.id !== moving.id,
      );
      const spot = snapDefense(
        {
          type,
          x: Math.round(pointer.worldX),
          y: Math.round(pointer.worldY),
          rotation: turret ? 0 : rotation,
        },
        others,
        this.map.obstacles,
      );
      this.placement = spot;
      const avoidsVehicles = Object.values(this.snapshot?.vehicles ?? {}).every(
        (vehicle) =>
          distanceToVehicle(spot.x, spot.y, vehicle) >= Math.max(config.width, config.height) / 2,
      );
      const valid =
        avoidsVehicles &&
        this.objectiveClear(spot.x, spot.y, Math.max(config.width, config.height) / 2) &&
        canPlaceDefense(spot, others, this.map.obstacles);
      this.relocationValid = valid;
      this.ghost
        .setVisible(true)
        .setTexture(turret ? `turret-base-${type}` : `defense-${type}`)
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
      return;
    }

    const type = moving.entity.type;
    const config = VEHICLES[type];
    const spot = {
      type,
      x: Math.round(pointer.worldX),
      y: Math.round(pointer.worldY),
      rotation,
    };
    this.placement = undefined;
    const me = this.players.get(this.gameService.sessionId());
    const inRange = me
      ? Math.hypot(me.root.x - pointer.worldX, me.root.y - pointer.worldY) <= PLACE_RANGE
      : true;
    const valid =
      inRange &&
      this.objectiveClear(spot.x, spot.y, Math.max(config.width, config.height) / 2) &&
      canPlaceVehicle(
        spot,
        Object.values(this.snapshot?.defenses ?? {}),
        Object.values(this.snapshot?.vehicles ?? {}).filter((vehicle) => vehicle.id !== moving.id),
        this.map.obstacles,
      );
    this.relocationValid = valid;
    this.ghost
      .setVisible(true)
      .setTexture(`vehicle-${type}`)
      .setPosition(spot.x, spot.y)
      .setDisplaySize(config.width, config.height)
      .setRotation(rotation)
      .setAlpha(valid ? 0.62 : 0.4);
    if (valid) this.ghost.clearTint();
    else this.ghost.setTint(0xff5f71);
    this.ghostRange.setVisible(false);
  }

  // ------------------------------------------------------------- build focus

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
    const inside = Boolean(snapshot?.players[this.gameService.sessionId()]?.vehicleId);
    let target: DefenseSnapshot | undefined;
    let hull: VehicleSnapshot | undefined;
    if (this.gameService.relocating()) {
      this.gameService.setFocusedDefense('');
      this.focusOutline.setVisible(false);
      this.focusLabel.setVisible(false);
      return;
    }
    if (snapshot?.phase === 'build' && me && !inside) {
      let bestDistance = DEFENSE_REACH;
      for (const defense of Object.values(snapshot.defenses)) {
        const distance = distanceToDefense(me.root.x, me.root.y, defense);
        if (distance > bestDistance) continue;
        bestDistance = distance;
        target = defense;
      }
      // A parked hull is worked on like a structure, and it wins when it is
      // the closer of the two.
      let hullDistance = target ? bestDistance : VEHICLE_REACH;
      for (const vehicle of Object.values(snapshot.vehicles ?? {})) {
        const distance = distanceToVehicle(me.root.x, me.root.y, vehicle);
        if (distance > hullDistance) continue;
        hullDistance = distance;
        hull = vehicle;
      }
      if (hull) target = undefined;
    }
    this.gameService.setFocusedDefense(hull?.id ?? target?.id ?? '');

    if (!target && !hull) {
      this.focusOutline.setVisible(false);
      this.focusLabel.setVisible(false);
      return;
    }

    this.focusPulse += deltaMs / 1000;
    const size = target
      ? defenseFootprint(target.type, target.rotation)
      : vehicleFootprint(hull!.type, hull!.rotation);
    const spot = target ?? hull!;
    const width = size.w + 14;
    const height = size.h + 14;
    const alpha = 0.55 + Math.sin(this.focusPulse * 5) * 0.2;
    this.focusOutline.setVisible(true).clear();
    if (target && DEFENSES[target.type].kind === 'turret') {
      const range = target.range || DEFENSES[target.type].range || 0;
      this.focusOutline
        .fillStyle(0x69f0ae, 0.025)
        .fillCircle(target.x, target.y, range)
        .lineStyle(1, 0x69f0ae, 0.18)
        .strokeCircle(target.x, target.y, range);
    }
    this.focusOutline
      .lineStyle(2, 0x69f0ae, alpha)
      .strokeRect(spot.x - width / 2, spot.y - height / 2, width, height);

    const repair = repairCost(spot);
    const cost = target ? DEFENSES[target.type].cost : VEHICLES[hull!.type].cost;
    const label = target ? DEFENSES[target.type].label : VEHICLES[hull!.type].label;
    // Repairs stay cooperative; selling is reserved for the player who paid.
    const own = spot.ownerId === this.gameService.sessionId();
    const canSell = own && (!hull || hull.crew.length === 0);
    const actions = [
      `[F] ${repair > 0 ? `Reparieren $${repair}` : 'ganz repariert'}`,
      hull ? '[E] Einsteigen' : '',
      !hull || hull.crew.length === 0 ? '[X] Verschieben' : '',
      canSell
        ? `[V] Verkaufen +$${spot.refund}${spot.refund >= cost ? ' (voller Preis)' : ''}`
        : !own
          ? 'Verkauf nur durch Besitzer'
          : '',
    ].filter((entry) => entry.length > 0);
    this.focusLabel
      .setVisible(true)
      // clears the structure's own health bar, which sits just above it
      .setPosition(spot.x, spot.y - height / 2 - 16)
      .setText(`${label}  ${Math.round(spot.health)} / ${spot.maxHealth}\n${actions.join('   ')}`);
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
      dash: this.dashQueued,
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
      input.dash ||
      Math.hypot(input.aimX - previous.aimX, input.aimY - previous.aimY) > 3
    );
  }

  // --------------------------------------------------------------- reconcile

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
      this.vehicles,
      snapshot.vehicles ?? {},
      (vehicle) => this.createVehicle(vehicle),
      (view, vehicle) => this.updateVehicle(view, vehicle),
    );
    this.syncEntities(
      this.drones,
      snapshot.drones ?? {},
      (drone) => this.createDrone(drone),
      (view, drone) => this.updateDrone(view, drone),
    );
    this.syncEntities(
      this.projectiles,
      snapshot.projectiles,
      (projectile) => this.createProjectile(projectile),
      (view, projectile) => this.updateProjectile(view, projectile),
    );
    this.syncEntities(
      this.hazards,
      snapshot.hazards ?? {},
      (hazard) => this.createHazard(hazard),
      (view, hazard) => this.updateHazard(view, hazard),
    );
    this.syncObjective(snapshot);
  }

  private syncObjective(snapshot: GameSnapshot) {
    if (!snapshot.objectiveActive) {
      this.objectiveRoot?.destroy(true);
      this.objectiveRoot = undefined;
      this.objectiveGraphics = undefined;
      this.objectiveLabel = undefined;
      this.objectiveKind = '';
      this.clearObjectiveCoreViews();
      return;
    }

    const cores = snapshot.objectiveCores ?? {};
    if (Object.keys(cores).length > 0) {
      this.objectiveRoot?.destroy(true);
      this.objectiveRoot = undefined;
      this.objectiveGraphics = undefined;
      this.objectiveLabel = undefined;
      this.objectiveKind = 'multiholdout';
      for (const [id, view] of this.objectiveCores) {
        if (id in cores) continue;
        view.root.destroy(true);
        this.objectiveCores.delete(id);
      }
      for (const core of Object.values(cores)) this.syncObjectiveCore(core);
      return;
    }
    this.clearObjectiveCoreViews();

    const kind = snapshot.objectiveKind ?? '';
    if (!this.objectiveRoot || this.objectiveKind !== kind) {
      this.objectiveRoot?.destroy(true);
      this.objectiveKind = kind;
      this.objectiveGraphics = this.add.graphics();
      this.objectiveLabel = this.add
        .text(0, 0, '', {
          align: 'center',
          color: '#eafff2',
          fontFamily: 'Inter, Arial, sans-serif',
          fontStyle: 'bold',
          fontSize: '12px',
          stroke: '#04100b',
          strokeThickness: 4,
        })
        .setOrigin(0.5, 1);
      this.objectiveRoot = this.add
        .container(0, 0, [this.objectiveGraphics, this.objectiveLabel])
        .setDepth(7);
    }

    const radius = snapshot.objectiveRadius ?? 56;
    const health = Math.max(0, snapshot.objectiveHealth ?? 0);
    const maxHealth = Math.max(1, snapshot.objectiveMaxHealth ?? 1);
    const healthShare = health / maxHealth;
    const progress = Math.max(0, Math.min(1, snapshot.objectiveProgress ?? 0));
    const escort = kind === 'escort';
    const color = escort ? 0xffa35c : 0x67f6ff;
    const graphics = this.objectiveGraphics!;
    graphics.clear();
    graphics.fillStyle(color, 0.07);
    graphics.fillCircle(0, 0, radius + 42);
    graphics.lineStyle(2, color, 0.48);
    graphics.strokeCircle(0, 0, radius + 42);

    if (escort) {
      graphics.fillStyle(0x11191d, 1);
      graphics.fillRoundedRect(-48, -25, 96, 50, 12);
      graphics.lineStyle(3, color, 0.9);
      graphics.strokeRoundedRect(-48, -25, 96, 50, 12);
      graphics.fillStyle(0x303a40, 1);
      graphics.fillCircle(-30, 28, 10);
      graphics.fillCircle(30, 28, 10);
      graphics.fillStyle(color, 0.8);
      graphics.fillRect(-24, -16, 48, 18);
    } else {
      graphics.fillStyle(0x10262b, 1);
      graphics.fillCircle(0, 0, 42);
      graphics.lineStyle(5, color, 0.9);
      graphics.strokeCircle(0, 0, 42);
      graphics.fillStyle(color, 0.72);
      graphics.fillCircle(0, 0, 17);
      graphics.lineStyle(2, 0xffffff, 0.5);
      graphics.strokeCircle(0, 0, 26);
    }

    graphics.fillStyle(0x2d1619, 0.95);
    graphics.fillRect(-62, -radius - 35, 124, 7);
    graphics.fillStyle(healthShare > 0.35 ? color : 0xff5f71, 1);
    graphics.fillRect(-62, -radius - 35, 124 * healthShare, 7);
    if (escort) {
      graphics.fillStyle(0x182027, 0.95);
      graphics.fillRect(-62, radius + 27, 124, 5);
      graphics.fillStyle(color, 0.9);
      graphics.fillRect(-62, radius + 27, 124 * progress, 5);
    }

    this.objectiveLabel!.setPosition(0, -radius - 40).setText(
      `${snapshot.objectiveTitle ?? 'Missionsziel'} · ${Math.round(health)} / ${Math.round(maxHealth)}`,
    );
    this.objectiveRoot!.setPosition(snapshot.objectiveX ?? 0, snapshot.objectiveY ?? 0);
  }

  private syncObjectiveCore(core: ObjectiveCoreSnapshot) {
    let view = this.objectiveCores.get(core.id);
    if (!view) {
      const graphics = this.add.graphics();
      const label = this.add
        .text(0, 0, '', {
          align: 'center',
          color: '#eaffff',
          fontFamily: 'Inter, Arial, sans-serif',
          fontStyle: 'bold',
          fontSize: '11px',
          stroke: '#040b10',
          strokeThickness: 4,
        })
        .setOrigin(0.5, 1);
      view = {
        graphics,
        label,
        root: this.add.container(core.x, core.y, [graphics, label]).setDepth(7),
      };
      this.objectiveCores.set(core.id, view);
    }
    const ratio = Math.max(0, Math.min(1, core.health / Math.max(1, core.maxHealth)));
    const color = ratio > 0.35 ? 0x72a7ff : 0xff5f71;
    view.graphics.clear();
    view.graphics.fillStyle(0x72a7ff, 0.055);
    view.graphics.fillCircle(0, 0, core.radius + 38);
    view.graphics.lineStyle(2, 0x72a7ff, 0.42);
    view.graphics.strokeCircle(0, 0, core.radius + 38);
    view.graphics.fillStyle(0x111d31, 1);
    view.graphics.fillCircle(0, 0, 39);
    view.graphics.lineStyle(5, color, 0.92);
    view.graphics.strokeCircle(0, 0, 39);
    view.graphics.fillStyle(color, 0.75);
    view.graphics.fillCircle(0, 0, 15);
    view.graphics.fillStyle(0x261016, 0.96);
    view.graphics.fillRect(-52, -core.radius - 32, 104, 7);
    view.graphics.fillStyle(color, 1);
    view.graphics.fillRect(-52, -core.radius - 32, 104 * ratio, 7);
    view.label
      .setPosition(0, -core.radius - 37)
      .setText(`${core.label} · ${Math.round(core.health)} / ${Math.round(core.maxHealth)}`);
    view.root.setPosition(core.x, core.y);
  }

  private clearObjectiveCoreViews() {
    for (const view of this.objectiveCores.values()) view.root.destroy(true);
    this.objectiveCores.clear();
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
    for (const id in entities) {
      const entity = entities[id];
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
    const dashRing = this.add
      .circle(0, 0, PLAYER_RADIUS + 12)
      .setStrokeStyle(3, 0x9fdcff, 0.9)
      .setVisible(false);
    const legA = this.add.image(-4, -11, `player-leg-${colorIndex}`);
    const legB = this.add.image(-4, 11, `player-leg-${colorIndex}`);
    const body = this.add.image(0, 0, `player-body-${colorIndex}`);
    const weapon = this.add.image(10, 6, `weapon-${player.weapon}`).setOrigin(0.18, 0.5);
    const head = this.add.image(9, 0, `player-head-${colorIndex}`);
    const actor = this.add.container(0, 0, [legA, legB, body, weapon, head]);

    const chargeBackground = this.add
      .rectangle(0, -61, 56, 9, 0x04100b, 0.94)
      .setStrokeStyle(1, 0xc8f8ff, 0.55)
      .setVisible(false);
    const chargeBar = this.add
      .rectangle(-27, -61, 54, 7, 0x68e9ff, 1)
      .setOrigin(0, 0.5)
      .setVisible(false);
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
    const shieldBar = this.add
      .rectangle(-24, 40, 48, 3, 0x9fdcff, 1)
      .setOrigin(0, 0.5)
      .setVisible(false);
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
        dashRing,
        actor,
        chargeBackground,
        chargeBar,
        label,
        healthBg,
        healthBar,
        shieldBar,
        reviveBg,
        reviveBar,
        reviveText,
      ])
      .setDepth(20);

    if (player.id === this.gameService.sessionId()) {
      this.cameras.main.startFollow(root, true, 0.14, 0.14);
      this.cameraFollowingLocal = true;
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
      shieldBar,
      chargeBackground,
      chargeBar,
      reviveBackground: reviveBg,
      reviveBar,
      reviveText,
      dashRing,
      dashPulse: 0,
      walk: 0,
      weaponKey: player.weapon,
      colorIndex,
      targetX: player.x,
      targetY: player.y,
    };
  }

  private updatePlayer(view: PlayerView, player: PlayerSnapshot) {
    const ratio = Math.max(0, player.health / player.maxHealth);
    view.healthBar.setDisplaySize(48 * ratio, 6);
    view.healthBar.setFillStyle(ratio < 0.3 ? 0xff5f71 : ratio < 0.6 ? 0xffcc66 : 0x69f0ae);
    // Teammates show their shield too, so everyone can see who is diving in.
    const shielded = player.shield > 0 && player.shieldMax > 0;
    view.shieldBar.setVisible(shielded);
    if (shielded) {
      view.shieldBar.setDisplaySize(48 * Math.min(1, player.shield / player.shieldMax), 3);
    }
    const charge = Math.max(0, Math.min(1, player.weaponCharge ?? 0));
    const charging = player.alive && charge > 0;
    view.chargeBackground.setVisible(charging);
    view.chargeBar
      .setVisible(charging)
      .setDisplaySize(54 * charge, 7)
      .setFillStyle(charge >= 1 ? 0xffd166 : 0x68e9ff);
    view.root.setAlpha(player.alive ? 1 : 0.6);

    if (view.weaponKey !== player.weapon) {
      view.weaponKey = player.weapon;
      view.weapon.setTexture(`weapon-${player.weapon}`);
    }
    view.weapon.setVisible(player.alive);
    const melee = isMeleeWeapon(player.weapon);
    view.weapon.x = melee ? 7 : player.firing > 0 ? 6 : 10;
    view.weapon.setRotation(melee && player.firing > 0 ? -0.62 : 0);

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
    view.label.setText(player.alive ? player.name : `${player.name} · am Boden`);
    view.actor.setRotation(player.rotation);
  }

  /** The blue ring is the promise that nothing can hit this player right now. */
  private updateDashRing(view: PlayerView, dashing: boolean, deltaMs: number) {
    view.dashRing.setVisible(dashing);
    if (!dashing) {
      view.body.setAlpha(1);
      return;
    }
    view.dashPulse += deltaMs / 1000;
    view.dashRing.setScale(1 + Math.sin(view.dashPulse * 22) * 0.12);
    view.dashRing.setStrokeStyle(3, 0x9fdcff, 0.75 + Math.sin(view.dashPulse * 34) * 0.2);
    view.body.setAlpha(0.75);
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
    let frontShield: Phaser.GameObjects.Rectangle | undefined;
    if (config.frontShield) {
      frontShield = this.add
        .rectangle(radius + 10, 0, 9, radius * 2.2, 0x50616a, 1)
        .setStrokeStyle(3, 0xffd166, 0.95);
    }
    const actor = this.add.container(0, 0, [...limbs, body, ...(frontShield ? [frontShield] : [])]);

    const healthBackground = this.add.rectangle(0, -radius - 13, radius * 2.2, 5, 0x260e14, 0.9);
    const healthBar = this.add
      .rectangle(-radius * 1.1, -radius - 13, radius * 2.2, 5, 0xff6b6b)
      .setOrigin(0, 0.5);

    const phaseShield =
      zombie.type === 'phaseguard'
        ? this.add
            .circle(0, 0, radius + 12, 0x73f7e5, 0.08)
            .setStrokeStyle(3, 0x73f7e5, 0.9)
            .setVisible(false)
        : undefined;
    const children: Phaser.GameObjects.GameObject[] = [
      shadow,
      ...(phaseShield ? [phaseShield] : []),
      actor,
      healthBackground,
      healthBar,
    ];
    let aura: Phaser.GameObjects.Arc | undefined;
    if (zombie.type === 'exploder') {
      aura = this.add.circle(0, 0, radius + 9).setStrokeStyle(3, 0xff5a36, 0.82);
      children.unshift(aura);
    } else if (config.turretSlow) {
      aura = this.add
        .circle(0, 0, config.turretSlow.radius)
        .setFillStyle(0xb45cff, 0.025)
        .setStrokeStyle(2, 0xdd76ff, 0.3);
      children.unshift(aura);
    } else if (config.rank === 'mini' || config.rank === 'boss') {
      aura = this.add
        .circle(0, 0, radius + 12)
        .setStrokeStyle(3, config.rank === 'boss' ? 0xff4f6b : 0xff5f9e, 0.55);
      children.unshift(aura);
    } else if (config.rank === 'elite') {
      aura = this.add.circle(0, 0, radius + 7).setStrokeStyle(2, 0xffcc66, 0.3);
      children.unshift(aura);
    }

    const root = this.add
      .container(zombie.x, zombie.y, children)
      .setDepth(config.rank === 'boss' ? 16 : config.rank === 'mini' ? 15 : 12)
      .setAlpha(config.hiddenFromTurrets ? (config.rank === 'boss' ? 0.52 : 0.3) : 1);

    return {
      root,
      actor,
      body,
      limbs,
      healthBar,
      healthBackground,
      aura,
      frontShield,
      phaseShield,
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

    if (zombie.type === 'phantom') {
      const shimmer = 0.26 + (Math.sin(this.time.now * 0.006 + zombie.x * 0.01) + 1) * 0.05;
      view.root.setAlpha(damaged ? 0.62 : shimmer);
    }

    if (view.phaseShield) {
      const protectedNow = zombie.shielding > 0;
      view.phaseShield.setVisible(protectedNow);
      if (protectedNow) {
        const pulse = 1 + Math.sin(zombie.shielding * 18) * 0.05;
        view.phaseShield.setScale(pulse).setAlpha(0.78 + Math.sin(zombie.shielding * 24) * 0.14);
      }
    }

    if (zombie.casting > 0) view.body.setTint(0xffd166);
    else if (zombie.burning > 0) view.body.setTint(0xffab5c);
    else if (zombie.chilled > 0) view.body.setTint(0x8fd4ff);
    else if (damaged) view.body.setTint(0xffdede);
    else view.body.clearTint();

    if (view.aura) {
      const casting = zombie.casting > 0;
      const rank = ZOMBIES[zombie.type].rank;
      if (zombie.type === 'exploder') {
        view.aura.setStrokeStyle(3, damaged ? 0xfff1a8 : 0xff5a36, 0.82);
        return;
      }
      if (ZOMBIES[zombie.type].turretSlow) {
        view.aura
          .setStrokeStyle(2, damaged ? 0xffd7ff : 0xdd76ff, 0.28)
          .setScale(1 + Math.sin(this.time.now * 0.004) * 0.018);
        return;
      }
      view.aura.setScale(zombie.charging > 0 || casting ? 1.18 : 1);
      const color = casting
        ? 0xffd166
        : zombie.charging > 0
          ? 0xffd166
          : rank === 'elite'
            ? 0xffcc66
            : 0xff4f6b;
      view.aura.setStrokeStyle(rank === 'elite' ? 2 : 3, color, rank === 'elite' ? 0.32 : 0.6);
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

      const rate =
        view.type === 'fast' || view.type === 'crawler' || view.type === 'evasive'
          ? 15
          : view.radius > 50
            ? 5
            : 9;
      view.walk += delta * (moving ? rate : 2.5);
      const swing = Math.sin(view.walk);
      if (view.type === 'exploder' && view.aura) {
        const pulse = (Math.sin(view.walk * 1.7) + 1) / 2;
        view.aura.setScale(1.02 + pulse * 0.13).setAlpha(0.62 + pulse * 0.34);
      }
      const attack = zombie && zombie.attacking > 0 ? 1 : 0;
      const reach = view.radius * (0.86 + attack * 0.32);
      view.limbs[0]
        .setPosition(reach, -view.radius * 0.52)
        .setRotation(-0.35 + swing * 0.32 - attack * 0.3);
      view.limbs[1]
        .setPosition(reach, view.radius * 0.52)
        .setRotation(0.35 - swing * 0.32 + attack * 0.3);
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
          this.effects.burst('flame', 2, view.root.x, view.root.y - 4);
        }
      }
    }
  }

  // ----------------------------------------------------------------- defense

  private createDefense(defense: DefenseSnapshot): DefenseView {
    const config = DEFENSES[defense.type];
    const turret = config.kind === 'turret';
    const shadow = this.add.ellipse(
      3,
      6,
      config.width * 1.05,
      config.height * 1.05,
      0x000000,
      0.34,
    );
    const body = this.add
      .image(0, 0, turret ? `turret-base-${defense.type}` : `defense-${defense.type}`)
      .setDisplaySize(config.width, config.height);
    const children: Phaser.GameObjects.GameObject[] = [shadow, body];
    let gun: Phaser.GameObjects.Image | undefined;
    if (turret) {
      gun = this.add.image(0, 0, `turret-gun-${defense.type}`).setOrigin(0.22, 0.5);
      children.push(gun);
    }
    const healthBackground = this.add.rectangle(
      0,
      -config.height / 2 - 10,
      config.width,
      5,
      0x260e14,
      0.9,
    );
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

  private moveDefenseViews(deltaMs: number) {
    const amount = 1 - Math.exp((-30 * Math.min(deltaMs, 100)) / 1000);
    for (const view of this.defenses.values()) {
      view.root.x = Phaser.Math.Linear(view.root.x, view.targetX, amount);
      view.root.y = Phaser.Math.Linear(view.root.y, view.targetY, amount);
    }
  }

  // ---------------------------------------------------------------- vehicles

  private createVehicle(vehicle: VehicleSnapshot): VehicleView {
    const config = VEHICLES[vehicle.type];
    const shadow = this.add.ellipse(4, 8, config.width * 1.05, config.height * 1.1, 0x000000, 0.36);
    const body = this.add
      .image(0, 0, `vehicle-${vehicle.type}`)
      .setDisplaySize(config.width, config.height);
    const children: Phaser.GameObjects.GameObject[] = [shadow, body];
    let gun: Phaser.GameObjects.Image | undefined;
    if (config.gun) {
      gun = this.add.image(0, 0, `vehicle-gun-${vehicle.type}`).setOrigin(0.2, 0.5);
      children.push(gun);
    }
    const healthBackground = this.add.rectangle(
      0,
      -config.height / 2 - 12,
      config.width * 0.8,
      5,
      0x260e14,
      0.9,
    );
    const healthBar = this.add
      .rectangle(
        (-config.width * 0.8) / 2,
        -config.height / 2 - 12,
        config.width * 0.8,
        5,
        0xffcc66,
      )
      .setOrigin(0, 0.5);
    const crewLabel = this.add
      .text(0, -config.height / 2 - 22, '', {
        align: 'center',
        color: '#e8f4ed',
        fontFamily: 'Inter, Arial, sans-serif',
        fontStyle: 'bold',
        fontSize: '11px',
        stroke: '#04100b',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1);
    const chargeBackground = this.add
      .rectangle(0, config.height / 2 + 15, 60, 9, 0x04100b, 0.94)
      .setStrokeStyle(1, 0x164a50, 0.95)
      .setVisible(false);
    const chargeBar = this.add
      .rectangle(-29, config.height / 2 + 15, 58, 7, 0x68e9ff, 1)
      .setOrigin(0, 0.5)
      .setVisible(false);
    children.push(healthBackground, healthBar, crewLabel, chargeBackground, chargeBar);

    // Above the barricades, below the players standing next to them.
    const root = this.add.container(vehicle.x, vehicle.y, children).setDepth(14);
    return {
      root,
      body,
      gun,
      healthBar,
      crewLabel,
      chargeBackground,
      chargeBar,
      type: vehicle.type,
      rotation: vehicle.rotation,
      targetRotation: vehicle.rotation,
      gunAngle: vehicle.rotation,
      driverId: vehicle.crew[0] ?? '',
      vx: 0,
      vy: 0,
      boost: 0,
      smoke: 0,
      targetX: vehicle.x,
      targetY: vehicle.y,
    };
  }

  private updateVehicle(view: VehicleView, vehicle: VehicleSnapshot) {
    const config = VEHICLES[vehicle.type];
    view.targetRotation = vehicle.rotation;
    if (config.bounce && vehicle.vx !== undefined && vehicle.vy !== undefined) {
      view.vx = vehicle.vx;
      view.vy = vehicle.vy;
    }
    view.driverId = vehicle.crew[0] ?? '';
    const ratio = Math.max(0, vehicle.health / vehicle.maxHealth);
    view.healthBar.setDisplaySize(config.width * 0.8 * ratio, 5);
    view.healthBar.setFillStyle(ratio < 0.3 ? 0xff5f71 : ratio < 0.6 ? 0xffcc66 : 0x69f0ae);

    const names = vehicle.crew
      .map((id) => this.snapshot?.players[id]?.name ?? '')
      .filter((name) => name.length > 0);
    view.crewLabel.setText(
      names.length > 0 ? `${names.join(' · ')}  ${vehicle.crew.length}/${config.seats}` : '',
    );
    const charge = Math.max(
      0,
      ...vehicle.crew.map((id) => this.snapshot?.players[id]?.weaponCharge ?? 0),
    );
    view.chargeBackground.setVisible(charge > 0);
    view.chargeBar
      .setVisible(charge > 0)
      .setDisplaySize(58 * Math.min(1, charge), 7)
      .setFillStyle(charge >= 1 ? 0xffd166 : 0x68e9ff);
  }

  /**
   * The hull the local player steers is simulated here as well, so steering
   * answers immediately instead of a snapshot later. Everything else simply
   * follows the server.
   */
  private moveVehicleViews(deltaMs: number, input: PlayerInput) {
    const delta = Math.min(deltaMs, 50) / 1000;
    const localId = this.gameService.sessionId();
    const me = this.snapshot?.players[localId];
    const drivenId = me?.vehicleId ?? '';
    const phaseAllowsMovement =
      this.snapshot?.phase === 'combat' || this.snapshot?.phase === 'build';

    for (const [id, view] of this.vehicles) {
      const config = VEHICLES[view.type];
      const driving = id === drivenId && view.driverId === localId && phaseAllowsMovement;

      if (driving) {
        view.boost = Math.max(0, view.boost - delta);
        const motion = {
          x: view.root.x,
          y: view.root.y,
          rotation: view.rotation,
          vx: view.vx,
          vy: view.vy,
        };
        let topSpeed =
          this.gameService.localVehicleSpeed(view.type) +
          (view.boost > 0 ? (config.boost ?? 0) : 0);
        const charged = me ? WEAPONS[me.weapon].charge : undefined;
        if (charged && (me?.weaponCharge ?? 0) > 0) topSpeed *= charged.moveFactor;
        driveVehicle(
          motion,
          Number(input.right) - Number(input.left),
          Number(input.down) - Number(input.up),
          config,
          delta,
          topSpeed,
        );
        view.vx = motion.vx;
        view.vy = motion.vy;
        view.rotation = motion.rotation;
        view.root.x = Phaser.Math.Clamp(motion.x, 40, ARENA.width - 40);
        view.root.y = Phaser.Math.Clamp(motion.y, 40, ARENA.height - 40);
        if (config.bounce) {
          if (view.root.x !== motion.x) view.vx = -view.vx * config.bounce;
          if (view.root.y !== motion.y) view.vy = -view.vy * config.bounce;
        }

        // Walls and buildings are only resolved by the server, so a big gap is
        // pulled straight back instead of drifting through them.
        const error = Math.hypot(view.targetX - view.root.x, view.targetY - view.root.y);
        const correction = error > 110 ? 1 : Math.min(1, delta * 2.4);
        view.root.x += (view.targetX - view.root.x) * correction;
        view.root.y += (view.targetY - view.root.y) * correction;
        if (error > 110) {
          view.vx = 0;
          view.vy = 0;
        }
      } else {
        const smoothing = 1 - Math.exp(-13 * delta);
        view.root.x = Phaser.Math.Linear(view.root.x, view.targetX, smoothing);
        view.root.y = Phaser.Math.Linear(view.root.y, view.targetY, smoothing);
        view.rotation = Phaser.Math.Angle.RotateTo(view.rotation, view.targetRotation, 9 * delta);
      }

      view.body.setRotation(view.rotation);
      this.aimVehicleGun(view, delta);
      if (Math.hypot(view.root.x - view.targetX, view.root.y - view.targetY) > 2 || driving) {
        view.smoke -= deltaMs;
        if (view.smoke <= 0) {
          view.smoke = 120;
          this.effects.burst(
            'smoke',
            1,
            view.root.x - Math.cos(view.rotation) * config.width * 0.5,
            view.root.y - Math.sin(view.rotation) * config.width * 0.5,
          );
        }
      }
    }
  }

  /** The mounted gun tracks whatever it would shoot at, the hull does not. */
  private aimVehicleGun(view: VehicleView, delta: number) {
    const gun = VEHICLES[view.type].gun;
    if (!gun || !view.gun) return;
    let target = view.rotation;
    let bestDistance = gun.range;
    for (const zombie of Object.values(this.snapshot?.zombies ?? {})) {
      const distance = Math.hypot(zombie.x - view.root.x, zombie.y - view.root.y);
      if (distance > bestDistance) continue;
      bestDistance = distance;
      target = Math.atan2(zombie.y - view.root.y, zombie.x - view.root.x);
    }
    view.gunAngle = Phaser.Math.Angle.RotateTo(view.gunAngle, target, 8 * delta);
    view.gun.setRotation(view.gunAngle);
  }

  // ------------------------------------------------------------------ drones

  private createDrone(drone: DroneSnapshot): DroneView {
    const shadow = this.add.ellipse(6, 14, 22, 12, 0x000000, 0.3);
    const rotors = [
      this.add.image(-7, -8, 'drone-rotor'),
      this.add.image(-7, 8, 'drone-rotor'),
      this.add.image(6, -8, 'drone-rotor'),
      this.add.image(6, 8, 'drone-rotor'),
    ];
    const body = this.add.image(0, 0, 'drone-body');
    const actor = this.add.container(0, 0, [...rotors, body]);
    // Above everything on the ground — a drone is the only thing that flies.
    const root = this.add.container(drone.x, drone.y, [shadow, actor]).setDepth(24);
    return {
      root,
      actor,
      body,
      rotors,
      rotation: drone.rotation,
      targetRotation: drone.rotation,
      spin: 0,
      bob: Math.random() * Math.PI * 2,
      targetX: drone.x,
      targetY: drone.y,
    };
  }

  private updateDrone(view: DroneView, drone: DroneSnapshot) {
    view.targetRotation = drone.rotation;
  }

  private moveDroneViews(deltaMs: number) {
    const delta = Math.min(deltaMs, 60) / 1000;
    const smoothing = 1 - Math.exp(-14 * delta);
    for (const view of this.drones.values()) {
      view.root.x = Phaser.Math.Linear(view.root.x, view.targetX, smoothing);
      view.root.y = Phaser.Math.Linear(view.root.y, view.targetY, smoothing);
      view.rotation = Phaser.Math.Angle.RotateTo(view.rotation, view.targetRotation, 10 * delta);
      view.actor.setRotation(view.rotation);
      // Blurred rotors and a slow hover keep it reading as airborne.
      view.spin += delta * 34;
      view.bob += delta * 3.4;
      for (let index = 0; index < view.rotors.length; index += 1) {
        const rotor = view.rotors[index];
        rotor.setRotation(index % 2 === 0 ? view.spin : -view.spin);
        rotor.setScale(0.9 + Math.sin(view.spin * 2 + index) * 0.06);
      }
      view.actor.setScale(1 + Math.sin(view.bob) * 0.04);
    }
  }

  // ----------------------------------------------------------------- hazards

  private createHazard(hazard: HazardSnapshot): HazardView {
    const style = HAZARD_STYLE[hazard.kind] ?? HAZARD_STYLE['warning'];
    const warning = hazard.kind === 'warning';
    const nullProjectile = hazard.kind === 'nullCore';
    const friendlyPool =
      hazard.kind === 'acid' ||
      hazard.kind === 'napalm' ||
      hazard.kind === 'nullField' ||
      nullProjectile;
    const hostilePoison = hazard.kind === 'poison';
    const pool = this.add
      .image(0, 0, 'fx-pool')
      .setDisplaySize(hazard.r * 2, hazard.r * 2)
      .setTint(style.tint)
      .setAlpha(style.alpha)
      .setVisible(!warning && hazard.kind !== 'pull');
    const fill = this.add.circle(0, 0, 1, style.tint, 0.28).setVisible(warning);
    const ring = this.add
      .circle(0, 0, hazard.r)
      .setStrokeStyle(
        warning || friendlyPool || hostilePoison ? 4 : 2,
        hostilePoison ? 0xff704d : style.tint,
        warning ? 0.95 : 0.72,
      );
    const marker = this.add
      .text(0, 0, nullProjectile ? '✦' : '☠', {
        color: nullProjectile ? '#eaffff' : '#fff0b0',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        fontSize: `${Math.max(18, Math.min(34, hazard.r * 0.42))}px`,
        stroke: nullProjectile ? '#32157a' : '#5c100c',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setVisible(hostilePoison || nullProjectile);

    const root = this.add
      .container(hazard.x, hazard.y, [pool, fill, ring, marker])
      .setDepth(warning ? 7 : 5);

    return {
      root,
      pool,
      ring,
      fill,
      marker,
      kind: hazard.kind,
      radius: hazard.r,
      pulse: 0,
      targetX: hazard.x,
      targetY: hazard.y,
    };
  }

  private updateHazard(view: HazardView, hazard: HazardSnapshot) {
    view.root.setPosition(hazard.x, hazard.y);
    view.radius = hazard.r;
    const progress = hazard.maxLife > 0 ? 1 - hazard.life / hazard.maxLife : 1;
    if (view.kind === 'warning') {
      // The circle fills up: full means the hit lands now.
      view.fill.setRadius(Math.max(1, hazard.r * progress));
      return;
    }
    if (view.kind === 'pull') {
      view.ring.setRadius(Math.max(4, hazard.r * (1 - progress)));
      return;
    }
    const fade = Math.min(1, hazard.life / 1.2);
    view.pool.setAlpha((HAZARD_STYLE[view.kind]?.alpha ?? 0.5) * fade);
    view.marker.setAlpha(fade);
  }

  private animateHazards(deltaMs: number) {
    for (const view of this.hazards.values()) {
      view.pulse += deltaMs / 1000;
      if (view.kind === 'warning') {
        view.ring.setStrokeStyle(4, 0xff4f6b, 0.6 + Math.sin(view.pulse * 14) * 0.35);
        continue;
      }
      if (view.kind === 'pull') {
        view.ring.setStrokeStyle(2, 0x4ce0d5, 0.35 + Math.sin(view.pulse * 9) * 0.2);
        continue;
      }
      if (view.kind === 'acid') {
        view.ring.setStrokeStyle(4, 0x8ff5ff, 0.55 + Math.sin(view.pulse * 7) * 0.3);
      } else if (view.kind === 'napalm') {
        view.ring.setStrokeStyle(4, 0xffb347, 0.58 + Math.sin(view.pulse * 9) * 0.3);
      } else if (view.kind === 'nullField') {
        view.ring.setStrokeStyle(3, 0xb99cff, 0.42 + Math.sin(view.pulse * 6) * 0.24);
      } else if (view.kind === 'nullCore') {
        view.ring.setStrokeStyle(4, 0xc8fff9, 0.65 + Math.sin(view.pulse * 12) * 0.28);
        view.marker.setScale(1.05 + Math.sin(view.pulse * 10) * 0.18).setRotation(view.pulse * 1.8);
      } else if (view.kind === 'poison') {
        view.ring.setStrokeStyle(4, 0xff704d, 0.58 + Math.sin(view.pulse * 8) * 0.3);
        view.marker
          .setScale(1 + Math.sin(view.pulse * 4.5) * 0.08)
          .setRotation(Math.sin(view.pulse * 2.2) * 0.05);
      }
      view.pool.setScale(
        (view.radius * 2 * (1 + Math.sin(view.pulse * 2.2) * 0.03)) / 128,
        (view.radius * 2 * (1 + Math.cos(view.pulse * 2.6) * 0.03)) / 128,
      );
    }
  }

  // --------------------------------------------------------------- projectile

  private createProjectile(projectile: ProjectileSnapshot): ProjectileView {
    const style = PROJECTILE_STYLE[projectile.kind] ?? PROJECTILE_STYLE['pistol'];
    const image = this.add
      .image(projectile.x, projectile.y, style.texture)
      .setTint(style.tint)
      .setScale(style.scaleX, style.scaleY)
      .setBlendMode(
        projectile.kind === 'throwshield' ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD,
      )
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
    if (projectile.kind !== 'throwshield') {
      view.root.setRotation(Math.atan2(projectile.vy, projectile.vx));
    }
  }

  private moveProjectiles(deltaMs: number) {
    const amount = 1 - Math.exp((-26 * Math.min(deltaMs, 100)) / 1000);
    for (const view of this.projectiles.values()) {
      view.root.x = Phaser.Math.Linear(view.root.x, view.targetX, amount);
      view.root.y = Phaser.Math.Linear(view.root.y, view.targetY, amount);
      if (view.kind === 'throwshield') view.root.rotation += deltaMs * 0.018;
      if (view.kind === 'rocket' || view.kind === 'firerocket' || view.kind === 'turret_launcher') {
        view.smoke -= deltaMs;
        if (view.smoke <= 0) {
          view.smoke = 55;
          this.effects.burst(
            view.kind === 'firerocket' ? 'flame' : 'smoke',
            1,
            view.root.x,
            view.root.y,
          );
        }
      }
      if (view.kind === 'flamer' || view.kind === 'turret_flame') {
        view.root.setScale(
          view.root.scaleX + deltaMs * 0.0022,
          view.root.scaleY + deltaMs * 0.0022,
        );
        view.root.setAlpha(Math.max(0.25, view.root.alpha - deltaMs * 0.0012));
      }
    }
  }

  // ------------------------------------------------------------ local motion

  /**
   * A downed player is not locked to their body. They can scout the whole
   * battlefield with the regular movement keys until a teammate revives them.
   */
  private updateSpectatorCamera(deltaMs: number, input: PlayerInput) {
    const localId = this.gameService.sessionId();
    const player = this.snapshot?.players[localId];
    const view = this.players.get(localId);
    const canFreeLook = Boolean(player) && !player?.alive && this.snapshot?.phase === 'combat';

    if (canFreeLook) {
      const camera = this.cameras.main;
      if (this.cameraFollowingLocal) {
        camera.stopFollow();
        this.cameraFollowingLocal = false;
      }
      let dx = Number(input.right) - Number(input.left);
      let dy = Number(input.down) - Number(input.up);
      const length = Math.hypot(dx, dy);
      if (length === 0) return;
      dx /= length;
      dy /= length;
      const distance = (820 * Math.min(deltaMs, 50)) / 1000;
      const visibleWidth = camera.width / camera.zoom;
      const visibleHeight = camera.height / camera.zoom;
      camera.setScroll(
        Phaser.Math.Clamp(camera.scrollX + dx * distance, 0, ARENA.width - visibleWidth),
        Phaser.Math.Clamp(camera.scrollY + dy * distance, 0, ARENA.height - visibleHeight),
      );
      return;
    }

    if (player?.alive && view && !this.cameraFollowingLocal) {
      this.cameras.main.startFollow(view.root, true, 0.14, 0.14);
      this.cameraFollowingLocal = true;
    }
  }

  private movePlayerViews(deltaMs: number, input: PlayerInput) {
    const delta = Math.min(deltaMs, 50) / 1000;
    const localId = this.gameService.sessionId();
    const phaseAllowsMovement =
      this.snapshot?.phase === 'combat' || this.snapshot?.phase === 'build';

    for (const [id, view] of this.players) {
      const player = this.snapshot?.players[id];
      // Everyone on board rides with the hull: the body is hidden, but the
      // container keeps moving so the camera and the aim still work.
      const hull = player?.vehicleId ? this.vehicles.get(player.vehicleId) : undefined;
      if (hull) {
        view.root.setVisible(false);
        view.root.x = hull.root.x;
        view.root.y = hull.root.y;
        view.actor.setRotation(
          id === localId
            ? Math.atan2(input.aimY - view.root.y, input.aimX - view.root.x)
            : (player?.rotation ?? 0),
        );
        this.updateDashRing(view, false, deltaMs);
        continue;
      }
      view.root.setVisible(true);

      if (id === localId && player?.alive && phaseAllowsMovement) {
        const dashing = this.localDash > 0;
        let dx = Number(input.right) - Number(input.left);
        let dy = Number(input.down) - Number(input.up);
        const isMoving = dx !== 0 || dy !== 0 || dashing;
        const length = Math.hypot(dx, dy) || 1;
        dx /= length;
        dy /= length;
        let speed = this.gameService.localMoveSpeed();
        const charge = WEAPONS[player.weapon].charge;
        if (charge && (player.weaponCharge ?? 0) > 0) speed *= charge.moveFactor;
        if (dashing) {
          dx = this.localDashX;
          dy = this.localDashY;
          speed = this.gameService.localDashSpeed();
        }
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
        // While dashing the server is always a step behind, so only a huge gap
        // is worth correcting — otherwise the dash would stutter.
        const tolerance = dashing ? 200 : 45;
        if (error > tolerance || (!isMoving && !dashing)) {
          const correction = isMoving ? Math.min(1, delta * 14) : 1 - Math.exp(-12 * delta);
          view.root.x += (view.targetX - view.root.x) * correction;
          view.root.y += (view.targetY - view.root.y) * correction;
        }
        this.animatePlayer(view, delta, isMoving);
        this.updateDashRing(view, dashing || (player?.dashing ?? 0) > 0, deltaMs);
        continue;
      }

      const smoothing = 1 - Math.exp(-11 * delta);
      const moved = Math.hypot(view.targetX - view.root.x, view.targetY - view.root.y) > 1.5;
      view.root.x = Phaser.Math.Linear(view.root.x, view.targetX, smoothing);
      view.root.y = Phaser.Math.Linear(view.root.y, view.targetY, smoothing);
      this.animatePlayer(view, delta, moved);
      this.updateDashRing(view, (player?.dashing ?? 0) > 0, deltaMs);
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
}
