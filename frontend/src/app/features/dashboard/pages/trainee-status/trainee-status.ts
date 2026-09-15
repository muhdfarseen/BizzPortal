import { Component, computed, inject, signal, viewChild } from '@angular/core';
import {
  StatusFilter,
  TraineeAssessment,
  TraineeStatusChange,
  statusLabel,
} from '../../../../core/models/assessment.model';
import { DEFAULT_PAGE_SIZE, FIRST_PAGE, SortDirection } from '../../../../core/models/page.model';
import { AssessmentService } from '../../../../core/services/assessment.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/ui/toast.service';
import { FilterBarComponent, FilterState } from '../../../../shared/filter-bar/filter-bar';
import {
  AssessmentPageChange,
  AssessmentRowAction,
  AssessmentRowActionEvent,
  AssessmentSortChange,
  AssessmentTableComponent,
} from '../../../../shared/ui/assessment-table/assessment-table';
import {
  TraineeStatusDialogComponent,
  TraineeStatusDialogRequest,
  TraineeStatusSave,
} from '../../../../shared/ui/trainee-status-dialog/trainee-status-dialog';
import {
  TraineeStatusUploadDialogComponent,
  TraineeStatusUploadSave,
} from '../../../../shared/ui/trainee-status-upload-dialog/trainee-status-upload-dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { reiconSearchNormal2, reiconUpload } from '@ng-icons/reicon';

/**
 * The tabs of the page, in display order: the ordinary path first, then the
 * outcome a trainee leaves by, then the three exits grouped as one.
 */
const STATUS_TABS: readonly StatusFilter[] = ['regular', 'remedial', 'lap', 'cleared', 'other'];

/**
 * The single row action, on every tab.
 *
 * One action rather than a different one per tab: the destination is a decision
 * the user makes in the dialog, not one implied by which tab they happen to be
 * looking at. "Move to LAP" on the Remedial tab could only ever escalate; this
 * can also step someone back, clear them, or record that they left.
 *
 * Deliberately the quiet button treatment rather than the filled one: this button
 * repeats on every row, so filling it would put a column of loud primary colour
 * down the table and compete with the page's own actions. It reads as an option
 * on the row and turns brand-coloured only when the pointer is over it.
 */
const CHANGE_STATUS_ACTION: readonly AssessmentRowAction[] = [
  { id: 'change-status', label: 'Change status', variant: 'secondary' },
];

/** Guidance for a tab that holds no trainees. */
const EMPTY_TAB_HINTS: Record<StatusFilter, string> = {
  regular: 'No trainees are regular for this group.',
  remedial: 'No trainees are on Remedial for this group.',
  lap: 'No trainees are on LAP for this group.',
  cleared: 'No trainees have cleared for this group.',
  other: 'Nobody has discontinued, resigned or been purged in this group.',
};

/** How a tab is written on its button. */
function tabLabel(tab: StatusFilter): string {
  return tab === 'other' ? 'Other' : statusLabel(tab);
}

/** The sentence shown after a change, named from the destination. */
const OUTCOMES: Record<TraineeStatusChange, string> = {
  regular: 'Status ended — trainee is regular',
  remedial: 'Moved to Remedial',
  lap: 'Moved to LAP',
  cleared: 'Marked as cleared',
  discontinued: 'Marked as discontinued',
  purged: 'Marked as purged',
  resigned: 'Marked as resigned',
};

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
 * Trainee status page: the filter bar, the status tabs and the trainees of the
 * tab on screen.
 *
 * The ordinary path runs regular → remedial → lap, and at any point a trainee can
 * clear or leave. Any status can follow any other — the dialog is where that is
 * decided, and it records the status, the day it takes effect and the reason in
 * one action.
 *
 * Each tab is its own server-paged query: the tab is sent as the `status` filter,
 * so the pager counts the tab rather than the whole group and the page on screen
 * is never a slice of something larger.
 */
@Component({
  selector: 'app-trainee-status',
  standalone: true,
  imports: [
    FilterBarComponent,
    AssessmentTableComponent,
    TraineeStatusDialogComponent,
    TraineeStatusUploadDialogComponent,
    NgIcon,
  ],
  providers: [provideIcons({ reiconSearchNormal2, reiconUpload })],
  templateUrl: './trainee-status.html',
  styleUrl: './trainee-status.css',
})
export class TraineeStatusComponent {
  private readonly assessments = inject(AssessmentService);
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(ToastService);

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

  /** The tabs of the page, in display order. */
  readonly statusTabs = STATUS_TABS;

  /** How a tab is written; `LAP` is an acronym and `other` reads better as Other. */
  readonly tabLabel = tabLabel;

  /** Filter of the results on screen; `null` until the first search. */
  readonly searchedFilter = signal<FilterState | null>(null);

  /** Latest filter selection, which may not have been searched yet. */
  private readonly pendingFilter = signal<FilterState | null>(null);

  /** The current page of the tab on screen, exactly as the server returned it. */
  readonly rows = signal<readonly TraineeAssessment[]>([]);

  /** Rows of the tab on screen across every page — never the page's length. */
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

  /** The status tab on screen. */
  readonly activeTab = signal<StatusFilter>('regular');

  /** The status change awaiting its confirmation dialog, if any. */
  readonly confirming = signal<TraineeStatusDialogRequest | null>(null);

  private readonly resultsTable = viewChild(AssessmentTableComponent);

  /** Whether a search has been run — drives the empty state. */
  readonly hasSearched = computed(() => this.searchedFilter() !== null);

  /**
   * Whether the table is shown rather than the tab's empty hint. An empty page
   * while a search is applied still shows the grid, so the table can say that
   * the search found nobody on this tab.
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

  /**
   * Row actions of the visible tab: changing a status needs
   * `trainee-status.manage`, which every role that can reach this screen holds since
   * migration V5 granted it to Faculty. The check stays rather than being dropped,
   * because a role could still be configured without it.
   */
  readonly rowActions = computed<readonly AssessmentRowAction[]>(() =>
    this.auth.has('trainee-status.manage') ? CHANGE_STATUS_ACTION : [],
  );

  /** Whether the tab on screen shows the status columns: start date and remark. */
  readonly showsStatusColumns = computed(() => this.activeTab() !== 'regular');

  /**
   * Whether the tab on screen shows a status column.
   *
   * Only the Other tab needs one: it holds three different statuses, so the tab
   * alone does not say which one a trainee is. On the other tabs every row carries
   * the tab's own status, and repeating it in a column would be noise.
   */
  readonly showsStatusColumn = computed(() => this.activeTab() === 'other');

  /** Guidance for the tab on screen when it holds no trainees. */
  readonly emptyTabHint = computed(() => EMPTY_TAB_HINTS[this.activeTab()]);

  onFilterChange(state: FilterState): void {
    this.pendingFilter.set(state);
  }

  private sameExamSelection(first?: readonly string[], second?: readonly string[]): boolean {
    return JSON.stringify(first ?? []) === JSON.stringify(second ?? []);
  }

  onSearch(state: FilterState): void {
    this.pendingFilter.set(state);
    this.searchedFilter.set(state);
    // A new group opens on the first page of the tab on screen. The search term
    // is kept: it was narrowing the grid the user is still looking at.
    this.pageIndex.set(FIRST_PAGE);
    this.loadTrainees(state);
    // The table is recreated only by the first search; later searches reuse the
    // instance, so it is returned to its first page here.
    this.resultsTable()?.resetPage();
  }

  /** Reads one page of the tab on screen into {@link rows}. */
  private loadTrainees(filter: FilterState): void {
    this.loading.set(true);
    this.assessments
      .getTrainees(filter, {
        page: this.pageIndex(),
        size: this.pageSize(),
        search: this.search(),
        status: this.activeTab(),
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

  selectTab(status: StatusFilter): void {
    if (status === this.activeTab()) {
      return;
    }
    this.activeTab.set(status);
    // Tabs are counted separately by the server, so a page deep into one tab
    // may not exist in the next.
    this.pageIndex.set(FIRST_PAGE);
    const filter = this.searchedFilter();
    if (filter) {
      this.loadTrainees(filter);
    }
  }

  onAction(event: AssessmentRowActionEvent): void {
    if (event.action.id !== 'change-status') {
      return;
    }
    this.confirming.set({ trainee: event.trainee });
  }

  /** Whether the bulk sheet dialog is open. */
  readonly uploading = signal(false);

  /**
   * Whether bulk upload is offered.
   *
   * <p>Guarded by the write permission, not the read one: reading a sheet changes
   * nothing, but uploading one writes statuses, and the commit endpoint checks the
   * same permission.
   */
  readonly canUpload = computed(() => this.auth.has('trainee-status.manage'));

  /** Records the confirmed change and refreshes the tab's data. */
  onConfirm(change: TraineeStatusSave): void {
    const filter = this.searchedFilter();
    if (filter) {
      this.assessments
        .saveTraineeStatus(change.employeeId, change.status, change.remark, change.effectiveDate)
        .subscribe({
          next: () => {
            this.toasts.success(OUTCOMES[change.status]);
            this.closeDialog();
            // The trainee has left the tab on screen, so its first page is read
            // again rather than patched: the row no longer belongs to it.
            this.pageIndex.set(FIRST_PAGE);
            this.loadTrainees(filter);
            this.resultsTable()?.resetPage();
          },
          // Reported by the error interceptor; the dialog stays open to retry.
          error: () => undefined,
        });
    } else {
      this.closeDialog();
    }
  }

  /** Opens the bulk sheet dialog. */
  openUpload(): void {
    this.uploading.set(true);
  }

  closeUpload(): void {
    this.uploading.set(false);
  }

  /**
   * After a bulk upload, reloads only what could have changed.
   *
   * <p>The dialog is left open on its outcome step, which is where the user reads how
   * many statuses were written and then closes it — the same shape the assessment
   * upload has.
   *
   * <p>The sheet was generated for its own group and tab, which need not be the ones
   * on screen: the dialog has its own filter bar. Reloading when they differ would
   * replace the table the user is looking at with a query about something else, so the
   * reload is limited to the case where the sheet covered what is on screen.
   */
  onUploadSaved(save: TraineeStatusUploadSave): void {
    const onScreen = this.searchedFilter();
    const sameGroup =
      onScreen !== null &&
      onScreen.locationId === save.filter.locationId &&
      onScreen.batchId === save.filter.batchId &&
      onScreen.lgId === save.filter.lgId;

    if (sameGroup && save.status === this.activeTab()) {
      this.pageIndex.set(FIRST_PAGE);
      this.loadTrainees(onScreen);
      this.resultsTable()?.resetPage();
    }
  }

  closeDialog(): void {
    this.confirming.set(null);
  }
}
