import { Component, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AssessmentExam } from '../../core/models/assessment.model';
import { LOCATIONS, LocationGroup, currentQuarter } from '../../core/models/organization.model';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/ui/toast.service';
import { SIGN_IN, signInWith } from '../../testing/api-testing';
import { FilterBarComponent, FilterState } from './filter-bar';

@Component({
  imports: [FilterBarComponent],
  template: `
    <app-filter-bar
      [defaultLocationId]="defaultLocationId()"
      [allowAll]="allowAll()"
      [requireFullSelection]="requireFullSelection()"
      [exams]="exams()"
      (filterChange)="changes.push($event)"
      (search)="searchCount = searchCount + 1"
    />
  `,
})
class TestHostComponent {
  readonly defaultLocationId = signal('');
  readonly allowAll = signal(false);
  readonly requireFullSelection = signal(false);
  readonly exams = signal<readonly AssessmentExam[]>([]);
  readonly changes: FilterState[] = [];
  searchCount = 0;
}

/** The session is stored, so clear it between the scoped and unscoped specs. */
const STORAGE_KEY = 'bizzskill_auth_state';

/**
 * The period the bar opens on, read from the same clock the component reads.
 *
 * Composing the expectation from `currentQuarter()` rather than hardcoding 2026
 * keeps these specs true in every year the suite happens to run in.
 */
const OPENING = currentQuarter();

/**
 * A year and quarter the fixture's batches really start in, for the specs that
 * need a particular batch: the bar opens on the quarter in progress, and the
 * fixture's fixed start dates cannot be relied on to fall inside it.
 */
const FIXTURE_YEAR = '2026';
const FIXTURE_QUARTER = 'Q1';

/** The dropdown is attached on a macrotask, so let it settle. */
async function flushOverlay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('FilterBarComponent', () => {
  let http: HttpTestingController;
  let auth: AuthService;

  beforeEach(async () => {
    localStorage.removeItem(STORAGE_KEY);
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem(STORAGE_KEY);
  });

  /** Signs in through the real login endpoint, flushing login and the org tree. */
  function signIn(employeeId: string): void {
    signInWith(http, auth, employeeId);
  }

  function createFixture() {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    return fixture;
  }

  function hostElement(fixture: ReturnType<typeof createFixture>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function selects(fixture: ReturnType<typeof createFixture>): HTMLElement[] {
    return Array.from(hostElement(fixture).querySelectorAll<HTMLElement>('app-select'));
  }

  /**
   * The filter select carrying this accessible label.
   *
   * Addressed by label, never by position: the bar is laid out to suit the screen,
   * and a spec that counted selects would break on every reorder.
   */
  function select(fixture: ReturnType<typeof createFixture>, label: string): HTMLElement {
    const found = selects(fixture).find(
      (candidate) => candidate.getAttribute('aria-label') === label,
    );
    if (!found) {
      throw new Error(`No filter select labelled "${label}"`);
    }
    return found;
  }

  async function openDropdown(
    fixture: ReturnType<typeof createFixture>,
    label: string,
  ): Promise<HTMLElement[]> {
    select(fixture, label).click();
    await flushOverlay();
    fixture.detectChanges();

    return Array.from(document.querySelectorAll<HTMLElement>('[ngpSelectOption]'));
  }

  function optionLabels(options: HTMLElement[]): (string | undefined)[] {
    return options.map((option) => option.textContent?.trim());
  }

  /**
   * Opens the filter named `filter`, clicks the option carrying this label, and
   * answers every label it offered.
   *
   * Reading the choices and making one in a single pass is not a convenience:
   * clicking an open dropdown closes it, so a spec that opened the same one twice
   * would find nothing left to click.
   */
  async function choose(
    fixture: ReturnType<typeof createFixture>,
    filter: string,
    label: string,
  ): Promise<(string | undefined)[]> {
    const options = await openDropdown(fixture, filter);
    const labels = optionLabels(options);
    options.find((option) => option.textContent?.trim() === label)?.click();
    await flushOverlay();
    fixture.detectChanges();
    return labels;
  }

  /** Chooses the year and then the quarter, the order the bar presents them in. */
  async function choosePeriod(
    fixture: ReturnType<typeof createFixture>,
    year: string,
    quarter: string,
  ): Promise<void> {
    await choose(fixture, 'Year', year);
    await choose(fixture, 'Quarter', quarter);
  }

  it('renders one select per filter level, the year leading', () => {
    const rendered = selects(createFixture());

    expect(rendered.length).toBe(5);
    // The period leads — year, then quarter — because it decides which batches,
    // and so which LGs, the levels after it have to offer.
    expect(rendered.map((element) => element.getAttribute('aria-label'))).toEqual([
      'Year',
      'Quarter',
      'Location',
      'Batch',
      'LG',
    ]);
  });

  it('opens on the quarter in progress, with no every-quarter choice to fall back to', async () => {
    const fixture = createFixture();

    expect(select(fixture, 'Year').querySelector('.select-value')?.textContent).toContain(
      String(OPENING.year),
    );
    expect(select(fixture, 'Quarter').querySelector('.select-value')?.textContent).toContain(
      `Q${OPENING.quarter}`,
    );

    // Four quarters and nothing else: an "All quarters" entry would be a second
    // way to say what one of these already says.
    expect(await choose(fixture, 'Quarter', `Q${OPENING.quarter}`)).toEqual([
      'Q1',
      'Q2',
      'Q3',
      'Q4',
    ]);
  });

  it('offers the years its batches start in, and no every-year choice', async () => {
    signIn(SIGN_IN.programManager);
    const fixture = createFixture();

    const years = await choose(fixture, 'Year', String(OPENING.year));
    const expected = [...new Set([OPENING.year, 2025, 2026])].sort((left, right) => left - right);

    expect(years).toEqual(expected.map(String));
  });

  it('starts with the batch and LG selects disabled and the location select open', () => {
    const fixture = createFixture();
    const location = select(fixture, 'Location');
    const batch = select(fixture, 'Batch');
    const lg = select(fixture, 'LG');

    expect(location.hasAttribute('data-disabled')).toBe(false);
    expect(batch.hasAttribute('data-disabled')).toBe(true);
    expect(lg.hasAttribute('data-disabled')).toBe(true);
    expect(batch.querySelector('.select-placeholder')?.textContent).toContain(
      'Select Location first',
    );
  });

  it('emits the location and enables the batch select once one is chosen', async () => {
    signIn(SIGN_IN.programManager);
    const fixture = createFixture();
    const host = fixture.componentInstance;

    await choose(fixture, 'Location', 'Bangalore');

    const location = select(fixture, 'Location');
    const batch = select(fixture, 'Batch');

    expect(location.querySelector('.select-value')?.textContent).toContain('Bangalore');
    expect(batch.hasAttribute('data-disabled')).toBe(false);
    expect(host.changes.at(-1)?.locationId).toBe('BLR');
  });

  it('offers batches from every location when a location is not required', async () => {
    signIn(SIGN_IN.programManager);
    const fixture = createFixture();

    fixture.componentInstance.allowAll.set(true);
    fixture.detectChanges();
    await choosePeriod(fixture, FIXTURE_YEAR, FIXTURE_QUARTER);

    // No location chosen, so the list is every reachable location's batches.
    // No location chosen, so every reachable location's Q1 batches are on offer,
    // each named with its location: the names alone would repeat.
    const labels = await choose(fixture, 'Batch', 'Kochi · Batch 01');

    expect(labels).toEqual([
      'All',
      'Chennai · Batch 01',
      'Kochi · Batch 01',
      'Kochi · Batch 02',
      'Trivandrum · Batch 01',
    ]);
  });

  it('offers All at every organisation level, so a narrowed filter is not a one-way door', async () => {
    signIn(SIGN_IN.programManager);
    const fixture = createFixture();

    fixture.componentInstance.allowAll.set(true);
    fixture.detectChanges();
    await choosePeriod(fixture, FIXTURE_YEAR, FIXTURE_QUARTER);

    expect(await choose(fixture, 'Location', 'Kochi')).toContain('All');
    expect(await choose(fixture, 'Batch', 'Batch 01')).toContain('All');
    expect(optionLabels(await openDropdown(fixture, 'LG'))).toContain('All');
  });

  it('returns to the whole organisation when All is chosen again', async () => {
    signIn(SIGN_IN.programManager);
    const fixture = createFixture();
    const host = fixture.componentInstance;

    host.allowAll.set(true);
    fixture.detectChanges();

    await choose(fixture, 'Location', 'Bangalore');
    expect(host.changes.at(-1)?.locationId).toBe('BLR');

    // The empty value that means "All" has to be selectable, not merely a
    // placeholder — a placeholder cannot be chosen, which made picking a
    // location a one-way door.
    await choose(fixture, 'Location', 'All');

    expect(host.changes.at(-1)?.locationId).toBeNull();
    expect(select(fixture, 'Location').querySelector('.select-placeholder')?.textContent).toContain(
      'All',
    );
  });

  it('clears the narrower filters when a wider one is set back to All', async () => {
    signIn(SIGN_IN.programManager);
    const fixture = createFixture();
    const host = fixture.componentInstance;

    host.allowAll.set(true);
    fixture.detectChanges();
    await choosePeriod(fixture, FIXTURE_YEAR, FIXTURE_QUARTER);

    await choose(fixture, 'Location', 'Kochi');
    await choose(fixture, 'Batch', 'Batch 01');
    // Read the id back rather than hardcoding it, so this does not break when
    // the fixture's ids change.
    expect(host.changes.at(-1)?.batchId).toBeTruthy();

    // A batch cannot survive its location being widened away.
    await choose(fixture, 'Location', 'All');

    expect(host.changes.at(-1)).toMatchObject({
      locationId: null,
      batchId: null,
      lgId: null,
    });
  });

  describe('the quarter a batch starts in', () => {
    /** Bangalore's batches: Batch 01 began in Q4 2025, Batch 02 in Q3 2026. */
    async function chooseBangalore(fixture: ReturnType<typeof createFixture>): Promise<void> {
      await choose(fixture, 'Location', 'Bangalore');
    }

    it('narrows the batch, and its LGs, to the chosen year, quarter and location', async () => {
      signIn(SIGN_IN.programManager);
      const fixture = createFixture();

      await choosePeriod(fixture, '2025', 'Q4');
      await chooseBangalore(fixture);

      // Bangalore's other batch began in Q3 2026, and every other location's in
      // Q1 2026, so the period and the location between them leave one batch.
      expect(await choose(fixture, 'Batch', 'Batch 01')).toEqual(['Batch 01']);
      expect(optionLabels(await openDropdown(fixture, 'LG'))).toEqual(['LG Alpha', 'LG Beta']);
    });

    it('applies the year and the quarter together', async () => {
      signIn(SIGN_IN.programManager);
      const fixture = createFixture();

      await choosePeriod(fixture, '2025', 'Q4');
      await chooseBangalore(fixture);
      expect(await choose(fixture, 'Batch', 'Batch 01')).toEqual(['Batch 01']);

      // The same quarter one year later holds no batch at all: the two halves of
      // the period are read together, not as alternatives.
      await choose(fixture, 'Year', '2026');
      expect(optionLabels(await openDropdown(fixture, 'Batch'))).toEqual([]);
    });

    it('drops the chosen batch and LG when the period changes underneath them', async () => {
      signIn(SIGN_IN.programManager);
      const fixture = createFixture();
      const host = fixture.componentInstance;

      await choosePeriod(fixture, FIXTURE_YEAR, FIXTURE_QUARTER);
      await choose(fixture, 'Location', 'Kochi');
      await choose(fixture, 'Batch', 'Batch 01');
      await choose(fixture, 'LG', 'LG Alpha');
      expect(host.changes.at(-1)?.lgId).toBe('1001');

      // Kochi's Batch 01 began in Q1 2026, so it cannot survive Q4 being chosen.
      await choose(fixture, 'Quarter', 'Q4');

      expect(host.changes.at(-1)).toMatchObject({ batchId: null, lgId: null });
    });

    it('tells the user, by toast, when their own choice leaves no batch to pick', async () => {
      signIn(SIGN_IN.programManager);
      const fixture = createFixture();
      const toasts = TestBed.inject(ToastService);

      // Nothing has been chosen yet, so nothing is announced: a toast about the
      // opening quarter would greet every visit to the page.
      expect(toasts.toasts()).toEqual([]);

      await choosePeriod(fixture, '2025', 'Q4');
      await chooseBangalore(fixture);
      // Bangalore's Q4 batch is on offer, so there is nothing to explain.
      expect(toasts.toasts()).toEqual([]);

      await choose(fixture, 'Quarter', 'Q2');

      expect(toasts.toasts().map((toast) => toast.variant)).toEqual(['info']);
      expect(toasts.toasts()[0].message).toBe('No batch starts in Q2 2025');
      expect(toasts.toasts()[0].detail).toBe('Choose another quarter, year or location.');
      // An empty dropdown is not left as the only explanation of itself.
      expect(optionLabels(await openDropdown(fixture, 'Batch'))).toEqual([]);
    });

    it('rearranges nothing when a quarter holds no batch', async () => {
      signIn(SIGN_IN.programManager);
      const fixture = createFixture();

      await choosePeriod(fixture, '2025', 'Q4');
      const rows = hostElement(fixture).querySelector<HTMLElement>('.filter-bar')?.children.length;

      // Same change, now with a location whose batches are all outside the
      // period: the bar must keep the shape it had, which an inline note broke by
      // claiming a row of its own.
      await chooseBangalore(fixture);
      await choose(fixture, 'Quarter', 'Q2');

      expect(hostElement(fixture).querySelector('.filter-bar')?.children.length).toBe(rows);
    });

    it('emits the period with the selection, so a screen can narrow its data to it', async () => {
      signIn(SIGN_IN.programManager);
      const fixture = createFixture();
      const host = fixture.componentInstance;

      // The bar opens on the quarter in progress, so even the first state it reports
      // is narrowed to a period.
      expect(host.changes[0]).toMatchObject({
        year: OPENING.year,
        quarter: OPENING.quarter,
      });

      await choosePeriod(fixture, '2025', 'Q4');

      // A screen showing an unscoped "All batches" reads these to ask for the
      // quarter's batches; without them it can only ask for every batch there is.
      expect(host.changes.at(-1)).toMatchObject({ year: 2025, quarter: 4 });
    });
  });

  it('does not offer All where the screen requires a full selection', async () => {
    signIn(SIGN_IN.programManager);
    const fixture = createFixture();

    // `allowAll` is off by default: the assessments and LAP / Remedial pages
    // are scoped to one LG and must not be given an organisation-wide choice.
    const options = await openDropdown(fixture, 'Location');

    expect(options.map((option) => option.textContent?.trim())).not.toContain('All');
  });

  it('emits a search when the Search button is clicked', () => {
    const fixture = createFixture();

    (hostElement(fixture).querySelector('.filter-search-btn') as HTMLButtonElement).click();

    expect(fixture.componentInstance.searchCount).toBe(1);
  });

  it('renders a search icon inside the Search button', () => {
    const fixture = createFixture();

    const button = hostElement(fixture).querySelector('.filter-search-btn') as HTMLButtonElement;

    expect(button.querySelector('.filter-search-icon')).not.toBeNull();
    expect(button.querySelector('ng-icon')).not.toBeNull();
    expect(button.textContent).toContain('Search');
  });

  it('closes the exam menu when clicking outside it', () => {
    const fixture = createFixture();
    fixture.componentInstance.exams.set([
      { id: 'pre', name: 'Pre', maxScore: 100 },
      { id: 'mid', name: 'Mid', maxScore: 100 },
    ]);
    fixture.detectChanges();

    const trigger = hostElement(fixture).querySelector<HTMLButtonElement>('.exam-multi-trigger');
    trigger?.click();
    fixture.detectChanges();
    expect(hostElement(fixture).querySelector('.exam-multi-menu')).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(hostElement(fixture).querySelector('.exam-multi-menu')).toBeNull();
  });

  it('keeps the Search button enabled unless a full selection is required', () => {
    const fixture = createFixture();

    const button = hostElement(fixture).querySelector('.filter-search-btn') as HTMLButtonElement;

    expect(button.disabled).toBe(false);
    expect(button.title).toBe('');
  });

  it('disables the Search button until location, batch and LG are chosen', async () => {
    signIn(SIGN_IN.programManager);
    const fixture = createFixture();
    fixture.componentInstance.requireFullSelection.set(true);
    fixture.detectChanges();

    const button = hostElement(fixture).querySelector('.filter-search-btn') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain('location, batch and LG');

    await choosePeriod(fixture, FIXTURE_YEAR, FIXTURE_QUARTER);

    await choose(fixture, 'Location', 'Kochi');
    expect(button.disabled).toBe(true);

    await choose(fixture, 'Batch', 'Batch 01');
    expect(button.disabled).toBe(true);

    await choose(fixture, 'LG', 'LG Beta');

    expect(button.disabled).toBe(false);
    expect(button.title).toBe('');
  });

  it('does not emit a search while the selection is incomplete', () => {
    const fixture = createFixture();
    fixture.componentInstance.requireFullSelection.set(true);
    fixture.detectChanges();

    (hostElement(fixture).querySelector('.filter-search-btn') as HTMLButtonElement).click();

    expect(fixture.componentInstance.searchCount).toBe(0);
  });

  describe('the scope of the signed-in session', () => {
    it('offers an all-location role the whole organisation', async () => {
      signIn(SIGN_IN.programManager); // Priya Raghavan — every location
      const fixture = createFixture();

      expect(optionLabels(await openDropdown(fixture, 'Location'))).toEqual(
        LOCATIONS.map((location) => location.name),
      );
    });

    it('offers a Location Admin only its assigned locations', async () => {
      signIn(SIGN_IN.locationAdmin); // Kochi Location Admin — Kochi only
      const fixture = createFixture();

      expect(await choose(fixture, 'Location', 'Kochi')).toEqual(['Kochi']);

      const kochi = LOCATIONS.find((location) => location.id === 'KOC') as LocationGroup;
      await choosePeriod(fixture, FIXTURE_YEAR, FIXTURE_QUARTER);

      expect(await choose(fixture, 'Batch', 'Batch 01')).toEqual(
        kochi.batches.map((batch) => batch.name),
      );
    });

    it('offers Faculty only its assigned batches, inside its assigned location', async () => {
      signIn(SIGN_IN.faculty); // Divya Sharma — Bangalore, Batch 01 only
      const fixture = createFixture();

      expect(await choose(fixture, 'Location', 'Bangalore')).toEqual(['Bangalore']);

      // The assigned batch began in Q4 2025, so that is the period to look in.
      await choosePeriod(fixture, '2025', 'Q4');
      expect(await choose(fixture, 'Batch', 'Batch 01')).toEqual(['Batch 01']);

      expect(optionLabels(await openDropdown(fixture, 'LG'))).toEqual(['LG Alpha', 'LG Beta']);
    });

    it('ignores a default location that falls outside the assignment', () => {
      signIn(SIGN_IN.locationAdmin); // Kochi only, so Bangalore is out of scope
      const fixture = TestBed.createComponent(TestHostComponent);
      fixture.componentInstance.defaultLocationId.set('BLR');
      fixture.detectChanges();

      const location = select(fixture, 'Location');
      expect(location.querySelector('.select-value')?.textContent).toContain('Kochi');
      expect(fixture.componentInstance.changes.at(-1)?.locationId).toBe('KOC');
    });
  });
});
