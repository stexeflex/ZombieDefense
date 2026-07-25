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
  findMap,
  type DefenseType,
  type WeaponType,
} from '../../../../shared/game-types';
import { AudioService } from '../../core/audio.service';
import { GameService } from '../../core/game.service';
import { ProgressService } from '../../core/progress.service';
import { GameCanvas } from '../../game/game-canvas';

type ShopTab = 'weapons' | 'barricades' | 'turrets';

@Component({
  selector: 'app-lobby',
  imports: [FormsModule, DecimalPipe, GameCanvas],
  templateUrl: './lobby.html',
  styleUrl: './lobby.scss',
})
export class Lobby implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly game = inject(GameService);
  readonly audio = inject(AudioService);
  readonly progress = inject(ProgressService);
  readonly origin = location.origin;

  readonly needsName = signal(false);
  readonly copied = signal(false);
  readonly lobbyCode = signal('');
  readonly shopTab = signal<ShopTab>('weapons');
  readonly players = computed(() => Object.values(this.game.snapshot()?.players ?? {}));
  readonly maps = MAPS;
  readonly weapons = WEAPON_ORDER.filter((type) => type !== 'pistol').map((type) => ({
    type,
    ...WEAPONS[type],
  }));
  readonly barricades = BARRICADE_ORDER.map((type) => ({ type, ...DEFENSES[type] }));
  readonly turrets = TURRET_ORDER.map((type) => ({ type, ...DEFENSES[type] }));

  readonly activeMap = computed(() => findMap(this.game.snapshot()?.mapId ?? this.game.preferredMap()));
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
    void this.game.disconnect();
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

  mapLocked(mapId: string) {
    return !this.progress.isUnlocked(mapId);
  }

  mapCleared(mapId: string) {
    return this.progress.isCleared(mapId);
  }

  ammoCost() {
    const weapon = this.game.player()?.weapon ?? 'pistol';
    return Math.round(WEAPONS[weapon].ammoCost * this.activeMap().moneyScale);
  }

  healCost() {
    return Math.round(260 * this.activeMap().moneyScale);
  }

  playerHealth(playerId: string) {
    const player = this.game.snapshot()?.players[playerId];
    return player ? Math.max(0, (player.health / player.maxHealth) * 100) : 0;
  }

  seconds(value: number) {
    const seconds = Math.max(0, Math.ceil(value));
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  }

  weaponName(type: WeaponType | undefined) {
    return type ? WEAPONS[type].label : '—';
  }

  weaponShort(type: WeaponType | undefined) {
    return type ? WEAPONS[type].short : '—';
  }

  async leave() {
    await this.game.disconnect();
    void this.router.navigateByUrl('/');
  }
}
