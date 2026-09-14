/**
 * Where the signed-in session lives between page loads.
 *
 * Kept apart from {@link AuthService} so the HTTP interceptors can read the
 * access token without constructing the service (which would circle back
 * through `HttpClient`), and so the storage format has exactly one definition.
 */

/** `localStorage` key holding the access token and the signed-in user. */
export const SESSION_STORAGE_KEY = 'bizzskill_auth_state';

/** What a signed-in browser tab keeps: the token and the account it belongs to. */
export interface StoredSession {
  accessToken: string;
  /** The API's user object, exactly as it was received. */
  user: unknown;
}

/** Reads the stored session, or `null` when there is none or it is unreadable. */
export function readStoredSession(): StoredSession | null {
  try {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredSession> | null;
    if (!parsed || typeof parsed.accessToken !== 'string' || !parsed.accessToken) {
      return null;
    }
    return { accessToken: parsed.accessToken, user: parsed.user };
  } catch {
    return null;
  }
}

/** The stored access token, or `null` when nobody is signed in. */
export function readAccessToken(): string | null {
  return readStoredSession()?.accessToken ?? null;
}

/** Writes the session so a reload keeps the user signed in. */
export function writeStoredSession(session: StoredSession): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // Ignore storage write errors in restricted environments.
  }
}

/** Removes the stored session. */
export function clearStoredSession(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage deletion errors.
  }
}
