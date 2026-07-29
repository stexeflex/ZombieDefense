import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject } from '@angular/core';
import Phaser from 'phaser';
import { VIEWPORT } from '../../../shared/game-types';
import { AudioService } from '../core/audio.service';
import { GameService } from '../core/game.service';
import { ArenaScene } from './arena-scene';
import { createGameTextures } from './textures';

@Component({
  selector: 'app-game-canvas',
  template: '<div #gameHost class="game-host" aria-label="Spielfeld"></div>',
  styles: `
    :host, .game-host {
      width: 100%;
      height: 100%;
      min-height: 0;
    }
    :host { display: block; overflow: hidden; background: #05100c; }
    .game-host { overflow: hidden; }
    :host ::ng-deep canvas { display: block; max-width: 100%; max-height: 100%; }
  `,
})
export class GameCanvas implements AfterViewInit, OnDestroy {
  @ViewChild('gameHost', { static: true }) gameHost!: ElementRef<HTMLDivElement>;
  private readonly gameService = inject(GameService);
  private readonly audio = inject(AudioService);
  private game?: Phaser.Game;
  private resizeObserver?: ResizeObserver;
  private resizeFrame?: number;

  ngAfterViewInit() {
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.gameHost.nativeElement,
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      backgroundColor: '#05100c',
      antialias: true,
      scene: [new ArenaScene(this.gameService, this.audio, createGameTextures)],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: VIEWPORT.width,
        height: VIEWPORT.height,
      },
      render: {
        pixelArt: false,
        roundPixels: true,
      },
    });

    // Collapsing the mission panel changes only this container, not the browser
    // window. Phaser otherwise keeps the old FIT measurement until fullscreen
    // or a window resize and the arena appears shifted inside the wider stage.
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeFrame !== undefined) cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = undefined;
        this.game?.scale.refresh();
      });
    });
    this.resizeObserver.observe(this.gameHost.nativeElement);
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    if (this.resizeFrame !== undefined) cancelAnimationFrame(this.resizeFrame);
    this.game?.destroy(true);
  }
}
