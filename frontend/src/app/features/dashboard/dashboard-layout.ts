import { Component, computed, signal, HostListener, ElementRef } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { NgpButton } from 'ng-primitives/button';
import { NgpAvatar, NgpAvatarFallback } from 'ng-primitives/avatar';
import { NgpTabset, NgpTabList, NgpTabButton, NgpTabPanel } from 'ng-primitives/tabs';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  reiconHome,
  reiconTask,
  reiconClipboard,
  reiconChart,
  reiconUsers,
  reiconSetting2,
  reiconLogout,
  reiconShieldCheck,
  reiconCheck,
  reiconCloseCircle,
} from '@ng-icons/reicon';
import { Permission, PERMISSIONS, scopeSummary } from '../../core/models/user.model';
import { AuthService } from '../../core/services/auth.service';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  route: string;
  /** Permission the tab needs; tabs without one are open to every role. */
  permission?: Permission;
  /** Super Admin tools, grouped at the right end of the bar apart from the rest. */
  admin?: boolean;
}

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    NgpButton,
    NgpAvatar,
    NgpAvatarFallback,
    NgpTabset,
    NgpTabList,
    NgpTabButton,
    NgpTabPanel,
    NgIcon,
  ],
  providers: [
    provideIcons({
      reiconHome,
      reiconTask,
      reiconClipboard,
      reiconChart,
      reiconUsers,
      reiconSetting2,
      reiconLogout,
      reiconShieldCheck,
      reiconCheck,
      reiconCloseCircle,
    }),
  ],
  templateUrl: './dashboard-layout.html',
  styleUrl: './dashboard-layout.css',
})
export class DashboardLayoutComponent {
  private readonly navItems: NavItem[] = [
    { id: 'home', label: 'Home', icon: 'reiconHome', route: '/dashboard/home' },
    {
      id: 'assessments',
      label: 'Assessments',
      icon: 'reiconTask',
      route: '/dashboard/assessments',
    },
    {
      id: 'trainee-status',
      label: 'Trainee Status',
      icon: 'reiconClipboard',
      route: '/dashboard/trainee-status',
    },
    { id: 'reports', label: 'Reports', icon: 'reiconChart', route: '/dashboard/reports' },
    {
      id: 'user-management',
      label: 'User Management',
      icon: 'reiconUsers',
      route: '/dashboard/user-management',
      permission: 'users.manage',
      admin: true,
    },
    {
      id: 'configuration',
      label: 'Configuration',
      icon: 'reiconSetting2',
      route: '/dashboard/configuration',
      permission: 'configuration.manage',
      admin: true,
    },
  ];

  /** The tabs the signed-in role may open — what the navbar renders. */
  readonly visibleNavItems = computed(() =>
    this.navItems.filter((item) => !item.permission || this.auth.has(item.permission)),
  );

  /**
   * Id of the first Super Admin tab. The bar renders one list, so this marks
   * where the right-hand group starts and where its divider goes.
   */
  readonly firstAdminTabId = computed(() => this.visibleNavItems().find((item) => item.admin)?.id);

  readonly currentTab = signal<string>('home');
  readonly isUserMenuOpen = signal(false);
  readonly isPermissionsModalOpen = signal(false);

  // The layout only renders behind the auth guard, so these mirror the session
  // and stay blank rather than inventing an identity.
  readonly employeeId = computed(() => this.auth.employeeId() ?? '');
  readonly userName = computed(() => this.auth.userName() ?? '');
  readonly userInitial = computed(() => (this.userName().charAt(0) || '?').toUpperCase());

  /** Display name of the signed-in role, e.g. `Super Admin`. */
  readonly roleLabel = computed(() => this.auth.roleDefinition().label);

  /** The permissions the role grants, with their descriptions. */
  readonly permissions = computed(() => {
    const granted = this.auth.permissions();
    return PERMISSIONS.filter((permission) => granted.includes(permission.id));
  });

  /** Whether the role holds every permission there is. */
  readonly hasAllPermissions = computed(() => this.permissions().length === PERMISSIONS.length);

  /** Whether the role reaches only part of the organisation. */
  readonly isScoped = computed(() => this.auth.scope() !== 'all');

  /** The locations or batches the session is assigned to, as one line. */
  readonly assignedAccess = computed(() =>
    scopeSummary(this.auth.role(), this.auth.assignedLocationIds(), this.auth.assignedBatchIds()),
  );

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly elementRef: ElementRef,
  ) {
    this.updateTabFromUrl(this.router.url);

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => {
        this.updateTabFromUrl(e.urlAfterRedirects || e.url);
      });
  }

  private updateTabFromUrl(url: string): void {
    const matching = this.visibleNavItems().find((item) => url.includes(item.id));
    if (matching) {
      this.currentTab.set(matching.id);
    }
  }

  onTabChange(tabId: string | undefined): void {
    if (!tabId) {
      return;
    }
    this.currentTab.set(tabId);
    const item = this.visibleNavItems().find((n) => n.id === tabId);
    if (item && !this.router.url.includes(item.id)) {
      this.router.navigate([item.route]);
    }
  }

  toggleUserMenu(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.isUserMenuOpen.update((open) => !open);
  }

  closeUserMenu(): void {
    this.isUserMenuOpen.set(false);
  }

  openPermissionsModal(): void {
    this.closeUserMenu();
    this.isPermissionsModalOpen.set(true);
  }

  closePermissionsModal(): void {
    this.isPermissionsModalOpen.set(false);
  }

  logout(): void {
    this.closeUserMenu();
    this.auth.logout();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const menuContainer = this.elementRef.nativeElement.querySelector('.user-menu-container');
    if (menuContainer && !menuContainer.contains(target)) {
      this.closeUserMenu();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isPermissionsModalOpen()) {
      this.closePermissionsModal();
    } else {
      this.closeUserMenu();
    }
  }
}
