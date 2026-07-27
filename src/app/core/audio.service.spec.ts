import { AudioService } from './audio.service';

describe('AudioService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores the selected master volume', () => {
    const audio = new AudioService();

    audio.setVolume(0.35);

    expect(audio.volume()).toBe(0.35);
    expect(localStorage.getItem('zombie-defense-volume')).toBe('0.35');
  });

  it('restores a fully muted volume', () => {
    localStorage.setItem('zombie-defense-volume', '0');

    expect(new AudioService().volume()).toBe(0);
  });
});
