import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((module) => module.Home),
    title: 'Zombie Defense',
  },
  {
    path: 'lobby/:code',
    loadComponent: () => import('./pages/lobby/lobby').then((module) => module.Lobby),
    title: 'Lobby · Zombie Defense',
  },
  { path: '**', redirectTo: '' },
];
