import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { flushStartup } from '../../../../testing/api-testing';
import { AssessmentsComponent } from './assessments';

describe('AssessmentsComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssessmentsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('renders the shared assessment results section for its own title', () => {
    const fixture = TestBed.createComponent(AssessmentsComponent);
    fixture.detectChanges();
    // The results section reads the exams and the CEFR mapping on construction.
    flushStartup(http);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('app-assessment-results')).not.toBeNull();
    expect(host.querySelector('.page-title')?.textContent?.trim()).toBe('Assessments');

    const searchButton = host.querySelector('.filter-search-btn') as HTMLButtonElement;
    expect(searchButton.disabled).toBe(true);
    expect(searchButton.querySelector('.filter-search-icon')).not.toBeNull();
  });
});
