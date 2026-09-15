import { Component, computed, inject, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { reiconCloseCircle, reiconEdit } from '@ng-icons/reicon';
import {
  AssessmentExam,
  AssessmentResult,
  CefrBadgeStyle,
  TraineeAssessment,
  cefrBadge,
  isValidScore,
  todayIsoDate,
} from '../../../core/models/assessment.model';
import { CefrMappingService } from '../../../core/services/cefr-mapping.service';

/**
 * The results a trainee edit produced, keyed by exam id.
 *
 * <p>Only the exams the user actually changed appear here. `undefined` clears an
 * exam that previously had a score, which is how the field being emptied is
 * expressed; an exam that is left blank and had no score is simply absent.
 */
export interface AssessmentEditSave {
  employeeId: string;
  results: Record<string, AssessmentResult | undefined>;
}

/** One editable exam row of the dialog. */
interface ExamDraft {
  exam: AssessmentExam;
  /** Raw input text so the field can be cleared while typing. */
  score: string;
  /** Level the current score maps to, or `null` while it is empty or invalid. */
  level: string | null;
}

/**
 * Edit dialog for one trainee's assessment results.
 *
 * Renders one score field per configured exam (Pre / Mid / Post today), so
 * exams added in the Configuration screen become editable without changes
 * here. The CEFR level is not entered by hand — it is derived from the score
 * using the mapping configured on the Configuration screen, and shown as a
 * read-only preview next to the field. Create the dialog per open (e.g. behind
 * an `@if`) so each session starts from the trainee's stored results.
 *
 * <p>Exams are sat one at a time, so the fields fill in as the trainee takes
 * them. Nothing here requires every exam to be scored: leave the ones that have
 * not happened yet blank and only those you fill in are saved.
 */
@Component({
  selector: 'app-assessment-edit-dialog',
  standalone: true,
  imports: [NgIcon],
  providers: [provideIcons({ reiconCloseCircle, reiconEdit })],
  host: {
    '(document:keydown.escape)': 'onCancel()',
  },
  templateUrl: './assessment-edit-dialog.html',
  styleUrl: './assessment-edit-dialog.css',
})
export class AssessmentEditDialogComponent {
  /** The admin-configured score → CEFR mapping levels are derived from. */
  private readonly cefrMapping = inject(CefrMappingService);

  /** The trainee whose results are being edited. */
  readonly trainee = input.required<TraineeAssessment>();

  /** Configured exams — one editable row each. */
  readonly exams = input.required<readonly AssessmentExam[]>();

  /** Emitted with the validated results when the edit is saved. */
  readonly save = output<AssessmentEditSave>();

  /** Emitted when the dialog is dismissed without saving. */
  readonly cancelled = output<void>();

  /** Pending score text keyed by exam id; empty until a field is touched. */
  private readonly edits = signal<Record<string, string | undefined>>({});

  /** Rows rendered by the dialog: stored score merged with the pending edit. */
  readonly drafts = computed<ExamDraft[]>(() => {
    const edits = this.edits();
    const results = this.trainee().results;

    return this.exams().map((exam) => {
      const stored = results[exam.id];
      const score = edits[exam.id] ?? (stored ? String(stored.score) : '');
      return { exam, score, level: this.levelFor(score, exam) };
    });
  });

  /**
   * The exams the user actually changed, ready to send.
   *
   * <p>Exams are sat one at a time, so a trainee routinely has a score for only
   * the exam just taken. A blank field therefore means "not sat yet" and is left
   * out entirely — it is not a validation failure and not a zero. Emptying a
   * field that did hold a score is a deliberate clear, and is sent as
   * `undefined` so the backend removes the result.
   *
   * <p>Unchanged scores are left out too; re-sending them would only add rows to
   * the audit trail that record nothing happening.
   */
  readonly pendingChanges = computed<Record<string, AssessmentResult | undefined>>(() => {
    const stored = this.trainee().results;
    const changes: Record<string, AssessmentResult | undefined> = {};

    for (const draft of this.drafts()) {
      const text = draft.score.trim();
      const existing = stored[draft.exam.id];

      if (text === '') {
        if (existing) {
          changes[draft.exam.id] = undefined;
        }
        continue;
      }

      const score = Number(text);
      if (!isValidScore(score, draft.exam.maxScore) || existing?.score === score) {
        continue;
      }
      changes[draft.exam.id] = {
        score,
        cefr: this.cefrMapping.levelFor(score),
        // A score keyed in here is conducted today, which is what the server
        // records; the date is not the faculty member's to choose on this path.
        assessedOn: todayIsoDate(),
      };
    }

    return changes;
  });

  /** Whether there is something valid to save. */
  readonly canSave = computed(
    () =>
      this.drafts().every((draft) => this.scoreError(draft) === null) &&
      Object.keys(this.pendingChanges()).length > 0,
  );

  /**
   * Validation message for a row, or `null` when the score is acceptable.
   *
   * <p>A blank row is acceptable: it means the exam has not been sat. Only a
   * value that is present but out of range is an error.
   */
  scoreError(draft: ExamDraft): string | null {
    if (draft.score.trim() === '') {
      return null;
    }
    const score = Number(draft.score);
    if (!isValidScore(score, draft.exam.maxScore)) {
      return `Whole numbers between 0 and ${draft.exam.maxScore}`;
    }
    return null;
  }

  onScoreInput(examId: string, event: Event): void {
    const score = (event.target as HTMLInputElement).value;
    this.edits.update((edits) => ({ ...edits, [examId]: score }));
  }

  /** Badge colours for a row's derived level, matching the assessment table. */
  levelStyle(level: string | null): CefrBadgeStyle {
    return cefrBadge(this.cefrMapping.colorFor(level).accent);
  }

  onSave(): void {
    if (!this.canSave()) {
      return;
    }

    this.save.emit({
      employeeId: this.trainee().employeeId,
      results: this.pendingChanges(),
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  /** The level a row's current score maps to, or `null` when it cannot be scored. */
  private levelFor(score: string, exam: AssessmentExam): string | null {
    const value = Number(score);
    if (score.trim() === '' || !isValidScore(value, exam.maxScore)) {
      return null;
    }
    return this.cefrMapping.levelFor(value);
  }
}
