import { Component, computed, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  reiconTask,
  reiconEdit2,
  reiconAdd,
  reiconCloseCircle,
  reiconSearchNormal2,
  reiconChart2,
  reiconArrowsRotate,
} from '@ng-icons/reicon';
import {
  CEFR_COLORS,
  CefrColor,
  CefrScoreBand,
  DEFAULT_MAX_SCORE,
  DEFAULT_MIN_SCORE,
  cefrColor,
  isValidScore,
} from '../../../../core/models/assessment.model';
import { AssessmentService } from '../../../../core/services/assessment.service';
import { CefrMappingService } from '../../../../core/services/cefr-mapping.service';
import { ToastService } from '../../../../core/ui/toast.service';

/* ── Assessment config model ──────────────────────────────── */

export interface AssessmentConfig {
  id: string;
  name: string;
  description: string;
  /** Highest achievable score; the API requires one on every write. */
  maxScore: number;
}

/** One editable row of the CEFR mapping; text fields stay raw while typing. */
interface MappingDraft {
  level: string;
  min: string;
  max: string;
  /** Id of the {@link CEFR_COLORS} entry the level's badge uses. */
  color: string;
}

@Component({
  selector: 'app-configuration',
  standalone: true,
  imports: [NgIcon],
  providers: [
    provideIcons({
      reiconTask,
      reiconEdit2,
      reiconAdd,
      reiconCloseCircle,
      reiconSearchNormal2,
      reiconChart2,
      reiconArrowsRotate,
    }),
  ],
  templateUrl: './configuration.html',
  styleUrl: './configuration.css',
})
export class ConfigurationComponent {
  private readonly cefrMappingService = inject(CefrMappingService);
  private readonly assessmentService = inject(AssessmentService);
  private readonly toasts = inject(ToastService);

  /** Sidebar nav items. */
  readonly sidebarItems = [
    { id: 'assessments', label: 'Assessments', icon: 'reiconTask' },
    { id: 'cefr', label: 'CEFR Mapping', icon: 'reiconChart2' },
  ];

  readonly activeSidebarItem = signal('assessments');

  /** ── Assessment CRUD state ─────────────────────────────── */

  /** Every assessment the API serves, retired ones included. */
  readonly assessments = computed<AssessmentConfig[]>(() =>
    this.assessmentService.allExams().map((assessment) => ({
      id: assessment.id,
      name: assessment.name,
      description: assessment.description,
      maxScore: assessment.maxScore,
    })),
  );

  /** Dialog state */
  readonly isDialogOpen = signal(false);
  readonly editingAssessment = signal<AssessmentConfig | null>(null);
  readonly formName = signal('');
  readonly formDescription = signal('');

  /** ── CEFR mapping state ────────────────────────────────── */

  /** The saved mapping, exposed so the template can show its default state. */
  readonly cefrMapping = this.cefrMappingService;

  /** Highest score a band may hold. */
  readonly maxScore = DEFAULT_MAX_SCORE;

  /** Badge colours offered for every band, ordered red → green. */
  readonly colors: readonly CefrColor[] = CEFR_COLORS;

  /** Index of the row whose colour palette is open, if any. */
  readonly openPalette = signal<number | null>(null);

  /** The editable copy of the saved mapping. */
  readonly mappingDraft = signal<MappingDraft[]>([]);

  constructor() {
    this.mappingDraft.set(this.toDraft(this.cefrMappingService.bands()));
    this.assessmentService.loadAllExams().subscribe({
      // Already reported by the error interceptor; the page just shows nothing.
      error: () => undefined,
    });
  }

  selectSidebarItem(id: string): void {
    this.activeSidebarItem.set(id);
  }

  /* ── Dialog actions ───────────────────────────────────────── */

  openAddDialog(): void {
    this.editingAssessment.set(null);
    this.formName.set('');
    this.formDescription.set('');
    this.isDialogOpen.set(true);
  }

  openEditDialog(assessment: AssessmentConfig): void {
    this.editingAssessment.set(assessment);
    this.formName.set(assessment.name);
    this.formDescription.set(assessment.description);
    this.isDialogOpen.set(true);
  }

  closeDialog(): void {
    this.isDialogOpen.set(false);
    this.editingAssessment.set(null);
  }

  onFormNameInput(event: Event): void {
    this.formName.set((event.target as HTMLInputElement).value);
  }

  onFormDescriptionInput(event: Event): void {
    this.formDescription.set((event.target as HTMLTextAreaElement).value);
  }

  saveAssessment(): void {
    const name = this.formName().trim();
    const desc = this.formDescription().trim();
    if (!name) return;

    const editing = this.editingAssessment();
    const request = editing
      ? this.assessmentService.updateExam(editing.id, name, desc, editing.maxScore)
      : this.assessmentService.createExam(name, desc, DEFAULT_MAX_SCORE);

    request.subscribe({
      next: () => {
        // Only close once the server has accepted it, so a rejected name leaves
        // the dialog open with the text still in it to correct.
        this.toasts.success(editing ? 'Assessment updated' : 'Assessment created');
        this.closeDialog();
      },
      // Already reported by the error interceptor.
      error: () => undefined,
    });
  }

  deleteAssessment(id: string): void {
    this.assessmentService.deleteExam(id).subscribe({
      next: () => this.toasts.success('Assessment deleted'),
      error: () => undefined,
    });
  }

  /* ── CEFR mapping actions ─────────────────────────────────── */

  /** Validation message for one band, or `null` when it is acceptable. */
  bandError(draft: MappingDraft, index: number): string | null {
    if (draft.level.trim() === '') {
      return 'Enter a level name';
    }
    const level = draft.level.trim().toLowerCase();
    const duplicated = this.mappingDraft().some(
      (other, position) => position !== index && other.level.trim().toLowerCase() === level,
    );
    if (duplicated) {
      return 'Level names must be unique';
    }

    if (draft.min.trim() === '' || draft.max.trim() === '') {
      return 'Enter both scores';
    }
    const min = Number(draft.min);
    const max = Number(draft.max);
    if (!isValidScore(min) || !isValidScore(max)) {
      return `Whole numbers between 0 and ${DEFAULT_MAX_SCORE}`;
    }
    if (min > max) {
      return 'Min score must not exceed max score';
    }
    if (!CEFR_COLORS.some((color) => color.id === draft.color)) {
      return 'Pick a badge colour';
    }
    return null;
  }

  /** Whether every band is valid and at least one band exists. */
  readonly mappingValid = computed(
    () =>
      this.mappingDraft().length > 0 &&
      this.mappingDraft().every((draft, index) => this.bandError(draft, index) === null),
  );

  /** Whether the draft differs from the saved mapping. */
  readonly mappingDirty = computed(() => {
    const saved = this.cefrMappingService.bands();
    const draft = this.mappingDraft();
    if (saved.length !== draft.length) {
      return true;
    }
    return draft.some((band, index) => {
      const current = saved[index];
      return (
        band.level.trim() !== current.level ||
        Number(band.min) !== current.min ||
        Number(band.max) !== current.max ||
        band.color !== current.color
      );
    });
  });

  /** Whether Save Changes should be enabled. */
  readonly canSaveMapping = computed(() => this.mappingValid() && this.mappingDirty());

  onLevelInput(index: number, event: Event): void {
    this.updateBand(index, { level: (event.target as HTMLInputElement).value });
  }

  onMinInput(index: number, event: Event): void {
    this.updateBand(index, { min: (event.target as HTMLInputElement).value });
  }

  onMaxInput(index: number, event: Event): void {
    this.updateBand(index, { max: (event.target as HTMLInputElement).value });
  }

  /** Appends an empty band for a new level. */
  addBand(): void {
    const draft = this.mappingDraft();
    const lastMax = draft.length ? Number(draft[draft.length - 1].max) : Number.NaN;
    const canContinue = Number.isFinite(lastMax) && lastMax < DEFAULT_MAX_SCORE;
    const min = Number.isFinite(lastMax) ? lastMax + 1 : DEFAULT_MIN_SCORE;
    // Continue along the red → green ramp as rows are added.
    const color = CEFR_COLORS[Math.min(draft.length, CEFR_COLORS.length - 1)].id;

    this.openPalette.set(null);
    this.mappingDraft.set([
      ...draft,
      canContinue
        ? { level: '', min: String(min), max: String(DEFAULT_MAX_SCORE), color }
        : { level: '', min: '', max: '', color },
    ]);
  }

  removeBand(index: number): void {
    this.openPalette.set(null);
    this.mappingDraft.update((draft) => draft.filter((_, position) => position !== index));
  }

  /** Opens (or closes) the colour palette of one row. */
  togglePalette(index: number): void {
    this.openPalette.update((open) => (open === index ? null : index));
  }

  /** Applies a palette colour to a row and closes its palette. */
  chooseColor(index: number, color: string): void {
    this.updateBand(index, { color });
    this.openPalette.set(null);
  }

  /** The palette entry behind a colour id, for painting swatches. */
  colorOf(id: string): CefrColor {
    return cefrColor(id);
  }

  saveMapping(): void {
    if (!this.canSaveMapping()) {
      return;
    }

    const bands: CefrScoreBand[] = [];
    for (const [index, draft] of this.mappingDraft().entries()) {
      if (this.bandError(draft, index) !== null) {
        return;
      }
      bands.push({
        level: draft.level.trim(),
        min: Number(draft.min),
        max: Number(draft.max),
        color: draft.color,
      });
    }

    this.openPalette.set(null);
    this.cefrMappingService.save(bands).subscribe({
      next: (saved) => {
        this.mappingDraft.set(this.toDraft(saved));
        this.toasts.success('CEFR mapping saved');
      },
      error: () => undefined,
    });
  }

  /** Discards unsaved edits and restores the shipped Versant mapping. */
  resetMapping(): void {
    this.cefrMappingService.reset();
    this.mappingDraft.set(this.toDraft(this.cefrMappingService.bands()));
  }

  private updateBand(index: number, change: Partial<MappingDraft>): void {
    this.mappingDraft.update((draft) =>
      draft.map((band, position) => (position === index ? { ...band, ...change } : band)),
    );
  }

  private toDraft(bands: readonly CefrScoreBand[]): MappingDraft[] {
    return bands.map((band, index) => ({
      level: band.level,
      min: String(band.min),
      max: String(band.max),
      // Bands saved before colours existed fall back to the ramp by position.
      color: CEFR_COLORS.some((color) => color.id === band.color)
        ? band.color
        : CEFR_COLORS[Math.min(index, CEFR_COLORS.length - 1)].id,
    }));
  }
}
