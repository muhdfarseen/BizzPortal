import { Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TraineeAssessment, todayIsoDate } from '../../../core/models/assessment.model';
import { DEFAULT_PAGE_SIZE, FIRST_PAGE, SortDirection } from '../../../core/models/page.model';
import { AssessmentService } from '../../../core/services/assessment.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/ui/toast.service';
import { FilterBarComponent, FilterState } from '../../filter-bar/filter-bar';
import {
  AssessmentPageChange,
  AssessmentRowAction,
  AssessmentRowActionEvent,
  AssessmentSortChange,
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
 * The table's column ids, mapped onto the keys the API sorts by. Only these two
 * can be ordered server-side; a header the map does not name (an exam column,
 * say) leaves the order alone rather than sorting the page in the browser.
 */
const SORT_KEYS: Record<string, string> = {
  name: 'name',
  employeeId: 'employeeId',
};

/**
 * Assessment results section of the Assessments page: the filter bar, the
 * (TanStack) results table and the result editor.
 *
 * A search is only allowed with a location, batch and LG selected, because the
 * data is scoped to one learning group. The group is paged, searched, filtered
 * and sorted by the server; this page keeps only the page on screen and asks
 * for another whenever the table reports a change.
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

  /** Section heading, e.g. `Assessments` or `Trainee Status`. */
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

  /** The current page of trainees, exactly as the server returned it. */
  readonly rows = signal<readonly TraineeAssessment[]>([]);

  /** Rows matching the search across every page — never the page's length. */
  readonly totalElements = signal(0);

  /** Whether a page is in flight. */
  readonly loading = signal(false);

  /** Zero-based index of the page on screen. */
  readonly pageIndex = signal(FIRST_PAGE);

  /** Rows per page. */
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);

  /** The search the rows were loaded for. */
  readonly search = signal('');

  /** Sort the rows were loaded in; omitted means the API's own order. */
  private readonly sort = signal<string | undefined>(undefined);
  private readonly direction = signal<SortDirection | undefined>(undefined);

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

  /**
   * Whether the table is shown rather than the "no trainees" state. An empty
   * page while a search is applied still shows the grid, so the table can say
   * that the search found nobody.
   */
  readonly showTable = computed(() => this.totalElements() > 0 || this.search().trim() !== '');

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
    // A new group is a new result set, so it opens on its first page. The
    // search term is kept: it was narrowing the grid the user is still looking
    // at, and dropping it would silently widen the group they just picked.
    this.pageIndex.set(FIRST_PAGE);
    this.loadTrainees(state);
    // The table is recreated only by the first search; later searches reuse the
    // instance, so it is returned to its first page here.
    this.resultsTable()?.resetPage();
  }

  /** Reads one page of the searched group into {@link rows}. */
  private loadTrainees(filter: FilterState): void {
    this.loading.set(true);
    this.assessments
      .getTrainees(filter, {
        page: this.pageIndex(),
        size: this.pageSize(),
        search: this.search(),
        sort: this.sort(),
        direction: this.direction(),
      })
      .subscribe({
        next: (page) => {
          this.rows.set(page.items);
          this.totalElements.set(page.totalElements);
          this.loading.set(false);
        },
        error: () => {
          this.rows.set([]);
          this.totalElements.set(0);
          this.loading.set(false);
        },
      });
  }

  onPageChange(change: AssessmentPageChange): void {
    const filter = this.searchedFilter();
    if (!filter) {
      return;
    }
    const unchanged = change.pageIndex === this.pageIndex() && change.pageSize === this.pageSize();
    this.pageIndex.set(change.pageIndex);
    this.pageSize.set(change.pageSize);
    if (!unchanged) {
      this.loadTrainees(filter);
    }
  }

  onSearchChange(term: string): void {
    const filter = this.searchedFilter();
    this.search.set(term);
    if (!filter) {
      return;
    }
    // A narrower result is usually shorter, so staying deep in the old one
    // would show an empty page and read as "nothing found".
    this.pageIndex.set(FIRST_PAGE);
    this.loadTrainees(filter);
  }

  onSortChange(change: AssessmentSortChange): void {
    const filter = this.searchedFilter();
    const sort = SORT_KEYS[change.sort];
    if (!filter || !sort) {
      return;
    }
    this.sort.set(sort);
    this.direction.set(change.direction);
    this.pageIndex.set(FIRST_PAGE);
    this.loadTrainees(filter);
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
      this.assessments.saveResults(save.employeeId, save.results).subscribe({
        next: () => {
          this.applyLocalResults(save);
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

  /**
   * Folds a saved score into the page on screen, so the table reflects the edit
   * at once. The level is derived the same way the server derives it, and the
   * next page read replaces the row anyway.
   */
  private applyLocalResults(save: AssessmentEditSave): void {
    this.rows.update((rows) =>
      rows.map((trainee) => {
        if (trainee.employeeId !== save.employeeId) {
          return trainee;
        }
        const results = { ...trainee.results };
        for (const [examId, result] of Object.entries(save.results)) {
          if (result) {
            results[examId] = {
              score: result.score,
              cefr: this.assessments.levelFor(result.score),
              // Inline entry is recorded against the day it is keyed in, which is
              // what the server stores; keep the row we just updated in step.
              assessedOn: todayIsoDate(),
            };
          } else {
            delete results[examId];
          }
        }
        return { ...trainee, results };
      }),
    );
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
      this.pageIndex.set(FIRST_PAGE);
      this.loadTrainees(searched);
      this.resultsTable()?.resetPage();
    }
  }
}
