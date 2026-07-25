import {
  ARENA,
  DEFENSES,
  DEFENSE_REACH,
  ENGINEER_DISCOUNT,
  PLACE_RANGE,
  REPAIR_COST_PER_HP,
  STARTER_BARRICADE_COUNT,
  WEAPONS,
  canPlaceDefense,
  discountedCost,
  distanceToDefense,
  reserveCapacity,
  sellValue,
  type DefenseType,
  type WeaponType,
} from '../../../shared/game-types.js';
import { DefenseState } from '../state/game-state.js';
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
    this.syncDiscounts(player, runtime);
  }

  private syncDiscounts(
    player: { weaponDiscount: number; barricadeDiscount: number; turretDiscount: number },
    runtime: RuntimePlayer,
  ) {
    player.weaponDiscount = runtime.weaponDiscounts;
    player.barricadeDiscount = runtime.barricadeDiscounts;
    player.turretDiscount = runtime.turretDiscounts;
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

  buyAmmo(sessionId: string) {
    const player = this.world.state.players.get(sessionId);
    const runtime = this.world.runtime.get(sessionId);
    if (!player || !runtime || this.world.state.phase !== 'build') return;
    const config = WEAPONS[player.weapon];
    const capacity = reserveCapacity(player.weapon, runtime.upgrades.reserveAmmo);
    const cost = Math.round(config.ammoCost * this.world.map.moneyScale);
    if (player.money < cost || player.reserveAmmo >= capacity) return;
    player.money -= cost;
    player.reserveAmmo = capacity;
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
    if (
      !canPlaceDefense(
        { type, x, y, rotation },
        this.world.state.defenses.values(),
        this.world.map.obstacles,
      )
    ) {
      return;
    }

    const defense = new DefenseState();
    defense.id = this.world.nextId('d');
    defense.ownerId = sessionId;
    defense.type = type;
    defense.x = x;
    defense.y = y;
    defense.rotation = rotation;
    const bonus = barricade ? 1 + runtime.upgrades.barricadeHealth * 0.02 : 1;
    defense.maxHealth = Math.round(config.health * bonus);
    defense.health = defense.maxHealth;
    defense.refund = sellValue(type, true);
    player.money -= price;
    if (barricade && runtime.barricadeDiscounts > 0) runtime.barricadeDiscounts -= 1;
    if (!barricade && runtime.turretDiscounts > 0) runtime.turretDiscounts -= 1;
    this.syncDiscounts(player, runtime);
    this.world.state.defenses.set(defense.id, defense);
    this.world.pushFx({ k: 'structure', x, y, s: type });
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

  sellDefense(sessionId: string, id?: string) {
    const player = this.world.state.players.get(sessionId);
    const target = this.focusedDefense(sessionId, id);
    if (!player || !target) return;
    // Exactly the price the client shows on the highlighted structure.
    player.money += target.refund;
    this.world.state.defenses.delete(target.id);
    this.world.pushFx({ k: 'wreck', x: target.x, y: target.y, s: target.type });
  }

  repairDefense(sessionId: string, id?: string) {
    const player = this.world.state.players.get(sessionId);
    const target = this.focusedDefense(sessionId, id);
    if (!player || !target) return;
    const rate = REPAIR_COST_PER_HP * (this.world.perksOf(sessionId).engineer ? 1 - ENGINEER_DISCOUNT : 1);
    const missing = target.maxHealth - target.health;
    const repair = Math.min(missing, Math.floor(player.money / rate));
    if (repair <= 0) return;
    player.money -= Math.ceil(repair * rate);
    target.health += repair;
    this.world.pushFx({ k: 'structure', x: target.x, y: target.y, s: target.type });
  }
}
