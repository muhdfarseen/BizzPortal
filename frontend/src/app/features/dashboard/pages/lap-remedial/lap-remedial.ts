import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { LapRemedialStatus, TraineeAssessment } from '../../../../core/models/assessment.model';
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
  LapRemedialChange,
  LapRemedialChangeRequest,
  LapRemedialDialogComponent,
} from '../../../../shared/ui/lap-remedial-dialog/lap-remedial-dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { reiconSearchNormal2 } from '@ng-icons/reicon';

/** The track tabs of the page, in display order. */
const TRACK_TABS: readonly { status: LapRemedialStatus; label: string }[] = [
  { status: 'none', label: 'No LAP / Remedial' },
  { status: 'remedial', label: 'Remedial' },
  { status: 'lap', label: 'LAP' },
];

/** Row actions offered on every row of a tab, keyed by the tab's track. */
const TAB_ACTIONS: Record<LapRemedialStatus, readonly AssessmentRowAction[]> = {
  none: [{ id: 'move-to-remedial', label: 'Move to Remedial', variant: 'primary' }],
  remedial: [{ id: 'move-to-lap', label: 'Move to LAP', variant: 'primary' }],
  lap: [{ id: 'close-lap', label: 'Close LAP', variant: 'secondary' }],
};

/** The track a row action moves a trainee onto. */
const ACTION_TARGETS: Record<string, LapRemedialStatus> = {
  'move-to-remedial': 'remedial',
  'move-to-lap': 'lap',
  'close-lap': 'none',
};

/** Guidance for a tab that holds no trainees. */
const EMPTY_TAB_HINTS: Record<LapRemedialStatus, string> = {
  none: 'No trainees without a LAP / Remedial track for this group.',
  remedial: 'No trainees are on Remedial for this group.',
  lap: 'No trainees are on LAP for this group.',
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
 * LAP / Remedial page: the filter bar, the track tabs and the trainees of the
 * tab on screen.
 *
 * Trainees move along a track — none → remedial → lap — and every move is
 * confirmed in a dialog that records a remark. The remark given with a move is
 * what the destination tab's table shows, so each track knows why its trainees
 * arrived.
 *
 * Each tab is its own server-paged query: the track is sent as the `status`
 * filter, so the pager counts the tab rather than the whole group and the page
 * on screen is never a slice of something larger.
 */
@Component({
  selector: 'app-lap-remedial',
  standalone: true,
  imports: [FilterBarComponent, AssessmentTableComponent, LapRemedialDialogComponent, NgIcon],
  providers: [provideIcons({ reiconSearchNormal2 })],
  templateUrl: './lap-remedial.html',
  styleUrl: './lap-remedial.css',
})
export class LapRemedialComponent {
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

  /** The track tabs of the page, in display order. */
  readonly trackTabs = TRACK_TABS;

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

  /** The track tab on screen. */
  readonly activeTab = signal<LapRemedialStatus>('none');

  /** The track change awaiting its confirmation dialog, if any. */
  readonly confirming = signal<LapRemedialChangeRequest | null>(null);

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
   * Row actions of the visible tab: moving a trainee along the track needs
   * `lap-remedial.manage`, so a role without it (Faculty) reads the tabs only.
   */
  readonly rowActions = computed<readonly AssessmentRowAction[]>(() =>
    this.auth.has('lap-remedial.manage') ? TAB_ACTIONS[this.activeTab()] : [],
  );

  /** Whether the tab on screen shows the track columns: start date and remark. */
  readonly showsTrackColumns = computed(() => this.activeTab() !== 'none');

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

  selectTab(status: LapRemedialStatus): void {
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
    const status = ACTION_TARGETS[event.action.id];
    if (!status) {
      return;
    }
    this.confirming.set({ trainee: event.trainee, status, title: event.action.label });
  }

  /** Records the confirmed change and refreshes the tab's data. */
  onConfirm(change: LapRemedialChange): void {
    const filter = this.searchedFilter();
    if (filter) {
      this.assessments
        .saveLapRemedial(
          change.employeeId,
          change.status,
          change.remark,
          change.startDate,
          change.closeDate,
        )
        .subscribe({
          next: () => {
            this.toasts.success(LapRemedialComponent.outcomeFor(change.status));
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

  closeDialog(): void {
    this.confirming.set(null);
  }

  /**
   * The confirmation for a move.
   *
   * Named from the destination rather than from `status`, because "none" is the
   * API's word for closing a track and means nothing to the person who clicked.
   */
  private static outcomeFor(status: LapRemedialStatus): string {
    switch (status) {
      case 'remedial':
        return 'Moved to Remedial';
      case 'lap':
        return 'Moved to LAP';
      case 'none':
        return 'Removed from LAP / Remedial';
    }
  }
}
