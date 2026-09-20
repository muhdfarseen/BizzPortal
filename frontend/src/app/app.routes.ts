import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then((m) => m.LoginComponent),
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard-layout').then((m) => m.DashboardLayoutComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      {
        path: 'home',
        loadComponent: () =>
          import('./features/dashboard/pages/home/home').then((m) => m.HomeComponent),
      },
      {
        path: 'assessments',
        loadComponent: () =>
          import('./features/dashboard/pages/assessments/assessments').then(
            (m) => m.AssessmentsComponent,
          ),
      },
      {
        path: 'lap-remedial',
        loadComponent: () =>
          import('./features/dashboard/pages/lap-remedial/lap-remedial').then(
            (m) => m.LapRemedialComponent,
          ),
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/dashboard/pages/reports/reports').then((m) => m.ReportsComponent),
        canActivate: [permissionGuard('reports.view')],
      },
      {
        path: 'user-management',
        loadComponent: () =>
          import('./features/dashboard/pages/user-management/user-management').then(
            (m) => m.UserManagementComponent,
          ),
        canActivate: [permissionGuard('users.manage')],
      },
      {
        path: 'configuration',
        loadComponent: () =>
          import('./features/dashboard/pages/configuration/configuration').then(
            (m) => m.ConfigurationComponent,
          ),
        canActivate: [permissionGuard('configuration.manage')],
      },
    ],
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' },
];
