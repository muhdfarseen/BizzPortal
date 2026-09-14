import {
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { reiconChevronDown, reiconSearchNormal } from '@ng-icons/reicon';
import { NgpPopover, NgpPopoverTrigger } from 'ng-primitives/popover';

/** A single choice inside the picker. */
export interface MultiSelectOption {
  /** The value bound to the selection. Must be unique within `options`. */
  value: string;
  /** The text shown in the list and the trigger summary. */
  label: string;
}

/**
 * Multi-select — a dropdown of checkboxes behind a single trigger, for lists
 * too long to lay out as a grid of them.
 *
 * The trigger stays one line whatever is chosen: it names up to two selections
 * and counts the rest (`Kochi, Trivandrum +3 more`). The panel is a portaled
 * popover, so it clears the dialog it sits in rather than being clipped by it,
 * and it flips above the trigger when the space below is short.
 *
 * Set `searchable` for a list long enough to type into — the search narrows the
 * panel without touching the selection, and the bulk actions act on what is on
 * screen, so "Select all" with a search active chooses every match, not every
 * option.
 *
 * ```html
 * <app-multi-select
 *   [options]="options"
 *   [selected]="selected()"
 *   [searchable]="true"
 *   placeholder="Select batches"
 *   ariaLabel="Assigned batches"
 *   (selectedChange)="selected.set($event)"
 * />
 * ```
 */
@Component({
  selector: 'app-multi-select',
  standalone: true,
  imports: [NgIcon, NgpPopover, NgpPopoverTrigger],
  providers: [provideIcons({ reiconChevronDown, reiconSearchNormal })],
  templateUrl: './multi-select.html',
  styleUrl: './multi-select.css',
})
export class MultiSelectComponent {
  /** Every choice the picker offers. */
  readonly options = input<MultiSelectOption[]>([]);

  /** The values currently chosen, in the order the host keeps them. */
  readonly selected = input<readonly string[]>([]);

  /** Emits the complete new selection whenever it changes. */
  readonly selectedChange = output<readonly string[]>();

  /** Whether the panel opens with a search box. */
  readonly searchable = input(false);

  /** Trigger text while nothing is chosen. */
  readonly placeholder = input('Select…');

  /** Panel text when there is nothing to choose from. */
  readonly emptyMessage = input('No options available');

  /** Accessible name, used by both the trigger and the panel. */
  readonly ariaLabel = input('');

  /** Whether the picker can be opened at all. */
  readonly disabled = input(false);

  /** The search term currently narrowing the list. */
  protected readonly query = signal('');

  /** Whether the panel is on screen. */
  protected readonly open = signal(false);

  /** The panel's search box, once the popover has rendered it. */
  private readonly searchBox = viewChild<ElementRef<HTMLInputElement>>('searchBox');

  constructor() {
    effect(() => {
      // Focus lands on the search box as the panel opens, so typing can start
      // straight away — that is the point of a searchable picker. Deferred a
      // tick because the box is created with the popover, one change-detection
      // pass after the open event fires.
      if (this.open() && this.searchable()) {
        const box = this.searchBox();
        if (box) {
          setTimeout(() => {
            if (this.open()) {
              box.nativeElement.focus();
            }
          });
        }
      }
    });
  }

  /** What the panel lists right now — the search term's matches. */
  protected readonly visibleOptions = computed(() => {
    const term = this.query().trim().toLowerCase();
    if (!term) {
      return this.options();
    }
    return this.options().filter((option) => option.label.toLowerCase().includes(term));
  });

  /**
   * What the trigger says. Two names are usually enough to recognise a
   * selection; past that a count reads better than a truncated list.
   */
  protected readonly summary = computed(() => {
    const selected = this.selected();
    if (selected.length === 0) {
      return this.placeholder();
    }
    const labels = selected.map(
      (value) => this.options().find((option) => option.value === value)?.label ?? value,
    );
    const shown = labels.slice(0, 2).join(', ');
    const rest = labels.length - 2;
    return rest > 0 ? `${shown} +${rest} more` : shown;
  });

  /** Whether anything is chosen, so the trigger can drop its placeholder look. */
  protected readonly hasSelection = computed(() => this.selected().length > 0);

  /** How many of the whole list are chosen, not just the matches on screen. */
  protected readonly countLabel = computed(() => {
    const total = this.options().length;
    if (!total) {
      return '';
    }
    return `${this.selected().length} of ${total} selected`;
  });

  /** Whether a value is currently chosen. */
  protected isSelected(value: string): boolean {
    return this.selected().includes(value);
  }

  /** Adds or removes one value. */
  protected toggle(value: string): void {
    const next = this.isSelected(value)
      ? this.selected().filter((candidate) => candidate !== value)
      : [...this.selected(), value];
    this.selectedChange.emit(next);
  }

  /**
   * Chooses everything on screen. With a search active that is every match and
   * nothing else; with a cleared search it is the whole list.
   */
  protected selectAllVisible(): void {
    const visible = this.visibleOptions().map((option) => option.value);
    this.selectedChange.emit(Array.from(new Set([...this.selected(), ...visible])));
  }

  /** Drops everything on screen, leaving any option the search is hiding alone. */
  protected clearVisible(): void {
    const visible = new Set(this.visibleOptions().map((option) => option.value));
    this.selectedChange.emit(this.selected().filter((value) => !visible.has(value)));
  }

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  /**
   * Tracks the popover's open state so focus can find the search box, and
   * forgets the search when it closes — reopening should start from the full
   * list, not from a term the user no longer remembers typing.
   */
  protected onOpenChange(open: boolean): void {
    this.open.set(open);
    if (!open) {
      this.query.set('');
    }
  }
}
