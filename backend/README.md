# BizzSkill Portal API

Spring Boot + PostgreSQL backend for the BizzSkill Portal frontend.

It owns the assessment configuration, results, CEFR mapping and trainee status data,
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
| `faculty` | assigned-batches | as above |

Faculty holds `trainee-status.manage` as well: a faculty member is who notices that a
trainee needs remedial teaching, and routing that through an administrator would
leave the record trailing the decision by days. `assigned-batches` is what keeps it
honest — the permission reaches only the groups the caller is assigned to.

---

## Package layout

```
com.bizzskill.portal
├── auth/           sign-in, token issuing                     (dto · service · web)
├── organization/   the portal hierarchy, scoped reads         (entity · repository · dto · service · web)
├── user/           accounts, roles, permissions               (entity · repository)
├── assessment/     assessments, CEFR bands, results, status   (entity · repository)
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
caller's scope for the same reason the roster is. `regular + remedial + lap +
cleared + others` always equals the trainee count: a trainee holds at most one
status, and the regular figure is derived rather than counted so that stays true
by construction.

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
| `PATCH` | `/api/assessments/trainees/{employeeId}/trainee-status` | `trainee-status.manage` |
| `GET` | `/api/assessments/uploads/template` | `assessments.view` |
| `POST` | `/api/assessments/uploads` | `assessments.edit` |
| `GET` | `/api/assessments/trainee-status/uploads/template` | `trainee-status.view` |
| `POST` | `/api/assessments/trainee-status/uploads/lookup` | `trainee-status.view` |
| `POST` | `/api/assessments/trainee-status/uploads` | `trainee-status.manage` |

Filter the roster with `?locationId=`, `?batchId=` and `?lgId=`; each narrows
further than the last. Score entry accepts a map keyed by assessment id, so a
table can save only the cell that changed, and `{"score": null}` clears a result.

`PATCH .../trainee-status` is the one place a trainee's status changes. It takes
`{status, remark, effectiveDate}` and answers `204`; see *Trainee status* below for
what it does with them. `POST .../trainee-status/uploads` writes through that same
service, so it is a second way in rather than a second writer.

The bulk commit takes an `assessedOn` date — the day the group sat the exam, one
date for the whole sheet, since a sheet is routinely uploaded after the fact. It
is required and cannot be in the future, and it is stored against every row as
`app_assessment_result.dateassessed_on`; the roster returns it alongside each
score. Inline score entry records the day it was keyed in, which is the same
column.

### Trainee status

A trainee's status is the row in `app_trainee_status` flagged `txtstate = 'A'`.
There is at most one such row per trainee — a partial unique index says so, which
is also what makes two simultaneous changes safe rather than merely unlikely.

`regular` is never stored. Holding no status *is* being regular, which is why the
roster reports `status` only for a trainee who holds one and the dashboard derives
the regular count by subtraction.

A change supersedes the current row rather than editing it: the old row becomes
`txtstate = 'C'` with `dateclose_date` set to the new status's start date, and a new
current row is inserted. History is therefore complete — the roster returns the
most recent superseded period's close date and remark for a trainee who holds
nothing, so the table can still say when they left a status and why. The remark on
the superseded row is kept, so each period keeps the reason it *began*.

The stored vocabulary is `remedial`, `lap`, `cleared`, `discontinued`, `purged` and
`resigned`, each enforced by a check constraint. The tabs group them: `regular`
(no current row), `remedial`, `lap`, `cleared`, and `other` (any of the three
exits). `cleared` is a successful outcome and is terminal in intent, but nothing
enforces that — the ordinary path runs regular → remedial → lap, and any status may
follow any other. The remark is what records why someone went backwards.

Rules the service enforces, and the status it answers with:

| Situation | Answer |
|---|---|
| Blank or missing `remark` | `400`, `fieldErrors[0].field = "remark"` |
| Unknown status code | `400`, `fieldErrors[0].field = "status"` |
| `effectiveDate` in the future | `400`, `fieldErrors[0].field = "effectiveDate"` |
| `effectiveDate` before the current status began | `400`, naming the earliest usable date |
| Trainee already holds that status | `422` |
| Ending a status for a regular trainee | `422` |
| Trainee outside the caller's scope | `403` |
| Someone else changed the status first | `409` |

The future-date check allows one day of UTC slack: for a user in IST, "today" is
already tomorrow in UTC, and refusing their own date would be a bug they could not
work around. Reporting a status the trainee already holds as `422` rather than as a
silent no-op is deliberate — the request carried a typed remark, and discarding it
without saying so is worse than refusing it.

#### Changing many at once

`GET .../trainee-status/uploads/template` builds a sheet for **one tab of one
group** — the tab is a required `status` parameter, so a sheet for Regular holds
only the trainees who are regular. The columns are:

```
Emp ID, Name, <one column per assessment asked for>, Current Status, New Status, Effective Date, Remark
```

The assessment columns are named `examIds`, repeated once per paper, and each cell
holds the mark as the screen shows it — `51 - B1`, the score and the CEFR level it
resolved to. A trainee who did not sit the paper has a blank cell. None of this is
read back: `Name`, the marks and `Current Status` exist so the person filling the
sheet can see the evidence for the decision in front of them, and the server
ignores all three on the way in. That is the point of the feature — the sheet is a
worksheet, not a data transfer.

`POST .../trainee-status/uploads` takes `{locationId, batchId, lgId, rows}`, where
each row is `{employeeId, status, remark, effectiveDate}`, all required but
`effectiveDate` — a blank date means today, exactly as the single change does. The
upload is **all-or-nothing**: every row is validated against the same rules the
single change applies before any of them is written, and a failure anywhere refuses
the whole sheet with row-addressed violations (`rows[3].status`), so a sheet is
never half-applied. The writes then go through `TraineeStatusService.save`, the same
method `PATCH` uses; the bulk endpoint is a second way in, not a second writer.

The client cannot validate the "what does this trainee hold now" rules on its own,
so `POST .../trainee-status/uploads/lookup` answers them: given the employee ids a
sheet names, it returns each one's current status and the day it began. That is what
lets the preview say "41202 already holds Remedial" before anything is sent to be
written — and it is scoped like every other read, so it cannot be used to ask about
another batch's trainees.

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

137 tests, no Docker required — the integration suite runs against a real
PostgreSQL database (`bizzskill_portal_test`, created by the same migrations
production uses).

| Suite | Covers |
|---|---|
| `CefrMappingServiceTest` | the published Versant boundaries, the 76 overlap, the out-of-range fallback, and mapping validation |
| `PortalApiIntegrationTest` | sign-in and its failure modes, token rejection, role scoping, score entry and its audit trail, the all-or-nothing upload, every trainee-status transition and its refusals, user-management guard rails, the dashboard summary and its scoping, and the not-found and wrong-method responses |

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
