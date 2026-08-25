import { Routes } from '@angular/router';

import { AppLayout } from './layouts/app-layout/app-layout';

export const routes: Routes = [
  {
    path: '',
    component: AppLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      {
        path: 'overview',
        title: 'Overview',
        loadComponent: () => import('./features/overview/overview').then((m) => m.Overview),
      },
      {
        path: 'servers',
        pathMatch: 'full',
        title: 'Servers',
        loadComponent: () => import('./features/overview/overview').then((m) => m.Overview),
      },
      {
        path: 'servers/:name',
        title: 'Server',
        loadComponent: () =>
          import('./features/server-detail/server-detail').then((m) => m.ServerDetailPage),
      },
      {
        path: 'servers/:name/:instance',
        title: 'Instance',
        loadComponent: () =>
          import('./features/instance-detail/instance-detail').then((m) => m.InstanceDetailPage),
      },
      {
        path: 'backups',
        title: 'Backups',
        loadComponent: () => import('./features/backups/backups').then((m) => m.Backups),
      },
      {
        path: 'incidents',
        title: 'Incidents',
        loadComponent: () => import('./features/incidents/incidents').then((m) => m.Incidents),
      },
      {
        path: 'settings',
        title: 'Settings',
        loadComponent: () => import('./features/settings/settings').then((m) => m.SettingsPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
