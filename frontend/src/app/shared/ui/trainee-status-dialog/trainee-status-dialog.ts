import { Component, computed, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { reiconArrowSwapHorizontal, reiconCloseCircle } from '@ng-icons/reicon';
import {
  OTHER_STATUSES,
  TraineeAssessment,
  TraineeStatus,
  TraineeStatusChange,
  statusLabel,
  todayIsoDate,
} from '../../../core/models/assessment.model';
import { SelectComponent, SelectOption } from '../select/select';

/** A status change awaiting confirmation. */
export interface TraineeStatusDialogRequest {
  /** The trainee whose status is changing. */
  trainee: TraineeAssessment;
}

/** A confirmed status change, as recorded against the trainee. */
export interface TraineeStatusSave {
  employeeId: string;
  /** The status the trainee will hold; `regular` ends whatever they hold. */
  status: TraineeStatusChange;
  remark: string;
  /** ISO date the new status takes effect. */
  effectiveDate: string;
}

/**
 * Confirmation dialog for a trainee status change: one trainee, the status they
 * will hold, the day it takes effect and the reason for it.
 *
 * The status the trainee holds now is shown but not offered, because choosing it
 * would be a change that changes nothing — the API refuses it too, so the option
 * is removed rather than left to fail. `regular` is offered alongside the stored
 * statuses because ending a status is a change like any other.
 *
 * Create the dialog per open (e.g. behind an `@if`) so each session starts with a
 * fresh default date and an empty remark.
 */
@Component({
  selector: 'app-trainee-status-dialog',
  standalone: true,
  imports: [NgIcon, SelectComponent],
  providers: [provideIcons({ reiconArrowSwapHorizontal, reiconCloseCircle })],
  host: {
    '(document:keydown.escape)': 'onCancel()',
  },
  templateUrl: './trainee-status-dialog.html',
  styleUrl: './trainee-status-dialog.css',
})
export class TraineeStatusDialogComponent {
  /** The change being confirmed. */
  readonly request = input.required<TraineeStatusDialogRequest>();

  /** Emitted with the chosen status, reason and date once confirmed. */
  readonly confirm = output<TraineeStatusSave>();

  /** Emitted when the dialog is dismissed without confirming. */
  readonly cancelled = output<void>();

  /** The status the trainee holds now, or `regular` when they hold none. */
  readonly currentStatus = computed<TraineeStatusChange>(
    () => this.request().trainee.status ?? 'regular',
  );

  /**
   * The statuses on offer, in the order a user thinks about them: the ordinary
   * path first, then the outcomes, then returning to regular.
   */
  readonly statusOptions = computed<SelectOption[]>(() => {
    const current = this.currentStatus();
    const stored: TraineeStatus[] = ['remedial', 'lap', 'cleared', ...OTHER_STATUSES];

    return [
      ...stored
        .filter((status) => status !== current)
        .map((status) => ({ value: status, label: statusLabel(status) })),
      // Removing support is the last thing you do, so it is listed last — and it
      // is not offered to someone who has nothing to remove.
      ...(current === 'regular' ? [] : [{ value: 'regular', label: statusLabel('regular') }]),
    ];
  });

  /** The status the user has chosen, or empty until they choose one. */
  readonly chosen = signal<TraineeStatusChange | ''>('');

  /** The day the change takes effect, defaulting to today. */
  readonly effectiveDate = signal(todayIsoDate());

  /** Latest date the picker offers: a status cannot start tomorrow. */
  readonly latestEffectiveDate = todayIsoDate();

  /** Exposed for the template, which writes `lap` as `LAP`. */
  readonly statusLabel = statusLabel;

  /** Raw textarea text so the field can be cleared while typing. */
  readonly remark = signal('');

  /** Whether a status, a date and a reason have all been given. */
  readonly canConfirm = computed(
    () => this.chosen() !== '' && this.effectiveDate() !== '' && this.remark().trim() !== '',
  );

  /** One-line explanation of what confirming will do. */
  readonly confirmText = computed(() => {
    const chosen = this.chosen();
    if (chosen === '') {
      return 'Choose the status this trainee should hold.';
    }
    if (chosen === 'regular') {
      return `${this.name()} will hold no status, and the current one will end.`;
    }
    return `${this.name()} will be moved to ${statusLabel(chosen)}.`;
  });

  /** The trainee's name, for the messages read back to the user. */
  private readonly name = computed(() => this.request().trainee.name);

  onStatusChange(value: string | null): void {
    this.chosen.set((value ?? '') as TraineeStatusChange | '');
  }

  onDateInput(event: Event): void {
    this.effectiveDate.set((event.target as HTMLInputElement).value);
  }

  onRemarkInput(event: Event): void {
    this.remark.set((event.target as HTMLTextAreaElement).value);
  }

  onConfirm(): void {
    if (!this.canConfirm()) {
      return;
    }
    this.confirm.emit({
      employeeId: this.request().trainee.employeeId,
      status: this.chosen() as TraineeStatusChange,
      remark: this.remark().trim(),
      effectiveDate: this.effectiveDate(),
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
