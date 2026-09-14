import { Injectable, computed, signal } from '@angular/core';

/** The four kinds of message the app raises. */
export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

/** One message being shown. */
export interface Toast {
  /** Stable identity, used to dismiss this one toast. */
  readonly id: number;
  readonly variant: ToastVariant;
  /** The headline. Short, past tense, no trailing full stop. */
  readonly message: string;
  /** Optional second line: a field error, a filename, a count. */
  readonly detail?: string;
  /** How long it stays. `0` means it waits for the user to dismiss it. */
  readonly durationMs: number;
}

/** Options accepted by every `show` shorthand. */
export interface ToastOptions {
  /** A second line of context. */
  detail?: string;
  /**
   * Override the default lifetime in milliseconds. `0` pins the toast until it
   * is dismissed — reserve that for a failure the user must not miss.
   */
  durationMs?: number;
}

/**
 * Default lifetimes, by variant.
 *
 * Successes are confirmations: the user already knows what they did, so four
 * seconds is enough to catch it out of the corner of an eye. Failures have to be
 * *read*, and often acted on, so they stay twice as long. An error the user
 * cannot act on is worse than no error at all, which is the whole reason this
 * exists.
 */
const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 4000,
  info: 4500,
  warning: 6500,
  error: 8000,
};

/**
 * How many toasts may be on screen at once.
 *
 * A loop of failing requests — a broken connection, a batch save where every row
 * fails — would otherwise bury the screen. Beyond this the oldest non-error is
 * dropped, so a queue of successes can never push an error out of sight.
 */
const MAX_VISIBLE = 5;

/**
 * The application's notifications.
 *
 * Screens raise a toast when something they did succeeds, and the HTTP error
 * interceptor raises one when a request fails, so a failure can never pass
 * silently just because a particular component forgot to catch it.
 *
 * State is a signal, so the container re-renders without any component having to
 * hold a reference to the service or unsubscribe from anything.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly items = signal<readonly Toast[]>([]);
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private nextId = 1;

  /** The toasts currently on screen, oldest first. */
  readonly toasts = this.items.asReadonly();

  /** How many are showing. Handy for tests and for a badge. */
  readonly count = computed(() => this.items().length);

  /** Confirms something worked. */
  success(message: string, options?: ToastOptions): number {
    return this.show('success', message, options);
  }

  /** Reports something that failed. */
  error(message: string, options?: ToastOptions): number {
    return this.show('error', message, options);
  }

  /** Reports something that succeeded but with a caveat. */
  warning(message: string, options?: ToastOptions): number {
    return this.show('warning', message, options);
  }

  /** Passes on something neutral. */
  info(message: string, options?: ToastOptions): number {
    return this.show('info', message, options);
  }

  /**
   * Raises a toast and returns its id.
   *
   * Raising the same message twice in a row does not stack two identical toasts:
   * the one already on screen has its timer restarted instead. That matters
   * because a single user action routinely produces several failing requests at
   * once — a dashboard load that fires four queries — and four copies of one
   * sentence reads as a malfunction.
   */
  show(variant: ToastVariant, message: string, options: ToastOptions = {}): number {
    const text = message.trim();
    if (!text) {
      return 0;
    }

    const existing = this.items().find(
      (toast) => toast.variant === variant && toast.message === text,
    );
    if (existing) {
      this.restartTimer(existing.id, existing.durationMs);
      return existing.id;
    }

    const durationMs = options.durationMs ?? DEFAULT_DURATION[variant];
    const toast: Toast = {
      id: this.nextId++,
      variant,
      message: text,
      ...(options.detail ? { detail: options.detail } : {}),
      durationMs,
    };

    this.items.update((current) => this.withRoom(current, toast));
    this.restartTimer(toast.id, durationMs);
    return toast.id;
  }

  /** Removes one toast and cancels its timer. Unknown ids are ignored. */
  dismiss(id: number): void {
    this.clearTimer(id);
    this.items.update((current) => current.filter((toast) => toast.id !== id));
  }

  /** Removes everything. Used when the session ends, so nothing outlives it. */
  clear(): void {
    for (const id of this.timers.keys()) {
      this.clearTimer(id);
    }
    this.items.set([]);
  }

  // ── Internals ───────────────────────────────────────────────────────────

  /**
   * Adds the new toast, dropping the oldest success or info if the screen is
   * full. Errors and warnings are kept: they are the ones worth reading.
   */
  private withRoom(current: readonly Toast[], toast: Toast): readonly Toast[] {
    const next = [...current, toast];
    if (next.length <= MAX_VISIBLE) {
      return next;
    }

    const droppable = next.findIndex(
      (candidate) => candidate.variant === 'success' || candidate.variant === 'info',
    );
    const victim = droppable === -1 ? 0 : droppable;
    this.clearTimer(next[victim].id);
    return next.filter((_, index) => index !== victim);
  }

  private restartTimer(id: number, durationMs: number): void {
    this.clearTimer(id);
    if (durationMs <= 0) {
      return;
    }
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        this.items.update((current) => current.filter((toast) => toast.id !== id));
      }, durationMs),
    );
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}
