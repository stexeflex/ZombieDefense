import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MAPS, WEAPON_ORDER, ZOMBIE_TYPES } from '../../../../shared/game-types';
import {
  PERK_DEFINITIONS,
  ProgressService,
  UPGRADE_DEFINITIONS,
  type PerkKey,
  type UpgradeKey,
} from '../../core/progress.service';

@Component({
  selector: 'app-home',
  imports: [FormsModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private readonly router = inject(Router);
  readonly progress = inject(ProgressService);
  readonly upgradesOpen = signal(false);
  readonly shopTab = signal<'levels' | 'perks'>('levels');
  readonly definitions = UPGRADE_DEFINITIONS;
  readonly perkDefinitions = PERK_DEFINITIONS;
  /**
   * A short ladder gets one pip per level, so a pip always means a level. Long
   * ladders would need forty of them, there a filled bar is far easier to read.
   */
  private readonly pipSteps = new Map<UpgradeKey, number[]>(
    UPGRADE_DEFINITIONS.filter((upgrade) => this.progress.maxLevel(upgrade.key) <= 10).map(
      (upgrade) => [
        upgrade.key,
        Array.from({ length: this.progress.maxLevel(upgrade.key) }, (_, index) => index + 1),
      ],
    ),
  );
  readonly mapCount = MAPS.length;
  readonly weaponCount = WEAPON_ORDER.length;
  readonly zombieCount = ZOMBIE_TYPES.length;

  name = localStorage.getItem('zombie-defense-name') ?? '';
  lobbyCode = '';
  formError = '';

  createLobby() {
    if (!this.validateName()) return;
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from(
      { length: 5 },
      () => alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join('');
    sessionStorage.setItem(`zombie-defense-create:${code}`, '1');
    localStorage.setItem('zombie-defense-name', this.name.trim());
    void this.router.navigate(['/lobby', code]);
  }

  joinLobby() {
    if (!this.validateName()) return;
    const code = this.lobbyCode
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 5);
    if (code.length !== 5) {
      this.formError = 'Bitte gib einen fünfstelligen Lobby-Code ein.';
      return;
    }
    localStorage.setItem('zombie-defense-name', this.name.trim());
    void this.router.navigate(['/lobby', code]);
  }

  buyUpgrade(key: UpgradeKey) {
    this.progress.buy(key);
  }

  buyPerk(key: PerkKey) {
    this.progress.buyPerk(key);
  }

  level(key: UpgradeKey) {
    return this.progress.upgrades()[key];
  }

  maxLevel(key: UpgradeKey) {
    return this.progress.maxLevel(key);
  }

  /** The pips of a short ladder, or nothing when the bar is used instead. */
  pips(key: UpgradeKey) {
    return this.pipSteps.get(key);
  }

  fillPercent(key: UpgradeKey) {
    return (this.level(key) / this.maxLevel(key)) * 100;
  }

  maxed(key: UpgradeKey) {
    return this.level(key) >= this.maxLevel(key);
  }

  private validateName() {
    this.name = this.name.trim().slice(0, 18);
    if (this.name.length < 2) {
      this.formError = 'Dein Name braucht mindestens zwei Zeichen.';
      return false;
    }
    this.formError = '';
    return true;
  }
}
