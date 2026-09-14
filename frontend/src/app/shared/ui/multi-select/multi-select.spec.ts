import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MultiSelectComponent, MultiSelectOption } from './multi-select';

/** A list long enough to prove the trigger stays one line under load. */
const LOCATION_OPTIONS: MultiSelectOption[] = [
  { value: 'BLR', label: 'Bangalore' },
  { value: 'CHN', label: 'Chennai' },
  { value: 'KOC', label: 'Kochi' },
  { value: 'PUN', label: 'Pune' },
  { value: 'TRV', label: 'Trivandrum' },
  { value: 'HYD', label: 'Hyderabad' },
];

/** Labels qualified the way batches are, so search over them is realistic. */
const BATCH_OPTIONS: MultiSelectOption[] = [
  { value: '101', label: 'Kochi · Batch 01' },
  { value: '102', label: 'Kochi · Batch 02' },
  { value: '201', label: 'Trivandrum · Batch 01' },
  { value: '301', label: 'Bangalore · Batch 01' },
];

@Component({
  imports: [MultiSelectComponent],
  template: `
    <app-multi-select
      [options]="options()"
      [selected]="selected()"
      [searchable]="searchable()"
      [placeholder]="placeholder()"
      [emptyMessage]="emptyMessage()"
      [disabled]="disabled()"
      ariaLabel="Assigned locations"
      (selectedChange)="selected.set($event)"
    />
  `,
})
class TestHostComponent {
  readonly options = signal<MultiSelectOption[]>(LOCATION_OPTIONS);
  readonly selected = signal<readonly string[]>([]);
  readonly searchable = signal(false);
  readonly placeholder = signal('Select locations');
  readonly emptyMessage = signal('No options available');
  readonly disabled = signal(false);
}

type Fixture = ReturnType<typeof createFixture>;

/** The dropdown is attached on a macrotask, so let it settle. */
async function flushOverlay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createFixture() {
  const fixture = TestBed.createComponent(TestHostComponent);
  fixture.detectChanges();
  return fixture;
}

function trigger(fixture: Fixture): HTMLButtonElement {
  return fixture.nativeElement.querySelector('button.multi-select-trigger') as HTMLButtonElement;
}

function triggerText(fixture: Fixture): string {
  return fixture.nativeElement.querySelector('.trigger-text')?.textContent?.trim() ?? '';
}

/** Opens the panel and returns the option rows the portal has rendered. */
async function openPanel(fixture: Fixture): Promise<HTMLElement[]> {
  trigger(fixture).click();
  await flushOverlay();
  fixture.detectChanges();
  return optionRows();
}

/** The panel under test — the last one attached, in case one leaked open. */
function panel(): HTMLElement | null {
  const panels = document.querySelectorAll<HTMLElement>('.multi-select-panel');
  return panels.length ? panels[panels.length - 1] : null;
}

function optionRows(): HTMLElement[] {
  return Array.from(panel()?.querySelectorAll<HTMLElement>('.panel-option') ?? []);
}

function optionLabels(): string[] {
  return optionRows().map((row) => row.textContent?.trim() ?? '');
}

/** Ticks the checkbox of the option with this label, as a user would. */
async function tick(label: string): Promise<void> {
  const row = optionRows().find((candidate) => candidate.textContent?.includes(label));
  row?.querySelector<HTMLInputElement>('input')?.click();
  await flushOverlay();
}

/** The panel's action button with this text. */
function action(label: string): HTMLButtonElement | undefined {
  return Array.from(panel()?.querySelectorAll<HTMLButtonElement>('.panel-action') ?? []).find(
    (button) => button.textContent?.trim() === label,
  );
}

/** Sets the search term the way typing does. */
async function type(term: string): Promise<void> {
  const input = panel()?.querySelector<HTMLInputElement>('.panel-search-input');
  if (!input) {
    throw new Error('The panel has no search box');
  }
  input.value = term;
  input.dispatchEvent(new Event('input'));
  await flushOverlay();
}

/** Closes the panel the way the popover does. */
async function closePanel(fixture: Fixture): Promise<void> {
  trigger(fixture).click();
  await flushOverlay();
  fixture.detectChanges();
}

describe('MultiSelectComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TestHostComponent] }).compileComponents();
  });

  it('shows the placeholder while nothing is chosen', () => {
    const fixture = createFixture();

    expect(triggerText(fixture)).toBe('Select locations');
    expect(trigger(fixture).textContent).toContain('Select locations');
  });

  it('opens the panel with every option behind one trigger', async () => {
    const fixture = createFixture();

    const rows = await openPanel(fixture);

    expect(trigger(fixture).getAttribute('aria-expanded')).toBe('true');
    expect(optionLabels()).toEqual([
      'Bangalore',
      'Chennai',
      'Kochi',
      'Pune',
      'Trivandrum',
      'Hyderabad',
    ]);
    expect(rows.length).toBe(6);
  });

  it('names the panel for the trigger to point at', async () => {
    const fixture = createFixture();

    await openPanel(fixture);

    // The trigger announces aria-haspopup="dialog", so the panel must be one.
    expect(panel()?.getAttribute('role')).toBe('dialog');
    expect(panel()?.getAttribute('aria-label')).toBe('Assigned locations');
    // aria-controls is set by the popover to the overlay it opened.
    expect(trigger(fixture).getAttribute('aria-controls') ?? '').not.toBe('');
  });

  it('ticks an option into the selection and names it on the trigger', async () => {
    const fixture = createFixture();

    await openPanel(fixture);
    await tick('Kochi');
    fixture.detectChanges();

    expect(fixture.componentInstance.selected()).toEqual(['KOC']);
    expect(triggerText(fixture)).toBe('Kochi');
  });

  it('keeps the trigger to one line by counting what no longer fits', async () => {
    const fixture = createFixture();

    await openPanel(fixture);
    await tick('Kochi');
    await tick('Bangalore');
    await tick('Pune');
    fixture.detectChanges();

    expect(fixture.componentInstance.selected()).toEqual(['KOC', 'BLR', 'PUN']);
    expect(triggerText(fixture)).toBe('Kochi, Bangalore +1 more');
  });

  it('marks the chosen rows so the state reads at a glance', async () => {
    const fixture = createFixture();
    fixture.componentInstance.selected.set(['KOC']);
    fixture.detectChanges();

    await openPanel(fixture);

    const checked = optionRows()
      .find((row) => row.textContent?.includes('Kochi'))
      ?.querySelector<HTMLInputElement>('input');
    expect(checked?.checked).toBe(true);
    expect(optionRows().find((row) => row.textContent?.includes('Kochi'))?.className).toContain(
      'is-checked',
    );
    expect(optionRows().find((row) => row.textContent?.includes('Pune'))?.className).not.toContain(
      'is-checked',
    );
  });

  it('unticks one option without touching the others', async () => {
    const fixture = createFixture();
    fixture.componentInstance.selected.set(['KOC', 'BLR']);
    fixture.detectChanges();

    await openPanel(fixture);
    await tick('Kochi');
    fixture.detectChanges();

    expect(fixture.componentInstance.selected()).toEqual(['BLR']);
    expect(triggerText(fixture)).toBe('Bangalore');
  });

  it('offers no search box unless the list is long enough to need one', async () => {
    const fixture = createFixture();

    await openPanel(fixture);

    expect(panel()?.querySelector('.panel-search-input')).toBeNull();
  });

  it('searches the panel without losing the selection it is hiding', async () => {
    const fixture = createFixture();
    fixture.componentInstance.searchable.set(true);
    fixture.componentInstance.selected.set(['KOC']);
    fixture.detectChanges();

    await openPanel(fixture);
    await type('pune');

    expect(optionLabels()).toEqual(['Pune']);
    // Kochi is hidden, not dropped — closing the search brings it back.
    expect(fixture.componentInstance.selected()).toEqual(['KOC']);

    await type('');
    expect(optionLabels()).toContain('Kochi');
  });

  it('matches the search case-insensitively over the whole label', async () => {
    const fixture = createFixture();
    fixture.componentInstance.searchable.set(true);
    fixture.detectChanges();

    await openPanel(fixture);
    await type('KOCHI');

    expect(optionLabels()).toEqual(['Kochi']);
  });

  it('says when a search matches nothing, and keeps the term legible', async () => {
    const fixture = createFixture();
    fixture.componentInstance.searchable.set(true);
    fixture.detectChanges();

    await openPanel(fixture);
    await type('nowhere');

    expect(optionRows()).toEqual([]);
    expect(panel()?.querySelector('.panel-empty')?.textContent).toContain('nowhere');
  });

  it('forgets the search when the panel closes', async () => {
    const fixture = createFixture();
    fixture.componentInstance.searchable.set(true);
    fixture.detectChanges();

    await openPanel(fixture);
    await type('pune');
    await closePanel(fixture);

    await openPanel(fixture);
    expect(optionLabels()).toEqual([
      'Bangalore',
      'Chennai',
      'Kochi',
      'Pune',
      'Trivandrum',
      'Hyderabad',
    ]);
  });

  it('focuses the search box as the panel opens', async () => {
    const fixture = createFixture();
    fixture.componentInstance.searchable.set(true);
    fixture.detectChanges();

    await openPanel(fixture);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.activeElement?.className).toContain('panel-search-input');
  });

  it('chooses everything with Select all, and the count keeps up', async () => {
    const fixture = createFixture();

    await openPanel(fixture);
    action('Select all')?.click();
    await flushOverlay();
    fixture.detectChanges();

    expect(fixture.componentInstance.selected().length).toBe(6);
    expect(panel()?.querySelector('.panel-count')?.textContent).toContain('6 of 6 selected');
    expect(triggerText(fixture)).toBe('Bangalore, Chennai +4 more');
  });

  it('empties the selection with Clear', async () => {
    const fixture = createFixture();
    fixture.componentInstance.selected.set(['KOC', 'BLR']);
    fixture.detectChanges();

    await openPanel(fixture);
    action('Clear')?.click();
    await flushOverlay();
    fixture.detectChanges();

    expect(fixture.componentInstance.selected()).toEqual([]);
    expect(triggerText(fixture)).toBe('Select locations');
  });

  it('reports how many of the list are chosen, not just the matches on screen', async () => {
    const fixture = createFixture();
    fixture.componentInstance.searchable.set(true);
    fixture.componentInstance.selected.set(['KOC']);
    fixture.detectChanges();

    await openPanel(fixture);
    await type('pune');

    expect(panel()?.querySelector('.panel-count')?.textContent).toContain('1 of 6 selected');
  });

  it('refuses to open when the picker is disabled', async () => {
    const fixture = createFixture();
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();

    trigger(fixture).click();
    await flushOverlay();
    fixture.detectChanges();

    expect(panel()).toBeNull();
  });

  it('shows the host’s empty message when there is nothing to choose from', async () => {
    const fixture = createFixture();
    fixture.componentInstance.options.set([]);
    fixture.componentInstance.emptyMessage.set('Select a location to choose its batches.');
    fixture.detectChanges();

    await openPanel(fixture);

    expect(optionRows()).toEqual([]);
    expect(panel()?.querySelector('.panel-empty')?.textContent).toContain(
      'Select a location to choose its batches.',
    );
    // With nothing to choose there is no bulk footer either.
    expect(panel()?.querySelector('.panel-footer')).toBeNull();
  });

  describe('batches — a list qualified with its location', () => {
    function batchFixture(): Fixture {
      const fixture = TestBed.createComponent(TestHostComponent);
      fixture.componentInstance.options.set(BATCH_OPTIONS);
      fixture.componentInstance.searchable.set(true);
      fixture.componentInstance.placeholder.set('Select batches');
      fixture.detectChanges();
      return fixture;
    }

    it('finds a batch by its location, a batch number, or its name', async () => {
      const fixture = batchFixture();

      await openPanel(fixture);
      await type('trivandrum');
      expect(optionLabels()).toEqual(['Trivandrum · Batch 01']);

      await type('batch 01');
      expect(optionLabels()).toEqual([
        'Kochi · Batch 01',
        'Trivandrum · Batch 01',
        'Bangalore · Batch 01',
      ]);

      await type('batch 02');
      expect(optionLabels()).toEqual(['Kochi · Batch 02']);
    });

    it('bulk-selects only the matches a search has narrowed to', async () => {
      const fixture = batchFixture();
      fixture.componentInstance.selected.set(['201']);
      fixture.detectChanges();

      await openPanel(fixture);
      await type('kochi');
      action('Select all')?.click();
      await flushOverlay();
      fixture.detectChanges();

      // The two Kochi batches are added; Trivandrum, hidden by the search,
      // keeps its place in the selection.
      expect(fixture.componentInstance.selected()).toEqual(['201', '101', '102']);
    });

    it('bulk-clears only the matches on screen', async () => {
      const fixture = batchFixture();
      fixture.componentInstance.selected.set(['101', '201']);
      fixture.detectChanges();

      await openPanel(fixture);
      await type('kochi');
      action('Clear')?.click();
      await flushOverlay();
      fixture.detectChanges();

      expect(fixture.componentInstance.selected()).toEqual(['201']);
    });
  });
});
