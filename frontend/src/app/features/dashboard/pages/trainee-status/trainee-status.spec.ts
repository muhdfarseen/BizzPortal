import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import {
  StatusFilter,
  formatIsoDate,
  todayIsoDate,
} from '../../../../core/models/assessment.model';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/ui/toast.service';
import {
  API_BASE,
  ApiTraineeFixture,
  SIGN_IN,
  flushStartup,
  pageOf,
  signInWith,
  traineeRows,
} from '../../../../testing/api-testing';
import { TraineeStatusUploadDialogComponent } from '../../../../shared/ui/trainee-status-upload-dialog/trainee-status-upload-dialog';
import { TraineeStatusComponent } from './trainee-status';

/** A trainee as the simulated server holds them, status included. */
interface ServerRow extends ApiTraineeFixture {
  status?: string;
  remark?: string;
  startDate?: string;
}

/** The exits the Other tab covers. */
const EXITS = ['discontinued', 'purged', 'resigned'];

/** The tab a status belongs to. */
function tabOf(status: string | undefined): StatusFilter {
  if (!status) {
    return 'regular';
  }
  if (EXITS.includes(status)) {
    return 'other';
  }
  return status as StatusFilter;
}

/** Twelve trainees: one on LAP, one on Remedial, and ten regular. */
function trackedServer(): ServerRow[] {
  return traineeRows(12).map((row) => ({ ...row }));
}

/** The same roster, plus one trainee in each of the three exits. */
function serverWithExits(): ServerRow[] {
  const rows = trackedServer();
  rows[2] = { ...rows[2], status: 'cleared', startDate: '2026-04-01', remark: 'Cleared the post.' };
  rows[3] = {
    ...rows[3],
    status: 'discontinued',
    startDate: '2026-04-02',
    remark: 'Stopped attending.',
  };
  rows[4] = { ...rows[4], status: 'resigned', startDate: '2026-04-03', remark: 'Resigned.' };
  rows[5] = { ...rows[5], status: 'purged', startDate: '2026-04-04', remark: 'Duplicate record.' };
  return rows;
}

/** Twelve untracked trainees: the Regular tab fills its first page. */
function regularServer(): ServerRow[] {
  return traineeRows(12).map(({ employeeId, name, results }) => ({ employeeId, name, results }));
}

/** The dropdown is attached on a macrotask, so let it settle. */
async function flushOverlay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('TraineeStatusComponent', () => {
  let http: HttpTestingController;

  /** The roster the page's queries are answered from, mutated by changes. */
  let server: ServerRow[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TraineeStatusComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    server = trackedServer();
    // Changing a status needs `trainee-status.manage`, which every role holds since
    // migration V5 — but an `all`-scope role is what offers Bangalore / Batch 01 /
    // LG Alpha in the filter bar.
    signInWith(http, TestBed.inject(AuthService), SIGN_IN.superadmin);
  });

  afterEach(() => http.verify());

  function createFixture() {
    const fixture = TestBed.createComponent(TraineeStatusComponent);
    // The exams and the CEFR mapping are read from the API when the page is
    // constructed — before the filter bar first renders, so a full selection
    // leaves Search enabled.
    flushStartup(http);
    fixture.detectChanges();
    return fixture;
  }

  function host(fixture: ReturnType<typeof createFixture>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function searchButton(fixture: ReturnType<typeof createFixture>): HTMLButtonElement {
    return host(fixture).querySelector<HTMLButtonElement>(
      '.filter-search-btn',
    ) as HTMLButtonElement;
  }

  /** Picks the option with the given label from the nth filter dropdown. */
  async function chooseFilter(
    fixture: ReturnType<typeof createFixture>,
    index: number,
    label: string,
  ): Promise<void> {
    host(fixture).querySelectorAll<HTMLElement>('app-select')[index].click();
    await flushOverlay();
    fixture.detectChanges();
    await pickOpenOption(label);
  }

  /** Clicks the option with this label in whichever dropdown is open. */
  async function pickOpenOption(label: string): Promise<void> {
    const option = Array.from(document.querySelectorAll<HTMLElement>('[ngpSelectOption]')).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    if (!option) {
      throw new Error(`No open option labelled "${label}"`);
    }
    option.click();
    await flushOverlay();
  }

  /** Chooses the destination status in the open dialog's picker. */
  async function chooseStatus(
    fixture: ReturnType<typeof createFixture>,
    label: string,
  ): Promise<void> {
    const picker = host(fixture).querySelector<HTMLElement>('[role="dialog"] app-select');
    picker?.click();
    await flushOverlay();
    fixture.detectChanges();
    await pickOpenOption(label);
    fixture.detectChanges();
  }

  /** The rows a query selects, as the API would select them. */
  function matchingRows(params: URLSearchParams): ServerRow[] {
    const tab = params.get('status');
    const search = (params.get('search') ?? '').toLowerCase();
    return server.filter(
      (row) =>
        (tab === null || tabOf(row.status) === tab) &&
        (search === '' ||
          row.name.toLowerCase().includes(search) ||
          row.employeeId.toLowerCase().includes(search)),
    );
  }

  /**
   * Answers the pending roster request from {@link server}, asserting the tab it
   * asked for when one is given.
   */
  function flushTraineesRequest(
    fixture: ReturnType<typeof createFixture>,
    expectedStatus?: string,
  ): URLSearchParams {
    const request = http.expectOne(
      (candidate) => candidate.url === `${API_BASE}/assessments/trainees`,
    );
    const params = new URLSearchParams(request.request.params.toString());
    if (expectedStatus !== undefined) {
      expect(params.get('status')).toBe(expectedStatus);
    }
    const page = Number(params.get('page') ?? '0');
    const size = Number(params.get('size') ?? '25');
    const rows = matchingRows(params);
    request.flush(
      pageOf(rows.slice(page * size, page * size + size), {
        page,
        size,
        totalElements: rows.length,
      }),
    );
    fixture.detectChanges();
    return params;
  }

  /** Applies a confirmed change to the simulated server. */
  function applyChange(
    employeeId: string,
    change: { status: string; remark: string; effectiveDate?: string },
  ): void {
    const row = server.find((candidate) => candidate.employeeId === employeeId);
    if (!row) {
      return;
    }
    if (change.status === 'regular') {
      row.status = undefined;
      row.startDate = undefined;
    } else {
      row.status = change.status;
      row.startDate = change.effectiveDate;
    }
    row.remark = change.remark;
  }

  /** Selects Bangalore / Batch 01 / LG Alpha and searches the tab on screen. */
  async function searchBangalore(
    fixture: ReturnType<typeof createFixture>,
    status = 'regular',
  ): Promise<void> {
    await chooseFilter(fixture, 0, 'Bangalore');
    await chooseFilter(fixture, 1, 'Batch 01');
    await chooseFilter(fixture, 2, 'LG Alpha');
    searchButton(fixture).click();
    fixture.detectChanges();
    flushTraineesRequest(fixture, status);
  }

  /** The tab button with the given label. */
  function tabButton(fixture: ReturnType<typeof createFixture>, label: string): HTMLButtonElement {
    const button = Array.from(
      host(fixture).querySelectorAll<HTMLButtonElement>('.status-tab'),
    ).find((candidate) => candidate.textContent?.trim() === label);
    if (!button) {
      throw new Error(`No status tab labelled "${label}"`);
    }
    return button;
  }

  /** Opens a tab and answers the query it makes for that status. */
  function openTab(fixture: ReturnType<typeof createFixture>, label: string, status: string): void {
    tabButton(fixture, label).click();
    fixture.detectChanges();
    flushTraineesRequest(fixture, status);
  }

  /** Employee ids of the rows on screen. */
  function rowIds(fixture: ReturnType<typeof createFixture>): string[] {
    return Array.from(host(fixture).querySelectorAll('.td-empid')).map(
      (cell) => cell.textContent?.trim() ?? '',
    );
  }

  /** Column headers of the table on screen. */
  function headerLabels(fixture: ReturnType<typeof createFixture>): string[] {
    return Array.from(host(fixture).querySelectorAll('thead th')).map(
      (th) => th.textContent?.trim() ?? '',
    );
  }

  /** Opens the change dialog on the first row and returns the trainee's id. */
  function openDialogOnFirstRow(fixture: ReturnType<typeof createFixture>): string {
    const employeeId = rowIds(fixture)[0];
    host(fixture).querySelector<HTMLButtonElement>('.row-action-text')?.click();
    fixture.detectChanges();
    return employeeId;
  }

  /** Types the reason into the open dialog. */
  function typeRemark(fixture: ReturnType<typeof createFixture>, remark: string): void {
    const textarea = host(fixture).querySelector<HTMLTextAreaElement>(
      '.remark-input',
    ) as HTMLTextAreaElement;
    textarea.value = remark;
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  /** Sets the effective date in the open dialog. */
  function setDialogDate(fixture: ReturnType<typeof createFixture>, iso: string): void {
    const input = host(fixture).querySelector<HTMLInputElement>('.date-input') as HTMLInputElement;
    input.value = iso;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  /** Clicks the dialog's confirm button, applies the change and reloads the tab. */
  function confirmDialog(fixture: ReturnType<typeof createFixture>): void {
    (host(fixture).querySelector('[role="dialog"] .btn-primary') as HTMLButtonElement).click();
    fixture.detectChanges();

    const request = http.expectOne(
      (candidate) => candidate.method === 'PATCH' && candidate.url.endsWith('/trainee-status'),
    );
    const parts = request.request.url.split('/');
    const employeeId = parts[parts.length - 2];
    applyChange(employeeId, request.request.body as { status: string; remark: string });
    request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    // The trainee has left the tab, so the tab is read again from the server.
    flushTraineesRequest(fixture);
  }

  /** The messages currently on the toast stack. */
  function toastMessages(): string[] {
    return TestBed.inject(ToastService)
      .toasts()
      .map((toast) => toast.message);
  }

  it('shows the title, the pre-search guidance and a disabled search button', () => {
    const fixture = createFixture();
    const element = host(fixture);

    expect(element.querySelector('.page-title')?.textContent?.trim()).toBe('Trainee Status');
    expect(element.querySelector('.empty-state')?.textContent).toContain(
      'Select filters to search',
    );
    expect(element.querySelector('app-assessment-table')).toBeNull();
    expect(element.querySelector('.status-tabs')).toBeNull();

    const search = searchButton(fixture);
    expect(search.disabled).toBe(true);
    expect(search.querySelector('.filter-search-icon')).not.toBeNull();
  });

  it('offers the five status tabs in order', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    const tabs = Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('.status-tab'));
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
      'Regular',
      'Remedial',
      'LAP',
      'Cleared',
      'Other',
    ]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
  });

  it('searches each tab as its own server-side query', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    // The server answers the Regular tab with the ten trainees holding no status.
    expect(rowIds(fixture)).toEqual([
      '41203',
      '41204',
      '41205',
      '41206',
      '41207',
      '41208',
      '41209',
      '41210',
      '41211',
      '41212',
    ]);

    openTab(fixture, 'Remedial', 'remedial');
    expect(rowIds(fixture)).toEqual(['41202']);

    openTab(fixture, 'LAP', 'lap');
    expect(rowIds(fixture)).toEqual(['41201']);
  });

  it('gathers the three exits into the one Other tab', async () => {
    server = serverWithExits();
    const fixture = createFixture();
    await searchBangalore(fixture);

    openTab(fixture, 'Cleared', 'cleared');
    expect(rowIds(fixture)).toEqual(['41203']);

    // One tab, three different statuses — which is why this tab needs the column.
    openTab(fixture, 'Other', 'other');
    expect(rowIds(fixture)).toEqual(['41204', '41205', '41206']);
  });

  it('shows which exit a trainee took, only where the tab cannot say', async () => {
    server = serverWithExits();
    const fixture = createFixture();
    await searchBangalore(fixture);

    // Regular: every row is the same, and the tab already says so.
    expect(headerLabels(fixture)).not.toContain('Status');

    openTab(fixture, 'Other', 'other');

    expect(headerLabels(fixture)).toContain('Status');
    expect(
      Array.from(host(fixture).querySelectorAll('.td-status .status-pill')).map((pill) =>
        pill.textContent?.trim(),
      ),
    ).toEqual(['Discontinued', 'Resigned', 'Purged']);
  });

  it('shows the status columns only where a status is held', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    expect(headerLabels(fixture)).toEqual([
      'Emp ID',
      'Name',
      'Pre Assessment',
      'Mid Assessment',
      'Post Assessment',
      'Action',
    ]);

    openTab(fixture, 'Remedial', 'remedial');

    expect(headerLabels(fixture)).toEqual([
      'Emp ID',
      'Name',
      'Pre Assessment',
      'Mid Assessment',
      'Post Assessment',
      'Start Date',
      'Remark',
      'Action',
    ]);
    expect(host(fixture).querySelector('tbody tr .td-remark')?.textContent?.trim()).toBe(
      'Below threshold.',
    );
  });

  it('offers the same single Change status action on every tab', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    const actions = () =>
      Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('.row-action-text')).map(
        (action) => action.textContent?.trim(),
      );

    expect(new Set(actions())).toEqual(new Set(['Change status']));

    openTab(fixture, 'Remedial', 'remedial');
    expect(new Set(actions())).toEqual(new Set(['Change status']));

    openTab(fixture, 'LAP', 'lap');
    expect(new Set(actions())).toEqual(new Set(['Change status']));
  });

  it('treats the row action as the quiet button, not the filled one', async () => {
    // It repeats on every row, so filling it would run a column of primary colour
    // down the table and compete with the page's own actions.
    const fixture = createFixture();
    await searchBangalore(fixture);

    const variants = Array.from(
      host(fixture).querySelectorAll<HTMLButtonElement>('.row-action-text'),
    ).map((action) => action.getAttribute('data-variant'));

    expect(variants.length).toBeGreaterThan(0);
    expect(new Set(variants)).toEqual(new Set(['secondary']));
  });

  it('hints when a tab holds no trainees', async () => {
    server = regularServer();
    const fixture = createFixture();
    await searchBangalore(fixture);

    openTab(fixture, 'Remedial', 'remedial');

    expect(host(fixture).querySelector('app-assessment-table')).toBeNull();
    expect(host(fixture).querySelector('.empty-state')?.textContent?.trim()).toBe(
      'No trainees are on Remedial for this group.',
    );
  });

  it('moves a regular trainee onto Remedial through the one dialog', async () => {
    server = regularServer();
    const fixture = createFixture();
    await searchBangalore(fixture);

    const employeeId = openDialogOnFirstRow(fixture);

    const dialog = host(fixture).querySelector('[role="dialog"]');
    expect(dialog?.querySelector('.modal-title')?.textContent?.trim()).toBe('Change status');
    expect(dialog?.querySelector('.modal-subtitle')?.textContent).toContain(employeeId);
    // Nothing happens until a destination, a date and a reason are all given.
    expect((dialog?.querySelector('.btn-primary') as HTMLButtonElement).disabled).toBe(true);

    await chooseStatus(fixture, 'Remedial');
    typeRemark(fixture, 'Weak pre-assessment score');

    // The date defaults to today, so the common case needs no thought.
    expect((host(fixture).querySelector('.date-input') as HTMLInputElement).value).toBe(
      todayIsoDate(),
    );

    confirmDialog(fixture);

    expect(host(fixture).querySelector('[role="dialog"]')).toBeNull();
    expect(rowIds(fixture)).not.toContain(employeeId);
    expect(toastMessages()).toContain('Moved to Remedial');

    openTab(fixture, 'Remedial', 'remedial');

    expect(rowIds(fixture)).toContain(employeeId);
    expect(host(fixture).querySelector('tbody tr .td-remark')?.textContent?.trim()).toBe(
      'Weak pre-assessment score',
    );
    expect(host(fixture).querySelector('tbody tr .td-start-date')?.textContent?.trim()).toBe(
      formatIsoDate(todayIsoDate()),
    );
  });

  it('records the day the status takes effect, which may be backdated', async () => {
    server = regularServer();
    const fixture = createFixture();
    await searchBangalore(fixture);

    openDialogOnFirstRow(fixture);
    await chooseStatus(fixture, 'Remedial');
    setDialogDate(fixture, '2026-03-04');
    typeRemark(fixture, 'Score reviewed late');
    confirmDialog(fixture);

    openTab(fixture, 'Remedial', 'remedial');

    expect(host(fixture).querySelector('tbody tr .td-start-date')?.textContent?.trim()).toBe(
      '4 Mar 2026',
    );
  });

  it('records an outcome that sticks rather than a closed track', async () => {
    server = regularServer();
    const fixture = createFixture();
    await searchBangalore(fixture);

    openDialogOnFirstRow(fixture);
    await chooseStatus(fixture, 'Cleared');
    typeRemark(fixture, 'Cleared the post-assessment');
    confirmDialog(fixture);

    expect(toastMessages()).toContain('Marked as cleared');

    openTab(fixture, 'Cleared', 'cleared');
    expect(rowIds(fixture)).toHaveLength(1);
  });

  it('moves a trainee from LAP back to Remedial, which the old tabs could not', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    openTab(fixture, 'LAP', 'lap');
    openDialogOnFirstRow(fixture);

    // The picker offers the step back, which a per-tab "Move to LAP" button
    // could never express.
    await chooseStatus(fixture, 'Remedial');
    typeRemark(fixture, 'Stepped back a level');
    confirmDialog(fixture);

    expect(toastMessages()).toContain('Moved to Remedial');

    openTab(fixture, 'Remedial', 'remedial');

    // The trainee who stepped back joins the one who was already there.
    expect(rowIds(fixture)).toEqual(['41201', '41202']);
    expect(host(fixture).querySelector('tbody tr .td-remark')?.textContent?.trim()).toBe(
      'Stepped back a level',
    );
  });

  it('ends a status, returning the trainee to Regular', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    openTab(fixture, 'LAP', 'lap');
    const employeeId = openDialogOnFirstRow(fixture);

    await chooseStatus(fixture, 'Regular');
    typeRemark(fixture, 'No longer needs support');
    confirmDialog(fixture);

    expect(toastMessages()).toContain('Status ended — trainee is regular');

    openTab(fixture, 'Regular', 'regular');

    expect(rowIds(fixture)).toContain(employeeId);
  });

  it('records every exit a trainee can leave by', async () => {
    server = regularServer();
    const fixture = createFixture();
    await searchBangalore(fixture);

    openDialogOnFirstRow(fixture);
    await chooseStatus(fixture, 'Resigned');
    typeRemark(fixture, 'Resigned during training');
    confirmDialog(fixture);

    expect(toastMessages()).toContain('Marked as resigned');

    openTab(fixture, 'Other', 'other');
    expect(rowIds(fixture)).toHaveLength(1);
  });

  it('keeps the trainee on their tab when the dialog is cancelled', async () => {
    server = regularServer();
    const fixture = createFixture();
    await searchBangalore(fixture);
    const employeeId = openDialogOnFirstRow(fixture);

    await chooseStatus(fixture, 'LAP');
    typeRemark(fixture, 'Typed, then abandoned');

    host(fixture).querySelector<HTMLButtonElement>('.btn-secondary')?.click();
    fixture.detectChanges();

    http.expectNone((candidate) => candidate.method === 'PATCH');
    expect(host(fixture).querySelector('[role="dialog"]')).toBeNull();
    expect(rowIds(fixture)[0]).toBe(employeeId);
  });

  it('flags results as stale once the filters change', async () => {
    const fixture = createFixture();
    await searchBangalore(fixture);

    expect(host(fixture).querySelector('.results-notice')).toBeNull();

    await chooseFilter(fixture, 2, 'LG Beta');

    expect(host(fixture).querySelector('.results-notice')?.textContent).toContain(
      'Filters changed',
    );
  });

  describe('bulk status change', () => {
    /** The bulk upload button, which sits beside the page heading. */
    function uploadButton(fixture: ReturnType<typeof createFixture>): HTMLButtonElement | null {
      return host(fixture).querySelector<HTMLButtonElement>('.page-heading .btn-upload');
    }

    function uploadDialog(fixture: ReturnType<typeof createFixture>) {
      return host(fixture).querySelector('app-trainee-status-upload-dialog');
    }

    /**
     * Reports an upload to the page, the way the dialog does when it finishes.
     *
     * Emitted through the output rather than by driving the whole dialog, which
     * `trainee-status-upload-dialog.spec.ts` already covers end to end.
     */
    function reportUpload(
      fixture: ReturnType<typeof createFixture>,
      save: { count: number; filter: Record<string, unknown>; status: string },
    ): void {
      const dialog = fixture.debugElement.query(By.directive(TraineeStatusUploadDialogComponent))
        .componentInstance as TraineeStatusUploadDialogComponent;
      dialog.saved.emit(save as never);
      fixture.detectChanges();
    }

    it('offers the bulk sheet beside the heading, before any search', () => {
      const fixture = createFixture();

      // The dialog carries its own filters, so the entry point does not wait for a
      // search — it is offered as soon as the page is open, beside the page title the
      // way the assessment section offers its own upload.
      const heading = host(fixture).querySelector('.page-heading');
      expect(uploadButton(fixture)).not.toBeNull();
      expect(heading?.querySelector('.page-title')?.textContent).toContain('Trainee Status');
      expect(heading?.querySelector('.btn-upload')?.textContent).toContain('Bulk status change');
      // The tabs still wait for a search; only the button moved up beside the title.
      expect(host(fixture).querySelector('.status-tabs')).toBeNull();
    });

    it('opens and closes the dialog from the page', () => {
      const fixture = createFixture();

      uploadButton(fixture)?.click();
      fixture.detectChanges();
      expect(uploadDialog(fixture)).not.toBeNull();

      // The setup step's Cancel button, which is how a user dismisses it.
      (
        host(fixture).querySelector(
          'app-trainee-status-upload-dialog .modal-footer .btn-secondary',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(uploadDialog(fixture)).toBeNull();
    });

    it('reloads the tab on screen when the sheet covered the group it is showing', async () => {
      const fixture = createFixture();
      await searchBangalore(fixture);

      uploadButton(fixture)?.click();
      fixture.detectChanges();
      applyChange(server[0].employeeId, {
        status: 'lap',
        remark: 'Needs more than remedial.',
        effectiveDate: '2026-06-01',
      });
      reportUpload(fixture, {
        count: 1,
        filter: { locationId: 'BLR', batchId: '103', lgId: '1004', examIds: ['1'] },
        status: 'regular',
      });

      // The trainee has left the tab on screen, so its first page is read again.
      flushTraineesRequest(fixture, 'regular');
      expect(rowIds(fixture)).not.toContain(server[0].employeeId);
      // Left open on its outcome step, which the user reads before closing it. The
      // dialog was not driven that far here, so its Cancel is what closes it.
      expect(uploadDialog(fixture)).not.toBeNull();

      (
        host(fixture).querySelector(
          'app-trainee-status-upload-dialog .modal-footer .btn-secondary',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(uploadDialog(fixture)).toBeNull();
    });

    it('leaves the table alone when the sheet was for another group', async () => {
      const fixture = createFixture();
      await searchBangalore(fixture);
      const before = rowIds(fixture);

      uploadButton(fixture)?.click();
      fixture.detectChanges();
      reportUpload(fixture, {
        count: 3,
        filter: { locationId: 'KOC', batchId: '9', lgId: '99', examIds: ['1'] },
        status: 'remedial',
      });

      // The dialog has its own filter bar, so it may have uploaded for a group the
      // page is not showing. Re-reading then would replace the table with an answer
      // about something else.
      http.expectNone((candidate) => candidate.url === `${API_BASE}/assessments/trainees`);
      expect(rowIds(fixture)).toEqual(before);
      // Still open, because the dialog reports its own outcome.
      expect(uploadDialog(fixture)).not.toBeNull();
    });

    it('leaves the table alone when the sheet was for another tab of the same group', async () => {
      const fixture = createFixture();
      await searchBangalore(fixture);
      const before = rowIds(fixture);

      uploadButton(fixture)?.click();
      fixture.detectChanges();
      reportUpload(fixture, {
        count: 2,
        filter: { locationId: 'BLR', batchId: '103', lgId: '1004', examIds: ['1'] },
        status: 'lap',
      });

      http.expectNone((candidate) => candidate.url === `${API_BASE}/assessments/trainees`);
      expect(rowIds(fixture)).toEqual(before);
    });
  });
});
