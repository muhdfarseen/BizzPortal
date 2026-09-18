import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { reiconChevronDown, reiconSearch } from '@ng-icons/reicon';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/ui/toast.service';
import { SelectComponent, SelectOption } from '../ui/select/select';
import { AssessmentExam } from '../../core/models/assessment.model';

/* ── Types ────────────────────────────────────────────────── */

// The hierarchy itself lives in core/models/organization.model.ts, shared with
// User Management; its types are re-exported here so existing importers of the
// filter bar keep resolving.
export type { BatchGroup, LgGroup, LocationGroup } from '../../core/models/organization.model';

import {
  batchStartsIn,
  batchStartYears,
  currentQuarter,
  periodLabel,
  qualifiedBatchName,
  QUARTERS,
  type BatchGroup,
  type LgGroup,
} from '../../core/models/organization.model';

export interface FilterState {
  locationId: string | null;
  batchId: string | null;
  lgId: string | null;
  /**
   * The period the selection is being read in — the quarter of a year a batch must
   * have started in to be in view.
   *
   * Part of the state rather than a screen's private detail because it narrows the
   * data, not only the choices: a screen showing an unscoped "All batches" has to
   * know which quarter it is answering for, or it would count every batch there is.
   */
  year: number;
  quarter: number;
  examIds?: readonly string[];
}

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectComponent, NgIcon],
  providers: [provideIcons({ reiconChevronDown, reiconSearch })],
  templateUrl: './filter-bar.html',
  styleUrl: './filter-bar.css',
})
export class FilterBarComponent implements OnInit {
  readonly defaultLocationId = input<string>('');
  readonly defaultBatchId = input<string>('');
  readonly defaultLgId = input<string>('');
  readonly showSearch = input<boolean>(true);
  readonly allowAll = input<boolean>(false);

  /**
   * When `true`, the Search button stays disabled until location, batch _and_
   * LG are selected — used by the pages whose data is scoped to one LG.
   */
  readonly requireFullSelection = input<boolean>(false);
  readonly exams = input<readonly AssessmentExam[]>([]);

  readonly filterChange = output<FilterState>();
  readonly search = output<FilterState>();

  private readonly auth = inject(AuthService);
  private readonly toasts = inject(ToastService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  /**
   * The hierarchy this session may search — the whole organisation for the
   * roles scoped to `all`, and only the assigned locations (and, for Faculty,
   * the assigned batches within them) for the rest. Every option list below
   * derives from this, so a scoped user is never offered another location's
   * data.
   */
  readonly locations = computed(() => this.auth.visibleLocations());

  readonly selectedLocationId = signal<string>('');
  readonly selectedBatchId = signal<string>('');
  readonly selectedLgId = signal<string>('');

  /**
   * The period the bar opens on: the quarter in progress.
   *
   * There is no "every quarter" choice to fall back to, so a default is not a
   * convenience — a screen always has a period, and the batches it can reach are
   * always the ones that began in it.
   */
  private readonly openingPeriod = currentQuarter();

  readonly selectedYear = signal<string>(String(this.openingPeriod.year));
  readonly selectedQuarter = signal<string>(String(this.openingPeriod.quarter));
  readonly selectedExamIds = signal<readonly string[]>([]);
  readonly isExamMenuOpen = signal(false);

  /**
   * The chosen period as numbers.
   *
   * Held as strings inside the selects because every option value is a string,
   * and converted here rather than compared as text, so `03` can never be read
   * as a different year from `3`.
   */
  private readonly selectedPeriod = computed(() => ({
    year: Number(this.selectedYear()),
    quarter: Number(this.selectedQuarter()),
  }));

  /**
   * The exams are read from the API, so they usually arrive after this
   * component has been created. Keep the selection in step with them: default
   * to every exam until the user narrows it down, and drop ids that are no
   * longer configured so a stale selection can never disable Search.
   */
  private readonly syncExamSelection = effect(() => {
    const configured = this.exams().map((exam) => exam.id);
    if (configured.length === 0) {
      return;
    }
    this.selectedExamIds.update((current) => {
      const kept = current.filter((id) => configured.includes(id));
      return kept.length > 0 ? kept : configured;
    });
  });

  readonly examOptions = computed<SelectOption[]>(() =>
    this.exams().map((exam) => ({ value: exam.id, label: exam.name })),
  );

  readonly selectedExamLabel = computed(() => {
    const selected = this.selectedExamIds();
    if (selected.length === 0) {
      return 'Select exams';
    }
    if (selected.length === this.exams().length) {
      return 'All exams';
    }
    return `${selected.length} exam${selected.length === 1 ? '' : 's'} selected`;
  });

  /**
   * Every batch the session can reach, before any level of the bar narrows it.
   *
   * The period leads the bar, so its choices cannot depend on a location that has
   * not been chosen yet: the years are read from here, and a year is never taken
   * off the menu by the selection below it.
   */
  private readonly reachableBatches = computed<readonly BatchGroup[]>(() =>
    this.locations().flatMap((location) => location.batches),
  );

  /**
   * The batches the location choice reaches, before the quarter and year narrow
   * them.
   */
  private readonly scopedBatches = computed<readonly BatchGroup[]>(() => {
    const locId = this.selectedLocationId();
    if (locId) {
      const loc = this.locations().find((l) => l.id === locId);
      return loc ? loc.batches : [];
    }
    if (this.allowAll()) {
      // Every location's batches, not one batch per name: two locations both have
      // a "Batch 01", and keeping only the first of them made the list whichever
      // location happened to come first — which quietly hid the batches a period
      // was chosen to see.
      return this.locations().flatMap((location) => location.batches);
    }
    return [];
  });

  /**
   * The batches the Batch dropdown offers: those the location reaches that start
   * in the chosen year and quarter. A batch's LGs are read from this list too, so
   * the period is what decides whose details a search can reach — a batch outside
   * it is never offered, and so never searched.
   */
  readonly availableBatches = computed<readonly BatchGroup[]>(() => {
    const { year, quarter } = this.selectedPeriod();
    return this.scopedBatches().filter((batch) => batchStartsIn(batch, year, quarter));
  });

  readonly availableLgs = computed<readonly LgGroup[]>(() => {
    const batchId = this.selectedBatchId();
    if (batchId) {
      const batch = this.availableBatches().find((b) => b.id === batchId || b.name === batchId);
      return batch ? batch.lgs : [];
    }
    if (this.allowAll()) {
      const allLgs: LgGroup[] = [];
      const seen = new Set<string>();
      for (const b of this.availableBatches()) {
        for (const lg of b.lgs) {
          if (!seen.has(lg.name)) {
            seen.add(lg.name);
            allLgs.push(lg);
          }
        }
      }
      return allLgs;
    }
    return [];
  });

  readonly isBatchDisabled = computed(() => {
    if (this.allowAll()) {
      return false;
    }
    return !this.selectedLocationId();
  });

  readonly isLgDisabled = computed(() => {
    if (this.allowAll()) {
      return false;
    }
    return !this.selectedBatchId();
  });

  /**
   * Whether the Search button is unavailable because the selection is
   * incomplete. Only enforced while {@link requireFullSelection} is enabled.
   */
  readonly isSearchDisabled = computed(() => {
    if (!this.requireFullSelection()) {
      return false;
    }
    return (
      !this.selectedLocationId() ||
      !this.selectedBatchId() ||
      !this.selectedLgId() ||
      (this.exams().length > 0 && this.selectedExamIds().length === 0)
    );
  });

  /* ── Options rendered by the `app-select` primitives ─────── */

  /**
   * The "All" choice, offered only on a screen that supports an unscoped view.
   *
   * It is an option in the list rather than only a placeholder. Without it,
   * picking a specific value is a one-way door: the empty value that means
   * "All" is what the placeholder stands for, and a placeholder cannot be
   * chosen, so there was no way back to the whole organisation.
   */
  private readonly allOption = computed<SelectOption[]>(() =>
    this.allowAll() ? [{ value: '', label: 'All' }] : [],
  );

  readonly locationOptions = computed<SelectOption[]>(() => [
    ...this.allOption(),
    ...this.locations().map((location) => ({
      value: location.id,
      label: location.name,
    })),
  ]);

  /**
   * The batch choices, qualified with their location while no location is chosen.
   *
   * Batches at different locations share names, so an unqualified list would show
   * "Batch 01" several times over with nothing to tell them apart. Once a location
   * is chosen there is only one of each name, and the plain name is the answer.
   */
  readonly batchOptions = computed<SelectOption[]>(() => {
    const qualified = this.selectedLocationId() === '';
    return [
      ...this.allOption(),
      ...this.availableBatches().map((batch) => ({
        value: batch.id,
        label: qualified ? qualifiedBatchName(batch.id) : batch.name,
      })),
    ];
  });

  /**
   * The four quarters, with no "All" among them: a screen is always looking at
   * one quarter, and returns to the quarter in progress by reloading.
   */
  readonly quarterOptions: SelectOption[] = QUARTERS.map((quarter) => ({
    value: String(quarter),
    label: `Q${quarter}`,
  }));

  /**
   * The years to choose between: every year a reachable batch began in, plus the
   * year in progress — which is the one on screen at first, and would otherwise
   * be a selected value with no option to display it.
   */
  readonly yearOptions = computed<SelectOption[]>(() => {
    const years = new Set<number>([this.openingPeriod.year, ...batchStartYears(this.reachableBatches())]);
    return [...years]
      .sort((left, right) => left - right)
      .map((year) => ({ value: String(year), label: String(year) }));
  });

  /**
   * What to say when the chosen period holds no batch at all, or `null` when it
   * holds one or the bar has no location to judge by yet.
   *
   * A filter that silently removes every choice reads as a broken screen; the
   * batches that went missing are on other dates, and nothing else says so.
   */
  private readonly emptyPeriodMessage = computed<string | null>(() => {
    if (this.scopedBatches().length === 0 || this.availableBatches().length > 0) {
      return null;
    }
    const { year, quarter } = this.selectedPeriod();
    return `No batch starts in ${periodLabel(year, quarter)}`;
  });

  readonly lgOptions = computed<SelectOption[]>(() => [
    ...this.allOption(),
    ...this.availableLgs().map((lg) => ({
      value: lg.id,
      label: lg.name,
    })),
  ]);

  ngOnInit(): void {
    this.selectedExamIds.set(this.exams().map((exam) => exam.id)); // A default outside the session's scope is ignored — the dropdown would not
    // offer it either.
    const visible = this.locations();
    const requested = this.defaultLocationId();
    const defaultLocation = visible.some((location) => location.id === requested) ? requested : '';

    if (defaultLocation) {
      this.selectedLocationId.set(defaultLocation);
      if (this.defaultBatchId()) {
        this.selectedBatchId.set(this.defaultBatchId());
        if (this.defaultLgId()) {
          this.selectedLgId.set(this.defaultLgId());
        }
      }
    } else if (visible.length === 1) {
      // Nothing to choose between, so start on the one location there is.
      this.selectedLocationId.set(visible[0].id);
    }

    this.emit();
  }

  onLocationChange(val: string | undefined): void {
    this.selectedLocationId.set(val ?? '');
    this.selectedBatchId.set('');
    this.selectedLgId.set('');
    this.emit();
    this.announceEmptyPeriod();
  }

  onBatchChange(val: string | undefined): void {
    this.selectedBatchId.set(val ?? '');
    this.selectedLgId.set('');
    this.emit();
  }

  onLgChange(val: string | undefined): void {
    this.selectedLgId.set(val ?? '');
    this.emit();
  }

  onQuarterChange(val: string | undefined): void {
    this.selectedQuarter.set(val ?? '');
    this.dropBatchesOutsidePeriod();
    this.emit();
    this.announceEmptyPeriod();
  }

  onYearChange(val: string | undefined): void {
    this.selectedYear.set(val ?? '');
    this.dropBatchesOutsidePeriod();
    this.emit();
    this.announceEmptyPeriod();
  }

  /**
   * Reports a period the user's own change left empty.
   *
   * Said as a toast rather than written into the bar: a note inside it took a row
   * of its own and pushed location, batch and LG down with it, so the header
   * rearranged itself as soon as a quarter held no batch. Raised only from the
   * change handlers, never on load — nothing has been chosen yet for the user to
   * have expected otherwise, and a toast about the opening quarter would greet
   * every visit.
   */
  private announceEmptyPeriod(): void {
    const message = this.emptyPeriodMessage();
    if (message) {
      this.toasts.info(message, { detail: 'Choose another quarter, year or location.' });
    }
  }

  /**
   * Drops the batch and LG when the period changes.
   *
   * Either may have been chosen from a quarter that is no longer selected, and a
   * batch that sits outside the new period must not survive as an invisible
   * selection the user can no longer see, let alone change.
   */
  private dropBatchesOutsidePeriod(): void {
    this.selectedBatchId.set('');
    this.selectedLgId.set('');
  }

  toggleExam(examId: string): void {
    const selected = new Set(this.selectedExamIds());
    if (selected.has(examId)) {
      selected.delete(examId);
    } else {
      selected.add(examId);
    }
    this.selectedExamIds.set(
      this.exams()
        .map((exam) => exam.id)
        .filter((id) => selected.has(id)),
    );
    this.emit();
  }

  isExamSelected(examId: string): boolean {
    return this.selectedExamIds().includes(examId);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const examPicker = this.elementRef.nativeElement.querySelector('.exam-multi-select');
    if (examPicker && !examPicker.contains(event.target as Node)) {
      this.isExamMenuOpen.set(false);
    }
  }

  onSearch(): void {
    if (this.isSearchDisabled()) {
      return;
    }
    const state = this.currentState();
    this.search.emit(state);
    this.filterChange.emit(state);
  }

  private currentState(): FilterState {
    const { year, quarter } = this.selectedPeriod();

    return {
      locationId: this.selectedLocationId() || null,
      batchId: this.selectedBatchId() || null,
      lgId: this.selectedLgId() || null,
      year,
      quarter,
      examIds: this.selectedExamIds(),
    };
  }

  private emit(): void {
    this.filterChange.emit(this.currentState());
  }
}
