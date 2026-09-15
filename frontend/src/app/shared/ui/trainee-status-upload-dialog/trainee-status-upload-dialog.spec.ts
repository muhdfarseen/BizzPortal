import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AssessmentExam, todayIsoDate } from '../../../core/models/assessment.model';
import { FileDownloadService } from '../../../core/services/file-download.service';
import { ToastService } from '../../../core/ui/toast.service';
import {
  TraineeStatusUploadDialogComponent,
  TraineeStatusUploadSave,
} from './trainee-status-upload-dialog';
import { API_BASE, CEFR_BANDS } from '../../../testing/api-testing';

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

const FILTER = { locationId: 'BLR', batchId: '103', lgId: '1004', examIds: ['1'] };

const BASE = `${API_BASE}/assessments/trainee-status/uploads`;

/** The header the server writes, which is what a downloaded sheet carries. */
const HEADER = [
  'Emp ID',
  'Name',
  'Pre',
  'Current Status',
  'New Status',
  'Effective Date',
  'Remark',
];

/** A row of the template's shape with the columns a spec does not care about blank. */
function row(employeeId: string, status: string, date = '', remark = ''): string[] {
  return [employeeId, 'Aarav Nair', '51 - B1', 'Regular', status, date, remark];
}

function csv(rows: readonly (readonly string[])[]): string {
  return [HEADER, ...rows].map((line) => line.join(',')).join('\r\n');
}

@Component({
  imports: [TraineeStatusUploadDialogComponent],
  template: `
    <app-trainee-status-upload-dialog
      [exams]="exams"
      (saved)="saves.push($event)"
      (cancelled)="cancelCount = cancelCount + 1"
    />
  `,
})
class TestHostComponent {
  readonly exams = EXAMS;
  readonly saves: TraineeStatusUploadSave[] = [];
  cancelCount = 0;
}

describe('TraineeStatusUploadDialogComponent', () => {
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

  function dialog(fixture: Fixture): TraineeStatusUploadDialogComponent {
    return fixture.debugElement.query(By.directive(TraineeStatusUploadDialogComponent))
      .componentInstance as TraineeStatusUploadDialogComponent;
  }

  function button(fixture: Fixture, selector: string): HTMLButtonElement {
    return host(fixture).querySelector<HTMLButtonElement>(selector) as HTMLButtonElement;
  }

  /** The group and marks the specs upload for. */
  function chooseGroup(fixture: Fixture): void {
    dialog(fixture).onFilterChange(FILTER);
    fixture.detectChanges();
  }

  /**
   * Feeds a CSV through the dialog's file input, as the picker would, and answers
   * the preview's lookup with what the group holds.
   */
  async function upload(
    fixture: Fixture,
    content: string,
    group = [
      { employeeId: '41201', name: 'Aarav Nair', status: null, startDate: null },
      { employeeId: '41202', name: 'Meera Iyer', status: 'remedial', startDate: '2026-02-02' },
    ],
    name = 'status.csv',
  ): Promise<void> {
    const input = host(fixture).querySelector<HTMLInputElement>('.file-input') as HTMLInputElement;
    const file = new File([content], name, { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));

    await new Promise((resolve) => setTimeout(resolve, 0));
    http
      .match((request) => request.url === `${BASE}/lookup`)
      .forEach((request) => request.flush({ trainees: group }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  /** The messages currently on the toast stack. */
  function toastMessages(): string[] {
    return TestBed.inject(ToastService)
      .toasts()
      .map((toast) => toast.message);
  }

  it('opens on the setup step with the group filters, the marks and the tab picker', () => {
    const fixture = createFixture();

    // Location, batch and LG, then the bar's own multi-select for the assessments
    // whose marks the sheet will carry, then the tab picker.
    expect(host(fixture).querySelectorAll('.filter-bar app-select').length).toBe(3);
    expect(host(fixture).querySelector('.exam-multi-select')).not.toBeNull();
    expect(host(fixture).querySelectorAll('app-select').length).toBe(4);
    expect(host(fixture).textContent).toContain('Choose the group and the tab');
  });

  it('keeps the sheet closed until a group and at least one assessment are chosen', () => {
    const fixture = createFixture();

    expect(button(fixture, '.step-actions .btn-secondary').disabled).toBe(true);
    expect(button(fixture, '.step-actions .btn-primary').disabled).toBe(true);

    // A group without marks is not enough: the marks are why the sheet is filled in.
    dialog(fixture).onFilterChange({ locationId: 'BLR', batchId: '103', lgId: '1004' });
    fixture.detectChanges();
    expect(button(fixture, '.step-actions .btn-secondary').disabled).toBe(true);

    chooseGroup(fixture);
    expect(button(fixture, '.step-actions .btn-secondary').disabled).toBe(false);
    // Reading a file needs no assessment, so it opens as soon as the group is there.
    expect(button(fixture, '.step-actions .btn-primary').disabled).toBe(false);
  });

  it('downloads the sheet for the tab on screen, with one column per assessment', () => {
    const fixture = createFixture();
    chooseGroup(fixture);

    button(fixture, '.step-actions .btn-secondary').click();

    const request = http.expectOne((candidate) => candidate.url === `${BASE}/template`);
    expect(request.request.params.get('status')).toBe('regular');
    expect(request.request.params.get('batchId')).toBe('103');
    expect(request.request.params.getAll('examIds')).toEqual(['1']);
    request.flush('Emp ID,Name\n41201,Aarav Nair', {
      headers: { 'Content-Disposition': 'attachment; filename="trainee-status-template.csv"' },
    });

    expect(download).toHaveBeenCalledWith(
      'trainee-status-template.csv',
      'Emp ID,Name\n41201,Aarav Nair',
      expect.stringContaining('text/csv'),
    );
  });

  it('offers every tab the page does, and downloads the one that is picked', () => {
    const fixture = createFixture();
    chooseGroup(fixture);

    dialog(fixture).onStatusChange('other');
    fixture.detectChanges();
    button(fixture, '.step-actions .btn-secondary').click();

    const request = http.expectOne((candidate) => candidate.url === `${BASE}/template`);
    expect(request.request.params.get('status')).toBe('other');
    request.flush('');
  });

  it('judges the sheet and shows what will be applied and what will not', async () => {
    const fixture = createFixture();
    chooseGroup(fixture);

    await upload(
      fixture,
      csv([
        row('41201', 'lap', '2026-06-01', 'Needs more than remedial.'),
        row('41202', 'remedial', '2026-06-01', 'Typed again by mistake.'),
        row('41201', '', '', ''),
      ]),
    );

    const summary = Array.from(host(fixture).querySelectorAll('.summary li')).map((item) =>
      item.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(summary).toEqual([
      '3 rows with something in them',
      '1 ready to apply',
      '1 with errors',
      '1 left alone',
    ]);

    // The row that will be applied, the row that will not, and the detailed reason.
    expect(host(fixture).querySelectorAll('.preview-table tbody tr').length).toBe(3);
    expect(host(fixture).querySelectorAll('.issue--ok').length).toBe(1);
    expect(host(fixture).querySelector('.issue--error')?.textContent).toContain(
      '41202 already holds Remedial.',
    );
    expect(host(fixture).textContent).toContain('No change — left as it is');
  });

  it('applies only the rows that passed and reports what changed', async () => {
    const fixture = createFixture();
    chooseGroup(fixture);

    await upload(
      fixture,
      csv([
        row('41201', 'lap', '2026-06-01', 'Needs more than remedial.'),
        row('41999', 'lap', '2026-06-01', 'Not in this group.'),
      ]),
    );

    button(fixture, '.modal-footer .btn-primary').click();

    const request = http.expectOne(BASE);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      locationId: 'BLR',
      batchId: 103,
      lgId: 1004,
      rows: [
        {
          employeeId: '41201',
          status: 'lap',
          remark: 'Needs more than remedial.',
          effectiveDate: '2026-06-01',
        },
      ],
    });
    request.flush({ updated: 1 });
    fixture.detectChanges();

    expect(host(fixture).textContent).toContain('1 status updated');
    expect(toastMessages()).toContain('1 status updated');
    expect(fixture.componentInstance.saves).toHaveLength(1);
    expect(fixture.componentInstance.saves[0]).toEqual({
      count: 1,
      filter: FILTER,
      status: 'regular',
    });
  });

  it('leaves the date to the server when the sheet left it blank', async () => {
    const fixture = createFixture();
    chooseGroup(fixture);

    await upload(fixture, csv([row('41201', 'lap', '', 'Needs more than remedial.')]));
    expect(host(fixture).textContent).toContain('Ready to apply');

    button(fixture, '.modal-footer .btn-primary').click();

    const request = http.expectOne(BASE);
    const body = request.request.body as { rows: readonly Record<string, unknown>[] };
    expect(body.rows[0]).not.toHaveProperty('effectiveDate');
    request.flush({ updated: 1 });
    fixture.detectChanges();
  });

  it('will not apply an empty sheet', async () => {
    const fixture = createFixture();
    chooseGroup(fixture);

    await upload(fixture, csv([row('41201', '', '', '')]));
    fixture.detectChanges();

    expect(button(fixture, '.modal-footer .btn-primary').disabled).toBe(true);
  });

  it('shows the server’s refusal without leaving the preview', async () => {
    const fixture = createFixture();
    chooseGroup(fixture);
    await upload(fixture, csv([row('41201', 'lap', '2026-06-01', 'Needs more than remedial.')]));

    button(fixture, '.modal-footer .btn-primary').click();
    http
      .expectOne(BASE)
      .flush(
        { message: 'That trainee changed a moment ago.' },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();

    expect(host(fixture).querySelector('.alert--error')?.textContent).toContain(
      'That trainee changed a moment ago.',
    );
    // Still on the preview, so the sheet can be corrected and tried again.
    expect(host(fixture).querySelector('.preview-table')).not.toBeNull();
  });

  it('goes back to the setup step with the group and tab still chosen', async () => {
    const fixture = createFixture();
    chooseGroup(fixture);
    await upload(fixture, csv([row('41201', 'lap', '2026-06-01', 'Needs more than remedial.')]));

    button(fixture, '.modal-footer .btn-secondary').click();
    fixture.detectChanges();

    expect(host(fixture).querySelector('.preview-table')).toBeNull();
    // The group is still chosen: the controls are kept mounted precisely so that the
    // filter bar cannot overwrite the selection with a fresh default on the way back.
    expect(button(fixture, '.step-actions .btn-secondary').disabled).toBe(false);
    expect(dialog(fixture).canUseGroup()).toBe(true);
  });

  it('offers the failed rows as a file to fix the sheet against', async () => {
    const fixture = createFixture();
    chooseGroup(fixture);
    await upload(fixture, csv([row('41999', 'promoted', '', '')]));

    button(fixture, '.btn-link').click();

    const [name, content] = download.mock.calls[0];
    expect(name).toBe('trainee-status-errors.csv');
    expect(content).toContain('41999');
    expect(content).toContain('is not in this group');
  });

  it('refuses a file the portal cannot read, without leaving the setup step', async () => {
    const fixture = createFixture();
    chooseGroup(fixture);

    await upload(fixture, 'not a sheet', [], 'status.pdf');

    expect(host(fixture).querySelector('.alert--error')?.textContent).toContain(
      'is not a CSV or Excel file',
    );
    expect(host(fixture).querySelector('.preview-table')).toBeNull();
  });

  it('reports a sheet the server rejects as unusable', async () => {
    const fixture = createFixture();
    chooseGroup(fixture);

    await upload(fixture, 'Emp ID,Name\r\n41201,Aarav Nair');

    expect(host(fixture).querySelector('.alert--error')?.textContent).toContain('New Status');
  });

  it('dates a row with no date today, which is what the server will do', async () => {
    const fixture = createFixture();
    chooseGroup(fixture);

    await upload(fixture, csv([row('41201', 'lap', '', 'Needs more than remedial.')]));

    expect(dialog(fixture).rows()[0].effectiveDate).toBe(todayIsoDate());
  });

  it('reports a cancelled dialog to the page', () => {
    const fixture = createFixture();

    button(fixture, '.modal-close-btn').click();

    expect(fixture.componentInstance.cancelCount).toBe(1);
  });
});
