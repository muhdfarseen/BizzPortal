import { Component, computed, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  reiconCloseCircle,
  reiconDanger,
  reiconInfoCircle,
  reiconTickCircle,
} from '@ng-icons/reicon';
import { Toast, ToastService, ToastVariant } from '../../../core/ui/toast.service';

/** The icon shown for each variant. */
const ICONS: Record<ToastVariant, string> = {
  success: 'reiconTickCircle',
  error: 'reiconCloseCircle',
  warning: 'reiconDanger',
  info: 'reiconInfoCircle',
};

/**
 * Renders the application's toasts.
 *
 * Mounted once, at the root, so a message raised from a dialog sits above that
 * dialog rather than being clipped by it.
 *
 * Accessibility note: there are two live regions rather than one. A single
 * `aria-live="polite"` region would queue an error behind whatever else is being
 * announced, and a single `assertive` one would interrupt the user for every
 * success. Splitting them lets a success be announced when the screen reader is
 * free while a failure interrupts immediately — which is the difference the
 * variant is supposed to make.
 */
@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [NgIcon],
  templateUrl: './toast-container.html',
  styleUrl: './toast-container.css',
  providers: [
    provideIcons({
      reiconTickCircle,
      reiconCloseCircle,
      reiconDanger,
      reiconInfoCircle,
    }),
  ],
})
export class ToastContainerComponent {
  private readonly toasts = inject(ToastService);

  /** Everything except failures: announced when the reader is next free. */
  readonly polite = computed(() =>
    this.toasts.toasts().filter((toast) => toast.variant !== 'error'),
  );

  /** Failures, announced immediately. */
  readonly assertive = computed(() => this.toasts.toasts().filter((t) => t.variant === 'error'));

  /** Whether there is anything to show at all. */
  readonly present = this.toasts.count;

  iconFor(variant: ToastVariant): string {
    return ICONS[variant];
  }

  dismiss(toast: Toast): void {
    this.toasts.dismiss(toast.id);
  }
}
