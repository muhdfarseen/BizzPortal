import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmDialogComponent } from './confirm-dialog';

@Component({
  imports: [ConfirmDialogComponent],
  template: `
    <app-confirm-dialog
      title="Delete assessment"
      [subtitle]="subtitle()"
      message="It is removed from the assessment list."
      confirmLabel="Delete assessment"
      (confirmed)="confirmCount = confirmCount + 1"
      (cancelled)="cancelCount = cancelCount + 1"
    />
  `,
})
class TestHostComponent {
  readonly subtitle = signal('Pre Assessment');
  confirmCount = 0;
  cancelCount = 0;
}

describe('ConfirmDialogComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TestHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
  });

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function dialog(): HTMLElement {
    return host().querySelector<HTMLElement>('[role="alertdialog"]') as HTMLElement;
  }

  function click(selector: string): void {
    host().querySelector<HTMLButtonElement>(selector)?.click();
    fixture.detectChanges();
  }

  it('is an alert dialog, so a screen reader announces it as one', () => {
    expect(dialog()).not.toBeNull();
    expect(dialog().getAttribute('aria-modal')).toBe('true');
  });

  it('names itself from its heading', () => {
    const labelledBy = dialog().getAttribute('aria-labelledby');
    const heading = host().querySelector<HTMLElement>(`#${labelledBy}`);

    expect(heading?.textContent).toContain('Delete assessment');
  });

  it('shows the title, subtitle, message and confirm label it is given', () => {
    expect(host().textContent).toContain('Delete assessment');
    expect(host().textContent).toContain('Pre Assessment');
    expect(host().textContent).toContain('It is removed from the assessment list.');
    expect(host().querySelector('.btn-danger')?.textContent).toContain('Delete assessment');
  });

  it('omits the subtitle when there is none to show', () => {
    fixture.componentInstance.subtitle.set('');
    fixture.detectChanges();

    expect(host().querySelector('.modal-subtitle')).toBeNull();
  });

  it('reports a confirmation', () => {
    click('.btn-danger');

    expect(fixture.componentInstance.confirmCount).toBe(1);
    expect(fixture.componentInstance.cancelCount).toBe(0);
  });

  it('reports a cancellation from Cancel', () => {
    click('.btn-secondary');

    expect(fixture.componentInstance.cancelCount).toBe(1);
    expect(fixture.componentInstance.confirmCount).toBe(0);
  });

  it('reports a cancellation from the close button', () => {
    click('.modal-close-btn');

    expect(fixture.componentInstance.cancelCount).toBe(1);
    expect(fixture.componentInstance.confirmCount).toBe(0);
  });

  it('reports a cancellation when the backdrop is clicked', () => {
    // Clicking away from an irreversible prompt is a "no", not a "yes".
    click('.modal-backdrop');

    expect(fixture.componentInstance.cancelCount).toBe(1);
    expect(fixture.componentInstance.confirmCount).toBe(0);
  });

  it('does not confirm when the click lands inside the dialog', () => {
    click('.modal-dialog');

    expect(fixture.componentInstance.confirmCount).toBe(0);
    expect(fixture.componentInstance.cancelCount).toBe(0);
  });

  it('gives each instance its own heading id', () => {
    const second = TestBed.createComponent(TestHostComponent);
    second.detectChanges();

    const first = host().querySelector<HTMLElement>('.modal-title')?.id;
    const other = (second.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.modal-title',
    )?.id;

    expect(first).toBeTruthy();
    expect(other).toBeTruthy();
    expect(first).not.toBe(other);
  });
});
