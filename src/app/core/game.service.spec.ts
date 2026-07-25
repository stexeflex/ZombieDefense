import { TestBed } from '@angular/core/testing';
import type { GamePhase, GameSnapshot } from '../../../shared/game-types';
import { GameService } from './game.service';

/** Only the fields the phase reaction looks at. */
function snapshotWith(phase: GamePhase): GameSnapshot {
  return {
    phase,
    wave: 1,
    waveKind: 'normal',
    players: {},
  } as unknown as GameSnapshot;
}

describe('GameService', () => {
  let service: GameService;

  beforeEach(() => {
    localStorage.clear();
    service = TestBed.inject(GameService);
  });

  it('drops the placement ghost when the wave starts', () => {
    (service as unknown as { reactToPhase(snapshot: GameSnapshot): void }).reactToPhase(
      snapshotWith('build'),
    );
    service.selectBuild('wood');
    expect(service.selectedBuild()).toBe('wood');

    (service as unknown as { reactToPhase(snapshot: GameSnapshot): void }).reactToPhase(
      snapshotWith('combat'),
    );
    expect(service.selectedBuild()).toBeNull();
    expect(service.placementRotation()).toBe(0);
  });
});
