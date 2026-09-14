import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToastService } from '../../../core/ui/toast.service';
import { ToastContainerComponent } from './toast-container';

describe('ToastContainerComponent', () => {
  let fixture: ComponentFixture<ToastContainerComponent>;
  let toasts: ToastService;
  let host: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ToastContainerComponent] });
    toasts = TestBed.inject(ToastService);
    fixture = TestBed.createComponent(ToastContainerComponent);
    host = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => toasts.clear());

  /** Re-renders and returns the current DOM. */
  function render(): HTMLElement {
    fixture.detectChanges();
    return host;
  }

  it('renders nothing while there is nothing to say', () => {
    const el = render();

    expect(el.querySelectorAll('.toast')).toHaveLength(0);
    // The regions themselves stay in the DOM: a live region has to exist before
    // the message is inserted for a screen reader to announce it.
    expect(el.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(el.querySelectorAll('[role="alert"]')).toHaveLength(1);
  });

  it('shows the message and the variant class', () => {
    toasts.success('Scores saved');
    const el = render();

    const toast = el.querySelector('.toast');
    expect(toast).not.toBeNull();
    expect(toast?.classList.contains('toast--success')).toBe(true);
    expect(el.querySelector('.toast-message')?.textContent?.trim()).toBe('Scores saved');
  });

  it('shows the optional detail line only when there is one', () => {
    toasts.error('Upload rejected', { detail: 'Two fields need attention.' });
    let el = render();
    expect(el.querySelector('.toast-detail')?.textContent?.trim()).toBe(
      'Two fields need attention.',
    );

    toasts.clear();
    toasts.error('Just the headline');
    el = render();
    expect(el.querySelector('.toast-detail')).toBeNull();
  });

  describe('accessibility', () => {
    it('announces failures assertively and everything else politely', () => {
      toasts.success('Saved');
      toasts.error('Failed');
      const el = render();

      const polite = el.querySelector('[role="status"]');
      const assertive = el.querySelector('[role="alert"]');

      // A success that interrupts, or an error that waits its turn, defeats the
      // point of having two variants.
      expect(polite?.querySelectorAll('.toast--success')).toHaveLength(1);
      expect(polite?.querySelectorAll('.toast--error')).toHaveLength(0);
      expect(assertive?.querySelectorAll('.toast--error')).toHaveLength(1);
      expect(polite?.getAttribute('aria-live')).toBe('polite');
      expect(assertive?.getAttribute('aria-live')).toBe('assertive');
    });

    it('hides the decorative icon from screen readers', () => {
      toasts.success('Saved');
      const el = render();
      expect(el.querySelector('ng-icon')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('names the dismiss button after the message it dismisses', () => {
      toasts.error('Scores could not be saved');
      const el = render();

      const button = el.querySelector('.toast-dismiss');
      expect(button?.getAttribute('aria-label')).toBe('Dismiss: Scores could not be saved');
      expect(button?.textContent?.trim()).toBe('×');
    });
  });

  it('removes the toast when its dismiss button is clicked', () => {
    toasts.error('Scores could not be saved');
    const el = render();
    expect(el.querySelectorAll('.toast')).toHaveLength(1);

    (el.querySelector('.toast-dismiss') as HTMLButtonElement).click();
    const after = render();

    expect(after.querySelectorAll('.toast')).toHaveLength(0);
    expect(toasts.count()).toBe(0);
  });

  it('renders several toasts in the order they were raised', () => {
    toasts.success('First');
    toasts.success('Second');
    const el = render();

    const messages = [...el.querySelectorAll('.toast-message')].map((node) =>
      node.textContent?.trim(),
    );
    expect(messages).toEqual(['First', 'Second']);
  });
});
