import { Component, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { reiconCloseCircle, reiconTrash } from '@ng-icons/reicon';

/** One instance's label id, so two dialogs never share an `aria-labelledby`. */
let nextInstanceId = 0;

/**
 * Confirmation for an action that cannot be undone.
 *
 * It is a component rather than a block of markup per page because the value of
 * a confirmation is that it looks and behaves the same every time: a prompt the
 * user has to read is only useful if they already know how to read it. It also
 * keeps the destructive case from drifting — the confirm button is always the
 * danger style, and Cancel is always the safe default to land on.
 *
 * The dialog is presentation only: it reports which button was pressed and the
 * caller decides what that means. Wording that promises something the API will
 * not honour is worse than no warning at all, so `message` is the caller's to
 * get right.
 *
 * ```html
 * @if (pendingDelete(); as assessment) {
 *   <app-confirm-dialog
 *     title="Delete assessment"
 *     [subtitle]="assessment.name"
 *     message="…"
 *     confirmLabel="Delete assessment"
 *     (confirmed)="confirmDelete()"
 *     (cancelled)="cancelDelete()"
 *   />
 * }
 * ```
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [NgIcon],
  providers: [provideIcons({ reiconCloseCircle, reiconTrash })],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.css',
})
export class ConfirmDialogComponent {
  /** Heading, e.g. "Delete assessment". */
  readonly title = input.required<string>();

  /** What is about to be affected — a name, an id — shown under the heading. */
  readonly subtitle = input('');

  /** The consequence, in the caller's words. */
  readonly message = input.required<string>();

  /** Text on the destructive button; name the action, not just "OK". */
  readonly confirmLabel = input('Delete');

  /** Header icon; the trash can unless the action calls for another. */
  readonly icon = input('reiconTrash');

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  /** Stable per instance, so the heading is announced with the dialog. */
  protected readonly titleId = `confirm-dialog-title-${nextInstanceId++}`;
}
