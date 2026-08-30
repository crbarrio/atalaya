import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MobileNavService } from '../../../../core/services/mobile-nav.service';
import { SessionService } from '../../../../core/services/session.service';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
})
export class Sidebar {


  private readonly sessions = inject(SessionService);
  protected readonly mobileNav = inject(MobileNavService);

  readonly session = this.sessions.session;

  readonly sections = [
    { path: '/overview', label: 'Overview', icon: 'dashboard' },
    { path: '/servers', label: 'Servers', icon: 'dns' },
    { path: '/apps', label: 'Applications', icon: 'apps' },
    { path: '/backups', label: 'Backups', icon: 'backup' },
    { path: '/incidents', label: 'Incidents', icon: 'warning' },
  ];



}
