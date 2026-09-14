import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  CEFR_COLORS,
  CefrScoreBand,
  DEFAULT_CEFR_MAPPING,
} from '../../../../core/models/assessment.model';
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

  /** The confirmation dialog, if one is on screen. */
  function confirmDialog(): HTMLElement | null {
    return host().querySelector<HTMLElement>('[role="alertdialog"]');
  }

  /** Presses the destructive button in the confirmation. */
  function confirmDelete(): void {
    confirmDialog()?.querySelector<HTMLButtonElement>('.btn-danger')?.click();
    fixture.detectChanges();
  }

  /** Presses Cancel in the confirmation. */
  function cancelDelete(): void {
    confirmDialog()?.querySelector<HTMLButtonElement>('.btn-secondary')?.click();
    fixture.detectChanges();
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

  /** The card showing the named assessment. */
  function cardFor(name: string): HTMLElement {
    return Array.from(host().querySelectorAll<HTMLElement>('.assessment-card')).find(
      (candidate) => candidate.querySelector('.assessment-name')?.textContent?.trim() === name,
    ) as HTMLElement;
  }

  /** Opens the edit dialog for the named assessment. */
  function openEditFor(name: string): void {
    cardFor(name).querySelector<HTMLButtonElement>('.action-btn[title="Edit"]')?.click();
    fixture.detectChanges();
  }

  /** Flicks the edit dialog's status switch. */
  function setDialogStatus(active: boolean): void {
    const input = host().querySelector<HTMLInputElement>('.switch-input') as HTMLInputElement;
    input.checked = active;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  /** Dismisses the open dialog without saving. */
  function closeDialog(): void {
    host().querySelector<HTMLButtonElement>('.dialog-footer .btn-cancel')?.click();
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
    firstCard.querySelector<HTMLButtonElement>('.action-btn[title="Edit"]')?.click();
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
      // The dialog owns the lifecycle switch, so it states the status outright
      // rather than leaving the API to infer it.
      status: 'active',
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
    confirmDelete();

    http
      .expectOne({ method: 'DELETE', url: `${API_BASE}/configuration/assessments/1` })
      .flush(null, { status: 204, statusText: 'No Content' });

    flushRefreshedLists(ACTIVE_EXAMS.slice(1));

    expect(component.assessments().map((assessment) => assessment.id)).toEqual(['2', '3']);
    expect(host().querySelectorAll('.assessment-card').length).toBe(2);
    expect(toastMessages()).toEqual(['Assessment deleted']);
  });

  it('asks before deleting an assessment, and sends nothing until confirmed', () => {
    const firstCard = host().querySelectorAll<HTMLElement>('.assessment-card')[0];
    firstCard.querySelector<HTMLButtonElement>('.action-btn--danger')?.click();
    fixture.detectChanges();

    expect(confirmDialog()).not.toBeNull();
    expect(confirmDialog()?.textContent).toContain(component.assessments()[0].name);
    // The click alone must not reach the API.
    http.expectNone({ method: 'DELETE', url: `${API_BASE}/configuration/assessments/1` });
  });

  it('keeps the assessment when the deletion is cancelled', () => {
    const before = component.assessments().length;
    const firstCard = host().querySelectorAll<HTMLElement>('.assessment-card')[0];
    firstCard.querySelector<HTMLButtonElement>('.action-btn--danger')?.click();
    fixture.detectChanges();

    cancelDelete();

    http.expectNone({ method: 'DELETE', url: `${API_BASE}/configuration/assessments/1` });
    expect(confirmDialog()).toBeNull();
    expect(component.assessments().length).toBe(before);
  });

  it('closes the confirmation on Escape without deleting', () => {
    const before = component.assessments().length;
    const firstCard = host().querySelectorAll<HTMLElement>('.assessment-card')[0];
    firstCard.querySelector<HTMLButtonElement>('.action-btn--danger')?.click();
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(confirmDialog()).toBeNull();
    expect(component.assessments().length).toBe(before);
    http.expectNone({ method: 'DELETE', url: `${API_BASE}/configuration/assessments/1` });
  });

  it('asks before removing a CEFR level, and keeps it when cancelled', () => {
    openMapping();
    const initial = rows().length;
    const level = levelInput(rows()[3]).value;

    rows()[3].querySelector<HTMLButtonElement>('.action-btn--danger')?.click();
    fixture.detectChanges();

    expect(confirmDialog()).not.toBeNull();
    expect(confirmDialog()?.textContent).toContain(level);
    expect(rows().length).toBe(initial);

    cancelDelete();

    expect(confirmDialog()).toBeNull();
    expect(rows().length).toBe(initial);
    expect(rows().map((row) => levelInput(row).value)).toContain(level);
  });

  it('offers exactly one control per action on a card', () => {
    const controls = Array.from(
      cardFor('Pre Assessment').querySelectorAll<HTMLButtonElement>(
        '.assessment-actions .action-btn',
      ),
    );

    // Editing and deleting only: the lifecycle toggle lives in the dialog,
    // where the rest of the assessment's properties are edited.
    expect(controls.map((control) => control.getAttribute('title'))).toEqual(['Edit', 'Delete']);
    expect(cardFor('Pre Assessment').querySelectorAll('ng-icon[name="reiconEdit2"]').length).toBe(
      1,
    );
  });

  it('retires an assessment through the edit dialog', () => {
    openEditFor('Pre Assessment');
    setDialogStatus(false);
    saveAssessment();

    const request = http.expectOne({
      method: 'PUT',
      url: `${API_BASE}/configuration/assessments/1`,
    });
    // The API replaces the record, so the untouched fields go back with it.
    expect(request.request.body).toEqual({
      name: 'Pre Assessment',
      description: 'Baseline.',
      maxScore: 90,
      status: 'inactive',
    });

    const retired: ApiAssessmentFixture[] = [
      { ...ACTIVE_EXAMS[0], status: 'inactive' },
      ...ACTIVE_EXAMS.slice(1),
    ];
    request.flush(retired[0]);
    flushRefreshedLists(retired, ACTIVE_EXAMS.slice(1));

    expect(cardFor('Pre Assessment').querySelector('.status-badge')?.textContent).toContain(
      'Inactive',
    );
    expect(component.assessments().find((it) => it.name === 'Pre Assessment')?.status).toBe(
      'inactive',
    );
    expect(toastMessages()).toContain('Assessment updated');
  });

  it('brings a retired assessment back into use', () => {
    openEditFor('Pre Assessment');
    setDialogStatus(false);
    saveAssessment();
    const retired: ApiAssessmentFixture[] = [
      { ...ACTIVE_EXAMS[0], status: 'inactive' },
      ...ACTIVE_EXAMS.slice(1),
    ];
    http
      .expectOne({ method: 'PUT', url: `${API_BASE}/configuration/assessments/1` })
      .flush(retired[0]);
    flushRefreshedLists(retired, ACTIVE_EXAMS.slice(1));

    openEditFor('Pre Assessment');
    // Opening a retired assessment shows the switch off...
    expect(host().querySelector<HTMLInputElement>('.switch-input')?.checked).toBe(false);

    // ...and turning it back on sends active.
    setDialogStatus(true);
    saveAssessment();
    const restore = http.expectOne({
      method: 'PUT',
      url: `${API_BASE}/configuration/assessments/1`,
    });
    expect((restore.request.body as { status?: string }).status).toBe('active');
    restore.flush(ACTIVE_EXAMS[0]);
    flushRefreshedLists(ACTIVE_EXAMS);

    expect(cardFor('Pre Assessment').querySelector('.status-badge')).toBeNull();
  });

  it('labels the status switch, and keeps it out of the create dialog', () => {
    // A new assessment starts active, so there is nothing to switch.
    openAddAssessment();
    expect(host().querySelector('.switch-input')).toBeNull();
    closeDialog();

    openEditFor('Pre Assessment');
    const input = host().querySelector<HTMLInputElement>('.switch-input') as HTMLInputElement;

    expect(input).not.toBeNull();
    // A switch rather than a checkbox: it applies immediately and has on/off
    // semantics, which is what a screen reader should announce.
    expect(input.getAttribute('role')).toBe('switch');
    expect(input.checked).toBe(true);
    expect(host().querySelector('.switch-state')?.textContent).toContain('Active');
    expect(host().querySelector('.switch-hint')?.textContent).toContain('Scored in the results');
  });

  it('badges only the retired assessments', () => {
    expect(host().querySelectorAll('.status-badge').length).toBe(0);

    openEditFor('Pre Assessment');
    setDialogStatus(false);
    saveAssessment();
    const retired: ApiAssessmentFixture[] = [
      { ...ACTIVE_EXAMS[0], status: 'inactive' },
      ...ACTIVE_EXAMS.slice(1),
    ];
    http
      .expectOne({ method: 'PUT', url: `${API_BASE}/configuration/assessments/1` })
      .flush(retired[0]);
    flushRefreshedLists(retired, ACTIVE_EXAMS.slice(1));

    // One badge, on the retired card alone.
    expect(host().querySelectorAll('.status-badge').length).toBe(1);
    expect(cardFor('Pre Assessment').classList.contains('assessment-card--inactive')).toBe(true);
    expect(cardFor('Mid Assessment').classList.contains('assessment-card--inactive')).toBe(false);
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

  it('does not treat a stored mapping as unsaved edits when it differs from the default', () => {
    // The fixture the suite flushes is the shipped default, so the draft and
    // the stored mapping agree by accident and this went unnoticed. Push a
    // genuinely customised mapping through a real reload: the draft must follow
    // it, or Save Changes arms itself over a mapping nobody edited.
    const customised: CefrScoreBand[] = [
      { level: 'Low', min: 10, max: 50, color: 'red' },
      { level: 'High', min: 51, max: 90, color: 'green' },
    ];

    cefr.load(true).subscribe();
    http.expectOne(`${API_BASE}/configuration/cefr-mapping`).flush(customised);
    fixture.detectChanges();

    expect(component.mappingDraft().map((band) => band.level)).toEqual(['Low', 'High']);
    expect(component.mappingDirty()).toBe(false);
    expect(component.canSaveMapping()).toBe(false);

    // The button only exists on the mapping tab, and it must be inert.
    openMapping();
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

    const removedLevel = levelInput(rows()[3]).value;
    rows()[3].querySelector<HTMLButtonElement>('.action-btn--danger')?.click();
    fixture.detectChanges();
    confirmDelete();

    expect(rows().length).toBe(initial - 1);
    expect(rows().map((row) => levelInput(row).value)).not.toContain(removedLevel);
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
