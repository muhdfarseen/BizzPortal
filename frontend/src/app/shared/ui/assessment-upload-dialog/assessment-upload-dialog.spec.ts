import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AssessmentExam } from '../../../core/models/assessment.model';
import { FileDownloadService } from '../../../core/services/file-download.service';
import { ToastService } from '../../../core/ui/toast.service';
import { AssessmentUploadDialogComponent, AssessmentUploadSave } from './assessment-upload-dialog';
import { API_BASE, ApiTraineeFixture, CEFR_BANDS, traineeRows } from '../../../testing/api-testing';

const EXAMS: readonly AssessmentExam[] = [
  { id: '1', name: 'Pre', maxScore: 90 },
  { id: '2', name: 'Mid', maxScore: 90 },
];

/** The config rows the API answers with; ids match {@link EXAMS}. */
const EXAM_CONFIG = [
  { id: '1', name: 'Pre', description: 'Baseline.', maxScore: 90, sortOrder: 1, status: 'active' },
  {
    id: '2',
    name: 'Mid',
    description: 'Checkpoint.',
    maxScore: 90,
    sortOrder: 2,
    status: 'active',
  },
];

const FILTER = { locationId: 'BLR', batchId: '103', lgId: '1004' };

const ROSTER: readonly ApiTraineeFixture[] = traineeRows(2);

@Component({
  imports: [AssessmentUploadDialogComponent],
  template: `
    <app-assessment-upload-dialog
      [exams]="exams"
      (saved)="saves.push($event)"
      (cancelled)="cancelCount = cancelCount + 1"
    />
  `,
})
class TestHostComponent {
  readonly exams = EXAMS;
  readonly saves: AssessmentUploadSave[] = [];
  cancelCount = 0;
}

describe('AssessmentUploadDialogComponent', () => {
  let http: HttpTestingController;
  let download: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    download = vi.fn();
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: FileDownloadService, useValue: { download } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function createFixture() {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    // The services the dialog uses read their configuration on construction.
    http
      .match(`${API_BASE}/configuration/assessments/active`)
      .forEach((request) => request.flush(EXAM_CONFIG));
    http
      .match(`${API_BASE}/configuration/cefr-mapping`)
      .forEach((request) => request.flush(CEFR_BANDS));
    fixture.detectChanges();
    return fixture;
  }

  type Fixture = ReturnType<typeof createFixture>;

  function host(fixture: Fixture): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function dialog(fixture: Fixture): AssessmentUploadDialogComponent {
    return fixture.debugElement.query(By.directive(AssessmentUploadDialogComponent))
      .componentInstance as AssessmentUploadDialogComponent;
  }

  function target(fixture: Fixture): TestHostComponent {
    return fixture.componentInstance;
  }

  function button(fixture: Fixture, selector: string): HTMLButtonElement {
    return host(fixture).querySelector<HTMLButtonElement>(selector) as HTMLButtonElement;
  }

  /** The group and assessment the specs upload for. */
  function chooseGroupAndAssessment(fixture: Fixture): void {
    const instance = dialog(fixture);
    instance.onFilterChange(FILTER);
    instance.onExamChange('1');
    fixture.detectChanges();
  }

  /** The first trainee of the group the dialog is filtered to. */
  function firstTrainee(): ApiTraineeFixture {
    return ROSTER[0];
  }

  function csv(rows: readonly (readonly string[])[]): string {
    return [['Emp ID', 'Name', 'Score'], ...rows].map((row) => row.join(',')).join('\r\n');
  }

  /** Feeds a CSV through the dialog's file input, as the picker would. */
  async function upload(fixture: Fixture, content: string, name = 'scores.csv'): Promise<void> {
    const input = host(fixture).querySelector<HTMLInputElement>('.file-input') as HTMLInputElement;
    const file = new File([content], name, { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));

    await new Promise((resolve) => setTimeout(resolve, 0));
    // The preview loads the group's roster before validating the sheet.
    http
      .match((request) => request.url === `${API_BASE}/assessments/trainees`)
      .forEach((request) => request.flush(ROSTER));
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  /** The messages currently on the toast stack. */
  function toastMessages(): string[] {
    return TestBed.inject(ToastService)
      .toasts()
      .map((toast) => toast.message);
  }

  it('opens on the setup step with the group filters and the assessment picker', () => {
    const fixture = createFixture();

    expect(host(fixture).querySelectorAll('.filter-bar app-select').length).toBe(3);
    expect(host(fixture).querySelector('.exam-multi-select')).toBeNull();
    expect(host(fixture).textContent).toContain('Choose the group and the assessment');
  });

  it('keeps the template and the file picker disabled until the selection is complete', () => {
    const fixture = createFixture();

    expect(button(fixture, '.step-actions .btn-secondary').disabled).toBe(true);
    expect(button(fixture, '.step-actions .btn-primary').disabled).toBe(true);

    dialog(fixture).onFilterChange(FILTER);
    fixture.detectChanges();
    // Still no assessment, so the actions stay closed.
    expect(button(fixture, '.step-actions .btn-primary').disabled).toBe(true);

    dialog(fixture).onExamChange('1');
    fixture.detectChanges();
    expect(button(fixture, '.step-actions .btn-secondary').disabled).toBe(false);
    expect(button(fixture, '.step-actions .btn-primary').disabled).toBe(false);
  });

  it('needs a location, batch and LG, not just an assessment', () => {
    const fixture = createFixture();
    dialog(fixture).onFilterChange({ locationId: 'BLR', batchId: null, lgId: null });
    dialog(fixture).onExamChange('1');
    fixture.detectChanges();

    expect(button(fixture, '.step-actions .btn-primary').disabled).toBe(true);
  });

  it('downloads the template the server generates for the chosen assessment', () => {
    const fixture = createFixture();
    chooseGroupAndAssessment(fixture);

    button(fixture, '.step-actions .btn-secondary').click();

    const request = http.expectOne(
      (candidate) => candidate.url === `${API_BASE}/assessments/uploads/template`,
    );
    expect(request.request.params.get('examId')).toBe('1');
    expect(request.request.params.get('lgId')).toBe('1004');
    request.flush('Emp ID,Name,Score\r\n41201,Trainee 1,40\r\n', {
      headers: { 'Content-Disposition': 'attachment; filename="pre-assessment-template.csv"' },
    });

    expect(download).toHaveBeenCalledTimes(1);
    const [fileName, content] = download.mock.calls[0];
    expect(fileName).toBe('pre-assessment-template.csv');
    expect(content).toContain('Emp ID,Name,Score');
    expect(content).toContain(firstTrainee().employeeId);
  });

  it('previews an uploaded sheet with its validation results', async () => {
    const fixture = createFixture();
    chooseGroupAndAssessment(fixture);
    const trainee = firstTrainee();

    await upload(
      fixture,
      csv([
        [trainee.employeeId, trainee.name, '70'],
        ['99999', 'Nobody', '40'],
      ]),
    );

    expect(host(fixture).textContent).toContain('rows in file');
    expect(host(fixture).querySelectorAll('.preview-table tbody tr').length).toBe(2);
    expect(host(fixture).querySelectorAll('.preview-table tbody tr.is-invalid').length).toBe(1);
    expect(host(fixture).textContent).toContain('99999 is not in this group');
    // The valid row shows the level its score maps to.
    expect(host(fixture).querySelector('.level-badge')?.textContent?.trim()).toBe('B2+');
  });

  it('states how many rows will be imported on the confirm button', async () => {
    const fixture = createFixture();
    chooseGroupAndAssessment(fixture);
    const trainee = firstTrainee();

    await upload(
      fixture,
      csv([
        [trainee.employeeId, trainee.name, '70'],
        ['99999', 'Nobody', '40'],
      ]),
    );

    expect(host(fixture).querySelector('.modal-footer .btn-primary')?.textContent).toContain(
      'Upload 1 results',
    );
  });

  it('downloads the failed rows as a CSV report', async () => {
    const fixture = createFixture();
    chooseGroupAndAssessment(fixture);

    await upload(fixture, csv([['99999', 'Nobody', '40']]));
    button(fixture, '.btn-link').click();

    const [fileName, content] = download.mock.calls[0];
    expect(fileName).toBe('pre-upload-errors.csv');
    expect(content).toContain('Row,Emp ID,Name,Score,Issue');
    expect(content).toContain('99999 is not in this group');
  });

  it('imports the valid rows, reports the outcome and tells the page', async () => {
    const fixture = createFixture();
    chooseGroupAndAssessment(fixture);
    const trainee = firstTrainee();

    await upload(
      fixture,
      csv([
        [trainee.employeeId, trainee.name, '70'],
        ['99999', 'Nobody', '40'],
      ]),
    );
    host(fixture).querySelector<HTMLButtonElement>('.modal-footer .btn-primary')?.click();
    fixture.detectChanges();

    const request = http.expectOne(`${API_BASE}/assessments/uploads`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      examId: '1',
      locationId: 'BLR',
      batchId: 103,
      lgId: 1004,
      rows: [{ employeeId: trainee.employeeId, score: 70 }],
    });
    request.flush({ saved: 1 });
    fixture.detectChanges();

    expect(host(fixture).textContent).toContain('1 results uploaded');
    expect(target(fixture).saves).toHaveLength(1);
    expect(target(fixture).saves[0]).toMatchObject({ examId: '1', count: 1, filter: FILTER });
    expect(toastMessages()).toEqual(['1 score imported']);
  });

  it('confirms a multi-row import with its count', async () => {
    const fixture = createFixture();
    chooseGroupAndAssessment(fixture);

    await upload(
      fixture,
      csv([
        [ROSTER[0].employeeId, ROSTER[0].name, '70'],
        [ROSTER[1].employeeId, ROSTER[1].name, '55'],
      ]),
    );
    host(fixture).querySelector<HTMLButtonElement>('.modal-footer .btn-primary')?.click();
    fixture.detectChanges();

    http.expectOne(`${API_BASE}/assessments/uploads`).flush({ saved: 2 });
    fixture.detectChanges();

    expect(toastMessages()).toEqual(['2 scores imported']);
  });

  it('uploads nothing when every row failed', async () => {
    const fixture = createFixture();
    chooseGroupAndAssessment(fixture);

    await upload(fixture, csv([['99999', 'Nobody', '40']]));

    expect(
      host(fixture).querySelector<HTMLButtonElement>('.modal-footer .btn-primary')?.disabled,
    ).toBe(true);
    expect(host(fixture).querySelector('.btn-link')).not.toBeNull();
  });

  it('explains a sheet that is missing a template column', async () => {
    const fixture = createFixture();
    chooseGroupAndAssessment(fixture);

    await upload(fixture, 'Emp ID,Name\r\n41201,Trainee 1');

    expect(host(fixture).querySelector('.alert--error')?.textContent).toContain('Score');
    expect(host(fixture).querySelector('.preview-table')).toBeNull();
  });

  it('returns to the setup step from the preview', async () => {
    const fixture = createFixture();
    chooseGroupAndAssessment(fixture);

    await upload(fixture, csv([[firstTrainee().employeeId, firstTrainee().name, '70']]));
    expect(host(fixture).querySelector('.preview-table')).not.toBeNull();

    button(fixture, '.modal-footer .btn-secondary').click();
    fixture.detectChanges();

    expect(host(fixture).querySelector('.preview-table')).toBeNull();
    expect(host(fixture).textContent).toContain('Choose the group and the assessment');
  });

  it('reports that it was dismissed', () => {
    const fixture = createFixture();

    host(fixture).querySelector<HTMLButtonElement>('.modal-close-btn')?.click();
    fixture.detectChanges();

    expect(target(fixture).cancelCount).toBe(1);
  });
});
