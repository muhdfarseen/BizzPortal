import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let toasts: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    toasts = TestBed.inject(ToastService);
  });

  afterEach(() => {
    // Timers are cleared through the service as well, so nothing leaks between
    // specs even if one left a toast up.
    toasts.clear();
    vi.useRealTimers();
  });

  it('starts with nothing showing', () => {
    expect(toasts.toasts()).toEqual([]);
    expect(toasts.count()).toBe(0);
  });

  it('raises each variant with its own tag', () => {
    toasts.success('Saved');
    toasts.error('Failed');
    toasts.warning('Partly saved');
    toasts.info('Heads up');

    expect(toasts.toasts().map((toast) => toast.variant)).toEqual([
      'success',
      'error',
      'warning',
      'info',
    ]);
  });

  it('returns an id that dismiss removes', () => {
    const id = toasts.success('Saved');
    expect(id).toBeGreaterThan(0);

    toasts.dismiss(id);
    expect(toasts.toasts()).toEqual([]);
  });

  it('ignores a blank message rather than showing an empty box', () => {
    expect(toasts.success('   ')).toBe(0);
    expect(toasts.error('')).toBe(0);
    expect(toasts.count()).toBe(0);
  });

  it('trims the message it shows', () => {
    toasts.success('  Saved  ');
    expect(toasts.toasts()[0].message).toBe('Saved');
  });

  it('carries an optional detail line', () => {
    toasts.error('Upload rejected', { detail: 'Two fields need attention.' });
    expect(toasts.toasts()[0].detail).toBe('Two fields need attention.');
  });

  describe('deduplication', () => {
    it('does not stack the same message twice', () => {
      // One user action can fire several failing requests at once; four copies
      // of one sentence reads as a malfunction rather than as feedback.
      const first = toasts.error('Could not reach the server.');
      const second = toasts.error('Could not reach the server.');

      expect(toasts.count()).toBe(1);
      expect(second).toBe(first);
    });

    it('restarts the timer of the toast it reuses', () => {
      toasts.success('Saved');
      vi.advanceTimersByTime(3000);
      expect(toasts.count()).toBe(1);

      toasts.success('Saved');
      // 3s have already passed, so without the restart this would now be gone.
      vi.advanceTimersByTime(3000);
      expect(toasts.count()).toBe(1);

      vi.advanceTimersByTime(1001);
      expect(toasts.count()).toBe(0);
    });

    it('keeps the same text under different variants apart', () => {
      toasts.success('Done');
      toasts.error('Done');
      expect(toasts.count()).toBe(2);
    });
  });

  describe('lifetimes', () => {
    it('dismisses a success on its own', () => {
      toasts.success('Saved');
      expect(toasts.count()).toBe(1);

      vi.advanceTimersByTime(4000);
      expect(toasts.count()).toBe(0);
    });

    it('keeps a failure up longer than a success, because it has to be read', () => {
      toasts.success('Saved');
      toasts.error('Failed');

      vi.advanceTimersByTime(4000);
      expect(toasts.toasts().map((toast) => toast.variant)).toEqual(['error']);

      vi.advanceTimersByTime(4000);
      expect(toasts.count()).toBe(0);
    });

    it('pins a toast when the caller asks for no timeout', () => {
      toasts.error('Something needs your attention', { durationMs: 0 });

      vi.advanceTimersByTime(600000);
      expect(toasts.count()).toBe(1);
    });

    it('honours a caller-supplied lifetime', () => {
      toasts.info('Brief', { durationMs: 1000 });

      vi.advanceTimersByTime(999);
      expect(toasts.count()).toBe(1);

      vi.advanceTimersByTime(1);
      expect(toasts.count()).toBe(0);
    });

    it('stops the timer when a toast is dismissed early', () => {
      const id = toasts.success('Saved');
      toasts.dismiss(id);

      // A timer that was not cancelled would write to the signal again here.
      vi.advanceTimersByTime(10000);
      expect(toasts.count()).toBe(0);
    });

    it('clears everything and cancels every timer', () => {
      toasts.success('One');
      toasts.error('Two');
      toasts.warning('Three');

      toasts.clear();
      expect(toasts.count()).toBe(0);

      vi.advanceTimersByTime(60000);
      expect(toasts.count()).toBe(0);
    });

    it('ignores a dismiss for an id that is not showing', () => {
      toasts.success('Saved');
      toasts.dismiss(9999);
      expect(toasts.count()).toBe(1);
    });
  });

  describe('the on-screen limit', () => {
    it('never shows more than five at once', () => {
      for (let i = 1; i <= 8; i++) {
        toasts.success(`Message ${i}`);
      }
      expect(toasts.count()).toBe(5);
    });

    it('drops the oldest success to make room, keeping the newest', () => {
      for (let i = 1; i <= 6; i++) {
        toasts.success(`Message ${i}`);
      }
      const messages = toasts.toasts().map((toast) => toast.message);

      expect(messages).not.toContain('Message 1');
      expect(messages).toContain('Message 6');
    });

    it('never pushes a failure off the screen to make room for a success', () => {
      toasts.error('Critical');
      toasts.error('Also critical');
      for (let i = 1; i <= 5; i++) {
        toasts.success(`Saved ${i}`);
      }

      expect(toasts.toasts().map((toast) => toast.message)).toContain('Critical');
      expect(toasts.count()).toBe(5);
    });
  });
});
