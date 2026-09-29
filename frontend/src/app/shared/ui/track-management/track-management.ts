import { Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { LapRemedialStatus, TraineeAssessment } from '../../../core/models/assessment.model';
import { Permission } from '../../../core/models/user.model';
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
  LapRemedialChange,
  LapRemedialChangeRequest,
  LapRemedialDialogComponent,
} from '../lap-remedial-dialog/lap-remedial-dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { reiconArrowLeft2, reiconSearchNormal2, reiconCloseCircle } from '@ng-icons/reicon';

/**
 * How a track page is configured.
 *
 * A page supplies its title, the track it lists, the actions those trainees may
 * be given, and the one placement it can make. The page always shows the track
 * it is for, and the Initiate button swaps the whole screen for the pool the
 * placement is made from, so the two things an administrator does — see who is
 * on the track, and put somebody on it — are one screen and one button rather
 * than two sub-tabs.
 */
export interface TrackPage {
  /** Heading of the current view, e.g. `Remedial`. */
  title: string;
  /** Track the page lists while viewing who is on it. */
  status: LapRemedialStatus;
  /** Row actions offered on the track, gated on that track's manage permission. */
  actions: readonly AssessmentRowAction[];
  /** Guidance shown when the track holds no trainees. */
  emptyHint: string;
  /** The one placement this page makes, and the pool it is made from. */
  initiate: {
    /** Heading while initiating, e.g. `Initiate LAP`, and the dialog's title. */
    title: string;
    /** Track a placement is made from — the pool the initiate view lists. */
    from: LapRemedialStatus;
    /** Row actions offered on the pool. */
    actions: readonly AssessmentRowAction[];
    /** Guidance shown when the pool is empty. */
    emptyHint: string;
    /**
     * Whether the pool's rows carry a start date and the remark they arrived
     * with. A trainee being placed onto a track from no track has neither, so
     * the pool leaves those columns off unless it is another track's trainees.
     */
    showsTrackColumns: boolean;
  };
}

/**
 * Header of the start date column on each track's table.
 *
 * A trainee has a start date per track, and the same column shows whichever one
 * the view is listing, so it is named for that track: the LAP table shows
 * `LAP Start Date`, and the Initiate LAP pool — whose trainees are on Remedial —
 * shows `Remedial Start Date`. A bare "Start Date" left the reader guessing which
 * of the two they were reading.
 *
 * <p>Only the two tracks a trainee can be placed on are named. A trainee on no
 * track has no start date, so that view carries no column to head, and a closed
 * track is left as history rather than listed.
 */
const START_DATE_HEADERS: Partial<Record<LapRemedialStatus, string>> = {
  lap: 'LAP Start Date',
  remedial: 'Remedial Start Date',
};

/** The track a row action moves a trainee onto. */
const ACTION_TARGETS: Record<string, LapRemedialStatus> = {
  'initiate-remedial': 'remedial',
  'initiate-lap': 'lap',
  'close-remedial': 'cleared',
  'close-lap': 'cleared',
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
 * LAP / Remedial track page: the filter bar, the trainees on this track, the
 * Initiate button and the search box.
 *
 * One screen, configured rather than copied: a page names its title, the track
 * it lists, the actions those trainees may be given and the one placement it
 * makes. Initiate swaps the screen for the pool the placement is made from — with
 * the heading following, so it always says which of the two is on screen. Every
 * change is confirmed in a dialog that records a remark, and the remark given
 * with a move is what the destination track's table shows, so each track knows
 * why its trainees arrived.
 *
 * Each view is its own server-paged query: the track is sent as the `status`
 * filter, so the pager counts the view rather than the whole group and the page
 * on screen is never a slice of something larger.
 */
@Component({
  selector: 'app-track-management',
  standalone: true,
  imports: [FilterBarComponent, AssessmentTableComponent, LapRemedialDialogComponent, NgIcon],
  providers: [
    provideIcons({ reiconArrowLeft2, reiconSearchNormal2, reiconCloseCircle }),
  ],
  templateUrl: './track-management.html',
  styleUrl: './track-management.css',
})
export class TrackManagementComponent {
  private readonly assessments = inject(AssessmentService);
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(ToastService);

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  /** How the page is configured; supplies the title, track and Initiate. */
  readonly page = input.required<TrackPage>();

  /** What the search box shows. */
  protected readonly draftQuery = signal('');

  /** Whether an applied search is narrowing the grid. */
  readonly isSearching = computed(() => this.search().trim() !== '');

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

  /** The track change awaiting its confirmation dialog, if any. */
  readonly confirming = signal<LapRemedialChangeRequest | null>(null);

  private readonly resultsTable = viewChild(AssessmentTableComponent);

  /** Whether the Initiate view — the pool a placement is made from — is on screen. */
  readonly initiating = signal(false);

  /**
   * Heading of the screen: the page's own while viewing who is on the track, and
   * the placement's own while initiating, so the two are never confused.
   */
  readonly heading = computed(() =>
    this.initiating() ? this.page().initiate.title : this.page().title,
  );

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
   * Row actions of the view on screen: moving a trainee along a track needs that
   * track's manage permission, and the two are granted separately, so a manager of
   * Remedial is offered nothing on the LAP table.
   */
  readonly rowActions = computed<readonly AssessmentRowAction[]>(() => {
    if (!this.auth.has(this.managePermission())) {
      return [];
    }
    const page = this.page();
    return this.initiating() ? page.initiate.actions : page.actions;
  });

  /**
   * Whether the rows on screen show the track columns: start date and remark.
   * A trainee on no track has neither, so the Initiate Remedial pool — the
   * trainees placed from no track — leaves those columns off.
   */
  readonly showsTrackColumns = computed(() =>
    this.initiating() ? this.page().initiate.showsTrackColumns : true,
  );

  /**
   * Header of the start date column, naming the track the dates on screen
   * belong to — the LAP table reads `LAP Start Date`, the Initiate LAP pool
   * reads `Remedial Start Date`, because the dates in it are the Remedial ones.
   */
  readonly startDateHeader = computed(
    () => START_DATE_HEADERS[this.activeStatus()] ?? 'Start Date',
  );

  /**
   * The permission that governs the track on screen.
   *
   * <p>LAP and Remedial are granted separately, so the page names its own track
   * and the whole screen — Initiate button, row actions, the dialog — follows it.
   * Deriving it here rather than checking two permissions in each place is what
   * keeps a Remedial-only manager from being offered anything on the LAP page.
   */
  private managePermission(): Permission {
    return this.page().status === 'lap'
      ? 'lap-remedial.lap-manage'
      : 'lap-remedial.remedial-manage';
  }

  /** Guidance for the view on screen when it holds no trainees. */
  readonly emptyHint = computed(() =>
    this.initiating() ? this.page().initiate.emptyHint : this.page().emptyHint,
  );

  /** Whether this user may move trainees on this track, and so sees Initiate. */
  readonly canManage = computed(() => this.auth.has(this.managePermission()));

  /** Accessible name of the results region, e.g. `Remedial trainees`. */
  readonly resultsLabel = computed(() => `${this.heading()} trainees`);

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

  /** The track the view on screen is querying: this page's, or the Initiate pool. */
  private activeStatus(): LapRemedialStatus {
    return this.initiating() ? this.page().initiate.from : this.page().status;
  }

  /** Reads one page of the view on screen into {@link rows}. */
  private loadTrainees(filter: FilterState): void {
    this.loading.set(true);
    this.assessments
      .getTrainees(filter, {
        page: this.pageIndex(),
        size: this.pageSize(),
        search: this.search(),
        status: this.activeStatus(),
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
    this.draftQuery.set(term);
    if (!filter) {
      return;
    }
    this.pageIndex.set(FIRST_PAGE);
    this.loadTrainees(filter);
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.draftQuery.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.onSearchChange(value), 300);
  }

  clearSearch(): void {
    clearTimeout(this.searchTimer);
    this.draftQuery.set('');
    this.onSearchChange('');
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

  /**
   * Opens the Initiate view: the pool the placement is made from.
   *
   * A view of its own, so it is counted by the server separately and the pager
   * returns to the first page rather than a page that may not exist in it.
   */
  startInitiate(): void {
    if (this.initiating()) {
      return;
    }
    this.initiating.set(true);
    this.pageIndex.set(FIRST_PAGE);
    const filter = this.searchedFilter();
    if (filter) {
      this.loadTrainees(filter);
    }
  }

  /** Returns from the Initiate view to the trainees on the track. */
  cancelInitiate(): void {
    if (!this.initiating()) {
      return;
    }
    this.initiating.set(false);
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

  closeDialog(): void {
    this.confirming.set(null);
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
            this.toasts.success(TrackManagementComponent.outcomeFor(change.status));
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

  /**
   * The confirmation for a move.
   *
   * Named from the destination rather than from `status`, because "none" is the
   * API's word for closing a track and means nothing to the person who clicked.
   */
  private static outcomeFor(status: LapRemedialStatus): string {
    switch (status) {
      case 'remedial':
        return 'Remedial initiated';
      case 'lap':
        return 'LAP initiated';
      case 'none':
        return 'Removed from LAP / Remedial';
      case 'cleared':
        return 'Marked as Cleared';
    }
  }
}
