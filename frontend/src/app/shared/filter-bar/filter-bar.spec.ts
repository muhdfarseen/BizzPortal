import { Component, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AssessmentExam } from '../../core/models/assessment.model';
import { LOCATIONS, LocationGroup } from '../../core/models/organization.model';
import { AuthService } from '../../core/services/auth.service';
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

  async function openDropdown(
    fixture: ReturnType<typeof createFixture>,
    index: number,
  ): Promise<HTMLElement[]> {
    selects(fixture)[index].click();
    await flushOverlay();
    fixture.detectChanges();

    return Array.from(document.querySelectorAll<HTMLElement>('[ngpSelectOption]'));
  }

  it('renders one select per filter level', () => {
    const rendered = selects(createFixture());

    expect(rendered.length).toBe(3);
    expect(rendered.map((select) => select.getAttribute('aria-label'))).toEqual([
      'Location',
      'Batch',
      'LG',
    ]);
  });

  it('starts with the batch and LG selects disabled and the location select open', () => {
    const [location, batch, lg] = selects(createFixture());

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

    const options = await openDropdown(fixture, 0);
    options.find((option) => option.textContent?.trim() === 'Bangalore')?.click();
    await flushOverlay();
    fixture.detectChanges();

    const [location, batch] = selects(fixture);
    expect(location.querySelector('.select-value')?.textContent).toContain('Bangalore');
    expect(batch.hasAttribute('data-disabled')).toBe(false);
    expect(host.changes.at(-1)?.locationId).toBe('BLR');
  });

  it('offers every batch when allowAll is enabled', async () => {
    signIn(SIGN_IN.programManager);
    const fixture = createFixture();

    fixture.componentInstance.allowAll.set(true);
    fixture.detectChanges();

    const options = await openDropdown(fixture, 1);
    const labels = options.map((option) => option.textContent?.trim());

    expect(labels).toContain('Batch 01');
    expect(labels).toContain('Batch 02');
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

    const locations = await openDropdown(fixture, 0);
    locations.find((option) => option.textContent?.trim() === 'Bangalore')?.click();
    await flushOverlay();
    fixture.detectChanges();
    expect(button.disabled).toBe(true);

    const batches = await openDropdown(fixture, 1);
    batches.find((option) => option.textContent?.trim() === 'Batch 01')?.click();
    await flushOverlay();
    fixture.detectChanges();
    expect(button.disabled).toBe(true);

    const lgs = await openDropdown(fixture, 2);
    lgs.find((option) => option.textContent?.trim() === 'LG Beta')?.click();
    await flushOverlay();
    fixture.detectChanges();

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
    function optionLabels(options: HTMLElement[]): (string | undefined)[] {
      return options.map((option) => option.textContent?.trim());
    }

    /** Picks the option with this label out of an already-open dropdown. */
    async function choose(
      fixture: ReturnType<typeof createFixture>,
      options: HTMLElement[],
      label: string,
    ): Promise<void> {
      options.find((option) => option.textContent?.trim() === label)?.click();
      await flushOverlay();
      fixture.detectChanges();
    }

    it('offers an all-location role the whole organisation', async () => {
      signIn(SIGN_IN.programManager); // Priya Raghavan — every location
      const fixture = createFixture();

      expect(optionLabels(await openDropdown(fixture, 0))).toEqual(
        LOCATIONS.map((location) => location.name),
      );
    });

    it('offers a Location Admin only its assigned locations', async () => {
      signIn(SIGN_IN.locationAdmin); // Kochi Location Admin — Kochi only
      const fixture = createFixture();

      const locations = await openDropdown(fixture, 0);
      expect(optionLabels(locations)).toEqual(['Kochi']);

      const kochi = LOCATIONS.find((location) => location.id === 'KOC') as LocationGroup;
      await choose(fixture, locations, 'Kochi');

      expect(optionLabels(await openDropdown(fixture, 1))).toEqual(
        kochi.batches.map((batch) => batch.name),
      );
    });

    it('offers Faculty only its assigned batches, inside its assigned location', async () => {
      signIn(SIGN_IN.faculty); // Divya Sharma — Bangalore, Batch 01 only
      const fixture = createFixture();

      const locations = await openDropdown(fixture, 0);
      expect(optionLabels(locations)).toEqual(['Bangalore']);

      await choose(fixture, locations, 'Bangalore');
      const batches = await openDropdown(fixture, 1);
      expect(optionLabels(batches)).toEqual(['Batch 01']);

      await choose(fixture, batches, 'Batch 01');
      expect(optionLabels(await openDropdown(fixture, 2))).toEqual(['LG Alpha', 'LG Beta']);
    });

    it('ignores a default location that falls outside the assignment', () => {
      signIn(SIGN_IN.locationAdmin); // Kochi only, so Bangalore is out of scope
      const fixture = TestBed.createComponent(TestHostComponent);
      fixture.componentInstance.defaultLocationId.set('BLR');
      fixture.detectChanges();

      const [location] = selects(fixture);
      expect(location.querySelector('.select-value')?.textContent).toContain('Kochi');
      expect(fixture.componentInstance.changes.at(-1)?.locationId).toBe('KOC');
    });
  });
});
