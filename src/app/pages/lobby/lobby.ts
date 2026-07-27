import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  BARRICADE_ORDER,
  DEFENSES,
  MAPS,
  TURRET_ORDER,
  WEAPONS,
  WEAPON_ORDER,
  ZOMBIES,
  ammoRefillCost,
  dashReduction,
  findMap,
  reserveCapacity,
  type DefenseType,
  type WeaponType,
} from '../../../../shared/game-types';
import { AudioService } from '../../core/audio.service';
import { DisplayService } from '../../core/display.service';
import { GameService } from '../../core/game.service';
import { ProgressService } from '../../core/progress.service';
import { GameCanvas } from '../../game/game-canvas';
import { UpgradeShop } from '../../shared/upgrade-shop';

type ShopTab = 'weapons' | 'barricades' | 'turrets';

@Component({
  selector: 'app-lobby',
  imports: [FormsModule, DecimalPipe, GameCanvas, UpgradeShop],
  templateUrl: './lobby.html',
  styleUrl: './lobby.scss',
})
export class Lobby implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly game = inject(GameService);
  readonly audio = inject(AudioService);
  readonly display = inject(DisplayService);
  readonly progress = inject(ProgressService);
  readonly origin = location.origin;

  readonly needsName = signal(false);
  readonly copied = signal(false);
  readonly lobbyCode = signal('');
  readonly shopTab = signal<ShopTab>('weapons');
  readonly upgradesOpen = signal(false);
  readonly combatPanelCollapsed = signal(false);
  readonly fullscreen = signal(false);
  readonly fullscreenSupported =
    typeof document !== 'undefined' &&
    document.fullscreenEnabled &&
    typeof document.documentElement.requestFullscreen === 'function';
  readonly volumePercent = computed(() => Math.round(this.audio.volume() * 100));
  readonly players = computed(() => Object.values(this.game.snapshot()?.players ?? {}));
  readonly readyCount = computed(() => this.players().filter((player) => player.ready).length);
  readonly maps = MAPS;
  readonly weapons = WEAPON_ORDER.filter((type) => type !== 'pistol').map((type) => ({
    type,
    ...WEAPONS[type],
  }));
  readonly barricades = BARRICADE_ORDER.map((type) => ({ type, ...DEFENSES[type] }));
  readonly turrets = TURRET_ORDER.map((type) => ({ type, ...DEFENSES[type] }));

  readonly activeMap = computed(() => findMap(this.game.snapshot()?.mapId ?? this.game.preferredMap()));
  readonly endless = computed(() => this.game.snapshot()?.endless ?? this.game.preferredEndless());
  readonly boss = computed(() => {
    const snapshot = this.game.snapshot();
    if (!snapshot || snapshot.bossMaxHealth <= 0) return null;
    return {
      name: snapshot.bossName,
      percent: Math.max(0, (snapshot.bossHealth / snapshot.bossMaxHealth) * 100),
      health: Math.round(snapshot.bossHealth),
      maxHealth: snapshot.bossMaxHealth,
    };
  });

  name = localStorage.getItem('zombie-defense-name') ?? '';

  ngOnInit() {
    this.syncFullscreenState();
    document.addEventListener('fullscreenchange', this.syncFullscreenState);
    const code = (this.route.snapshot.paramMap.get('code') ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 5);
    if (code.length !== 5) {
      void this.router.navigateByUrl('/');
      return;
    }
    this.lobbyCode.set(code);
    if (this.name.trim().length >= 2) void this.join();
    else this.needsName.set(true);
  }

  ngOnDestroy() {
    document.removeEventListener('fullscreenchange', this.syncFullscreenState);
    void this.game.disconnect();
  }

  setVolume(event: Event) {
    const input = event.target as HTMLInputElement;
    this.audio.setVolume(Number(input.value) / 100);
  }

  setUiScale(event: Event) {
    const input = event.target as HTMLInputElement;
    this.display.setUiScale(Number(input.value));
  }

  toggleCombatPanel() {
    this.combatPanelCollapsed.update((collapsed) => !collapsed);
  }

  async toggleFullscreen() {
    if (!this.fullscreenSupported) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      this.syncFullscreenState();
    }
  }

  async join() {
    this.name = this.name.trim().slice(0, 18);
    if (this.name.length < 2) {
      this.needsName.set(true);
      return;
    }
    this.needsName.set(false);
    this.audio.unlock();
    const createKey = `zombie-defense-create:${this.lobbyCode()}`;
    const create = sessionStorage.getItem(createKey) === '1';
    sessionStorage.removeItem(createKey);
    await this.game.connect(this.lobbyCode(), this.name, create);
  }

  async copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      this.copied.set(true);
      window.setTimeout(() => this.copied.set(false), 1800);
    } catch {
      this.copied.set(false);
    }
  }

  start() {
    this.game.startRun();
  }

  toggleReady() {
    const player = this.game.player();
    if (player) this.game.setReady(!player.ready);
  }

  selectBuild(type: DefenseType) {
    this.game.selectBuild(this.game.selectedBuild() === type ? null : type);
  }

  selectMap(mapId: string) {
    if (!this.game.isHost() || !this.progress.isUnlocked(mapId)) return;
    this.game.selectMap(mapId);
  }

  selectMode(endless: boolean) {
    if (!this.game.isHost() || this.endless() === endless) return;
    this.game.selectEndless(endless);
  }

  /** An endless run has no last wave, so the counter shows infinity instead. */
  totalLabel() {
    const snapshot = this.game.snapshot();
    if (!snapshot) return '—';
    return snapshot.endless ? '∞' : String(snapshot.totalWaves);
  }

  /** What the dash currently swallows, so the HUD never oversells the dodge. */
  dashHint() {
    const percent = Math.round(dashReduction(this.progress.upgrades().dashResist) * 100);
    return percent >= 100 ? 'Dash (unverwundbar)' : `Dash (−${percent} % Schaden)`;
  }

  mapLocked(mapId: string) {
    return !this.progress.isUnlocked(mapId);
  }

  mapCleared(mapId: string) {
    return this.progress.isCleared(mapId);
  }

  nextMapName() {
    const index = MAPS.findIndex((map) => map.id === this.activeMap().id);
    return index >= 0 && index + 1 < MAPS.length ? MAPS[index + 1].name : '';
  }

  ammoCost() {
    const player = this.game.player();
    if (!player) return 0;
    return ammoRefillCost(
      player.weapon,
      player.reserveAmmo,
      this.progress.upgrades().reserveAmmo,
      this.activeMap().moneyScale,
    );
  }

  ammoMissing() {
    const player = this.game.player();
    if (!player || player.weapon === 'pistol') return 0;
    return Math.max(
      0,
      reserveCapacity(player.weapon, this.progress.upgrades().reserveAmmo) - player.reserveAmmo,
    );
  }

  /** One pip per dash charge; filled ones are ready to use. */
  dashPips() {
    const dash = this.game.dash();
    return Array.from({ length: dash.max }, (_, index) => index < dash.charges);
  }

  /** Prices already include the discount a starter perk still has left. */
  weaponPrice(weapon: WeaponType) {
    return this.game.weaponPrice(weapon);
  }

  defensePrice(type: DefenseType) {
    return this.game.defensePrice(type);
  }

  /** Two ids exist as both a weapon and a turret, so the checks stay separate. */
  weaponDeal(weapon: WeaponType) {
    return this.weaponPrice(weapon) < WEAPONS[weapon].cost;
  }

  defenseDeal(type: DefenseType) {
    return this.defensePrice(type) < DEFENSES[type].cost;
  }

  bossName(mapId: string) {
    return ZOMBIES[findMap(mapId).boss].label;
  }

  bossThreat(mapId: string) {
    return ZOMBIES[findMap(mapId).boss].threat ?? '';
  }

  owns(weapon: WeaponType) {
    return this.game.player()?.owned.includes(weapon) ?? false;
  }

  /** Buying puts a new weapon in the arsenal, a second click just equips it. */
  weaponAction(weapon: WeaponType) {
    if (this.owns(weapon)) this.game.switchWeapon(weapon);
    else this.game.buyWeapon(weapon);
  }

  playerHealth(playerId: string) {
    const player = this.game.snapshot()?.players[playerId];
    return player ? Math.max(0, (player.health / player.maxHealth) * 100) : 0;
  }

  weaponName(type: WeaponType | undefined) {
    return type ? WEAPONS[type].label : '—';
  }

  weaponShort(type: WeaponType | undefined) {
    return type ? WEAPONS[type].short : '—';
  }

  /**
   * The route change alone tears the lobby down and `ngOnDestroy` closes the
   * room, so the button never waits for the server to confirm the leave — that
   * wait made the first click look as if nothing had happened.
   */
  leave() {
    void this.router.navigateByUrl('/');
  }

  private readonly syncFullscreenState = () => {
    this.fullscreen.set(Boolean(document.fullscreenElement));
  };
}
