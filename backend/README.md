# BizzSkill Portal API

Spring Boot + PostgreSQL backend for the BizzSkill Portal frontend.

It owns the assessment configuration, results, CEFR mapping and LAP/Remedial data,
and **reads** the training organisation (locations, batches, learning groups,
participants) from the tables owned by the existing technical assessment portal.

- Java 21 · Spring Boot 4.1.1 · Maven
- PostgreSQL 18 · Flyway migrations · Hibernate `ddl-auto: validate`
- Stateless JWT authentication · permission-based authorisation with data scoping

---

## Running it

### 1. Database

The application expects a PostgreSQL database and creates its own schema on
startup. Create an empty database — nothing else is needed:

```bash
createdb -h localhost -U postgres bizzskill_portal
# or: psql -h localhost -U postgres -c "CREATE DATABASE bizzskill_portal"
```

Connection settings default to `localhost:5432/bizzskill_portal` with user
`postgres`. Override them per environment:

| Variable | Default | Purpose |
|---|---|---|
| `DB_URL` | `jdbc:postgresql://localhost:5432/bizzskill_portal` | JDBC URL |
| `DB_USERNAME` | `postgres` | database user |
| `DB_PASSWORD` | `123` | database password |
| `SERVER_PORT` | `8080` | HTTP port |
| `JWT_SECRET` | dev value | **must be set in production** (≥ 32 bytes) |
| `JWT_TTL` | `8h` | token lifetime |
| `PORTAL_ALLOWED_ORIGINS` | `http://localhost:4200` | CORS origins |
| `PORTAL_PASSWORD_ENCODING` | `plain` | `bcrypt` to hash passwords |

### 2. Start

```bash
cd backend
mvn spring-boot:run
```

Flyway applies the migrations on startup. The `local` profile (the default) also
seeds demo organisation data: fourteen locations, 29 batches, 60 learning groups
and 965 trainees, most of them in Kochi. Every insert is idempotent, so a
database that already holds data is topped up rather than duplicated, and
nothing the seed writes is ever updated or deleted.

### 3. Sign in

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"employeeId":"admin","password":"Admin@123"}'
```

The bootstrap administrator (`admin` / `Admin@123`, employee `10294`) is created
by migration `V3`. **Change that password before the first real deployment.**

---

## ⚠️ Passwords are currently stored in plain text

At the client's explicit request, for now. This is not acceptable in production.

The cost of switching is deliberately small: passwords live behind a
`PasswordEncoder` bean (`PasswordEncoderConfig`), and the plain-text
implementation is constant-time and reports every row as needing a re-hash.

To move to BCrypt:

1. Set `PORTAL_PASSWORD_ENCODING=bcrypt`.
2. Existing rows still hold plain text, so nobody could sign in. Either issue
   one-time passwords, or implement `UserDetailsPasswordService` to re-hash each
   password as its owner signs in — `PlainTextPasswordEncoder.upgradeEncoding`
   already returns `true` for every row, which is the hook for exactly that.
3. Delete the plain-text encoder once every row is a `$2a$` hash.

---

## Data ownership

| Tables | Owner | This service |
|---|---|---|
| `location`, `batch`, `learning_group`, `participant` | the technical assessment portal | **read-only** |
| `app_*` | this service | read/write |

The portal tables are reproduced by `V1__portal_schema.sql` with their structure
exactly as supplied — no renamed columns, no added columns, no invented foreign
keys. That is verified, not asserted: comparing every column of all four tables
against the supplied Oracle dictionary dump shows identical names, types and
lengths, with nothing missing and nothing extra. Their entities are annotated `@Immutable` and the application has no write
path to them; the local demo seed uses `JdbcTemplate` precisely so it does not
create one.

### Oracle → PostgreSQL type mapping

The portal schema was supplied as Oracle DDL. Applied consistently:

| Oracle | PostgreSQL | Why |
|---|---|---|
| `NUMBER(22)` | `bigint` | surrogate keys; `numeric(22)` would force `BigDecimal` on every id for no benefit |
| `VARCHAR2(n)` | `varchar(n)` | direct equivalent |
| `CHAR(1)` | `varchar(1)` | status flags; avoids `CHAR` blank-padding surprises |
| `DATE` | `date` | these columns are date-only, not timestamps |

Identifiers are lowercase because PostgreSQL folds unquoted names that way; the
Oracle uppercase names resolve to the same tables.

---

## Schema management

Flyway owns the schema. Hibernate is set to `validate`, so the application fails
at startup if an entity and its table disagree — the opposite of `ddl-auto: update`,
which lets a schema silently drift away from the code.

| Migration | Contents |
|---|---|
| `V1__portal_schema.sql` | the four portal tables (`CREATE TABLE IF NOT EXISTS`) |
| `V2__app_schema.sql` | application tables |
| `V3__reference_data.sql` | roles, permissions, grants, CEFR bands, assessments, bootstrap admin |

`baseline-on-migrate` is on: pointed at a production portal database that already
has tables but no Flyway history, V1 is recorded as the baseline (nothing to
create, since those tables exist) and V2+ are applied.

---

## Security model

- **Stateless.** Every request carries `Authorization: Bearer <token>`. No
  server-side session; CSRF is disabled because nothing is cookie-authenticated.
- **Permissions, not roles.** The token carries permission codes, and endpoints
  check capabilities:
  ```java
  @PreAuthorize("hasAuthority('assessments.edit')")
  ```
  Granting a permission to a role is a data change, not a deployment.
- **Scope is enforced in queries, not the UI.** A role's `scope` narrows every
  read: `all`, `assigned-locations` or `assigned-batches`. Hiding rows in the
  browser is not access control, so `OrganizationService` filters by the caller's
  assignments in the query itself.
- **Tokens are snapshots.** A permission or assignment change takes effect at the
  user's next sign-in. That is the accepted trade-off of the stateless design;
  the alternatives are short-lived tokens with a refresh flow, or revocation
  checks per request.

Four roles ship as reference data, mirroring the frontend:

| Role | Scope | Permissions |
|---|---|---|
| `superadmin` | all | all 8 |
| `program-manager` | all | all but `users.manage`, `configuration.manage` |
| `location-admin` | assigned-locations | as above |
| `faculty` | assigned-batches | as above, minus `lap-remedial.manage` |

---

## Package layout

```
com.bizzskill.portal
├── auth/           sign-in, token issuing                     (dto · service · web)
├── organization/   the portal hierarchy, scoped reads         (entity · repository · dto · service · web)
├── user/           accounts, roles, permissions               (entity · repository)
├── assessment/     assessments, CEFR bands, results, LAP      (entity · repository)
├── security/       token service, principal, password encoder
├── config/         security, JPA auditing, demo seed
└── common/         audit base class, enums, error model
```

Each feature owns its own `entity` / `repository` / `dto` / `service` / `web`
slices rather than the whole application sharing one layer per type.

---

## API

Every endpoint except sign-in requires `Authorization: Bearer <token>`.

### Operations

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/health` | public |

Reports whether the application is up and can reach its database, and nothing
else — no version, hostname or connection string, since it is unauthenticated. It
answers 200 only when the database responds, so an instance that is running but
cut off from its database is reported as not ready rather than staying in a load
balancer's rotation.

### Authentication

| Method | Path | Permission |
|---|---|---|
| `POST` | `/api/auth/login` | public |
| `GET` | `/api/auth/me` | authenticated |
| `POST` | `/api/auth/logout` | authenticated |

### Organisation

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/organization/locations` | `dashboard.view` |

Returns Location → Batch → LG, already narrowed to the caller's scope.

### Dashboard

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/dashboard/summary` | `dashboard.view` |

Headline counters and a per-location breakdown, counted server-side so the
dashboard can never disagree with the assessment tables, and narrowed to the
caller's scope for the same reason the roster is. `regular + remedial + lap`
always equals the trainee count: a trainee is on at most one track, and the
regular figure is derived rather than counted so that stays true by construction.

### Configuration

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/configuration/assessments` | `assessments.view` |
| `GET` | `/api/configuration/assessments/active` | `assessments.view` |
| `POST` | `/api/configuration/assessments` | `configuration.manage` |
| `PUT` | `/api/configuration/assessments/{id}` | `configuration.manage` |
| `DELETE` | `/api/configuration/assessments/{id}` | `configuration.manage` |
| `GET` | `/api/configuration/cefr-mapping` | `assessments.view` |
| `PUT` | `/api/configuration/cefr-mapping` | `configuration.manage` |

### Users

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/users` | `users.manage` |
| `GET` | `/api/users/roles` | `users.manage` |
| `GET` | `/api/users/permissions` | `users.manage` |
| `POST` | `/api/users` | `users.manage` |
| `PATCH` | `/api/users/{employeeId}` | `users.manage` |
| `DELETE` | `/api/users/{employeeId}` | `users.manage` |

`POST /api/users` returns a `temporaryPassword` **once**, and only when the request
did not supply one. No other response has a field for it.

### Assessments

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/assessments/trainees` | `assessments.view` |
| `PATCH` | `/api/assessments/trainees/{employeeId}` | `assessments.edit` |
| `PATCH` | `/api/assessments/trainees/{employeeId}/lap-remedial` | `lap-remedial.manage` |
| `GET` | `/api/assessments/uploads/template` | `assessments.view` |
| `POST` | `/api/assessments/uploads` | `assessments.edit` |

Filter the roster with `?locationId=`, `?batchId=` and `?lgId=`; each narrows
further than the last. Score entry accepts a map keyed by assessment id, so a
table can save only the cell that changed, and `{"score": null}` clears a result.

### Errors

Every failure uses one shape, including validation failures:

```json
{
  "timestamp": "2026-09-13T09:15:17Z",
  "status": 400,
  "error": "Bad Request",
  "message": "The request contains invalid values.",
  "path": "/api/auth/login",
  "fieldErrors": [{ "field": "password", "message": "Enter your password." }]
}
```

`fieldErrors` is empty rather than absent when there is nothing field-specific, so
a client never has to distinguish "no field errors" from "old server". Upload
failures use indexed paths such as `rows[2].score` so a screen can point at the
offending spreadsheet row.

---

## Tests

```bash
cd backend
mvn test
```

70 tests, no Docker required — the integration suite runs against a real
PostgreSQL database (`bizzskill_portal_test`, created by the same migrations
production uses).

| Suite | Covers |
|---|---|
| `CefrMappingServiceTest` | the published Versant boundaries, the 76 overlap, the out-of-range fallback, and mapping validation |
| `PortalApiIntegrationTest` | sign-in and its failure modes, token rejection, role scoping, score entry and its audit trail, the all-or-nothing upload, user-management guard rails, the dashboard summary and its scoping, and the not-found and wrong-method responses |

Two choices worth knowing about:

- **The integration tests use a real database**, because the rules most worth
  protecting — who may see which trainees, and who may score them — live in the
  queries and the security filter chain. Mocking those layers would only assert
  that the code calls itself.
- **The whole suite is `@Transactional`**, so fixtures roll back and the database
  is left as it was found.

Create the test database once:

```bash
createdb -h localhost -U postgres bizzskill_portal_test
```

---

## Still to build

- a password-change flow (self-service change, and an admin reset) — deliberately
  not folded into `PATCH /api/users`, so an ordinary role edit can never silently
  reset a credential
- pagination for `/api/assessments/trainees` once a group outgrows one response
- dashboard figures are computed on request; a large organisation would want them
  cached or materialised rather than recounted on every page load
- an Excel (`.xlsx`) template alongside the CSV one
- operation-level audit logging for configuration and user changes, beyond the
  existing assessment-result trail
