import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CEFR_COLORS, DEFAULT_CEFR_MAPPING } from '../../../../core/models/assessment.model';
import { AuthService } from '../../../../core/services/auth.service';
import { CefrMappingService } from '../../../../core/services/cefr-mapping.service';
import { ToastService } from '../../../../core/ui/toast.service';
import {
  ACTIVE_EXAMS,
  API_BASE,
  CEFR_BANDS,
  SIGN_IN,
  signInWith,
} from '../../../../testing/api-testing';
import type { ApiAssessmentFixture } from '../../../../testing/api-testing';
import { ConfigurationComponent } from './configuration';

const STORAGE_KEY = 'bizzskill_auth_state';

describe('ConfigurationComponent', () => {
  let fixture: ComponentFixture<ConfigurationComponent>;
  let component: ConfigurationComponent;
  let cefr: CefrMappingService;
  let http: HttpTestingController;
  let auth: AuthService;

  beforeEach(async () => {
    localStorage.removeItem(STORAGE_KEY);
    await TestBed.configureTestingModule({
      imports: [ConfigurationComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    // The route is Super-Admin gated, so the spec signs in the same way the
    // screen's guard would.
    signInWith(http, auth, SIGN_IN.superadmin);

    fixture = TestBed.createComponent(ConfigurationComponent);
    component = fixture.componentInstance;
    cefr = TestBed.inject(CefrMappingService);
    fixture.detectChanges();

    // What the service constructors and `loadAllExams()` ask for on creation.
    http.expectOne(`${API_BASE}/configuration/cefr-mapping`).flush(CEFR_BANDS);
    http.expectOne(`${API_BASE}/configuration/assessments/active`).flush(ACTIVE_EXAMS);
    http.expectOne(`${API_BASE}/configuration/assessments`).flush(ACTIVE_EXAMS);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem(STORAGE_KEY);
  });

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Opens the CEFR Mapping sidebar section. */
  function openMapping(): void {
    const items = host().querySelectorAll<HTMLButtonElement>('.sidebar-item');
    items[1].click();
    fixture.detectChanges();
  }

  function rows(): HTMLElement[] {
    return Array.from(host().querySelectorAll<HTMLElement>('.mapping-row'));
  }

  function levelInput(row: HTMLElement): HTMLInputElement {
    return row.querySelector<HTMLInputElement>('.mapping-input--level') as HTMLInputElement;
  }

  function scoreInputs(row: HTMLElement): HTMLInputElement[] {
    return Array.from(
      row.querySelectorAll<HTMLInputElement>('.mapping-input:not(.mapping-input--level)'),
    );
  }

  function typeInto(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function saveButton(): HTMLButtonElement {
    return host().querySelector<HTMLButtonElement>('.header-actions .btn-add') as HTMLButtonElement;
  }

  /** The shipped mapping with its first band replaced, as the API echoes it. */
  function bandsWithFirst(first: {
    level: string;
    min: number;
    max: number;
    color: string;
  }): { level: string; min: number; max: number; color: string }[] {
    return [first, ...DEFAULT_CEFR_MAPPING.slice(1).map((band) => ({ ...band }))];
  }

  /** Clicks Save and flushes the `PUT` with the bands that were sent. */
  function saveAndFlush(): { level: string; min: number; max: number; color: string }[] {
    saveButton().click();
    fixture.detectChanges();

    const request = http.expectOne({
      method: 'PUT',
      url: `${API_BASE}/configuration/cefr-mapping`,
    });
    const sent = request.request.body as {
      level: string;
      min: number;
      max: number;
      color: string;
    }[];
    request.flush(sent);
    fixture.detectChanges();
    return sent;
  }

  /** Opens the assessment dialog on a new assessment. */
  function openAddAssessment(): void {
    host().querySelector<HTMLButtonElement>('.btn-add')?.click();
    fixture.detectChanges();
  }

  /** Fills the assessment dialog's name and description. */
  function typeAssessmentForm(name: string, description: string): void {
    const panel = host().querySelector<HTMLElement>('.dialog-panel') as HTMLElement;
    const nameInput = panel.querySelector<HTMLInputElement>('.field-input') as HTMLInputElement;
    nameInput.value = name;
    nameInput.dispatchEvent(new Event('input'));
    const descriptionInput = panel.querySelector<HTMLTextAreaElement>(
      '.field-textarea',
    ) as HTMLTextAreaElement;
    descriptionInput.value = description;
    descriptionInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  /** Submits the open assessment dialog. */
  function saveAssessment(): void {
    host().querySelector<HTMLButtonElement>('.dialog-footer .btn-save')?.click();
    fixture.detectChanges();
  }

  /** Flushes the two list reads a create / update / delete triggers. */
  function flushRefreshedLists(
    all: readonly ApiAssessmentFixture[],
    active: readonly ApiAssessmentFixture[] = all,
  ): void {
    http.expectOne(`${API_BASE}/configuration/assessments`).flush(all);
    http.expectOne(`${API_BASE}/configuration/assessments/active`).flush(active);
    fixture.detectChanges();
  }

  /** The messages currently on the toast stack. */
  function toastMessages(): string[] {
    return TestBed.inject(ToastService)
      .toasts()
      .map((toast) => toast.message);
  }

  it('starts on the Assessments section', () => {
    expect(component.activeSidebarItem()).toBe('assessments');
    expect(host().querySelectorAll('.assessment-card').length).toBe(3);
    expect(component.assessments().map((assessment) => assessment.name)).toEqual(
      ACTIVE_EXAMS.map((assessment) => assessment.name),
    );
  });

  it('creates an assessment through the API', () => {
    openAddAssessment();
    typeAssessmentForm('Exit Assessment', 'Final check.');

    saveAssessment();

    const created: ApiAssessmentFixture = {
      id: '4',
      name: 'Exit Assessment',
      description: 'Final check.',
      maxScore: 90,
      sortOrder: 4,
      status: 'active',
    };
    const request = http.expectOne({
      method: 'POST',
      url: `${API_BASE}/configuration/assessments`,
    });
    expect(request.request.body).toEqual({
      name: 'Exit Assessment',
      description: 'Final check.',
      maxScore: 90,
    });
    request.flush(created);

    // A create refreshes both lists the screen reads from.
    flushRefreshedLists([...ACTIVE_EXAMS, created]);

    expect(component.assessments().map((assessment) => assessment.name)).toContain(
      'Exit Assessment',
    );
    expect(host().querySelectorAll('.assessment-card').length).toBe(4);
    expect(toastMessages()).toEqual(['Assessment created']);
  });

  it('does not confirm a creation the API rejected', () => {
    openAddAssessment();
    typeAssessmentForm('Exit Assessment', 'Final check.');
    saveAssessment();

    http
      .expectOne({ method: 'POST', url: `${API_BASE}/configuration/assessments` })
      .flush(
        { status: 409, message: 'An assessment with that name already exists.' },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();

    // The dialog stays open on the text the user typed, and nothing claims
    // the assessment was created.
    expect(host().querySelector('.dialog-panel')).not.toBeNull();
    expect(toastMessages().filter((message) => message === 'Assessment created')).toEqual([]);
  });

  it('updates an assessment through the API', () => {
    const firstCard = host().querySelectorAll<HTMLElement>('.assessment-card')[0];
    firstCard.querySelector<HTMLButtonElement>('.action-btn')?.click();
    fixture.detectChanges();

    typeAssessmentForm('Pre Assessment Updated', 'Baseline, revised.');
    saveAssessment();

    const updated: ApiAssessmentFixture = {
      id: '1',
      name: 'Pre Assessment Updated',
      description: 'Baseline, revised.',
      maxScore: 90,
      sortOrder: 1,
      status: 'active',
    };
    const request = http.expectOne({
      method: 'PUT',
      url: `${API_BASE}/configuration/assessments/1`,
    });
    expect(request.request.body).toEqual({
      name: 'Pre Assessment Updated',
      description: 'Baseline, revised.',
      maxScore: 90,
    });
    request.flush(updated);

    flushRefreshedLists([updated, ...ACTIVE_EXAMS.slice(1)], ACTIVE_EXAMS);

    expect(component.assessments()[0].name).toBe('Pre Assessment Updated');
    expect(toastMessages()).toEqual(['Assessment updated']);
  });

  it('deletes an assessment through the API', () => {
    const firstCard = host().querySelectorAll<HTMLElement>('.assessment-card')[0];
    firstCard.querySelector<HTMLButtonElement>('.action-btn--danger')?.click();
    fixture.detectChanges();

    http
      .expectOne({ method: 'DELETE', url: `${API_BASE}/configuration/assessments/1` })
      .flush(null, { status: 204, statusText: 'No Content' });

    flushRefreshedLists(ACTIVE_EXAMS.slice(1));

    expect(component.assessments().map((assessment) => assessment.id)).toEqual(['2', '3']);
    expect(host().querySelectorAll('.assessment-card').length).toBe(2);
    expect(toastMessages()).toEqual(['Assessment deleted']);
  });

  it('offers a CEFR Mapping section seeded with the Versant scale', () => {
    openMapping();

    expect(rows().length).toBe(DEFAULT_CEFR_MAPPING.length);
    expect(rows().map((row) => levelInput(row).value)).toEqual(
      DEFAULT_CEFR_MAPPING.map((band) => band.level),
    );
    expect(scoreInputs(rows()[0]).map((input) => input.value)).toEqual(['10', '22']);
    expect(scoreInputs(rows()[9]).map((input) => input.value)).toEqual(['86', '90']);
  });

  it('lets a level be renamed and a new level be added', () => {
    openMapping();

    typeInto(levelInput(rows()[0]), 'Pre-A1');
    typeInto(scoreInputs(rows()[0])[0], '5');

    expect(component.canSaveMapping()).toBe(true);
    const renamed = saveAndFlush();

    expect(renamed[0]).toEqual({ level: 'Pre-A1', min: 5, max: 22, color: 'red' });
    expect(cefr.bands()[0]).toEqual({ level: 'Pre-A1', min: 5, max: 22, color: 'red' });

    host().querySelector<HTMLButtonElement>('.btn-add-band')?.click();
    fixture.detectChanges();

    const added = rows()[component.mappingDraft().length - 1];
    expect(levelInput(added).value).toBe('');
    expect(host().textContent).toContain('Enter a level name');
    expect(saveButton().disabled).toBe(true);

    typeInto(levelInput(added), 'C2+');
    typeInto(scoreInputs(added)[0], '86');
    typeInto(scoreInputs(added)[1], '90');
    expect(component.canSaveMapping()).toBe(true);
    const saved = saveAndFlush();

    expect(saved.at(-1)).toEqual({
      level: 'C2+',
      min: 86,
      max: 90,
      color: CEFR_COLORS[10].id,
    });
    expect(cefr.bands().at(-1)).toEqual({
      level: 'C2+',
      min: 86,
      max: 90,
      color: CEFR_COLORS[10].id,
    });
    // The custom level shares C2's range; the later row wins the tie.
    expect(cefr.levelFor(88)).toBe('C2+');
  });

  it('rejects duplicate level names', () => {
    openMapping();

    typeInto(levelInput(rows()[1]), 'Below A1');

    expect(host().textContent).toContain('Level names must be unique');
    expect(saveButton().disabled).toBe(true);
  });

  it('persists an edited range when saved', () => {
    openMapping();

    expect(component.canSaveMapping()).toBe(false);
    typeInto(scoreInputs(rows()[0])[0], '12');

    expect(component.mappingDirty()).toBe(true);
    expect(component.canSaveMapping()).toBe(true);
    expect(saveButton().disabled).toBe(false);

    const sent = saveAndFlush();

    expect(sent[0]).toEqual({ level: 'Below A1', min: 12, max: 22, color: 'red' });
    expect(cefr.bands()[0]).toEqual({ level: 'Below A1', min: 12, max: 22, color: 'red' });
    expect(component.canSaveMapping()).toBe(false);
    expect(toastMessages()).toEqual(['CEFR mapping saved']);
  });

  it('lets a badge colour be picked from the palette', () => {
    openMapping();

    // The palette stays closed until its swatch is clicked.
    expect(host().querySelectorAll('.color-palette').length).toBe(0);
    expect(component.colorOf(component.mappingDraft()[0].color).id).toBe('red');

    rows()[0].querySelector<HTMLButtonElement>('.color-trigger')?.click();
    fixture.detectChanges();

    const swatches = host().querySelectorAll<HTMLButtonElement>('.color-swatch');
    expect(swatches.length).toBe(15);
    expect(swatches.length).toBe(CEFR_COLORS.length);
    expect(swatches[0].classList.contains('is-selected')).toBe(true);

    swatches[14].click();
    fixture.detectChanges();

    // Picking a colour closes the palette and marks the mapping dirty.
    expect(host().querySelectorAll('.color-palette').length).toBe(0);
    expect(component.mappingDirty()).toBe(true);

    const sent = saveAndFlush();

    expect(sent).toEqual(
      bandsWithFirst({ level: 'Below A1', min: 10, max: 22, color: CEFR_COLORS[14].id }),
    );
    expect(cefr.bands()[0].color).toBe(CEFR_COLORS[14].id);
    expect(cefr.colorFor('Below A1').accent).toBe(CEFR_COLORS[14].accent);
  });

  it('flags a max score below the min score and blocks saving', () => {
    openMapping();

    const [min, max] = scoreInputs(rows()[0]);
    typeInto(min, '50');
    typeInto(max, '40');

    expect(host().textContent).toContain('Min score must not exceed max score');
    expect(saveButton().disabled).toBe(true);

    saveButton().click();
    expect(cefr.isDefault()).toBe(true);
  });

  it('rejects scores outside the whole-number range', () => {
    openMapping();

    typeInto(scoreInputs(rows()[0])[0], '91');

    expect(host().textContent).toContain('Whole numbers between 0 and 90');
    expect(saveButton().disabled).toBe(true);
  });

  it('removes a band', () => {
    openMapping();
    const initial = rows().length;

    rows()[3].querySelector<HTMLButtonElement>('.action-btn--danger')?.click();
    fixture.detectChanges();

    expect(rows().length).toBe(initial - 1);
    expect(rows().map((row) => levelInput(row).value)).not.toContain('A2+');
  });

  it('restores the shipped Versant mapping on reset', () => {
    openMapping();
    typeInto(scoreInputs(rows()[0])[0], '12');

    host().querySelector<HTMLButtonElement>('.btn-secondary')?.click();
    fixture.detectChanges();

    expect(cefr.bands()).toEqual(DEFAULT_CEFR_MAPPING);
    expect(component.mappingDraft()[0].min).toBe('10');
    expect(component.canSaveMapping()).toBe(false);
  });
});
