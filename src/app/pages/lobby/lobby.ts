import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DEFENSES, WEAPONS, type DefenseType, type WeaponType } from '../../../../shared/game-types';
import { GameService } from '../../core/game.service';
import { GameCanvas } from '../../game/game-canvas';

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
  readonly origin = location.origin;

  readonly needsName = signal(false);
  readonly copied = signal(false);
  readonly lobbyCode = signal('');
  readonly players = computed(() => Object.values(this.game.snapshot()?.players ?? {}));
  readonly weapons = [
    { type: 'rifle' as WeaponType, ...WEAPONS.rifle },
    { type: 'shotgun' as WeaponType, ...WEAPONS.shotgun },
  ];
  readonly defenses = [
    { type: 'barricade' as DefenseType, ...DEFENSES.barricade },
    { type: 'turret' as DefenseType, ...DEFENSES.turret },
  ];

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

  async leave() {
    await this.game.disconnect();
    void this.router.navigateByUrl('/');
  }
}
