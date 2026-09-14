import { Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { reiconChevronDown } from '@ng-icons/reicon';
import {
  injectSelectState,
  NgpSelect,
  NgpSelectDropdown,
  NgpSelectOption,
  NgpSelectPortal,
} from 'ng-primitives/select';

/** A single choice rendered inside the select dropdown. */
export interface SelectOption {
  /** The value bound to the select. Must be unique within `options`. */
  value: string;
  /** The text shown in the trigger and the dropdown. */
  label: string;
}

/**
 * Select — Angular Primitives primitive styled with the minimal white
 * example theme (see `--ngp-*` tokens in `src/styles.css`), using the
 * BizSkill blue as the accent colour in place of the theme's red.
 *
 * ```html
 * <app-select
 *   [options]="options"
 *   [value]="value()"
 *   placeholder="Select a batch"
 *   ariaLabel="Batch"
 *   (valueChange)="value.set($event ?? '')"
 * />
 * ```
 */
@Component({
  selector: 'app-select',
  hostDirectives: [
    {
      directive: NgpSelect,
      inputs: ['ngpSelectValue: value', 'ngpSelectDisabled: disabled'],
      outputs: ['ngpSelectValueChange: valueChange'],
    },
  ],
  host: {
    '[attr.aria-label]': 'ariaLabel() || null',
  },
  imports: [NgIcon, NgpSelectDropdown, NgpSelectOption, NgpSelectPortal],
  providers: [provideIcons({ reiconChevronDown })],
  templateUrl: './select.html',
  styleUrl: './select.css',
})
export class SelectComponent {
  /** Access the underlying select primitive state. */
  protected readonly state = injectSelectState<string>();

  /** The options rendered in the dropdown. */
  readonly options = input<SelectOption[]>([]);

  /** Text shown while no option is selected. */
  readonly placeholder = input('Select…');

  /** The accessible label for the trigger. */
  readonly ariaLabel = input('');

  /** Whether the current value matches a selectable option. */
  protected readonly hasValue = computed(() => {
    const value = this.state().value();
    return value !== undefined && value !== null && value !== '';
  });

  /** The label of the selected option, if the value matches one. */
  protected readonly selectedLabel = computed(() => {
    const value = this.state().value();
    if (value === undefined || value === null) {
      return '';
    }
    return this.options().find((option) => option.value === value)?.label ?? String(value);
  });
}
