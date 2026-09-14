import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ApiRequestError,
  DEFAULT_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  apiErrorMessage,
  apiFieldErrors,
  fieldErrorMessage,
  toApiError,
} from './api-error';
import { SUPPRESS_ERROR_TOAST, apiErrorInterceptor } from './api-error.interceptor';
import { ToastService } from '../ui/toast.service';
import { API_BASE } from '../../testing/api-testing';

/** The envelope every failing endpoint answers with. */
const ENVELOPE = {
  timestamp: '2026-09-13T09:32:09.844162Z',
  status: 400,
  error: 'Bad Request',
  message: 'Row 2 could not be saved.',
  path: '/api/assessments/uploads',
  fieldErrors: [
    { field: 'rows[1].employeeId', message: 'Unknown trainee.' },
    { field: 'rows[1].score', message: 'Score must be between 0 and 90.' },
  ],
};

describe('apiErrorInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Runs a failing request and returns the error the caller receives. */
  function failure(body: object, status: number, statusText = 'Error'): unknown {
    let thrown: unknown = null;
    client
      .get(`${API_BASE}/users/roles`)
      .subscribe({ error: (error: unknown) => (thrown = error) });
    http.expectOne(`${API_BASE}/users/roles`).flush(body, { status, statusText });
    return thrown;
  }

  it('reduces a 4xx envelope to an ApiRequestError with its field errors', () => {
    const error = failure(ENVELOPE, 400, 'Bad Request');

    expect(error).toBeInstanceOf(ApiRequestError);
    const apiError = error as ApiRequestError;
    expect(apiError.status).toBe(400);
    expect(apiError.message).toBe('Row 2 could not be saved.');
    expect(apiError.fieldErrors).toHaveLength(2);
    expect(apiError.fieldError('rows[1].employeeId')).toBe('Unknown trainee.');
    expect(apiError.fieldError('rows[0].score')).toBeUndefined();
  });

  it('hides the body of a 5xx behind the fallback message', () => {
    const error = failure({ message: 'Stack trace: …' }, 500, 'Internal Server Error');

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).message).toBe(DEFAULT_ERROR_MESSAGE);
    expect((error as ApiRequestError).fieldErrors).toEqual([]);
  });

  it('reports a transport failure with the connection message', () => {
    let thrown: unknown = null;
    client
      .get(`${API_BASE}/users/roles`)
      .subscribe({ error: (error: unknown) => (thrown = error) });

    http
      .expectOne(`${API_BASE}/users/roles`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    expect((thrown as ApiRequestError).message).toBe(NETWORK_ERROR_MESSAGE);
    expect((thrown as ApiRequestError).status).toBe(0);
  });

  it('lets a successful response through unchanged', () => {
    let received: unknown = null;
    client.get(`${API_BASE}/users/roles`).subscribe((value) => (received = value));

    http.expectOne(`${API_BASE}/users/roles`).flush([{ id: 'superadmin' }]);

    expect(received).toEqual([{ id: 'superadmin' }]);
  });
});

describe('api-error helpers', () => {
  it('reads the message and field errors of an envelope', () => {
    const error = new ApiRequestError(400, 'Nope.', [{ field: 'score', message: 'Out of range.' }]);
    const details = toApiError(error);

    expect(details.status).toBe(400);
    expect(apiErrorMessage(error)).toBe('Nope.');
    expect(apiFieldErrors(error)).toEqual([{ field: 'score', message: 'Out of range.' }]);
    expect(fieldErrorMessage(details.fieldErrors, 'score')).toBe('Out of range.');
  });

  it('falls back for a value that is not an API failure', () => {
    // A thrown Error keeps its message; anything else gets the neutral fallback.
    expect(toApiError(new Error('kaboom')).message).toBe('kaboom');
    expect(apiErrorMessage('boom')).toBe(DEFAULT_ERROR_MESSAGE);
    expect(toApiError(null).message).toBe(DEFAULT_ERROR_MESSAGE);
    expect(apiFieldErrors(new Error('kaboom'))).toEqual([]);
  });
});

describe('apiErrorInterceptor notifications', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let toasts: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    toasts = TestBed.inject(ToastService);
  });

  afterEach(() => {
    toasts.clear();
    http.verify();
  });

  /** Fails a request and returns the messages that ended up on screen. */
  function messagesFrom(
    run: () => void,
    flush: (request: ReturnType<HttpTestingController['expectOne']>) => void,
  ): string[] {
    run();
    flush(http.expectOne(`${API_BASE}/users/roles`));
    return toasts.toasts().map((toast) => toast.message);
  }

  it('raises an error toast when a request fails', () => {
    const shown = messagesFrom(
      () => client.get(`${API_BASE}/users/roles`).subscribe({ error: () => undefined }),
      (request) => request.flush(ENVELOPE, { status: 400, statusText: 'Bad Request' }),
    );

    // A failure nobody caught used to be silent; this is the guarantee that it
    // cannot be any more.
    expect(shown).toEqual(['Row 2 could not be saved.']);
    expect(toasts.toasts()[0].variant).toBe('error');
  });

  it('says how many fields need attention when the API reported some', () => {
    messagesFrom(
      () => client.get(`${API_BASE}/users/roles`).subscribe({ error: () => undefined }),
      (request) => request.flush(ENVELOPE, { status: 400, statusText: 'Bad Request' }),
    );

    expect(toasts.toasts()[0].detail).toBe('2 fields need attention.');
  });

  it('replaces the raw 401 with the sentence the user needs', () => {
    // The auth interceptor has already bounced them to the sign-in screen, where
    // "Unauthorized" would explain nothing.
    const shown = messagesFrom(
      () => client.get(`${API_BASE}/users/roles`).subscribe({ error: () => undefined }),
      (request) => request.flush({}, { status: 401, statusText: 'Unauthorized' }),
    );

    expect(shown).toEqual(['Your session has expired. Please sign in again.']);
  });

  it('shows the reason the API gave for a 403', () => {
    const shown = messagesFrom(
      () => client.get(`${API_BASE}/users/roles`).subscribe({ error: () => undefined }),
      (request) =>
        request.flush(
          { status: 403, message: 'You can only manage your own location.' },
          { status: 403, statusText: 'Forbidden' },
        ),
    );

    expect(shown).toEqual(['You can only manage your own location.']);
  });

  it('never shows the raw HTTP wording the browser produces', () => {
    // Without a body Angular would otherwise supply
    // "Http failure response for http://…: 403 Forbidden" — a developer string
    // that leaks the URL into a toast.
    const shown = messagesFrom(
      () => client.get(`${API_BASE}/users/roles`).subscribe({ error: () => undefined }),
      (request) => request.flush(null, { status: 403, statusText: 'Forbidden' }),
    );

    expect(shown).toEqual([DEFAULT_ERROR_MESSAGE]);
    expect(shown[0]).not.toContain('Http failure');
  });

  it('uses the connection message when the server cannot be reached', () => {
    const shown = messagesFrom(
      () => client.get(`${API_BASE}/users/roles`).subscribe({ error: () => undefined }),
      (request) =>
        request.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' }),
    );

    expect(shown).toEqual([NETWORK_ERROR_MESSAGE]);
  });

  it('stays quiet when the caller opts out', () => {
    const shown = messagesFrom(
      () =>
        client
          .get(`${API_BASE}/users/roles`, {
            context: new HttpContext().set(SUPPRESS_ERROR_TOAST, true),
          })
          .subscribe({ error: () => undefined }),
      (request) => request.flush(ENVELOPE, { status: 400, statusText: 'Bad Request' }),
    );

    expect(shown).toEqual([]);
  });

  it('stays quiet for a failed sign-in, which reports itself on the form', () => {
    client
      .post(`${API_BASE}/auth/login`, { employeeId: 'admin', password: 'nope' })
      .subscribe({ error: () => undefined });

    http
      .expectOne(`${API_BASE}/auth/login`)
      .flush(
        { message: 'Your Employee ID or password is incorrect.' },
        { status: 401, statusText: 'Unauthorized' },
      );

    expect(toasts.count()).toBe(0);
  });

  it('stays quiet when the request succeeds', () => {
    client.get(`${API_BASE}/users/roles`).subscribe();
    http.expectOne(`${API_BASE}/users/roles`).flush([]);

    expect(toasts.count()).toBe(0);
  });

  it('still rethrows the ApiRequestError for the caller to handle', () => {
    let thrown: unknown = null;
    client
      .get(`${API_BASE}/users/roles`)
      .subscribe({ error: (error: unknown) => (thrown = error) });
    http
      .expectOne(`${API_BASE}/users/roles`)
      .flush(ENVELOPE, { status: 400, statusText: 'Bad Request' });

    // The toast is in addition to the error, not instead of it.
    expect(thrown).toBeInstanceOf(ApiRequestError);
  });
});
