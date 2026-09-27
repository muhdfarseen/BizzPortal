import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { expect } from 'vitest';
import { ToastService } from '../core/ui/toast.service';
import { API_BASE, ApiTraineeFixture, flushStartup, pageOf, traineeRows } from './api-testing';

/** A trainee as the simulated server holds them, track included. */
export interface ServerRow extends ApiTraineeFixture {
  status?: string;
  remark?: string;
  startDate?: string;
}

/** Twelve untracked trainees: the initiating tab fills its first page. */
export function untrackedServer(): ServerRow[] {
  return traineeRows(12).map(({ employeeId, name, results }) => ({ employeeId, name, results }));
}

/** Twelve trainees with a lap and a remedial: every track holds somebody. */
export function trackedServer(): ServerRow[] {
  return traineeRows(12).map((row) => ({ ...row }));
}

/** The dropdown is attached on a macrotask, so let it settle. */
export async function flushOverlay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Drives one track page against a simulated server.
 *
 * Both pages are the same screen over different tracks, so both specs run the
 * same gestures through this: pick the filters, search, open a sub-tab, confirm
 * a move. The simulated server answers by the track the page asked for, so a
 * spec can assert which query each sub-tab made rather than only what it drew.
 */
export class TrackPageHarness<T> {
  /** The track state the page's queries are answered from, mutated by moves. */
  server: ServerRow[] = trackedServer();

  constructor(private readonly http: HttpTestingController) {}

  /**
   * A page instance. The component is created before its startup requests are
   * answered: the exams and the CEFR mapping are read from the API as the page is
   * constructed, so they are already in flight by the time this returns.
   */
  createFixture(component: Type<T>): ComponentFixture<T> {
    const fixture = TestBed.createComponent(component);
    flushStartup(this.http);
    fixture.detectChanges();
    return fixture;
  }

  host(fixture: ComponentFixture<T>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  searchButton(fixture: ComponentFixture<T>): HTMLButtonElement {
    return this.host(fixture).querySelector<HTMLButtonElement>(
      '.filter-search-btn',
    ) as HTMLButtonElement;
  }

  /** Picks the option with the given label from the filter dropdown so labelled. */
  async chooseFilter(fixture: ComponentFixture<T>, filter: string, label: string): Promise<void> {
    // Found by label, never by position: the bar is laid out to suit the screen,
    // so an index would break every time a filter is moved or added.
    this.host(fixture).querySelector<HTMLElement>(`app-select[aria-label="${filter}"]`)?.click();
    await flushOverlay();
    fixture.detectChanges();

    const option = Array.from(document.querySelectorAll<HTMLElement>('[ngpSelectOption]')).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    option?.click();
    await flushOverlay();
    fixture.detectChanges();
  }

  /** The track a row is on, with "none" standing for no open track. */
  private trackOf(row: ServerRow): string {
    return row.status ?? 'none';
  }

  /** The rows a query selects, as the API would select them. */
  private matchingRows(params: URLSearchParams): ServerRow[] {
    const status = params.get('status');
    const search = (params.get('search') ?? '').toLowerCase();
    return this.server.filter(
      (row) =>
        (status === null || this.trackOf(row) === status) &&
        (search === '' ||
          row.name.toLowerCase().includes(search) ||
          row.employeeId.toLowerCase().includes(search)),
    );
  }

  /**
   * Answers the pending roster request from the simulated server, asserting the
   * track it asked for when one is given.
   */
  flushTraineesRequest(fixture: ComponentFixture<T>, expectedStatus?: string): URLSearchParams {
    const request = this.http.expectOne(
      (candidate) => candidate.url === `${API_BASE}/assessments/trainees`,
    );
    const params = new URLSearchParams(request.request.params.toString());
    if (expectedStatus !== undefined) {
      expect(params.get('status')).toBe(expectedStatus);
    }
    const page = Number(params.get('page') ?? '0');
    const size = Number(params.get('size') ?? '25');
    const rows = this.matchingRows(params);
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

  /** Applies a confirmed move to the simulated server. */
  private applyMove(
    employeeId: string,
    change: { status: string; remark: string; startDate?: string; closeDate?: string },
  ): void {
    const row = this.server.find((candidate) => candidate.employeeId === employeeId);
    if (!row) {
      return;
    }
    row.status = change.status === 'none' ? undefined : change.status;
    row.remark = change.remark;
    if (change.status === 'none') {
      row.startDate = undefined;
    } else {
      row.startDate = change.startDate;
    }
  }

  /**
   * Puts the first `count` trainees onto a track, without driving the UI.
   *
   * Some pages cannot reach a track through their own tabs — the LAP page only
   * ever queries Remedial and LAP, so a spec that needs a track already closed
   * seeds it here rather than walking there first.
   */
  seedTrack(status: string, count = 1, startDate = '2026-03-02'): void {
    this.server.slice(0, count).forEach((row) => {
      row.status = status;
      row.startDate = startDate;
      row.remark = status === 'lap' ? 'No improvement.' : 'Below threshold.';
    });
  }

  /**
   * Selects Q4 2025, Bangalore / Batch 01 / LG Alpha and searches the tab on
   * screen. The period is named because the bar opens on the quarter in progress,
   * which holds none of the fixture's batches.
   */
  async searchBangalore(fixture: ComponentFixture<T>, status = 'none'): Promise<void> {
    await this.chooseFilter(fixture, 'Year', '2025');
    await this.chooseFilter(fixture, 'Quarter', 'Q4');
    await this.chooseFilter(fixture, 'Location', 'Bangalore');
    await this.chooseFilter(fixture, 'Batch', 'Batch 01');
    await this.chooseFilter(fixture, 'LG', 'LG Alpha');
    this.searchButton(fixture).click();
    fixture.detectChanges();
    this.flushTraineesRequest(fixture, status);
  }

  /** The sub-tab button with the given label. */
  tabButton(fixture: ComponentFixture<T>, label: string): HTMLButtonElement {
    const button = Array.from(
      this.host(fixture).querySelectorAll<HTMLButtonElement>('.track-tab'),
    ).find((candidate) => candidate.textContent?.trim() === label);
    if (!button) {
      throw new Error(`No track tab labelled "${label}"`);
    }
    return button;
  }

  /** Opens a sub-tab and answers the query it makes for that track. */
  openTab(fixture: ComponentFixture<T>, label: string, status: string): void {
    this.tabButton(fixture, label).click();
    fixture.detectChanges();
    this.flushTraineesRequest(fixture, status);
  }

  /** Employee ids of the rows on screen. */
  rowIds(fixture: ComponentFixture<T>): string[] {
    return Array.from(this.host(fixture).querySelectorAll('.td-empid')).map(
      (cell) => cell.textContent?.trim() ?? '',
    );
  }

  /** Column headers of the table on screen. */
  headerLabels(fixture: ComponentFixture<T>): string[] {
    return Array.from(this.host(fixture).querySelectorAll('thead th')).map(
      (th) => th.textContent?.trim() ?? '',
    );
  }

  /** The labels of the row actions offered on the first row on screen. */
  actionLabels(fixture: ComponentFixture<T>): (string | undefined)[] {
    const firstRow = this.host(fixture).querySelector('tbody tr');
    return Array.from(firstRow?.querySelectorAll<HTMLButtonElement>('.row-action-text') ?? []).map(
      (action) => action.textContent?.trim(),
    );
  }

  /** Confirms the open track-change dialog with the given remark, then reloads the tab. */
  confirmDialog(fixture: ComponentFixture<T>, remark: string): void {
    const element = this.host(fixture);
    const textarea = element.querySelector<HTMLTextAreaElement>(
      '.remark-input',
    ) as HTMLTextAreaElement;
    textarea.value = remark;
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (element.querySelector<HTMLButtonElement>('.btn-primary') as HTMLButtonElement).click();
    fixture.detectChanges();

    const request = this.http.expectOne(
      (candidate) =>
        candidate.method === 'PATCH' &&
        candidate.url.startsWith(`${API_BASE}/assessments/trainees/`) &&
        candidate.url.endsWith('/lap-remedial'),
    );
    const parts = request.request.url.split('/');
    const employeeId = parts[parts.length - 2];
    this.applyMove(employeeId, request.request.body as { status: string; remark: string });
    request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    // The trainee has left the tab, so the tab is read again from the server.
    this.flushTraineesRequest(fixture);
  }

  /** Sets the date of the open track-change dialog. */
  setDialogDate(fixture: ComponentFixture<T>, iso: string): void {
    const input = this.host(fixture).querySelector<HTMLInputElement>('.date-input') as HTMLInputElement;
    input.value = iso;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  /** The date the open dialog shows. */
  dialogDateValue(fixture: ComponentFixture<T>): string {
    return (this.host(fixture).querySelector<HTMLInputElement>('.date-input') as HTMLInputElement)
      .value;
  }

  /** Runs the first row action on screen through its dialog; returns the trainee's id. */
  runFirstAction(fixture: ComponentFixture<T>, remark: string): string {
    const employeeId = this.rowIds(fixture)[0];
    this.host(fixture).querySelector<HTMLButtonElement>('.row-action-text')?.click();
    fixture.detectChanges();
    this.confirmDialog(fixture, remark);
    return employeeId;
  }

  /** The messages currently on the toast stack. */
  toastMessages(): string[] {
    return TestBed.inject(ToastService)
      .toasts()
      .map((toast) => toast.message);
  }
}
