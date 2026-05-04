import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home.component').then(m => m.HomeComponent),
  },
  {
    path: 'movie/:id',
    loadComponent: () =>
      import('./movie-detail/movie-detail.component').then(m => m.MovieDetailComponent),
  },
  {
    path: 'show/:id',
    loadComponent: () =>
      import('./show-detail/show-detail.component').then(m => m.ShowDetailComponent),
  },
];
