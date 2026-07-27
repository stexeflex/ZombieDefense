import { DisplayService } from './display.service';

describe('DisplayService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty('--ui-font-scale');
  });

  afterEach(() => {
    document.documentElement.style.removeProperty('--ui-font-scale');
  });

  it('applies and stores the selected UI scale', () => {
    const display = new DisplayService();

    display.setUiScale(125);

    expect(display.uiScale()).toBe(125);
    expect(localStorage.getItem('zombie-defense-ui-scale')).toBe('125');
    expect(document.documentElement.style.getPropertyValue('--ui-font-scale')).toBe('125%');
  });

  it('restores a saved UI scale on startup', () => {
    localStorage.setItem('zombie-defense-ui-scale', '115');

    const display = new DisplayService();

    expect(display.uiScale()).toBe(115);
    expect(document.documentElement.style.getPropertyValue('--ui-font-scale')).toBe('115%');
  });

  it('keeps the UI scale inside the supported range', () => {
    const display = new DisplayService();

    display.setUiScale(200);

    expect(display.uiScale()).toBe(140);
  });
});
