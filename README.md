# BizzSkill Portal

An internal training-assessment portal: administrators configure assessments and
CEFR bands, faculty score trainees against them, and the results drive CEFR badges
and a LAP / Remedial programme.

Two applications, in two directories:

| Directory | What it is | Stack |
|---|---|---|
| `frontend/` | the portal itself | Angular 22, standalone components, signals |
| `backend/` | the API it talks to | Spring Boot 4.1.1, Java 21, PostgreSQL 18 |

Each has its own README; `backend/README.md` is the substantive one, covering the
schema, the type mapping, the security model and the API reference.

---

## Running it

### Prerequisites

- **Java 21+** and **Maven**
- **PostgreSQL** running on `localhost:5432`
- **Node 20+** (developed on 24)

### 1. Database

```bash
createdb -h localhost -U postgres bizzskill_portal       # the application
createdb -h localhost -U postgres bizzskill_portal_test  # only needed to run the tests
```

The backend builds its own schema on startup — there is nothing to import.

### 2. Backend

```bash
cd backend
mvn spring-boot:run
```

Serves `http://localhost:8080`. On first run it seeds a small demo organisation
(5 locations, 6 batches, 7 learning groups, 14 trainees) so the screens have
something to show; it skips that whenever the portal tables already hold data.

### 3. Frontend

```bash
cd frontend
npm install
npm start
```

Serves `http://localhost:4200` and expects the API on `http://localhost:8080`,
which is already allowed by the backend's CORS configuration and set in
`src/environments/environment.development.ts`.

### Signing in

| Employee ID | Password | Role |
|---|---|---|
| `admin` | `Admin@123` | Super Admin |

The demo seed creates two more accounts that are useful for seeing role scoping
work — a Location Admin restricted to Kochi (`kocadmin` / `Koc@123`) and a Faculty
member restricted to one Bangalore batch (`faculty1` / `Fac@123`). They are
created by `DemoDataLoader` and only exist under the `local` profile.

> **Change the bootstrap password before any real deployment.** Passwords are
> currently stored in plain text, at the client's request; `backend/README.md`
> documents the switch to BCrypt and how existing rows migrate.

---

## Tests

```bash
cd backend  && mvn test                      # 90 tests
cd frontend && npm test -- --watch=false     # 358 tests
```

The backend suite needs `bizzskill_portal_test` to exist and runs against real
PostgreSQL — the rules worth protecting (who may see which trainees, and who may
score them) live in the queries and the security filter chain, so mocking those
layers would only assert that the code calls itself.

---

## Where things are

```
backend/src/main/java/com/bizzskill/portal/
├── auth/           sign-in and token issuing
├── organization/   locations, batches, learning groups, participants
├── user/           accounts, roles, permissions, assignments
├── assessment/     assessments, CEFR mapping, results, LAP/Remedial, uploads
├── security/       token service, principal, password encoder
├── config/         security, JPA auditing, demo seed
└── common/         audit base class, enums, error model, health probe

frontend/src/app/
├── core/           models, services, guards, interceptors, auth, toasts
├── features/       dashboard and its pages
└── shared/         reusable UI (dialogs, badges, tables, toasts)
```

### Data ownership

`LOCATION`, `BATCH`, `LEARNING_GROUP` and `PARTICIPANT` belong to the existing
technical assessment portal. This application **reads** them and never writes to
them, and their structure is reproduced exactly as supplied — verified column by
column against the original Oracle dictionary dump. Everything prefixed `app_` is
owned by this application.

---

## Notifications

Every action reports its outcome. There are no silent buttons.

**Successes are raised by the screen that performed the action**, because only it
knows what the action meant — `Scores saved`, `Account created`, ``Account for
Aarav Nair deleted``. A screen calls `ToastService.success(...)` after the server
has accepted the change, never before; where an action happens in a dialog, the
dialog closes on success and stays open on failure so typed work is not thrown
away.

**Failures are raised centrally by the HTTP error interceptor**, so a failure
cannot be silent just because one screen forgot its error branch. It reads the
backend's error envelope, so the user sees the sentence the API wrote. Two cases
are special-cased: a 401 becomes *"Your session has expired. Please sign in
again."* rather than the word "Unauthorized", and a validation failure says how
many fields need attention.

A request opts out with `SUPPRESS_ERROR_TOAST` when it is one of the app's own
background loads (session restore, logout) or when the screen already reports
that exact failure inline, such as the sign-in form.

```ts
// The default: a failure raises a toast as well as throwing.
this.http.post(url, body);

// Background or already-reported: stay quiet.
this.http.get(url, { context: new HttpContext().set(SUPPRESS_ERROR_TOAST, true) });
```

### Two behaviours worth knowing

- **Identical messages do not stack.** The same variant and text raised again
  restarts the existing toast's timer instead of adding a second. One user action
  routinely fires several requests at once, and four copies of one sentence reads
  as a malfunction. Failures are unaffected in practice, because a failure and a
  success never share a variant — a failed second attempt still breaks through.
- **A full screen never hides a failure.** Five toasts may show at once; when a
  sixth arrives the oldest *success or info* is dropped, and an error is only
  dropped when there is nothing else left.

Toasts are split across two ARIA live regions — failures are announced
assertively, everything else politely — so a success never interrupts and a
failure never waits its turn.

### Layering

The app uses a deliberately short scale, and a new element should join one of
these two tiers rather than invent a number:

| Layer | `z-index` | What lives there |
| --- | --- | --- |
| Overlays | `100` | Every dialog backdrop, modal and dropdown |
| Notifications | `1000` | The toast stack, and nothing else |

Toasts outrank everything by design: a message that can be painted over is worse
than no message at all. This is not theoretical — the configuration page's dialog
backdrop had drifted to `z-index: 1000`, so a failure raised while that dialog
was open was drawn *behind* a full-screen `rgba(0, 0, 0, 0.4)` backdrop with a
`blur(4px)` filter. The toast was in the DOM and passed a `waitForSelector`
check while being unreadable on screen. It now sits at `100` like every other
dialog, and the toast stack is the single highest layer.

---

## Status

Both halves are complete and run against each other.

**Backend** — authentication, the organisation hierarchy, configuration
(assessments and the CEFR mapping), user management, the dashboard figures, and
the assessment workflow including score entry, LAP / Remedial tracking and the CSV
bulk upload, with every score change written to an audit trail. 24 endpoints,
90 tests.

Both the assessment results and the LAP / Remedial tables carry a search box,
matching a partial name or employee id case-insensitively — typing either
"aarav" or "41207" finds the same person. Paging, searching, filtering and
ordering are all done by the database and sent one page at a time, so a group of
two thousand trainees costs a client the same few kilobytes as a group of ten.
Filters narrow the whole group rather than the page on screen, which is the
difference that matters: a client-side filter over one page reports "no matches"
for a trainee sitting on another.

Destructive actions ask first. Assessments and CEFR levels are removed through
one shared confirmation dialog (`shared/ui/confirm-dialog`), which is an
`alertdialog` so the question is announced, defaults to the safe answer, and
closes on Escape or a backdrop click. The prompt for an assessment says that one
holding recorded results cannot be deleted, because the API enforces exactly
that and a warning about the wrong consequence teaches users to ignore warnings.

That advice is actionable: every assessment carries an active/inactive state,
switched from the assessment's own edit dialog and saved with its name and
description. Retiring takes an assessment out of the results table without
touching the results already recorded against it, which is the only option once
they exist. The list badges a retired assessment and dims it, so the state reads
at a glance without putting a third control on every card.

Scores are recorded per exam, in any order and one at a time. Exams are sat
individually, so a trainee holds whatever results they have earned so far and
nothing requires the set to be complete: a save carries only the exams whose
score actually changed, and those that have not been sat yet are simply absent.

**Frontend** — reads and writes the real API throughout: environment
configuration, HTTP services for every screen, a bearer-token interceptor that
ends the session on a 401, an error interceptor that unwraps the API's error
envelope, route guards for authentication and permissions, and toast
notifications for every action. No in-memory mock data remains in production
code. 358 tests.

Assigning a role's locations and batches is done from two dropdown pickers
rather than a wall of checkboxes. Locations are a multi-select that keeps its
trigger to one line by naming two and counting the rest; batches are the same
with a search box, because the list grows past what is worth scanning and each
batch is qualified with its location (`Kochi · Batch 01`). Both panels are
portaled popovers, so they clear the dialog they sit in, flip above the trigger
when the space below is short, and focus the search box on opening. Their bulk
actions act on what is on screen, so "Select all" with a search active chooses
every match and nothing else.

### Before deploying

- **Set `JWT_SECRET`.** The default is a development value.
- **Move passwords off plain text** — see the section in `backend/README.md`.
- **Change the bootstrap admin password.**
- **Point `environment.ts` at the real API URL** and add that origin to
  `PORTAL_ALLOWED_ORIGINS`; both currently name `localhost`.
