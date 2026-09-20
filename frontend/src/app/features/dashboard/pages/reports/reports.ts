import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  reiconArrowLeft,
  reiconCloseCircle,
  reiconSearchNormal2,
  reiconUser,
} from '@ng-icons/reicon';
import { TraineeOption } from '../../../../core/models/report.model';
import { ReportService } from '../../../../core/services/report.service';
import { TraineeReportComponent } from '../../../../shared/ui/trainee-report/trainee-report';

/** The reports the page can open, one per card. */
export type ReportId = 'trainee';

/** A card on the reports landing view: the report's name, and what opens it. */
interface ReportCard {
  id: ReportId;
  title: string;
  icon: string;
}

/**
 * The reports the page offers.
 *
 * <p>The list is the page's own: another report is a card here and a view behind
 * it, not a new route and a new nav tab, so the section grows without the bar
 * growing with it.
 */
const REPORT_CARDS: readonly ReportCard[] = [
  { id: 'trainee', title: 'Trainee report', icon: 'reiconUser' },
];

/** How long typing has to settle before a search is sent. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Reports: a card per report, and the report behind each card.
 *
 * <p>The page owns the selection — which report is open, which trainee — and the
 * reads themselves go through {@link ReportService}, which publishes the answers
 * as signals. The report is computed by the API and narrowed to the caller's own
 * scope there; nothing on this page filters, because a report is a claim about the
 * organisation and a claim assembled in the browser from the data already on screen
 * would understate it.
 */
@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [NgIcon, TraineeReportComponent],
  providers: [
    provideIcons({
      reiconUser,
      reiconSearchNormal2,
      reiconCloseCircle,
      reiconArrowLeft,
    }),
  ],
  templateUrl: './reports.html',
  styleUrl: './reports.css',
})
export class ReportsComponent implements OnDestroy {
  private readonly reports = inject(ReportService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  /** The report on screen; `null` while the card grid is showing. */
  readonly activeReport = signal<ReportId | null>(null);

  /** What the trainee search box shows. */
  protected readonly draftQuery = signal('');

  /** Whether the trainee match list is showing. */
  readonly isMatchMenuOpen = signal(false);

  /** The trainee whose report is on screen, if any. */
  readonly selectedEmployeeId = signal<string | null>(null);

  /** The cards on the landing view. */
  readonly cards = REPORT_CARDS;

  /** The matches of the last search. */
  readonly matches = this.reports.matches;

  /** Whether a search is in flight. */
  readonly searching = this.reports.searching;

  /** The trainee report on screen, read by the API. */
  readonly traineeReport = this.reports.trainee;

  readonly traineeLoading = this.reports.loadingTrainee;
  readonly traineeFailed = this.reports.traineeFailed;

  /** Whether the search currently holds a term, and so whether "no matches" means anything. */
  readonly hasSearchTerm = computed(() => this.draftQuery().trim() !== '');

  /** Whether the search found nobody, which is only worth saying once it has settled. */
  readonly noMatches = computed(
    () => this.hasSearchTerm() && !this.searching() && this.matches().length === 0,
  );

  /** The report whose card was chosen. */
  openReport(id: ReportId): void {
    this.activeReport.set(id);
  }

  /** Returns to the card grid, dropping the selection so a card opens fresh. */
  closeReport(): void {
    this.activeReport.set(null);
    this.isMatchMenuOpen.set(false);
  }

  /** Searches for a trainee once typing has settled. */
  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.draftQuery.set(value);
    this.isMatchMenuOpen.set(true);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.searchTrainees(value), SEARCH_DEBOUNCE_MS);
  }

  /** Opens a match's report. */
  selectTrainee(trainee: TraineeOption): void {
    this.selectedEmployeeId.set(trainee.employeeId);
    this.draftQuery.set(trainee.name);
    this.isMatchMenuOpen.set(false);
    this.reports.loadTrainee(trainee.employeeId).subscribe({ error: () => undefined });
  }

  clearSearch(): void {
    clearTimeout(this.searchTimer);
    this.draftQuery.set('');
    this.matchesReset();
    this.isMatchMenuOpen.set(false);
  }

  /**
   * Closes the match list when the click lands outside the search box.
   *
   * Gone rather than left open behind the report: a list of matches floating over
   * the page is read as the current answer, and there is no term it still belongs
   * to once the user has moved on.
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const search = this.elementRef.nativeElement.querySelector('.trainee-search');
    if (search && !search.contains(event.target as Node)) {
      this.isMatchMenuOpen.set(false);
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.searchTimer);
    // The service outlives this page, so its copy of the report is dropped on
    // the way out: a report is a snapshot, and the next visit must not open on
    // one that is already stale.
    this.reports.clear();
  }

  private searchTrainees(term: string): void {
    this.reports.searchTrainees(term).subscribe({ error: () => undefined });
  }

  private matchesReset(): void {
    this.reports.searchTrainees('').subscribe({ error: () => undefined });
  }
}
