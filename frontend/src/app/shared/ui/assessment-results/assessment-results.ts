import { Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TraineeAssessment } from '../../../core/models/assessment.model';
import { AssessmentService } from '../../../core/services/assessment.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/ui/toast.service';
import { FilterBarComponent, FilterState } from '../../filter-bar/filter-bar';
import {
  AssessmentRowAction,
  AssessmentRowActionEvent,
  AssessmentTableComponent,
} from '../assessment-table/assessment-table';
import {
  AssessmentEditDialogComponent,
  AssessmentEditSave,
} from '../assessment-edit-dialog/assessment-edit-dialog';
import {
  AssessmentUploadDialogComponent,
  AssessmentUploadSave,
} from '../assessment-upload-dialog/assessment-upload-dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { reiconSearchNormal2, reiconUpload } from '@ng-icons/reicon';

/**
 * Assessment results section of the Assessments page: the filter bar, the
 * (TanStack) results table and the result editor.
 *
 * A search is only allowed with a location, batch and LG selected, because the
 * data is scoped to one learning group.
 */
@Component({
  selector: 'app-assessment-results',
  standalone: true,
  imports: [
    CommonModule,
    FilterBarComponent,
    AssessmentTableComponent,
    AssessmentEditDialogComponent,
    AssessmentUploadDialogComponent,
    NgIcon,
  ],
  providers: [provideIcons({ reiconSearchNormal2, reiconUpload })],
  templateUrl: './assessment-results.html',
  styleUrl: './assessment-results.css',
})
export class AssessmentResultsComponent {
  private readonly assessments = inject(AssessmentService);
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(ToastService);

  /** Section heading, e.g. `Assessments` or `LAP / Remedial`. */
  readonly title = input.required<string>();

  /** The exams configured for the portal (Pre / Mid / Post today). */
  readonly exams = this.assessments.exams;

  readonly selectedExams = computed(() => {
    const filter = this.searchedFilter();
    const selectedIds = filter?.examIds;
    if (!selectedIds) {
      return this.exams();
    }
    const selected = new Set(selectedIds);
    return this.exams().filter((exam) => selected.has(exam.id));
  });

  /** Filter of the results on screen; `null` until the first search. */
  readonly searchedFilter = signal<FilterState | null>(null);

  /** Latest filter selection, which may not have been searched yet. */
  private readonly pendingFilter = signal<FilterState | null>(null);

  /** The trainees of the searched group. */
  readonly rows = signal<readonly TraineeAssessment[]>([]);

  /** The trainee currently being edited, if any. */
  readonly editing = signal<TraineeAssessment | null>(null);

  /** Whether the bulk upload dialog is open. */
  readonly isUploading = signal(false);

  /** Bulk upload is offered to the roles that may record results. */
  readonly canUpload = computed(() => this.auth.has('assessments.edit'));

  /**
   * Row action of the table: open the result editor for the trainee. Offered
   * only to roles that may record results (`assessments.edit`).
   */
  readonly rowActions = computed<readonly AssessmentRowAction[]>(() =>
    this.auth.has('assessments.edit')
      ? [{ id: 'edit', label: 'Edit assessment results', icon: 'reiconEdit2' }]
      : [],
  );

  private readonly resultsTable = viewChild(AssessmentTableComponent);

  /** Whether a search has been run — drives the empty state. */
  readonly hasSearched = computed(() => this.searchedFilter() !== null);

  /** Whether the filters moved on after the last search. */
  readonly isStale = computed(() => {
    const searched = this.searchedFilter();
    const pending = this.pendingFilter();
    if (!searched || !pending) {
      return false;
    }
    return (
      searched.locationId !== pending.locationId ||
      searched.batchId !== pending.batchId ||
      searched.lgId !== pending.lgId ||
      !this.sameExamSelection(searched.examIds, pending.examIds)
    );
  });

  onFilterChange(state: FilterState): void {
    this.pendingFilter.set(state);
  }

  private sameExamSelection(first?: readonly string[], second?: readonly string[]): boolean {
    return JSON.stringify(first ?? []) === JSON.stringify(second ?? []);
  }

  onSearch(state: FilterState): void {
    this.pendingFilter.set(state);
    this.searchedFilter.set(state);
    this.loadTrainees(state);
    // The table is recreated only by the first search; later searches reuse the
    // instance, so it is returned to its first page here.
    this.resultsTable()?.resetPage();
  }

  /** Reads the group's roster from the API into {@link rows}. */
  private loadTrainees(filter: FilterState): void {
    this.assessments.getTrainees(filter).subscribe({
      next: (trainees) => this.rows.set(trainees),
      error: () => this.rows.set([]),
    });
  }

  onRowAction(event: AssessmentRowActionEvent): void {
    if (event.action.id === 'edit') {
      this.editing.set(event.trainee);
    }
  }

  /** Persists an edited trainee and refreshes the row shown in the table. */
  onEditSave(save: AssessmentEditSave): void {
    const filter = this.searchedFilter();
    if (filter) {
      this.assessments.saveResults(filter, save.employeeId, save.results).subscribe({
        next: () => {
          // The service folds the saved score into its cached roster.
          this.rows.set(this.assessments.cachedTrainees(filter));
          this.toasts.success('Scores saved');
          this.closeEdit();
        },
        // Reported by the error interceptor; the dialog stays open to retry.
        error: () => undefined,
      });
    } else {
      this.closeEdit();
    }
  }

  closeEdit(): void {
    this.editing.set(null);
  }

  openUpload(): void {
    this.isUploading.set(true);
  }

  closeUpload(): void {
    this.isUploading.set(false);
  }

  /**
   * Refreshes the table when the upload touched the group on screen. An upload
   * for another group leaves the current results alone.
   */
  onUploadSaved(save: AssessmentUploadSave): void {
    const searched = this.searchedFilter();
    if (
      searched &&
      searched.locationId === save.filter.locationId &&
      searched.batchId === save.filter.batchId &&
      searched.lgId === save.filter.lgId
    ) {
      this.loadTrainees(searched);
      this.resultsTable()?.resetPage();
    }
  }
}
