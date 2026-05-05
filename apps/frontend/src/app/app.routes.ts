import { Routes } from '@angular/router';
import { adminGuard } from './admin/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'movie/:id',
    loadComponent: () =>
      import('./movie-detail/movie-detail.component').then((m) => m.MovieDetailComponent),
  },
  {
    path: 'show/:id',
    loadComponent: () =>
      import('./show-detail/show-detail.component').then((m) => m.ShowDetailComponent),
  },
  {
    path: 'play/:fileId',
    loadComponent: () => import('./player/player.component').then((m) => m.PlayerComponent),
  },
  {
    path: 'admin',
    loadComponent: () => import('./admin/admin.component').then((m) => m.AdminComponent),
    canActivate: [adminGuard],
  },
];
