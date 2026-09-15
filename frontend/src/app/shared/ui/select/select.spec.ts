import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SelectComponent, SelectOption } from './select';

@Component({
  imports: [SelectComponent],
  template: `
    <app-select
      [options]="options()"
      [value]="value()"
      [placeholder]="placeholder()"
      [disabled]="disabled()"
      ariaLabel="Location"
      (valueChange)="value.set($event ?? '')"
    />
  `,
})
class TestHostComponent {
  readonly options = signal<SelectOption[]>([
    { value: 'KOC', label: 'Kochi' },
    { value: 'BLR', label: 'Bangalore' },
  ]);
  readonly value = signal<string>('');
  readonly placeholder = signal('Select Location');
  readonly disabled = signal(false);
}

/** The dropdown is attached on a macrotask, so let it settle. */
async function flushOverlay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('SelectComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TestHostComponent] }).compileComponents();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    return fixture;
  }

  function triggerFor(fixture: ReturnType<typeof createFixture>): HTMLElement {
    return fixture.nativeElement.querySelector('app-select') as HTMLElement;
  }

  async function openDropdown(fixture: ReturnType<typeof createFixture>): Promise<HTMLElement[]> {
    triggerFor(fixture).click();
    await flushOverlay();
    fixture.detectChanges();

    return Array.from(document.querySelectorAll<HTMLElement>('[ngpSelectOption]'));
  }

  it('renders a combobox trigger with the given accessible label', () => {
    const trigger = triggerFor(createFixture());

    expect(trigger.getAttribute('role')).toBe('combobox');
    expect(trigger.getAttribute('aria-label')).toBe('Location');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the placeholder while no option is selected', () => {
    const fixture = createFixture();

    expect(fixture.nativeElement.querySelector('.select-placeholder')?.textContent).toContain(
      'Select Location',
    );
    expect(fixture.nativeElement.querySelector('.select-value')).toBeNull();
  });

  it('shows the selected option label', () => {
    const fixture = createFixture();

    fixture.componentInstance.value.set('BLR');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.select-value')?.textContent).toContain(
      'Bangalore',
    );
    expect(fixture.nativeElement.querySelector('.select-placeholder')).toBeNull();
  });

  it('marks the trigger as disabled', () => {
    const fixture = createFixture();

    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();

    const trigger = triggerFor(fixture);
    expect(trigger.hasAttribute('data-disabled')).toBe(true);
    expect(trigger.getAttribute('tabindex')).toBe('-1');
  });

  it('opens the dropdown with the available options', async () => {
    const fixture = createFixture();

    const options = await openDropdown(fixture);

    expect(triggerFor(fixture).getAttribute('aria-expanded')).toBe('true');
    expect(options.map((option) => option.textContent?.trim())).toEqual(['Kochi', 'Bangalore']);
  });

  it('emits the option value and updates the trigger when an option is chosen', async () => {
    const fixture = createFixture();

    const options = await openDropdown(fixture);
    options[1].click();
    await flushOverlay();
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('BLR');
    expect(fixture.nativeElement.querySelector('.select-value')?.textContent).toContain(
      'Bangalore',
    );
  });

  it('flags the chosen option with data-selected so the accent can be themed', async () => {
    const fixture = createFixture();

    fixture.componentInstance.value.set('BLR');
    fixture.detectChanges();

    const options = await openDropdown(fixture);

    const selected = document.querySelector<HTMLElement>('[ngpSelectOption][data-selected]');
    expect(selected).not.toBeNull();
    expect(selected?.textContent?.trim()).toBe('Bangalore');
    expect(options[0].hasAttribute('data-selected')).toBe(false);
  });

  it('shows an empty message when there are no options', async () => {
    const fixture = createFixture();

    fixture.componentInstance.options.set([]);
    fixture.detectChanges();

    await openDropdown(fixture);
    fixture.detectChanges();

    expect(document.querySelector('.select-empty')?.textContent).toContain('No options available');
  });

  it('keeps Escape to itself while the dropdown is open', async () => {
    // Every modal in the portal dismisses itself on `document:keydown.escape`.
    // Without this, Escape meant for the dropdown would carry on up and close the
    // modal around it, throwing away whatever the user had typed into that modal.
    const fixture = createFixture();
    const seenAtDocument: KeyboardEvent[] = [];
    const listener = (event: KeyboardEvent) => seenAtDocument.push(event);
    document.addEventListener('keydown', listener);

    try {
      const options = await openDropdown(fixture);
      options[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await flushOverlay();

      expect(seenAtDocument.filter((event) => event.key === 'Escape')).toEqual([]);
    } finally {
      document.removeEventListener('keydown', listener);
    }
  });

  it('keeps Escape to itself when the key is pressed on the trigger', async () => {
    // The real case: the browser leaves focus on the trigger, not in the list, so
    // the key never passes through the dropdown element on its way to the document.
    const fixture = createFixture();
    const seenAtDocument: KeyboardEvent[] = [];
    const listener = (event: KeyboardEvent) => seenAtDocument.push(event);
    document.addEventListener('keydown', listener);

    try {
      await openDropdown(fixture);
      triggerFor(fixture).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      await flushOverlay();

      expect(seenAtDocument.filter((event) => event.key === 'Escape')).toEqual([]);
    } finally {
      document.removeEventListener('keydown', listener);
    }
  });

  it('lets Escape through once the dropdown is closed', async () => {
    // The guard is about the open dropdown, not about Escape in general: a modal
    // must still be dismissible from inside a select that is not showing its list.
    const fixture = createFixture();
    const seenAtDocument: KeyboardEvent[] = [];
    const listener = (event: KeyboardEvent) => seenAtDocument.push(event);
    document.addEventListener('keydown', listener);

    try {
      triggerFor(fixture).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      await flushOverlay();

      expect(seenAtDocument.filter((event) => event.key === 'Escape')).toHaveLength(1);
    } finally {
      document.removeEventListener('keydown', listener);
    }
  });
});
