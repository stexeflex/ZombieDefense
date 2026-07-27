import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DisplayService } from './core/display.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly display = inject(DisplayService);
}
