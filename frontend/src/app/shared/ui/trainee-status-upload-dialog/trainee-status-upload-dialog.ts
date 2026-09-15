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
import {
  AssessmentExam,
  StatusFilter,
  formatIsoDate,
  statusLabel,
  statusTabLabel,
} from '../../../core/models/assessment.model';
import { SHEET_ACCEPT } from '../../../core/models/sheet.model';
import {
  StatusUploadPreview,
  buildStatusErrorCsv,
  readyRows,
} from '../../../core/models/trainee-status-upload.model';
import { apiErrorMessage } from '../../../core/http/api-error';
import { TraineeStatusUploadService } from '../../../core/services/trainee-status-upload.service';
import { FileDownloadService } from '../../../core/services/file-download.service';
import { SheetReaderService } from '../../../core/services/sheet-reader.service';
import { ToastService } from '../../../core/ui/toast.service';
import { FilterBarComponent, FilterState } from '../../filter-bar/filter-bar';
import { SelectComponent, SelectOption } from '../select/select';

/** What an upload changed, reported to the page that opened the dialog. */
export interface TraineeStatusUploadSave {
  /** Statuses changed. */
  count: number;
  /** The group and tab the sheet was uploaded for, so the page can refresh a match. */
  filter: FilterState;
  status: StatusFilter;
}

/** The dialog's three screens. */
type UploadStep = 'setup' | 'preview' | 'done';

/** The tabs a sheet can be generated for, in the order they are offered. */
const STATUS_TABS: readonly StatusFilter[] = ['regular', 'remedial', 'lap', 'cleared', 'other'];

/**
 * Changes trainee statuses in bulk from a CSV or Excel sheet.
 *
 * Three steps: pick the group and the tab, choose which assessments' marks to show,
 * download the template and send it back; review the judged sheet and confirm; then
 * see what changed. The sheet lists every trainee of the tab and the user fills in
 * only the rows they are changing — a row left blank asks for nothing, which is what
 * makes the sheet usable for correcting a handful of trainees.
 *
 * The judging runs in the browser — see `validateStatusUpload` — against what the
 * server says each trainee holds now, so the user finds out about a mistake before
 * uploading rather than after. The server checks all of it again regardless.
 */
@Component({
  selector: 'app-trainee-status-upload-dialog',
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
  templateUrl: './trainee-status-upload-dialog.html',
  styleUrl: './trainee-status-upload-dialog.css',
})
export class TraineeStatusUploadDialogComponent {
  /** The exams configured for the portal; the chosen ones become sheet columns. */
  readonly exams = input.required<readonly AssessmentExam[]>();

  /** Emitted once statuses have been changed. */
  readonly saved = output<TraineeStatusUploadSave>();

  /** Emitted when the dialog is dismissed. */
  readonly cancelled = output<void>();

  private readonly uploads = inject(TraineeStatusUploadService);
  private readonly reader = inject(SheetReaderService);
  private readonly files = inject(FileDownloadService);
  private readonly toasts = inject(ToastService);

  /** Extensions the file picker offers. */
  readonly accept = SHEET_ACCEPT;

  readonly step = signal<UploadStep>('setup');
  readonly status = signal<StatusFilter>('regular');
  readonly fileName = signal('');
  readonly preview = signal<StatusUploadPreview | null>(null);
  readonly applied = signal(0);
  readonly isReading = signal(false);
  readonly readError = signal<string | null>(null);

  /** The group the sheet was generated for; `null` until the filter bar reports. */
  private readonly filter = signal<FilterState | null>(null);

  /** Exposed so the template can write a status the way the rest of the portal does. */
  protected readonly statusLabel = statusLabel;

  /** Exposed for the same reason: a tab is written the way the page's tabs are. */
  protected readonly tabLabel = statusTabLabel;

  /** Exposed so the template can write a date the way the rest of the portal does. */
  protected readonly formatDate = formatIsoDate;

  readonly statusOptions: SelectOption[] = STATUS_TABS.map((tab) => ({
    value: tab,
    label: statusTabLabel(tab),
  }));

  readonly rows = computed(() => this.preview()?.rows ?? []);
  readonly sheetError = computed(() => this.preview()?.sheetError ?? null);
  readonly hasErrors = computed(() => (this.preview()?.errorRows ?? 0) > 0);

  /** A status belongs to one trainee in one learning group. */
  readonly groupReady = computed(() => {
    const filter = this.filter();
    return Boolean(filter?.locationId && filter.batchId && filter.lgId);
  });

  /**
   * Whether the template and the file picker are available yet.
   *
   * <p>At least one assessment is required, because the marks are the reason the
   * sheet is worth filling in: a faculty member reads them to decide the status.
   */
  readonly canUseGroup = computed(
    () => this.groupReady() && (this.filter()?.examIds?.length ?? 0) > 0,
  );

  /** The exams the sheet will carry marks for, for the hint under the buttons. */
  readonly chosenExams = computed(() => {
    const chosen = this.filter()?.examIds ?? [];
    return this.exams().filter((exam) => chosen.includes(exam.id));
  });

  onFilterChange(state: FilterState): void {
    this.filter.set(state);
  }

  onStatusChange(value: string | undefined): void {
    const tab = STATUS_TABS.find((candidate) => candidate === value);
    if (tab) {
      this.status.set(tab);
    }
  }

  /** Downloads the sheet for the chosen group and tab. */
  downloadTemplate(): void {
    const filter = this.filter();
    if (!filter || !this.canUseGroup()) {
      return;
    }
    this.readError.set(null);
    this.uploads.templateCsv(filter, this.status(), filter.examIds ?? []).subscribe({
      error: (error: unknown) => this.readError.set(apiErrorMessage(error)),
    });
  }

  /** Reads the chosen sheet, judges it, and moves to the preview. */
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const filter = this.filter();
    // Reset first, so picking the same file again still fires `change`.
    input.value = '';
    if (!file || !filter) {
      return;
    }

    this.isReading.set(true);
    this.readError.set(null);
    try {
      const sheet = await this.reader.read(file);
      this.fileName.set(file.name);
      this.preview.set(await firstValueFrom(this.uploads.preview(filter, sheet)));
      this.step.set('preview');
    } catch (error) {
      this.readError.set(
        error instanceof Error ? error.message : `${file.name} could not be read.`,
      );
    } finally {
      this.isReading.set(false);
    }
  }

  /** Downloads the rows that failed, one line per problem, to fix the file against. */
  downloadErrors(): void {
    const preview = this.preview();
    if (!preview) {
      return;
    }
    this.files.download('trainee-status-errors.csv', buildStatusErrorCsv(preview));
  }

  backToSetup(): void {
    this.readError.set(null);
    this.step.set('setup');
  }

  /** Applies the sheet's changes, and reports what was done to the page. */
  confirmUpload(): void {
    const filter = this.filter();
    const preview = this.preview();
    if (!filter || !preview || preview.readyRows === 0) {
      return;
    }

    this.readError.set(null);
    this.uploads.commit(filter, readyRows(preview)).subscribe({
      next: (count) => {
        this.applied.set(count);
        this.step.set('done');
        this.toasts.success(count === 1 ? '1 status updated' : `${count} statuses updated`);
        this.saved.emit({ count, filter, status: this.status() });
      },
      // Kept inline: the dialog lists which rows the server rejected, and the user
      // fixes them in the file before trying again.
      error: (error: unknown) => this.readError.set(apiErrorMessage(error)),
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
