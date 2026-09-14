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
import { MultiSelectComponent, MultiSelectOption } from '../multi-select/multi-select';
import { SelectComponent, SelectOption } from '../select/select';

/** A permission of the portal, marked with whether the chosen role grants it. */
interface PermissionRow {
  id: Permission;
  label: string;
  description: string;
  granted: boolean;
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
  readonly batchOptions = computed<MultiSelectOption[]>(() => {
    // Depends on the loaded tree, so the choices appear when it does.
    this.organization.locations();
    return batchesForLocations(this.draft().locationIds).map((batch: BatchGroup) => ({
      value: batch.id,
      label: qualifiedBatchName(batch.id),
    }));
  });

  /**
   * What the batch picker says while there is nothing to pick from — a nudge
   * that names the step that fixes it, wherever the dead end came from.
   */
  readonly batchHint = computed(() =>
    this.draft().locationIds.length
      ? 'The selected locations have no batches.'
      : 'Select a location to choose its batches.',
  );

  /** Every permission, marked with whether the chosen role grants it. */
  readonly permissionRows = computed<PermissionRow[]>(() => {
    const granted = this.role().permissions;
    return this.users.permissions().map((permission) => ({
      ...permission,
      granted: granted.includes(permission.id),
    }));
  });

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

  /**
   * Applies a new location selection. Dropping a location also drops its
   * batches, so the batch list never keeps a selection the user can no longer
   * reach.
   */
  onLocationsChange(locationIds: readonly string[]): void {
    const reachable = new Set(
      batchesForLocations([...locationIds]).map((batch: BatchGroup) => batch.id),
    );
    this.patch({
      locationIds: [...locationIds],
      batchIds: this.draft().batchIds.filter((batchId) => reachable.has(batchId)),
    });
  }

  /**
   * Applies a new batch selection. The picker can only offer the batches of the
   * chosen locations, so a value outside them cannot arrive here.
   */
  onBatchesChange(batchIds: readonly string[]): void {
    this.patch({ batchIds: [...batchIds] });
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
