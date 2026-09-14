import { Component, computed, effect, inject, signal } from '@angular/core';
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
import { AssessmentService, AssessmentStatus } from '../../../../core/services/assessment.service';
import { CefrMappingService } from '../../../../core/services/cefr-mapping.service';
import { ToastService } from '../../../../core/ui/toast.service';
import { ConfirmDialogComponent } from '../../../../shared/ui/confirm-dialog/confirm-dialog';

/* ── Assessment config model ──────────────────────────────── */

export interface AssessmentConfig {
  id: string;
  name: string;
  description: string;
  /** Highest achievable score; the API requires one on every write. */
  maxScore: number;
  /** Retired assessments stay configured but leave the results table. */
  status: AssessmentStatus;
}

/** One editable row of the CEFR mapping; text fields stay raw while typing. */
interface MappingDraft {
  level: string;
  min: string;
  max: string;
  /** Id of the {@link CEFR_COLORS} entry the level's badge uses. */
  color: string;
}

/**
 * The destructive action awaiting confirmation.
 *
 * Both deletes on this page share one dialog, so the prompt cannot drift into
 * two subtly different warnings; only the wording and the work to do differ.
 */
type PendingDelete =
  | { kind: 'assessment'; assessment: AssessmentConfig }
  | { kind: 'band'; level: string; index: number };

@Component({
  selector: 'app-configuration',
  standalone: true,
  imports: [NgIcon, ConfirmDialogComponent],
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
  host: {
    // Escape dismisses the delete confirmation first, then the edit dialog —
    // the same order User Management uses.
    '(document:keydown.escape)': 'onEscape()',
  },
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
      status: assessment.status,
    })),
  );

  /** Dialog state */
  readonly isDialogOpen = signal(false);
  readonly editingAssessment = signal<AssessmentConfig | null>(null);
  readonly formName = signal('');
  readonly formDescription = signal('');

  /** Lifecycle state held by the edit dialog. A new assessment is always active. */
  readonly formStatus = signal<AssessmentStatus>('active');

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

  /**
   * Whether the user has changed the draft. A mapping that arrives after they
   * have started editing must not overwrite their work.
   */
  private draftEdited = false;

  constructor() {
    this.assessmentService.loadAllExams().subscribe({
      // Already reported by the error interceptor; the page just shows nothing.
      error: () => undefined,
    });
  }

  /**
   * Keep the draft in step with the stored mapping until the user takes over.
   *
   * The service starts on the shipped default and swaps in the API's mapping
   * once it arrives, so seeding the draft once at construction — which is what
   * this did — leaves it holding the default whenever the page is opened
   * directly. That reads as unsaved edits against the real mapping, arming
   * Save Changes to overwrite a configured mapping with the shipped one.
   */
  private readonly seedDraftFromStore = effect(() => {
    const stored = this.cefrMappingService.bands();
    if (!this.draftEdited) {
      this.mappingDraft.set(this.toDraft(stored));
    }
  });

  selectSidebarItem(id: string): void {
    this.activeSidebarItem.set(id);
  }

  /* ── Dialog actions ───────────────────────────────────────── */

  openAddDialog(): void {
    this.editingAssessment.set(null);
    this.formName.set('');
    this.formDescription.set('');
    // Creating always starts active: an assessment that arrives retired cannot
    // score anything, and the API defaults to active when none is given.
    this.formStatus.set('active');
    this.isDialogOpen.set(true);
  }

  openEditDialog(assessment: AssessmentConfig): void {
    this.editingAssessment.set(assessment);
    this.formName.set(assessment.name);
    this.formDescription.set(assessment.description);
    this.formStatus.set(assessment.status);
    this.isDialogOpen.set(true);
  }

  /** Reads the dialog's status switch. */
  onStatusChange(event: Event): void {
    this.formStatus.set((event.target as HTMLInputElement).checked ? 'active' : 'inactive');
  }

  closeDialog(): void {
    this.isDialogOpen.set(false);
    this.editingAssessment.set(null);
  }

  /** Escape closes the delete confirmation, or the dialog behind it. */
  onEscape(): void {
    if (this.pendingDelete()) {
      this.cancelDelete();
      return;
    }
    if (this.isDialogOpen()) {
      this.closeDialog();
    }
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
      ? this.assessmentService.updateExam(
          editing.id,
          name,
          desc,
          editing.maxScore,
          this.formStatus(),
        )
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

  /* ── Destructive actions ──────────────────────────────────── */

  /** The delete the user has asked for and not yet confirmed, if any. */
  readonly pendingDelete = signal<PendingDelete | null>(null);

  /**
   * Wording for the pending confirmation, or `null` when nothing is pending.
   *
   * The API refuses to delete an assessment that already has results, so the
   * prompt says so rather than promising a delete that will be rejected — a
   * warning about the wrong consequence teaches the user to ignore warnings.
   */
  readonly confirmCopy = computed<{
    title: string;
    subtitle: string;
    message: string;
    confirmLabel: string;
  } | null>(() => {
    const pending = this.pendingDelete();
    if (!pending) {
      return null;
    }

    if (pending.kind === 'assessment') {
      return {
        title: 'Delete assessment',
        subtitle: pending.assessment.name,
        message:
          'It is removed from the assessment list for good. An assessment that already ' +
          'holds recorded results cannot be deleted; deactivate it instead to take it ' +
          'out of the results table without losing those results.',
        confirmLabel: 'Delete assessment',
      };
    }

    return {
      title: 'Remove CEFR level',
      subtitle: pending.level,
      message:
        'It is dropped from the mapping when you save. Results already recorded keep ' +
        'their score and level.',
      confirmLabel: 'Remove level',
    };
  });

  /** Asks before deleting an assessment. */
  requestDeleteAssessment(assessment: AssessmentConfig): void {
    this.pendingDelete.set({ kind: 'assessment', assessment });
  }

  /** Asks before dropping a level from the mapping. */
  requestRemoveBand(index: number): void {
    const band = this.mappingDraft()[index];
    if (!band) {
      return;
    }
    this.openPalette.set(null);
    this.pendingDelete.set({ kind: 'band', level: band.level.trim() || 'this level', index });
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  /** Carries out the delete the user confirmed. */
  confirmDelete(): void {
    const pending = this.pendingDelete();
    if (!pending) {
      return;
    }
    this.pendingDelete.set(null);

    if (pending.kind === 'band') {
      this.draftEdited = true;
      this.mappingDraft.update((draft) =>
        draft.filter((_, position) => position !== pending.index),
      );
      return;
    }

    this.assessmentService.deleteExam(pending.assessment.id).subscribe({
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
    this.draftEdited = true;
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
    this.draftEdited = true;
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
