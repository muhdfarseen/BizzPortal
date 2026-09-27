import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TraineeAssessment, todayIsoDate } from '../../../core/models/assessment.model';
import {
  LapRemedialChange,
  LapRemedialChangeRequest,
  LapRemedialDialogComponent,
} from './lap-remedial-dialog';

const TRAINEE: TraineeAssessment = {
  employeeId: 'EMP-41207',
  name: 'Aarav Nair',
  results: {},
};

const REQUEST: LapRemedialChangeRequest = {
  trainee: TRAINEE,
  status: 'remedial',
  title: 'Initiate Remedial',
};

@Component({
  imports: [LapRemedialDialogComponent],
  template: `
    <app-lap-remedial-dialog
      [request]="request()"
      (confirm)="confirmed.push($event)"
      (cancelled)="cancelled = true"
    />
  `,
})
class TestHostComponent {
  readonly request = signal<LapRemedialChangeRequest>(REQUEST);
  readonly confirmed: LapRemedialChange[] = [];
  cancelled = false;
}

describe('LapRemedialDialogComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TestHostComponent] }).compileComponents();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    return fixture;
  }

  function host(fixture: ReturnType<typeof createFixture>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the change, the trainee it applies to and what confirming does', () => {
    const element = host(createFixture());

    expect(element.querySelector('.modal-title')?.textContent?.trim()).toBe('Initiate Remedial');
    expect(element.querySelector('.modal-subtitle')?.textContent).toContain('Aarav Nair');
    expect(element.querySelector('.modal-subtitle')?.textContent).toContain('EMP-41207');
    expect(element.querySelector('.confirm-text')?.textContent).toContain('placed on Remedial');
  });

  it('words the change for every destination track', () => {
    const lap = createFixture();
    lap.componentInstance.request.set({ ...REQUEST, status: 'lap', title: 'Initiate LAP' });
    lap.detectChanges();
    expect(host(lap).querySelector('.confirm-text')?.textContent).toContain('placed on LAP');

    const close = createFixture();
    close.componentInstance.request.set({ ...REQUEST, status: 'none', title: 'Close LAP' });
    close.detectChanges();
    expect(host(close).querySelector('.confirm-text')?.textContent).toContain(
      'completed the lap cycle',
    );
  });

  it('keeps Confirm disabled until a remark is entered, then emits the trimmed change', () => {
    const fixture = createFixture();
    const element = host(fixture);
    const confirmButton = element.querySelector<HTMLButtonElement>(
      '.btn-primary',
    ) as HTMLButtonElement;
    const textarea = element.querySelector<HTMLTextAreaElement>(
      '.remark-input',
    ) as HTMLTextAreaElement;

    expect(confirmButton.textContent?.trim()).toBe('Initiate Remedial');
    expect(confirmButton.disabled).toBe(true);

    textarea.value = '   ';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(confirmButton.disabled).toBe(true);

    textarea.value = '  Weak pre-assessment score  ';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(confirmButton.disabled).toBe(false);

    confirmButton.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.confirmed).toEqual([
      {
        employeeId: 'EMP-41207',
        status: 'remedial',
        remark: 'Weak pre-assessment score',
        startDate: todayIsoDate(),
      },
    ]);
  });

  it('defaults the start date of a move to today and emits a chosen date', () => {
    const fixture = createFixture();
    const element = host(fixture);
    const dateInput = element.querySelector<HTMLInputElement>('.date-input') as HTMLInputElement;

    expect(dateInput.value).toBe(todayIsoDate());

    dateInput.value = '2026-03-04';
    dateInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const textarea = element.querySelector<HTMLTextAreaElement>(
      '.remark-input',
    ) as HTMLTextAreaElement;
    textarea.value = 'Weak pre-assessment score';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (element.querySelector<HTMLButtonElement>('.btn-primary') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.confirmed).toEqual([
      {
        employeeId: 'EMP-41207',
        status: 'remedial',
        remark: 'Weak pre-assessment score',
        startDate: '2026-03-04',
      },
    ]);
  });

  it('keeps Confirm disabled while a move has no start date', () => {
    const fixture = createFixture();
    const element = host(fixture);
    const confirmButton = element.querySelector<HTMLButtonElement>(
      '.btn-primary',
    ) as HTMLButtonElement;
    const dateInput = element.querySelector<HTMLInputElement>('.date-input') as HTMLInputElement;
    const textarea = element.querySelector<HTMLTextAreaElement>(
      '.remark-input',
    ) as HTMLTextAreaElement;

    textarea.value = 'Weak pre-assessment score';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(confirmButton.disabled).toBe(false);

    dateInput.value = '';
    dateInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(confirmButton.disabled).toBe(true);

    confirmButton.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.confirmed).toEqual([]);
  });

  it('asks for a close date with label Close Date when closing a track and emits closeDate', () => {
    const fixture = createFixture();
    fixture.componentInstance.request.set({ ...REQUEST, status: 'none', title: 'Close LAP' });
    fixture.detectChanges();
    const element = host(fixture);

    const dateInput = element.querySelector<HTMLInputElement>('.date-input');
    expect(dateInput).not.toBeNull();
    expect(dateInput?.value).toBe(todayIsoDate());

    const label = element.querySelector('.field-label');
    expect(label?.textContent?.trim()).toBe('Close Date');

    const textarea = element.querySelector<HTMLTextAreaElement>(
      '.remark-input',
    ) as HTMLTextAreaElement;
    textarea.value = 'Track completed';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (element.querySelector<HTMLButtonElement>('.btn-primary') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.confirmed).toEqual([
      {
        employeeId: 'EMP-41207',
        status: 'none',
        remark: 'Track completed',
        closeDate: todayIsoDate(),
      },
    ]);
  });

  it('allows picking a custom close date when closing LAP', () => {
    const fixture = createFixture();
    fixture.componentInstance.request.set({ ...REQUEST, status: 'none', title: 'Close LAP' });
    fixture.detectChanges();
    const element = host(fixture);

    const dateInput = element.querySelector<HTMLInputElement>('.date-input') as HTMLInputElement;
    dateInput.value = '2026-04-10';
    dateInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const textarea = element.querySelector<HTMLTextAreaElement>(
      '.remark-input',
    ) as HTMLTextAreaElement;
    textarea.value = 'Completed early';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (element.querySelector<HTMLButtonElement>('.btn-primary') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.confirmed).toEqual([
      {
        employeeId: 'EMP-41207',
        status: 'none',
        remark: 'Completed early',
        closeDate: '2026-04-10',
      },
    ]);
  });

  it('dismisses without confirming from the Cancel button', () => {
    const fixture = createFixture();
    const element = host(fixture);

    const textarea = element.querySelector<HTMLTextAreaElement>(
      '.remark-input',
    ) as HTMLTextAreaElement;
    textarea.value = 'Typed, then abandoned';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('.btn-secondary')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.cancelled).toBe(true);
    expect(fixture.componentInstance.confirmed).toEqual([]);
  });

  it('dismisses without confirming from the Escape key', () => {
    const fixture = createFixture();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(fixture.componentInstance.cancelled).toBe(true);
    expect(fixture.componentInstance.confirmed).toEqual([]);
  });
});
