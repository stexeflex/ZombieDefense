import {
  ARENA,
  DEFENSES,
  DEFENSE_REACH,
  ENGINEER_DISCOUNT,
  PLACE_RANGE,
  REPAIR_COST_PER_HP,
  STARTER_BARRICADE_COUNT,
  VEHICLES,
  VEHICLE_REACH,
  WEAPONS,
  ammoRefillCost,
  canPlaceDefense,
  canPlaceVehicle,
  discountedCost,
  distanceToDefense,
  distanceToVehicle,
  reserveCapacity,
  sellValue,
  vehicleArmorReduction,
  vehicleMaxHealth,
  vehicleSellValue,
  weaponSellValue,
  type DefenseType,
  type VehicleType,
  type WeaponType,
} from '../../../shared/game-types.js';
import { DefenseState, VehicleState } from '../state/game-state.js';
import type { PlayerSystem } from './players.js';
import type { GameWorld, RuntimePlayer } from './world.js';

/** The build phase: buying weapons and ammo, placing, repairing and selling. */
export class BuildSystem {
  constructor(
    private readonly world: GameWorld,
    private readonly players: PlayerSystem,
  ) {}

  /** Starter perks hand out their discounts once per run. */
  resetDiscounts(sessionId: string) {
    const runtime = this.world.runtime.get(sessionId);
    const player = this.world.state.players.get(sessionId);
    if (!runtime || !player) return;
    runtime.weaponDiscounts = runtime.perks.starterWeapon ? 1 : 0;
    runtime.barricadeDiscounts = runtime.perks.starterBarricade ? STARTER_BARRICADE_COUNT : 0;
    runtime.turretDiscounts = runtime.perks.starterTurret ? 1 : 0;
    runtime.vehicleDiscounts = runtime.perks.motorPool ? 1 : 0;
    this.syncDiscounts(player, runtime);
  }

  private syncDiscounts(
    player: {
      weaponDiscount: number;
      barricadeDiscount: number;
      turretDiscount: number;
      vehicleDiscount: number;
    },
    runtime: RuntimePlayer,
  ) {
    player.weaponDiscount = runtime.weaponDiscounts;
    player.barricadeDiscount = runtime.barricadeDiscounts;
    player.turretDiscount = runtime.turretDiscounts;
    player.vehicleDiscount = runtime.vehicleDiscounts;
  }

  // -------------------------------------------------------------------- shop

  /** Bought weapons stay in the arsenal, so a purchase is never a trade-in. */
  buyWeapon(sessionId: string, weapon: WeaponType) {
    const player = this.world.state.players.get(sessionId);
    const runtime = this.world.runtime.get(sessionId);
    if (!player || !runtime || this.world.state.phase !== 'build' || !(weapon in WEAPONS)) return;
    if (player.owned.includes(weapon)) {
      this.selectWeapon(sessionId, weapon);
      return;
    }
    const config = WEAPONS[weapon];
    const price = discountedCost(config.cost, runtime.weaponDiscounts);
    if (player.money < price) return;
    player.money -= price;
    if (runtime.weaponDiscounts > 0) runtime.weaponDiscounts -= 1;
    this.syncDiscounts(player, runtime);
    player.owned.push(weapon);
    runtime.stowed.set(weapon, {
      ammo: this.players.magazineSize(weapon, runtime.upgrades),
      reserveAmmo: reserveCapacity(weapon, runtime.upgrades.reserveAmmo),
    });
    this.players.equipWeapon(player, runtime, weapon);
    this.syncWeaponRefunds(sessionId);
  }

  selectWeapon(sessionId: string, weapon: WeaponType) {
    const player = this.world.state.players.get(sessionId);
    const runtime = this.world.runtime.get(sessionId);
    if (!player || !runtime || !(weapon in WEAPONS)) return;
    const phase = this.world.state.phase;
    if (phase !== 'build' && phase !== 'combat') return;
    if (!player.owned.includes(weapon)) return;
    this.players.equipWeapon(player, runtime, weapon);
  }

  /** Sale values are authoritative because inactive weapons keep ammo server-side. */
  syncWeaponRefunds(sessionId: string) {
    const player = this.world.state.players.get(sessionId);
    const runtime = this.world.runtime.get(sessionId);
    if (!player || !runtime) return;
    player.weaponRefunds.clear();
    for (const weapon of player.owned as Iterable<WeaponType>) {
      if (weapon === 'pistol') continue;
      const stored =
        weapon === player.weapon
          ? { ammo: player.ammo, reserveAmmo: player.reserveAmmo }
          : runtime.stowed.get(weapon);
      if (!stored) continue;
      player.weaponRefunds.set(
        weapon,
        weaponSellValue(
          weapon,
          stored.ammo,
          stored.reserveAmmo,
          runtime.upgrades.magazineSize,
          runtime.upgrades.reserveAmmo,
          this.world.map.moneyScale,
        ),
      );
    }
  }

  sellWeapon(sessionId: string, weapon: WeaponType) {
    const player = this.world.state.players.get(sessionId);
    const runtime = this.world.runtime.get(sessionId);
    if (
      !player ||
      !runtime ||
      this.world.state.phase !== 'build' ||
      weapon === 'pistol' ||
      !(weapon in WEAPONS) ||
      !player.owned.includes(weapon)
    ) {
      return;
    }
    this.syncWeaponRefunds(sessionId);
    const refund = player.weaponRefunds.get(weapon) ?? 0;
    if (player.weapon === weapon) this.players.equipWeapon(player, runtime, 'pistol');
    const index = player.owned.indexOf(weapon);
    if (index >= 0) player.owned.splice(index, 1);
    runtime.stowed.delete(weapon);
    player.weaponRefunds.delete(weapon);
    player.money += refund;
  }

  buyAmmo(sessionId: string) {
    const player = this.world.state.players.get(sessionId);
    const runtime = this.world.runtime.get(sessionId);
    if (!player || !runtime || this.world.state.phase !== 'build' || player.weapon === 'pistol') {
      return;
    }
    const capacity = reserveCapacity(player.weapon, runtime.upgrades.reserveAmmo);
    const cost = ammoRefillCost(
      player.weapon,
      player.reserveAmmo,
      runtime.upgrades.reserveAmmo,
      this.world.map.moneyScale,
    );
    if (cost <= 0 || player.money < cost || player.reserveAmmo >= capacity) return;
    player.money -= cost;
    player.reserveAmmo = capacity;
    this.syncWeaponRefunds(sessionId);
  }

  // ------------------------------------------------------------------- build

  placeDefense(
    sessionId: string,
    payload: { type?: DefenseType; x?: number; y?: number; rotation?: number },
  ) {
    const player = this.world.state.players.get(sessionId);
    const runtime = this.world.runtime.get(sessionId);
    const type = payload.type;
    if (!player || !runtime || this.world.state.phase !== 'build') return;
    // Nobody builds from the driver's seat.
    if (player.vehicleId) return;
    if (!type || !(type in DEFENSES)) return;
    const config = DEFENSES[type];
    const barricade = config.kind === 'barricade';
    const discounts = barricade ? runtime.barricadeDiscounts : runtime.turretDiscounts;
    const price = discountedCost(config.cost, discounts);

    const x = this.world.clamp(Number(payload.x) || player.x, 70, ARENA.width - 70);
    const y = this.world.clamp(Number(payload.y) || player.y, 70, ARENA.height - 70);
    const rotation = barricade
      ? (Math.round((Number(payload.rotation) || 0) / (Math.PI / 2)) * (Math.PI / 2)) % Math.PI
      : 0;
    if (player.money < price) return;
    if (Math.hypot(player.x - x, player.y - y) > PLACE_RANGE) return;
    if (!this.world.objectiveClear(x, y, Math.max(config.width, config.height) / 2)) return;
    if (
      !canPlaceDefense(
        { type, x, y, rotation },
        this.world.state.defenses.values(),
        this.world.map.obstacles,
      )
    ) {
      return;
    }
    for (const vehicle of this.world.state.vehicles.values()) {
      if (distanceToVehicle(x, y, vehicle) < Math.max(config.width, config.height) / 2) return;
    }

    const defense = new DefenseState();
    defense.id = this.world.nextId('d');
    defense.ownerId = sessionId;
    defense.type = type;
    defense.x = x;
    defense.y = y;
    defense.rotation = rotation;
    defense.range = barricade ? 0 : (config.range ?? 0) * (1 + runtime.upgrades.turretRange * 0.01);
    const bonus = barricade ? 1 + runtime.upgrades.barricadeHealth * 0.02 : 1;
    defense.maxHealth = Math.round(config.health * bonus);
    defense.health = defense.maxHealth;
    defense.refund = sellValue(type, defense.health, defense.maxHealth);
    player.money -= price;
    if (barricade && runtime.barricadeDiscounts > 0) runtime.barricadeDiscounts -= 1;
    if (!barricade && runtime.turretDiscounts > 0) runtime.turretDiscounts -= 1;
    this.syncDiscounts(player, runtime);
    this.world.state.defenses.set(defense.id, defense);
    this.world.pushFx({ k: 'structure', x, y, s: type });
  }

  // ---------------------------------------------------------------- vehicles

  /**
   * A vehicle is bought by parking it, exactly like a structure. It is worth a
   * lot of money, so it has to be earned before the squad rolls out in it.
   */
  placeVehicle(
    sessionId: string,
    payload: { type?: VehicleType; x?: number; y?: number; rotation?: number },
  ) {
    const player = this.world.state.players.get(sessionId);
    const runtime = this.world.runtime.get(sessionId);
    const type = payload.type;
    if (!player || !runtime || this.world.state.phase !== 'build' || player.vehicleId) return;
    if (!type || !(type in VEHICLES)) return;
    const config = VEHICLES[type];
    const price = discountedCost(config.cost, runtime.vehicleDiscounts);

    const x = this.world.clamp(Number(payload.x) || player.x, 90, ARENA.width - 90);
    const y = this.world.clamp(Number(payload.y) || player.y, 90, ARENA.height - 90);
    const rotation =
      (Math.round((Number(payload.rotation) || 0) / (Math.PI / 2)) * (Math.PI / 2)) % Math.PI;
    if (player.money < price) return;
    if (Math.hypot(player.x - x, player.y - y) > PLACE_RANGE) return;
    if (!this.world.objectiveClear(x, y, Math.max(config.width, config.height) / 2)) return;
    if (
      !canPlaceVehicle(
        { type, x, y, rotation },
        this.world.state.defenses.values(),
        this.world.state.vehicles.values(),
        this.world.map.obstacles,
      )
    ) {
      return;
    }

    const vehicle = new VehicleState();
    vehicle.id = this.world.nextId('v');
    vehicle.ownerId = sessionId;
    vehicle.type = type;
    vehicle.x = x;
    vehicle.y = y;
    vehicle.rotation = rotation;
    vehicle.maxHealth = vehicleMaxHealth(type, runtime.upgrades.vehicleHealth);
    vehicle.health = vehicle.maxHealth;
    vehicle.armor = vehicleArmorReduction(runtime.upgrades.vehicleArmor);
    vehicle.refund = vehicleSellValue(type, vehicle.health, vehicle.maxHealth);
    player.money -= price;
    if (runtime.vehicleDiscounts > 0) runtime.vehicleDiscounts -= 1;
    this.syncDiscounts(player, runtime);
    this.world.state.vehicles.set(vehicle.id, vehicle);
    this.world.pushFx({ k: 'engine', x, y, s: type });
  }

  private focusedVehicle(sessionId: string, id?: string) {
    const player = this.world.state.players.get(sessionId);
    if (!player || this.world.state.phase !== 'build' || player.vehicleId) return undefined;
    if (id) {
      const picked = this.world.state.vehicles.get(id);
      if (!picked) return undefined;
      return distanceToVehicle(player.x, player.y, picked) <= VEHICLE_REACH + 40
        ? picked
        : undefined;
    }
    let best: VehicleState | undefined;
    let bestDistance = VEHICLE_REACH;
    this.world.state.vehicles.forEach((vehicle) => {
      const distance = distanceToVehicle(player.x, player.y, vehicle);
      if (distance > bestDistance) return;
      bestDistance = distance;
      best = vehicle;
    });
    return best;
  }

  private sellVehicle(sessionId: string, id?: string) {
    const player = this.world.state.players.get(sessionId);
    const target = this.focusedVehicle(sessionId, id);
    if (!player || !target) return false;
    // Repairs and interaction stay cooperative, but only the buyer may turn
    // their upgraded vehicle back into money.
    if (target.ownerId !== sessionId) return false;
    // Selling with the squad on board would drop everyone into the horde.
    if (target.crew.length > 0) return false;
    player.money += vehicleSellValue(target.type, target.health, target.maxHealth);
    this.world.state.vehicles.delete(target.id);
    this.world.pushFx({ k: 'wreck', x: target.x, y: target.y, s: target.type });
    return true;
  }

  private repairVehicle(sessionId: string, id?: string) {
    const player = this.world.state.players.get(sessionId);
    const target = this.focusedVehicle(sessionId, id);
    if (!player || !target) return false;
    const rate =
      REPAIR_COST_PER_HP * (this.world.perksOf(sessionId).engineer ? 1 - ENGINEER_DISCOUNT : 1);
    const missing = target.maxHealth - target.health;
    const repair = Math.min(missing, Math.floor(player.money / rate));
    if (repair <= 0) return false;
    player.money -= Math.ceil(repair * rate);
    target.health += repair;
    target.refund = vehicleSellValue(target.type, target.health, target.maxHealth);
    this.world.pushFx({ k: 'structure', x: target.x, y: target.y, s: target.type });
    return true;
  }

  /**
   * The structure a player can work on: the one the client highlights, or the
   * closest one in reach when no id was sent.
   */
  private focusedDefense(sessionId: string, id?: string) {
    const player = this.world.state.players.get(sessionId);
    if (!player || this.world.state.phase !== 'build') return undefined;
    if (id) {
      const picked = this.world.state.defenses.get(id);
      if (!picked) return undefined;
      // The client highlights from its predicted position, so allow a little
      // more than the display reach instead of dropping borderline clicks.
      return distanceToDefense(player.x, player.y, picked) <= DEFENSE_REACH + 40
        ? picked
        : undefined;
    }
    let best: DefenseState | undefined;
    let bestDistance = DEFENSE_REACH;
    this.world.state.defenses.forEach((defense) => {
      const distance = distanceToDefense(player.x, player.y, defense);
      if (distance > bestDistance) return;
      bestDistance = distance;
      best = defense;
    });
    return best;
  }

  /** One key sells whatever is highlighted, structure or parked vehicle. */
  sellDefense(sessionId: string, id?: string) {
    const player = this.world.state.players.get(sessionId);
    const target = this.focusedDefense(sessionId, id);
    if (!player || !target) {
      this.sellVehicle(sessionId, id);
      return;
    }
    // Ownership only limits selling. Team mates may still work with and repair
    // structures placed by somebody else.
    if (target.ownerId !== sessionId) return;
    // Exactly the price the client shows on the highlighted structure.
    const refund = sellValue(target.type, target.health, target.maxHealth);
    player.money += refund;
    this.world.state.defenses.delete(target.id);
    this.world.pushFx({ k: 'wreck', x: target.x, y: target.y, s: target.type });
  }

  repairDefense(sessionId: string, id?: string) {
    const player = this.world.state.players.get(sessionId);
    const target = this.focusedDefense(sessionId, id);
    if (!player || !target) {
      this.repairVehicle(sessionId, id);
      return;
    }
    const rate =
      REPAIR_COST_PER_HP * (this.world.perksOf(sessionId).engineer ? 1 - ENGINEER_DISCOUNT : 1);
    const missing = target.maxHealth - target.health;
    const repair = Math.min(missing, Math.floor(player.money / rate));
    if (repair <= 0) return;
    player.money -= Math.ceil(repair * rate);
    target.health += repair;
    target.refund = sellValue(target.type, target.health, target.maxHealth);
    this.world.pushFx({ k: 'structure', x: target.x, y: target.y, s: target.type });
  }

  /**
   * Repositioning is cooperative: unlike selling it never transfers money or
   * ownership, so any nearby team mate may tidy the shared defense line.
   */
  movePlaced(
    sessionId: string,
    payload?: { id?: string; x?: number; y?: number; rotation?: number },
  ) {
    const player = this.world.state.players.get(sessionId);
    if (!player || !payload?.id || this.world.state.phase !== 'build' || player.vehicleId) return;
    const defense = this.world.state.defenses.get(payload.id);
    const vehicle = this.world.state.vehicles.get(payload.id);
    if (!defense && !vehicle) return;

    const sourceDistance = defense
      ? distanceToDefense(player.x, player.y, defense)
      : distanceToVehicle(player.x, player.y, vehicle!);
    const sourceReach = defense ? DEFENSE_REACH + 40 : VEHICLE_REACH + 40;
    if (sourceDistance > sourceReach || (vehicle && vehicle.crew.length > 0)) return;

    const x = this.world.clamp(Number(payload.x) || player.x, 70, ARENA.width - 70);
    const y = this.world.clamp(Number(payload.y) || player.y, 70, ARENA.height - 70);
    if (Math.hypot(player.x - x, player.y - y) > PLACE_RANGE) return;

    if (defense) {
      const config = DEFENSES[defense.type];
      const rotation =
        config.kind === 'barricade'
          ? (Math.round((Number(payload.rotation) || 0) / (Math.PI / 2)) * (Math.PI / 2)) % Math.PI
          : 0;
      if (!this.world.objectiveClear(x, y, Math.max(config.width, config.height) / 2)) return;
      const others = [...this.world.state.defenses.values()].filter(
        (entry) => entry.id !== defense.id,
      );
      if (
        !canPlaceDefense({ type: defense.type, x, y, rotation }, others, this.world.map.obstacles)
      ) {
        return;
      }
      for (const hull of this.world.state.vehicles.values()) {
        if (distanceToVehicle(x, y, hull) < Math.max(config.width, config.height) / 2) return;
      }
      defense.x = x;
      defense.y = y;
      defense.rotation = rotation;
      this.world.pushFx({ k: 'structure', x, y, s: defense.type });
      return;
    }

    if (!vehicle) return;
    const config = VEHICLES[vehicle.type];
    const rotation =
      (Math.round((Number(payload.rotation) || 0) / (Math.PI / 2)) * (Math.PI / 2)) % Math.PI;
    if (!this.world.objectiveClear(x, y, Math.max(config.width, config.height) / 2)) return;
    const otherVehicles = [...this.world.state.vehicles.values()].filter(
      (entry) => entry.id !== vehicle.id,
    );
    if (
      !canPlaceVehicle(
        { type: vehicle.type, x, y, rotation },
        this.world.state.defenses.values(),
        otherVehicles,
        this.world.map.obstacles,
      )
    ) {
      return;
    }
    vehicle.x = x;
    vehicle.y = y;
    vehicle.rotation = rotation;
    vehicle.vx = 0;
    vehicle.vy = 0;
    this.world.pushFx({ k: 'engine', x, y, s: vehicle.type });
  }
}
