import { Component, computed, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { reiconArrowSwapHorizontal, reiconCloseCircle } from '@ng-icons/reicon';
import {
  LapRemedialStatus,
  TraineeAssessment,
  todayIsoDate,
} from '../../../core/models/assessment.model';

/** A LAP / Remedial track change awaiting confirmation. */
export interface LapRemedialChangeRequest {
  /** The trainee the change applies to. */
  trainee: TraineeAssessment;
  /** The track the trainee will be on once confirmed. */
  status: LapRemedialStatus;
  /** Heading and confirm-button text, e.g. `Move to Remedial`. */
  title: string;
}

/** A confirmed track change, as recorded against the trainee. */
export interface LapRemedialChange {
  employeeId: string;
  status: LapRemedialStatus;
  remark: string;
  /** ISO date the trainee starts the track; present when moving onto a track. */
  startDate?: string;
  /** ISO date the trainee closes the track; present when closing a track. */
  closeDate?: string;
}

/**
 * Confirmation dialog of a LAP / Remedial track change: one trainee, the track
 * they are moving onto or closing, the date of that change and the remark that will
 * be shown in the table. Create the dialog per open (e.g. behind an `@if`) so
 * each session starts with a fresh default date and an empty remark.
 */
@Component({
  selector: 'app-lap-remedial-dialog',
  standalone: true,
  imports: [NgIcon],
  providers: [provideIcons({ reiconArrowSwapHorizontal, reiconCloseCircle })],
  host: {
    '(document:keydown.escape)': 'onCancel()',
  },
  templateUrl: './lap-remedial-dialog.html',
  styleUrl: './lap-remedial-dialog.css',
})
export class LapRemedialDialogComponent {
  /** The change being confirmed. */
  readonly request = input.required<LapRemedialChangeRequest>();

  /** Emitted with the remark once the change is confirmed. */
  readonly confirm = output<LapRemedialChange>();

  /** Emitted when the dialog is dismissed without confirming. */
  readonly cancelled = output<void>();

  /** Raw textarea text so the field can be cleared while typing. */
  readonly remark = signal('');

  /** Date of the track action (Start Date when moving onto a track, Close Date when closing), defaulting to today. */
  readonly date = signal(todayIsoDate());

  /** Backwards compatibility alias for the date signal. */
  readonly startDate = this.date;

  /** Whether the change moves the trainee onto a track (rather than closing one). */
  readonly isMove = computed(() => this.request().status !== 'none');

  /** Label for the date field: 'Start Date' when moving onto a track, 'Close Date' when closing a track. */
  readonly dateLabel = computed(() => (this.isMove() ? 'Start Date' : 'Close Date'));

  /** Whether a non-empty remark and date have been entered. */
  readonly canConfirm = computed(() => {
    if (this.remark().trim() === '') {
      return false;
    }
    return this.date() !== '';
  });

  /** One-line explanation of what confirming will do. */
  readonly confirmText = computed(() => {
    const trainee = this.request().trainee;
    switch (this.request().status) {
      case 'remedial':
        return `${trainee.name} will be moved to Remedial`;
      case 'lap':
        return `${trainee.name} will be moved to LAP`;
      default:
        return `${trainee.name} has completed the lap cycle`;
    }
  });

  onRemarkInput(event: Event): void {
    this.remark.set((event.target as HTMLTextAreaElement).value);
  }

  onDateInput(event: Event): void {
    this.date.set((event.target as HTMLInputElement).value);
  }

  onStartDateInput(event: Event): void {
    this.onDateInput(event);
  }

  onConfirm(): void {
    if (!this.canConfirm()) {
      return;
    }

    const { trainee, status } = this.request();
    this.confirm.emit({
      employeeId: trainee.employeeId,
      status,
      remark: this.remark().trim(),
      ...(this.isMove() ? { startDate: this.date() } : { closeDate: this.date() }),
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
