import { Component, computed, inject, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { reiconCheck, reiconCloseCircle, reiconMinus, reiconUserEdit } from '@ng-icons/reicon';
import {
  BatchGroup,
  batchesForLocations,
  qualifiedBatchName,
} from '../../../core/models/organization.model';
import {
  Permission,
  PortalUser,
  UserDraft,
  UserRole,
  UserStatus,
  roleDefinition,
} from '../../../core/models/user.model';
import { OrganizationService } from '../../../core/services/organization.service';
import { UserService } from '../../../core/services/user.service';
import { SelectComponent, SelectOption } from '../select/select';

/** A permission of the portal, marked with whether the chosen role grants it. */
interface PermissionRow {
  id: Permission;
  label: string;
  description: string;
  granted: boolean;
}

/** A batch the user can be assigned to, labelled with its location. */
interface BatchChoice {
  id: string;
  label: string;
}

/** Enough of an address to be a plausible mailbox — the API has the last word. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Add / edit dialog for a portal user.
 *
 * The role drives the rest of the form: it fixes the permission set (shown
 * read-only, since permissions are a property of the role and not of the
 * person) and decides whether the location and batch pickers apply at all.
 * Create the dialog per open (e.g. behind an `@if`) so each session starts from
 * the account being edited.
 */
@Component({
  selector: 'app-user-edit-dialog',
  standalone: true,
  imports: [NgIcon, SelectComponent],
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

  /** Employee ids already in use, so a new account cannot collide with one. */
  readonly takenEmployeeIds = input<readonly string[]>([]);

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

  /** Every location the session may assign, as the checkboxes render them. */
  readonly locations = computed(() => this.organization.locations());

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
      batchIds: edits.batchIds ?? stored?.batchIds ?? [],
      status: edits.status ?? stored?.status ?? 'active',
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

  /** Whether the chosen role is assigned batches. */
  readonly showBatches = computed(() => this.role().requiresBatches);

  /** Batches of the selected locations, labelled `Kochi · Batch 01`. */
  readonly batchChoices = computed<BatchChoice[]>(() => {
    // Depends on the loaded tree, so the choices appear when it does.
    this.organization.locations();
    return batchesForLocations(this.draft().locationIds).map((batch: BatchGroup) => ({
      id: batch.id,
      label: qualifiedBatchName(batch.id),
    }));
  });

  /** Every permission, marked with whether the chosen role grants it. */
  readonly permissionRows = computed<PermissionRow[]>(() => {
    const granted = this.role().permissions;
    return this.users.permissions().map((permission) => ({
      ...permission,
      granted: granted.includes(permission.id),
    }));
  });

  /** Validation message for the Employee ID field, or `null` when it is fine. */
  readonly employeeIdError = computed<string | null>(() => {
    if (this.isEditing()) {
      return null;
    }
    const employeeId = this.draft().employeeId.trim();
    if (!employeeId) {
      return 'Enter an employee ID';
    }
    const taken = this.takenEmployeeIds().some(
      (candidate) => candidate.toLowerCase() === employeeId.toLowerCase(),
    );
    return taken ? 'That employee ID already has an account' : null;
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

  /** Validation message for the batch picker, or `null` when it is fine. */
  readonly batchError = computed<string | null>(() => {
    if (!this.showBatches() || this.draft().batchIds.length) {
      return null;
    }
    return 'Assign at least one batch';
  });

  /** Whether every field holds something the account can be saved with. */
  readonly canSave = computed(
    () =>
      this.employeeIdError() === null &&
      this.nameError() === null &&
      this.emailError() === null &&
      this.locationError() === null &&
      this.batchError() === null,
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

  /** Whether a location is currently assigned. */
  isLocationSelected(locationId: string): boolean {
    return this.draft().locationIds.includes(locationId);
  }

  /** Whether a batch is currently assigned. */
  isBatchSelected(batchId: string): boolean {
    return this.draft().batchIds.includes(batchId);
  }

  /**
   * Adds or removes a location. Dropping a location also drops its batches, so
   * the batch list never keeps a selection the user can no longer reach.
   */
  toggleLocation(locationId: string): void {
    const current = this.draft();
    const locationIds = current.locationIds.includes(locationId)
      ? current.locationIds.filter((id) => id !== locationId)
      : [...current.locationIds, locationId];

    const reachable = new Set(batchesForLocations(locationIds).map((batch) => batch.id));
    this.patch({
      locationIds,
      batchIds: current.batchIds.filter((batchId) => reachable.has(batchId)),
    });
  }

  /** Adds or removes a batch. */
  toggleBatch(batchId: string): void {
    const current = this.draft();
    this.patch({
      batchIds: current.batchIds.includes(batchId)
        ? current.batchIds.filter((id) => id !== batchId)
        : [...current.batchIds, batchId],
    });
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
