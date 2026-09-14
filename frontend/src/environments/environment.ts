/**
 * The production environment.
 *
 * Angular replaces this file with `environment.development.ts` for the
 * `development` and `serve` configurations (see `angular.json`), so local work
 * points at a local backend without changing any source.
 */
export const environment = {
  production: true,
  /** Base URL of the Spring Boot API, without a trailing slash. */
  apiBaseUrl: 'http://localhost:8080/api',
};
