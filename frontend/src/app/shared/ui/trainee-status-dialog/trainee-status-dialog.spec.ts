import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TraineeAssessment, todayIsoDate } from '../../../core/models/assessment.model';
import {
  TraineeStatusDialogComponent,
  TraineeStatusDialogRequest,
  TraineeStatusSave,
} from './trainee-status-dialog';

/** A trainee on no status, which is the ordinary starting point. */
const REGULAR: TraineeAssessment = {
  employeeId: 'EMP-41207',
  name: 'Aarav Nair',
  results: {},
};

/** The same trainee, now on Remedial. */
const ON_REMEDIAL: TraineeAssessment = { ...REGULAR, status: 'remedial', startDate: '2026-02-02' };

@Component({
  imports: [TraineeStatusDialogComponent],
  template: `
    <app-trainee-status-dialog
      [request]="request()"
      (confirm)="confirmed.push($event)"
      (cancelled)="cancelled = true"
    />
  `,
})
class TestHostComponent {
  readonly request = signal<TraineeStatusDialogRequest>({ trainee: REGULAR });
  readonly confirmed: TraineeStatusSave[] = [];
  cancelled = false;
}

describe('TraineeStatusDialogComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TestHostComponent] }).compileComponents();
  });

  function createFixture(trainee: TraineeAssessment = REGULAR) {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.componentInstance.request.set({ trainee });
    fixture.detectChanges();
    return fixture;
  }

  function host(fixture: ReturnType<typeof createFixture>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function dialog(fixture: ReturnType<typeof createFixture>): TraineeStatusDialogComponent {
    return fixture.debugElement.children[0].componentInstance as TraineeStatusDialogComponent;
  }

  /** Fills the reason in, leaving the dialog open. */
  function typeRemark(fixture: ReturnType<typeof createFixture>, remark: string): void {
    const textarea = host(fixture).querySelector<HTMLTextAreaElement>(
      '.remark-input',
    ) as HTMLTextAreaElement;
    textarea.value = remark;
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function confirmButton(fixture: ReturnType<typeof createFixture>): HTMLButtonElement {
    return host(fixture).querySelector<HTMLButtonElement>('.btn-primary') as HTMLButtonElement;
  }

  /** Fills the dialog in as a user would, then confirms. */
  function confirmWith(
    fixture: ReturnType<typeof createFixture>,
    status: string,
    remark: string,
    date?: string,
  ): void {
    dialog(fixture).onStatusChange(status);

    if (date !== undefined) {
      const input = host(fixture).querySelector<HTMLInputElement>(
        '.date-input',
      ) as HTMLInputElement;
      input.value = date;
      input.dispatchEvent(new Event('input'));
    }

    typeRemark(fixture, remark);
    confirmButton(fixture).click();
    fixture.detectChanges();
  }

  it('names the trainee and the status they hold now', () => {
    const element = host(createFixture(ON_REMEDIAL));

    expect(element.querySelector('.modal-title')?.textContent?.trim()).toBe('Change status');
    expect(element.querySelector('.modal-subtitle')?.textContent).toContain('Aarav Nair');
    expect(element.querySelector('.modal-subtitle')?.textContent).toContain('EMP-41207');
    expect(element.querySelector('.current-status')?.textContent).toContain('Remedial');
  });

  it('reads a trainee holding nothing as Regular', () => {
    expect(host(createFixture()).querySelector('.current-status')?.textContent).toContain(
      'Regular',
    );
  });

  it('offers every status except the one the trainee already holds', () => {
    // Choosing the status they are on would be a change that changes nothing, and
    // the API refuses it — so it is not offered rather than left to fail.
    expect(
      dialog(createFixture(ON_REMEDIAL))
        .statusOptions()
        .map((option) => option.value),
    ).toEqual(['lap', 'cleared', 'discontinued', 'purged', 'resigned', 'regular']);
  });

  it('offers everything, including the ordinary path, to a regular trainee', () => {
    // Nothing to end, so Regular is not on the list.
    expect(
      dialog(createFixture())
        .statusOptions()
        .map((option) => option.value),
    ).toEqual(['remedial', 'lap', 'cleared', 'discontinued', 'purged', 'resigned']);
  });

  it('writes LAP as an acronym in the picker', () => {
    const options = dialog(createFixture()).statusOptions();
    expect(options.find((option) => option.value === 'lap')?.label).toBe('LAP');
    expect(options.find((option) => option.value === 'discontinued')?.label).toBe('Discontinued');
  });

  it('keeps Confirm disabled until a status and a reason are both given', () => {
    const fixture = createFixture();

    expect(confirmButton(fixture).textContent?.trim()).toBe('Change status');
    expect(confirmButton(fixture).disabled).toBe(true);

    // A reason without a destination is not a change.
    typeRemark(fixture, 'Needs support');
    expect(confirmButton(fixture).disabled).toBe(true);

    dialog(fixture).onStatusChange('remedial');
    fixture.detectChanges();
    expect(confirmButton(fixture).disabled).toBe(false);

    // Whitespace is not a reason.
    typeRemark(fixture, '   ');
    expect(confirmButton(fixture).disabled).toBe(true);
  });

  it('emits the chosen status, the trimmed reason and today by default', () => {
    const fixture = createFixture();
    confirmWith(fixture, 'remedial', '  Weak pre-assessment score  ');

    expect(fixture.componentInstance.confirmed).toEqual([
      {
        employeeId: 'EMP-41207',
        status: 'remedial',
        remark: 'Weak pre-assessment score',
        effectiveDate: todayIsoDate(),
      },
    ]);
  });

  it('emits the date the user corrects it to', () => {
    const fixture = createFixture();
    confirmWith(fixture, 'lap', 'Escalated after the mid.', '2026-03-04');

    expect(fixture.componentInstance.confirmed[0]).toMatchObject({
      status: 'lap',
      effectiveDate: '2026-03-04',
    });
  });

  it('sends regular, not a status, when the trainee is to hold none', () => {
    const fixture = createFixture(ON_REMEDIAL);
    confirmWith(fixture, 'regular', 'No longer needs support.');

    expect(fixture.componentInstance.confirmed[0]).toMatchObject({
      status: 'regular',
      remark: 'No longer needs support.',
    });
  });

  it('offers a date capped at today, since a status cannot start tomorrow', () => {
    const input = host(createFixture()).querySelector<HTMLInputElement>('.date-input');
    expect(input?.value).toBe(todayIsoDate());
    expect(input?.getAttribute('max')).toBe(todayIsoDate());
  });

  it('keeps Confirm disabled while the date is empty', () => {
    const fixture = createFixture();
    dialog(fixture).onStatusChange('cleared');
    typeRemark(fixture, 'Completed the cycle');
    expect(confirmButton(fixture).disabled).toBe(false);

    const dateInput = host(fixture).querySelector<HTMLInputElement>(
      '.date-input',
    ) as HTMLInputElement;
    dateInput.value = '';
    dateInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(confirmButton(fixture).disabled).toBe(true);
    confirmButton(fixture).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.confirmed).toEqual([]);
  });

  it('says what confirming will do, in the words of the destination', () => {
    const fixture = createFixture(ON_REMEDIAL);
    const text = () => host(fixture).querySelector('.confirm-text')?.textContent ?? '';

    expect(text()).toContain('Choose the status');

    dialog(fixture).onStatusChange('lap');
    fixture.detectChanges();
    expect(text()).toContain('Aarav Nair will be moved to LAP');

    dialog(fixture).onStatusChange('discontinued');
    fixture.detectChanges();
    expect(text()).toContain('will be moved to Discontinued');

    dialog(fixture).onStatusChange('regular');
    fixture.detectChanges();
    expect(text()).toContain('will hold no status');
  });

  it('dismisses without confirming from the Cancel button', () => {
    const fixture = createFixture();
    dialog(fixture).onStatusChange('cleared');
    typeRemark(fixture, 'Typed, then abandoned');

    host(fixture).querySelector<HTMLButtonElement>('.btn-secondary')?.click();
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
