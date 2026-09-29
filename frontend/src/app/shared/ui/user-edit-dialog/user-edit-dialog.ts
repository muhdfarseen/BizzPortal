import { Component, computed, inject, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { reiconCheck, reiconCloseCircle, reiconMinus, reiconUserEdit } from '@ng-icons/reicon';
import {
  Permission,
  PortalUser,
  TRACK_PERMISSIONS,
  UserDraft,
  UserRole,
  UserStatus,
  roleDefinition,
} from '../../../core/models/user.model';
import { OrganizationService } from '../../../core/services/organization.service';
import { UserService } from '../../../core/services/user.service';
import { MultiSelectComponent, MultiSelectOption } from '../multi-select/multi-select';
import { SelectComponent, SelectOption } from '../select/select';

/** A permission of the portal, marked with whether the chosen role grants it. */
interface PermissionRow {
  id: Permission;
  label: string;
  description: string;
  granted: boolean;
  /** Set on a track permission the chosen role already grants on its own. */
  locked?: boolean;
}

/** Enough of an address to be a plausible mailbox — the API has the last word. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Add / edit dialog for a portal user.
 *
 * The role drives most of the form: it fixes the permission set and decides
 * whether the location and batch pickers apply at all.
 *
 * <p>The two LAP / Remedial management permissions are the exception. They are
 * not part of any role — a role cannot say that one faculty member owns Remedial
 * and the next owns both — so they are chosen here, per person. Every faculty can
 * still see the tracks; the boxes decide who may act on them.
 *
 * Create the dialog per open (e.g. behind an `@if`) so each session starts from
 * the account being edited.
 */
@Component({
  selector: 'app-user-edit-dialog',
  standalone: true,
  imports: [NgIcon, MultiSelectComponent, SelectComponent],
  providers: [provideIcons({ reiconCheck, reiconCloseCircle, reiconMinus, reiconUserEdit })],
  host: {
    '(document:keydown.escape)': 'onCancel()',
  },
  templateUrl: './user-edit-dialog.html',
  styleUrl: './user-edit-dialog.css',
})
export class UserEditDialogComponent {
  private readonly users = inject(UserService);
  private readonly organization = inject(OrganizationService);

  /** The account being edited, or `null` to add a new one. */
  readonly user = input<PortalUser | null>(null);

  /**
   * Whether the role field is locked — set for the signed-in user's own
   * account, so an admin cannot demote themselves out of the portal.
   */
  readonly lockRole = input(false);

  /** Emitted with the completed account when the dialog is saved. */
  readonly save = output<UserDraft>();

  /** Emitted when the dialog is dismissed without saving. */
  readonly cancelled = output<void>();

  /** Role choices, most access first, taken from the matrix the API serves. */
  readonly roleOptions = computed<SelectOption[]>(() =>
    this.users.roles().map((role) => ({
      value: role.id,
      label: role.label,
    })),
  );

  /** Status choices. */
  readonly statusOptions: SelectOption[] = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ];

  /** Every location the session may assign, as the picker lists them. */
  readonly locationOptions = computed<MultiSelectOption[]>(() =>
    this.organization.locations().map((location) => ({
      value: location.id,
      label: location.name,
    })),
  );

  /** Fields the user has touched; everything else falls back to the account. */
  private readonly edits = signal<Partial<UserDraft>>({});

  /** Whether an existing account is being edited rather than one added. */
  readonly isEditing = computed(() => this.user() !== null);

  /** The account as it currently stands in the form. */
  readonly draft = computed<UserDraft>(() => {
    const stored = this.user();
    const edits = this.edits();
    return {
      employeeId: edits.employeeId ?? stored?.employeeId ?? '',
      name: edits.name ?? stored?.name ?? '',
      email: edits.email ?? stored?.email ?? '',
      // New accounts start on the least access there is.
      role: edits.role ?? stored?.role ?? 'faculty',
      locationIds: edits.locationIds ?? stored?.locationIds ?? [],
      status: edits.status ?? stored?.status ?? 'active',
      // A new account manages no track until a box is ticked.
      trackPermissions: edits.trackPermissions ?? stored?.trackPermissions ?? [],
    };
  });

  /** The chosen role's definition — what the rest of the form keys off. */
  readonly role = computed(() => {
    // Reading the served matrix keeps this in step when the API's roles arrive.
    this.users.roles();
    return roleDefinition(this.draft().role);
  });

  /** Whether the chosen role is assigned locations. */
  readonly showLocations = computed(() => this.role().requiresLocations);

  /**
   * Every permission that comes with the role, marked with whether it is granted.
   *
   * <p>The two track permissions are excluded: they are editable above, and
   * listing them here as well would show the same permission twice with no way
   * to tell which one is authoritative.
   */
  readonly rolePermissionRows = computed<PermissionRow[]>(() => {
    const granted = this.role().permissions;
    return this.users
      .permissions()
      .filter((permission) => !TRACK_PERMISSIONS.includes(permission.id))
      .map((permission) => ({
        ...permission,
        granted: granted.includes(permission.id),
      }));
  });

  /**
   * The two track permissions as checkboxes, for a role that does not already
   * grant them.
   *
   * <p>Hidden rather than disabled for the roles that hold both through their
   * role: a box that is already on because of the role is not the
   * administrator's to set, and offering it would let them tick something that
   * would then be sent as a personal grant they never made.
   */
  readonly trackPermissionRows = computed<PermissionRow[]>(() => {
    const roleHolds = this.role().permissions;
    return TRACK_PERMISSIONS.map((id) => {
      const definition = this.users.permissions().find((permission) => permission.id === id);
      return {
        id,
        label: definition?.label ?? id,
        description: definition?.description ?? '',
        granted: (this.draft().trackPermissions ?? []).includes(id),
        // Not the administrator's to choose when the role already grants it.
        locked: roleHolds.includes(id),
      };
    });
  });

  /** Whether the track checkboxes are offered for the chosen role. */
  readonly showTrackPermissions = computed(() =>
    TRACK_PERMISSIONS.some((id) => !this.role().permissions.includes(id)),
  );

  /** Ticks or unticks one track permission. */
  onTrackPermissionToggle(id: Permission, checked: boolean): void {
    const current = this.draft().trackPermissions ?? [];
    this.patch({
      trackPermissions: checked
        ? [...current, id]
        : current.filter((permission) => permission !== id),
    });
  }

  /**
   * Validation message for the Employee ID field, or `null` when it is fine.
   *
   * Whether the id is already in use is not decided here: the account list is
   * paged, so this side never holds every id, and the API's 409 is what refuses
   * a duplicate.
   */
  readonly employeeIdError = computed<string | null>(() => {
    if (this.isEditing()) {
      return null;
    }
    return this.draft().employeeId.trim() ? null : 'Enter an employee ID';
  });

  /** Validation message for the Name field, or `null` when it is fine. */
  readonly nameError = computed<string | null>(() =>
    this.draft().name.trim() ? null : 'Enter a name',
  );

  /** Validation message for the Email field, or `null` when it is fine. */
  readonly emailError = computed<string | null>(() => {
    const email = this.draft().email.trim();
    if (!email) {
      return 'Enter an email address';
    }
    return EMAIL_PATTERN.test(email) ? null : 'Enter a valid email address';
  });

  /** Validation message for the location picker, or `null` when it is fine. */
  readonly locationError = computed<string | null>(() => {
    if (!this.showLocations() || this.draft().locationIds.length) {
      return null;
    }
    return 'Assign at least one location';
  });

  /** Whether every field holds something the account can be saved with. */
  readonly canSave = computed(
    () =>
      this.employeeIdError() === null &&
      this.nameError() === null &&
      this.emailError() === null &&
      this.locationError() === null,
  );

  onEmployeeIdInput(event: Event): void {
    this.patch({ employeeId: (event.target as HTMLInputElement).value });
  }

  onNameInput(event: Event): void {
    this.patch({ name: (event.target as HTMLInputElement).value });
  }

  onEmailInput(event: Event): void {
    this.patch({ email: (event.target as HTMLInputElement).value });
  }

  onRoleChange(value: string | undefined): void {
    const role = this.users.roles().find((candidate) => candidate.id === value);
    if (!role || this.lockRole()) {
      return;
    }
    this.patch({ role: role.id as UserRole });
  }

  onStatusChange(value: string | undefined): void {
    if (value !== 'active' && value !== 'inactive') {
      return;
    }
    this.patch({ status: value as UserStatus });
  }

  /**
   * Applies a new location selection.
   *
   * <p>Nothing cascades any more: the batches inside a location come with the
   * location, so there is no second selection to keep in step with this one.
   */
  onLocationsChange(locationIds: readonly string[]): void {
    this.patch({ locationIds: [...locationIds] });
  }

  onSave(): void {
    if (!this.canSave()) {
      return;
    }

    const draft = this.draft();
    this.save.emit({
      ...draft,
      employeeId: draft.employeeId.trim(),
      name: draft.name.trim(),
      email: draft.email.trim(),
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  private patch(changes: Partial<UserDraft>): void {
    this.edits.update((edits) => ({ ...edits, ...changes }));
  }
}
