import { Component, computed, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  reiconArrowLeft2,
  reiconCloseCircle,
  reiconDocumentDownload,
  reiconTickCircle,
  reiconUpload,
} from '@ng-icons/reicon';
import { AssessmentExam, CefrBadgeStyle, cefrBadge } from '../../../core/models/assessment.model';
import {
  SHEET_ACCEPT,
  UploadPreview,
  buildErrorCsv,
} from '../../../core/models/assessment-upload.model';
import { apiErrorMessage } from '../../../core/http/api-error';
import { AssessmentUploadService } from '../../../core/services/assessment-upload.service';
import { CefrMappingService } from '../../../core/services/cefr-mapping.service';
import { FileDownloadService } from '../../../core/services/file-download.service';
import { ToastService } from '../../../core/ui/toast.service';
import { FilterBarComponent, FilterState } from '../../filter-bar/filter-bar';
import { SelectComponent, SelectOption } from '../select/select';

/** What an upload saved, reported to the page that opened the dialog. */
export interface AssessmentUploadSave {
  examId: string;
  examName: string;
  /** Results written. */
  count: number;
  /** The group that was uploaded for, so the page can refresh a matching table. */
  filter: FilterState;
}

/** The dialog's three screens. */
type UploadStep = 'setup' | 'preview' | 'done';

/** Turns an assessment name into a safe file name fragment. */
function fileSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'assessment'
  );
}

/**
 * Uploads assessment scores in bulk from a CSV or Excel sheet.
 *
 * Three steps: pick the group and the one assessment, download the prefilled
 * template and send it back; review the validated preview and confirm; then see
 * what was imported. Validation runs entirely in the browser — see
 * `validateUpload` — and rows that fail are skipped, never guessed at.
 */
@Component({
  selector: 'app-assessment-upload-dialog',
  standalone: true,
  imports: [FilterBarComponent, SelectComponent, NgIcon],
  providers: [
    provideIcons({
      reiconArrowLeft2,
      reiconCloseCircle,
      reiconDocumentDownload,
      reiconTickCircle,
      reiconUpload,
    }),
  ],
  templateUrl: './assessment-upload-dialog.html',
  styleUrl: './assessment-upload-dialog.css',
})
export class AssessmentUploadDialogComponent {
  /** The exams configured for the portal; exactly one is uploaded at a time. */
  readonly exams = input.required<readonly AssessmentExam[]>();

  /** Emitted once results have been written. */
  readonly saved = output<AssessmentUploadSave>();

  /** Emitted when the dialog is dismissed. */
  readonly cancelled = output<void>();

  private readonly uploads = inject(AssessmentUploadService);
  private readonly files = inject(FileDownloadService);
  private readonly toasts = inject(ToastService);
  private readonly cefrMapping = inject(CefrMappingService);

  /** Extensions the file picker offers. */
  readonly accept = SHEET_ACCEPT;

  readonly step = signal<UploadStep>('setup');
  readonly examId = signal('');
  readonly fileName = signal('');
  readonly preview = signal<UploadPreview | null>(null);
  readonly imported = signal(0);
  readonly isReading = signal(false);
  readonly readError = signal<string | null>(null);

  /** The group the sheet is uploaded for; `null` until the filter bar reports. */
  private readonly filter = signal<FilterState | null>(null);

  readonly examOptions = computed<SelectOption[]>(() =>
    this.exams().map((exam) => ({ value: exam.id, label: exam.name })),
  );

  readonly selectedExam = computed(
    () => this.exams().find((exam) => exam.id === this.examId()) ?? null,
  );

  /** A score belongs to one learning group, so all three filters are needed. */
  readonly groupReady = computed(() => {
    const filter = this.filter();
    return Boolean(filter?.locationId && filter.batchId && filter.lgId);
  });

  /** Whether the template and the file picker are available yet. */
  readonly canUseGroup = computed(() => this.groupReady() && this.selectedExam() !== null);

  readonly rows = computed(() => this.preview()?.rows ?? []);
  readonly sheetError = computed(() => this.preview()?.sheetError ?? null);
  readonly hasErrors = computed(() => (this.preview()?.errorRows ?? 0) > 0);

  /** Badge colours of a previewed level, matching the results table. */
  levelStyle(cefr: string | null): CefrBadgeStyle {
    return cefrBadge(this.cefrMapping.colorFor(cefr).accent);
  }

  onFilterChange(state: FilterState): void {
    this.filter.set(state);
  }

  onExamChange(value: string | undefined): void {
    this.examId.set(value ?? '');
  }

  /** Downloads the template for the selected group and assessment. */
  downloadTemplate(): void {
    const filter = this.filter();
    const exam = this.selectedExam();
    if (!filter || !exam || !this.groupReady()) {
      return;
    }
    this.readError.set(null);
    this.uploads.templateCsv(filter, exam.id).subscribe({
      error: (error: unknown) => this.readError.set(apiErrorMessage(error)),
    });
  }

  /** Reads the chosen sheet and moves to the preview. */
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const filter = this.filter();
    const exam = this.selectedExam();
    // Reset first, so picking the same file again still fires `change`.
    input.value = '';
    if (!file || !filter || !exam) {
      return;
    }

    this.isReading.set(true);
    this.readError.set(null);
    try {
      const sheet = await this.uploads.readSheet(file);
      this.fileName.set(file.name);
      this.preview.set(await firstValueFrom(this.uploads.preview(filter, exam.id, sheet)));
      this.step.set('preview');
    } catch (error) {
      this.readError.set(
        error instanceof Error ? error.message : `${file.name} could not be read.`,
      );
    } finally {
      this.isReading.set(false);
    }
  }

  /** Downloads the rows that failed validation, one line per problem. */
  downloadErrors(): void {
    const preview = this.preview();
    const exam = this.selectedExam();
    if (!preview || !exam) {
      return;
    }
    this.files.download(`${fileSlug(exam.name)}-upload-errors.csv`, buildErrorCsv(preview));
  }

  /** Returns to the setup step to pick a different group or file. */
  backToSetup(): void {
    this.step.set('setup');
    this.preview.set(null);
    this.fileName.set('');
    this.readError.set(null);
  }

  /** Writes the accepted rows and shows the outcome. */
  confirmUpload(): void {
    const filter = this.filter();
    const exam = this.selectedExam();
    const preview = this.preview();
    if (!filter || !exam || !preview) {
      return;
    }

    this.readError.set(null);
    this.uploads.commit(filter, exam.id, preview.rows).subscribe({
      next: (count) => {
        this.imported.set(count);
        this.step.set('done');
        this.toasts.success(count === 1 ? '1 score imported' : `${count} scores imported`);
        this.saved.emit({ examId: exam.id, examName: exam.name, count, filter });
      },
      // Kept inline: the dialog lists which rows the server rejected, and the
      // user fixes them in the file before trying again.
      error: (error: unknown) => this.readError.set(apiErrorMessage(error)),
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
