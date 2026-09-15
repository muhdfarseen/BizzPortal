import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  AssessmentExam,
  TraineeAssessment,
  cefrBadge,
  cefrColor,
  todayIsoDate,
} from '../../../core/models/assessment.model';
import { CefrMappingService } from '../../../core/services/cefr-mapping.service';
import { flushStartup } from '../../../testing/api-testing';
import { AssessmentEditDialogComponent, AssessmentEditSave } from './assessment-edit-dialog';

const EXAMS: readonly AssessmentExam[] = [
  { id: 'pre', name: 'Pre', maxScore: 100 },
  { id: 'mid', name: 'Mid', maxScore: 100 },
  { id: 'post', name: 'Post', maxScore: 100 },
];

const TRAINEE: TraineeAssessment = {
  employeeId: 'EMP-41207',
  name: 'Meera Nair',
  results: {
    pre: { score: 64, cefr: 'B1', assessedOn: '2026-05-04' },
    mid: { score: 58, cefr: 'B1', assessedOn: null },
  },
};

@Component({
  imports: [AssessmentEditDialogComponent],
  template: `
    <app-assessment-edit-dialog
      [trainee]="trainee()"
      [exams]="exams()"
      (save)="saved.push($event)"
      (cancelled)="cancelledCount = cancelledCount + 1"
    />
  `,
})
class TestHostComponent {
  readonly trainee = signal<TraineeAssessment>(TRAINEE);
  readonly exams = signal<readonly AssessmentExam[]>(EXAMS);
  readonly saved: AssessmentEditSave[] = [];
  cancelledCount = 0;
}

describe('AssessmentEditDialogComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function createFixture() {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    // The dialog reads the CEFR mapping from the API when it is created.
    flushStartup(http);
    fixture.detectChanges();
    return fixture;
  }

  function host(fixture: ReturnType<typeof createFixture>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function examRows(fixture: ReturnType<typeof createFixture>): HTMLElement[] {
    return Array.from(host(fixture).querySelectorAll<HTMLElement>('.exam-row'));
  }

  function scoreInput(fixture: ReturnType<typeof createFixture>, index: number): HTMLInputElement {
    return host(fixture).querySelectorAll<HTMLInputElement>('.score-input')[index];
  }

  function levelPreviews(fixture: ReturnType<typeof createFixture>): string[] {
    return examRows(fixture).map(
      (row) => row.querySelector('.level-preview')?.textContent?.trim() ?? '',
    );
  }

  /** jsdom reports applied colours as `rgb(...)`, not the authored hex. */
  function rgb(hex: string): string {
    const value = hex.replace('#', '');
    const channels = [0, 2, 4].map((offset) =>
      Number.parseInt(value.slice(offset, offset + 2), 16),
    );
    return `rgb(${channels.join(', ')})`;
  }

  function saveButton(fixture: ReturnType<typeof createFixture>): HTMLButtonElement {
    return host(fixture).querySelector<HTMLButtonElement>('.btn-primary') as HTMLButtonElement;
  }

  function typeScore(
    fixture: ReturnType<typeof createFixture>,
    index: number,
    value: string,
  ): void {
    const input = scoreInput(fixture, index);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('renders one editable row per configured exam', () => {
    const fixture = createFixture();
    const rows = examRows(fixture);

    expect(rows.length).toBe(3);
    expect(rows.map((row) => row.querySelector('.exam-name')?.textContent?.trim())).toEqual([
      'Pre',
      'Mid',
      'Post',
    ]);
  });

  it('prefills stored scores and shows the mapped level', () => {
    const fixture = createFixture();

    expect(scoreInput(fixture, 0).value).toBe('64');
    expect(scoreInput(fixture, 1).value).toBe('58');
    expect(scoreInput(fixture, 2).value).toBe('');
    expect(levelPreviews(fixture)).toEqual(['B2', 'B1+', '—']);
  });

  it('maps the level automatically as a score is typed', () => {
    const fixture = createFixture();

    typeScore(fixture, 0, '88');
    expect(levelPreviews(fixture)[0]).toBe('C2');

    typeScore(fixture, 0, '');
    expect(levelPreviews(fixture)[0]).toBe('—');
  });

  it('derives the preview from the configured mapping, colour included', () => {
    const fixture = createFixture();

    // The mapping lives behind the API, so a save round-trips before the rows
    // re-render with the new level.
    const bands = [{ level: 'X1', min: 0, max: 100, color: 'green' }];
    TestBed.inject(CefrMappingService)
      .save(bands)
      .subscribe({ error: () => undefined });
    http.expectOne((request) => request.method === 'PUT').flush(bands);
    fixture.detectChanges();

    expect(levelPreviews(fixture)).toEqual(['X1', 'X1', '—']);

    const preview = examRows(fixture)[0].querySelector<HTMLElement>('.level-preview');
    expect(preview?.style.background).toBe(rgb(cefrBadge(cefrColor('green').accent).background));
    expect(preview?.style.color).toBe(rgb(cefrBadge(cefrColor('green').accent).color));
  });

  it('allows an exam to be left blank, because exams are sat one at a time', () => {
    const fixture = createFixture();

    // `post` has no score yet. That is the normal state for an exam still to
    // come, so it is not an error and the user is not asked to fill it in.
    expect(host(fixture).textContent).not.toContain('Enter a score');
    expect(examRows(fixture)[2].querySelector('.field-error')).toBeNull();

    // Nothing has been changed yet, so there is nothing to save.
    expect(saveButton(fixture).disabled).toBe(true);

    // Scoring the one exam just sat is enough on its own.
    typeScore(fixture, 2, '75');
    expect(saveButton(fixture).disabled).toBe(false);
  });

  it('saves a score for a single exam without touching the others', () => {
    const fixture = createFixture();

    typeScore(fixture, 2, '75');

    saveButton(fixture).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.saved).toEqual([
      {
        employeeId: 'EMP-41207',
        // Only `post` is sent: `pre` and `mid` already hold their scores.
        results: { post: { score: 75, cefr: 'B2+', assessedOn: todayIsoDate() } },
      },
    ]);
  });

  it('emits only the exams that changed, leaving untouched ones alone', () => {
    const fixture = createFixture();

    typeScore(fixture, 0, '92');
    typeScore(fixture, 2, '75');

    expect(saveButton(fixture).disabled).toBe(false);
    saveButton(fixture).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.saved.length).toBe(1);
    // `mid` still holds its stored 58 and was never touched, so re-sending it
    // would only add a do-nothing row to the audit trail.
    expect(fixture.componentInstance.saved[0]).toEqual({
      employeeId: 'EMP-41207',
      results: {
        pre: { score: 92, cefr: 'C2', assessedOn: todayIsoDate() },
        post: { score: 75, cefr: 'B2+', assessedOn: todayIsoDate() },
      },
    });
  });

  it('clears a stored score when its field is emptied', () => {
    const fixture = createFixture();

    // `pre` holds 64; emptying it is a deliberate clear, not "not sat yet".
    typeScore(fixture, 0, '');

    expect(saveButton(fixture).disabled).toBe(false);
    saveButton(fixture).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.saved[0].results).toEqual({ pre: undefined });
  });

  it('ignores an exam that was already blank and is left blank', () => {
    const fixture = createFixture();

    // `post` is empty and stays empty: nothing to send for it.
    typeScore(fixture, 0, '92');
    saveButton(fixture).click();
    fixture.detectChanges();

    expect(Object.keys(fixture.componentInstance.saved[0].results)).toEqual(['pre']);
  });

  it('re-enables saving when a change is undone', () => {
    const fixture = createFixture();

    typeScore(fixture, 0, '92');
    expect(saveButton(fixture).disabled).toBe(false);

    // Put the stored value back; there is nothing left to save.
    typeScore(fixture, 0, '64');
    expect(saveButton(fixture).disabled).toBe(true);
  });

  it('rejects a score above the exam maximum', () => {
    const fixture = createFixture();

    typeScore(fixture, 0, '120');

    expect(host(fixture).textContent).toContain('Whole numbers between 0 and 100');
    expect(saveButton(fixture).disabled).toBe(true);

    saveButton(fixture).click();
    expect(fixture.componentInstance.saved.length).toBe(0);
  });

  it('rejects a fractional score', () => {
    const fixture = createFixture();

    typeScore(fixture, 1, '61.5');

    expect(saveButton(fixture).disabled).toBe(true);
  });

  it('emits cancelled from the cancel button', () => {
    const fixture = createFixture();

    host(fixture).querySelector<HTMLButtonElement>('.btn-secondary')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.cancelledCount).toBe(1);
    expect(fixture.componentInstance.saved.length).toBe(0);
  });

  it('emits cancelled when Escape is pressed', () => {
    const fixture = createFixture();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(fixture.componentInstance.cancelledCount).toBe(1);
  });

  it('adds a row when the configuration gains an exam', () => {
    const fixture = createFixture();
    fixture.componentInstance.exams.set([...EXAMS, { id: 'final', name: 'Final', maxScore: 50 }]);
    fixture.detectChanges();

    const rows = examRows(fixture);
    expect(rows.length).toBe(4);
    expect(rows[3].querySelector('.exam-name')?.textContent?.trim()).toBe('Final');
  });
});
