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
import { SelectComponent, SelectOption } from '../ui/select/select';
import { AssessmentExam } from '../../core/models/assessment.model';

/* ── Types ────────────────────────────────────────────────── */

// The hierarchy itself lives in core/models/organization.model.ts, shared with
// User Management; its types are re-exported here so existing importers of the
// filter bar keep resolving.
export type { BatchGroup, LgGroup, LocationGroup } from '../../core/models/organization.model';

import type { BatchGroup, LgGroup } from '../../core/models/organization.model';

export interface FilterState {
  locationId: string | null;
  batchId: string | null;
  lgId: string | null;
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
  readonly selectedExamIds = signal<readonly string[]>([]);
  readonly isExamMenuOpen = signal(false);

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

  readonly availableBatches = computed<readonly BatchGroup[]>(() => {
    const locId = this.selectedLocationId();
    if (locId) {
      const loc = this.locations().find((l) => l.id === locId);
      return loc ? loc.batches : [];
    }
    if (this.allowAll()) {
      const all: BatchGroup[] = [];
      const seen = new Set<string>();
      for (const l of this.locations()) {
        for (const b of l.batches) {
          if (!seen.has(b.name)) {
            seen.add(b.name);
            all.push(b);
          }
        }
      }
      return all;
    }
    return [];
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
  readonly locationOptions = computed<SelectOption[]>(() =>
    this.locations().map((location) => ({
      value: location.id,
      label: location.name,
    })),
  );

  readonly batchOptions = computed<SelectOption[]>(() =>
    this.availableBatches().map((batch) => ({
      value: batch.id,
      label: batch.name,
    })),
  );

  readonly lgOptions = computed<SelectOption[]>(() =>
    this.availableLgs().map((lg) => ({
      value: lg.id,
      label: lg.name,
    })),
  );

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
    return {
      locationId: this.selectedLocationId() || null,
      batchId: this.selectedBatchId() || null,
      lgId: this.selectedLgId() || null,
      examIds: this.selectedExamIds(),
    };
  }

  private emit(): void {
    this.filterChange.emit(this.currentState());
  }
}
