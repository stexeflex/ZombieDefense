import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ProgressService,
  UPGRADE_DEFINITIONS,
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
  readonly definitions = UPGRADE_DEFINITIONS;

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

  level(key: UpgradeKey) {
    return this.progress.upgrades()[key];
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
