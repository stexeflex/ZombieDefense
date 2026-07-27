import { Injectable, signal } from '@angular/core';

const UI_SCALE_KEY = 'zombie-defense-ui-scale';
const MIN_UI_SCALE = 85;
const MAX_UI_SCALE = 140;

@Injectable({ providedIn: 'root' })
export class DisplayService {
  readonly uiScale = signal(this.readScale());

  constructor() {
    this.applyScale(this.uiScale());
  }

  setUiScale(value: number) {
    const scale = Math.max(MIN_UI_SCALE, Math.min(MAX_UI_SCALE, Math.round(value)));
    this.uiScale.set(scale);
    localStorage.setItem(UI_SCALE_KEY, String(scale));
    this.applyScale(scale);
  }

  private applyScale(scale: number) {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--ui-font-scale', `${scale}%`);
  }

  private readScale() {
    if (typeof localStorage === 'undefined') return 100;
    const raw = localStorage.getItem(UI_SCALE_KEY);
    if (raw === null) return 100;
    const stored = Number(raw);
    return Number.isFinite(stored)
      ? Math.max(MIN_UI_SCALE, Math.min(MAX_UI_SCALE, Math.round(stored)))
      : 100;
  }
}
