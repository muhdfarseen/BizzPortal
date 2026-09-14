/**
 * The development environment, swapped in for `ng serve` / `ng build
 * --configuration development` via `angular.json`'s `fileReplacements`.
 */
export const environment = {
  production: false,
  /** Base URL of the Spring Boot API, without a trailing slash. */
  apiBaseUrl: 'http://localhost:8080/api',
};
