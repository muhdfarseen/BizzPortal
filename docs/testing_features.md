# BizzSkill Portal

## 1. Roles and what each may do

There are **four roles**. Access comes from two things only: the *permissions* of
the role, and the *locations* assigned to the user. There is no batch-level
access — assigning a location grants every batch and learning group inside it.

### 1.1 Role capability matrix

| Screen / Action | Super Admin | Program Manager | Location Admin | Faculty |
|---|---|---|---|---|
| **Home** — view dashboard figures | Yes | Yes | Yes | Yes |
| **Assessments** — search & view results | Yes | Yes | Yes | Yes |
| **Assessments** — edit a trainee's scores | Yes | Yes | Yes | Yes |
| **Assessments** — bulk upload scores | Yes | Yes | Yes | Yes |
| **Remedial** — view who is on Remedial | Yes | Yes | Yes | Yes |
| **Remedial** — Initiate Remedial | Yes | Yes | Yes | **Depends — see 1.2** |
| **Remedial** — Close Remedial | Yes | Yes | Yes | **Depends — see 1.2** |
| **LAP** — view who is on LAP | Yes | Yes | Yes | Yes |
| **LAP** — Initiate LAP | Yes | Yes | Yes | **Depends — see 1.2** |
| **LAP** — Close LAP | Yes | Yes | Yes | **Depends — see 1.2** |
| **Reports** — open & export the trainee report | Yes | Yes | Yes | Yes |
| **User Management** — full access | Yes | **No** | **No** | **No** |
| **Configuration** — exams & CEFR mapping | Yes | **No** | **No** | **No** |

### 1.2 The two per-person Faculty track permissions

Faculty are the only role whose LAP / Remedial authority varies per person. In
**User Management → Add/Edit user**, when the role is **Faculty**, a section
appears: **LAP / Remedial management**, with two tick boxes:

- **Manage Remedial** — Initiate Remedial and Close Remedial
- **Manage LAP** — Initiate LAP and Close LAP

Four combinations are possible. All four are valid and all must be tested:

| Ticked | Who they are | Can initiate/close Remedial | Can initiate/close LAP |
|---|---|---|---|
| *(none)* | Viewer | No | No |
| Manage Remedial only | Remedial owner | **Yes** | No |
| Manage LAP only | LAP owner | No | **Yes** |
| Both | Track owner | **Yes** | **Yes** |

Four rules to hold on to:

- **Everyone with the role can still *view* both lists.** The tick boxes control
  the actions, never the visibility.
- A placement made on the **Remedial** page cannot be moved to LAP. LAP is only
  ever started from the **LAP** page.
- The boxes are **not shown** for Location Admin / Program Manager / Super Admin,
  because those roles already hold both through the role.
- Choosing a role other than Faculty must **clear** any ticks, so a demoted user
  loses the personal grants rather than keeping them.

### 1.3 Location scoping

| Role | Sees |
|---|---|
| Super Admin | Every location |
| Program Manager | Every location |
| Location Admin | Only the assigned locations |
| Faculty | Only the assigned locations, and every batch inside them |

A user with **no** location assigned should see no data anywhere. Confirm this is
refused cleanly rather than showing empty tables that look like "no trainees".

---

## 2. Test accounts and data to be ready

Sign-in uses the **Employee ID** (the account's username is derived from it).
Passwords below are the demo seed; use whatever your environment has been given.

| Employee ID | Password | Role | Location granted | Track permissions |
|---|---|---|---|---|
| `10294` | `Admin@123` | Super Admin | All | Both (via role) |
| `20117` | *(ask)* | Program Manager | All | Both (via role) |
| `10295` | `Koc@123` | Location Admin | Kochi | Both (via role) |
| `10296` | `Fac@123` | Faculty | Bangalore | **Manage Remedial only** |
| `10297` | `Fac@123` | Faculty | Bangalore | **Both** |
| *(create)* | *(generated)* | Faculty | *(assign)* | **None** — the viewer case |
| *(create)* | *(generated)* | Faculty | *(assign)* | **Manage LAP only** — create this in US-04 |

**Accounts to create , to complete the matrix (see US-04):**

1. `F-VIEW` — Faculty, no track ticks.
2. `F-LAP` — Faculty, **Manage LAP** only.
3. Give `F-VIEW` and `F-LAP` a location that has at least two batches, so
   location-scoping (US-12) can be checked.

**Data to have ready before starting:**

- At least one location with **two or more batches** (to prove a location grant
  reaches every batch inside it).
- A second location that no scoped account is assigned to.
- Some trainees already on Remedial, some on LAP, some on no track.
- One trainee in the *second* batch of your location, to prove US-12.

---

## 3. Test stories

### 3.1 Authentication and session

**US-01 — Sign in with valid credentials**
- **Given** the sign-in page, **when** I enter a valid Employee ID and password,
  **then** I land on Home and my name and role are shown in the header.

**US-02 — Sign in with a wrong password**
- **Given** the sign-in page, **when** I enter a valid Employee ID with a wrong
  password, **then** an inline error appears, no page navigation happens, and the
  password field is usable again.

**US-03 — Sign in with an unknown Employee ID**
- **Given** the sign-in page, **when** I enter an Employee ID that does not exist,
  **then** the message must not reveal whether the ID exists.

**US-04 — Sign in as an inactive user**
- **Given** a user set to Inactive, **when** I try to sign in, **then** sign-in is
  refused with a clear message.

**US-05 — Sign out**
- **Given** I am signed in, **when** I sign out, **then** I return to the sign-in
  page, and the browser Back button does not return me to a portal page.

**US-06 — Session survives a page refresh**
- **Given** I am signed in, **when** I refresh the browser, **then** I stay signed
  in and land on the page I was on.

**US-07 — Session expiry**
- **Given** I am signed in, **when** the session expires (or the token is
  invalidated), **then** I am returned to sign-in with an "expired" message rather
  than a blank page, and I am not left on a half-loaded screen.

**US-08 — Reaching a page without being signed in**
- **Given** I am signed out, **when** I open any portal URL directly,
  **then** I am sent to sign-in, and back to the page I wanted after signing in.

### 3.2 Navigation

**US-09 — The tab bar matches my role**
- **Given** I sign in as each role in turn, **then** the tabs shown are:

| Role | Tabs visible |
|---|---|
| Super Admin | Home, Assessments, Remedial, LAP, Reports, User Management, Configuration |
| Program Manager | Home, Assessments, Remedial, LAP, Reports |
| Location Admin | Home, Assessments, Remedial, LAP, Reports |
| Faculty | Home, Assessments, Remedial, LAP, Reports |

- A hidden tab must also be unreachable by typing its URL directly — it should
  redirect to Home, not render the screen.

**US-10 — Navigating between tabs**
- **Given** I am on any tab, **when** I click another tab, **then** the page loads,
  the tab is highlighted, and the browser URL matches the tab.

---

### 3.3 Home (dashboard)

**US-11 — Dashboard figures load**
- **Given** I am signed in, **when** I open Home, **then** four cards are shown:
  Total Batches, Total Trainees, On Remedial, On LAP.

**US-12 — Dashboard narrows by location and period**
- **Given** I am on Home, **when** I choose a Year, Quarter, Location, Batch or LG
  from the filter bar, **then** the four figures update to that selection.
- The filter must offer **All** at every level, so a narrowed filter can always be
  undone.

**US-13 — Dashboard respects my locations**
- **Given** I am signed in as a Location Admin or Faculty, **when** I open Home,
  **then** the Location dropdown offers **only** my assigned locations, and the
  figures never include another location's trainees.
- A Location Admin must see "All locations" and be able to narrow; a Faculty
  cannot choose a location they do not hold.

**US-14 — A location grant reaches every batch inside it**
- **Given** a location with two batches and a Faculty assigned to that location,
  **when** I open the Batch dropdown, **then** **both** batches are offered.
- A batch must not be hidden from someone who holds the whole location.

**US-15 — Empty period**
- **Given** I choose a Year/Quarter that holds no batch, **then** I get a clear
  notice naming the step that fixes it, and the page does not sit blank.

### 3.4 Assessments (results)

**US-16 — Search requires a full group**
- **Given** I am on Assessments, **then** the Search button stays disabled until
  Location, Batch and LG are all chosen.

**US-17 — View results for a group**
- **Given** a group is selected and I search, **then** one row per trainee with
  their Employee ID, name, and a column per assessment showing the score and its
  CEFR level.

**US-18 — Search within the results**
- **Given** results are loaded, **when** I type a partial name or an Employee ID
  part, **then** the list narrows. `aarav` and `41207` must both find the same
  person, and matching ignores case.
- Clearing the box restores the full list.

**US-19 — Sort and page the results**
- **Given** results are loaded, **when** I sort by Employee ID, Name or Email, and
  change page or rows-per-page, **then** the order and page are correct, and
  sorting is stable.
- Page counts must reflect the **whole** group, not just the rows on screen.

**US-20 — Edit one trainee's scores**
- **Given** results are loaded and I hold record-results rights, **when** I click
  the action on a row, **then** a dialog opens; **when** I change a score and save,
  **then** the table shows the new score and its CEFR level.
- A score above the assessment's maximum must be refused.
- Clearing a score must remove the result rather than store a zero.

**US-21 — Cancel the score editor**
- **Given** the score dialog is open, **when** I change a score and cancel,
  **then** nothing is saved and the table is unchanged.

**US-22 — Results are scoped to my locations**
- **Given** I am signed in as Faculty or Location Admin, **when** I search a group
  in a location I do not hold, **then** the request is **refused** — not an empty
  table, which would look like a group with no trainees.
- Knowing a trainee's Employee ID must not be enough to score them; an attempt on
  a trainee in another location must be refused.

---

### 3.5 Bulk upload of scores

**US-23 — Open the upload dialog**
- **Given** I am on a loaded group, **when** I open Upload, **then** a three-step
  dialog appears: choose group and assessment → review the sheet → done.

**US-24 — Download the template**
- **Given** the upload dialog, **when** I choose the group and assessment and
  download the template, **then** a spreadsheet with the expected columns for
  that group is downloaded.

**US-25 — Upload a valid sheet**
- **Given** a correctly filled template, **when** I choose the file and confirm,
  **then** the scores are saved and the success message reports how many scores
  the sheet now holds.

**US-26 — Preview warns before saving**
- **Given** a sheet with problems, **then** the preview lists each failing row
  with the spreadsheet row number and the reason, and nothing is saved.

**US-27 — All-or-nothing upload**
- **Given** a sheet where some rows are good and some are bad, **when** I confirm,
  **then** **nothing** is saved — not even the good rows. This is deliberate: a
  half-updated roster is worse than none.

**US-28 — Sheet problems are named clearly**
- **then** I get a specific message for each of: empty file, wrong columns, a score
  above the maximum, a non-numeric score, an Employee ID not in the group, a
  duplicate row, and a name that disagrees with the roster.

**US-29 — Trainees the sheet leaves out**
- **Given** a sheet that does not cover the whole group, **then** the preview
  tells me how many trainees were left out, and the upload still succeeds for the
  rows it does contain.

**US-30 — Download the error report**
- **Given** a preview with failures, **when** I download the error report,
  **then** I get a CSV listing the failed rows.

**US-31 — Go back from the preview**
- **Given** the preview step, **when** I press Back, **then** I return to the
  setup step and can change the group or assessment without redoing everything.


### 3.6 Remedial

**US-32 — View who is on Remedial**
- **Given** I am signed in as any role, **when** I open Remedial, **then** I see
  the trainees currently on the track, with the batch, Employee ID, name, date
  started and the assessment that triggered it.
- A location-scoped user sees only their own locations' trainees.

**US-33 — Filter and search the Remedial list**
- **Given** the list is loaded, **when** I filter by Location, Batch, Year, Quarter
  or LG, and search by name or Employee ID, **then** the list narrows and the
  result count is correct.

**US-34 — Sorting and paging the Remedial list**
- **Given** the list is loaded, **when** I sort by any column and change page or
  rows-per-page, **then** order and paging are correct and stable.

**US-35 — Initiate Remedial (permitted)**
- **Given** I am a Super Admin, Program Manager, Location Admin, or a Faculty with
  **Manage Remedial**, **when** I open a trainee's Initiate dialog, choose the
  assessment, and confirm, **then** the trainee appears on the Remedial list with
  today's date, and the batch "On Remedial" count rises by one.

**US-36 — Initiate Remedial (not permitted)**
- **Given** I am a Faculty **without Manage Remedial**, **when** I open a trainee's
  row, **then** the Initiate Remedial action is not offered.
- If the request is made directly rather than through the screen, the server must
  refuse it. Hiding a button is not the control.

**US-37 — Initiate a trainee who is already on the track**
- **Given** a trainee is already on Remedial, **when** I try to initiate again,
  **then** it is refused with a clear message and no duplicate is created.

**US-38 — The four Faculty permission combinations**

Run this story once per account, using the same trainee and the same actions.

| Account | Ticked | Remedial list visible | Initiate Remedial | Close Remedial | Initiate LAP | Close LAP |
|---|---|---|---|---|---|---|
| `F-VIEW` | none | Yes | **No** | **No** | **No** | **No** |
| `10296` | Remedial | Yes | **Yes** | **Yes** | No | No |
| `F-LAP` | LAP | Yes | **No** | **No** | **Yes** | **Yes** |
| `10297` | Both | Yes | **Yes** | **Yes** | **Yes** | **Yes** |

- **When** I attempt an action my account is not entitled to, **then** it is
  refused with a permission message, nothing changes, and the list is unchanged.
- Sign in as each of the four in turn and confirm the other three accounts' tests
  are unaffected by the previous sign-in (no session bleed).

**US-39 — Close Remedial**
- **Given** I hold Manage Remedial (or an admin role), **when** I open a trainee on
  the track and choose Close Remedial, **then** the trainee leaves the list and the
  batch "On Remedial" count falls by one.

**US-40 — Remediate a trainee from another location**
- **Given** I am location-scoped, **when** I try to initiate or close Remedial for a
  trainee in a location I do not hold, **then** it is refused. Having the permission
  is not the same as having the location.

### 3.7 LAP

**US-41 — View who is on LAP**
- **Given** I am signed in as any role, **when** I open LAP, **then** I see the
  trainees on the track with batch, Employee ID, name, date started and the
  triggering assessment, scoped to my locations.

**US-42 — Filter, search, sort and page the LAP list**
- **Then** the same behaviours as US-33 and US-34 hold on the LAP list.

**US-43 — Initiate LAP (permitted)**
- **Given** I am an admin role, or a Faculty with **Manage LAP**, **when** I
  initiate LAP for a trainee, **then** the trainee appears on the LAP list and the
  "On LAP" count rises by one.

**US-44 — Initiate LAP (not permitted)**
- **Given** I am a Faculty **without Manage LAP** — including a Faculty with
  **Manage Remedial only** — **then** the Initiate LAP action is not offered, and a
  direct request is refused by the server.
- **This is the most important negative test in the pack:** Manage Remedial must
  not imply Manage LAP.

**US-45 — The two tracks are independent**
- **Given** a trainee is on Remedial, **when** I put them on LAP, **then** they
  appear on both lists, and closing one track must not close the other.
- A trainee on a track must not be re-initiated onto the same track.

**US-46 — Close LAP**
- **Given** I hold Manage LAP (or an admin role), **when** I close LAP for a
  trainee, **then** they leave the LAP list and the "On LAP" count falls by one.

**US-47 — Trainee on LAP at another location**
- **Given** I am location-scoped, **then** initiating or closing LAP for a trainee
  in a location I do not hold is refused.

### 3.8 Reports

**US-48 — Open the Reports tab**
- **Given** I am signed in as any role, **when** I open Reports, **then** the
  report cards are shown and the tab is reachable.

**US-49 — Open a trainee report**
- **Given** the report list, **when** I open the Trainee report, **then** a search
  box appears with a way back to the list.

**US-50 — Search for a trainee**
- **Given** the report view, **when** I type a name or Employee ID, **then**
  matching trainees are offered, and choosing one opens their report.
- A search with no matches must say so, not show an empty report.
- The clear button must reset the search.

**US-51 — Report contents**
- **Then** the report shows the trainee's CEFR level, the assessments taken with
  their scores and levels, the LAP and Remedial history with dates, and the totals
  across their batches.

**US-52 — Report is scoped**
- **Given** I am location-scoped, **when** I search for a trainee in a location I
  do not hold, **then** that trainee is not offered and the report cannot be opened.
- **This is the highest-value security story in the pack** — test it explicitly
  for Faculty and Location Admin.

**US-53 — Export the report**
- **Given** a trainee report is open, **when** I export or print it, **then** a
  file is produced that matches what is on screen.

---

---


### 3.9 User Management (Super Admin only)

**US-54 — The tab is admin-only**
- **Given** I am a Program Manager, Location Admin or Faculty, **then** the
  User Management tab is not shown, and typing its URL does not open the page.

**US-55 — List, search, sort and page the users**
- **Given** I am a Super Admin on User Management, **when** I search by name,
  Employee ID or email, and sort by any column, **then** the list and its counts
  are correct.

**US-56 — Filter users by role and by status**
- **When** I filter by role, or by Active/Inactive, **then** only matching users
  are listed, and the filters combine correctly.

**US-57 — Add a user**
- **Given** I open Add user, **when** I complete Employee ID, name, email, role,
  location and password, **then** the user is created and appears in the list.
- A duplicate Employee ID must be refused with a message on that field.

**US-58 — Field validation on Add/Edit user**
- **Then** I get a clear message for each of: empty Employee ID, name, email or
  password; a malformed email; a password below the minimum length.
- The Save button stays disabled until the form is valid.

**US-59 — There is no batch picker**
- **Given** I open Add/Edit user, **then** the dialog shows **Assigned locations**
  and **no** "Assigned batches" control of any kind.
- This is the change in this release: access is granted by location, and a batch
  is never assigned to a person directly. A leftover batch picker is a defect.

**US-60 — Assigned locations behave as a multiple select**
- **When** I open the location picker, **then** I can add and remove several
  locations, see what is currently selected, and remove a tag by its cross.
- Only the locations I am entitled to assign are offered.

**US-61 — LAP / Remedial tick boxes appear only for Faculty**
- **Given** I set the role to Faculty, **then** the **LAP / Remedial management**
  section appears with two checkboxes.
- Changing the role to Location Admin, Program Manager or Super Admin must hide
  the section and clear any ticks.

**US-62 — Set the per-person track permissions**
- **Given** I set the role to Faculty, **when** I tick **Manage Remedial** and/or
  **Manage LAP** and save, **then** reopening that user shows the same ticks.
- Ticking **neither** is valid and must be saved as "no personal grants".
- Ticking **both** is valid and must be saved as "both".

**US-63 — A demoted user loses the personal grants**
- **Given** a Faculty user with both ticks, **when** I change their role to
  Location Admin and save, **then** the track grants are gone. Reopening must not
  resurrect them.

**US-64 — Read-only permissions panel**
- **Given** a user is open, **then** the Permissions section lists what the role
  grants, clearly marked as coming from the role and not editable here — changing
  them means changing the role.

**US-65 — Edit a user**
- **Given** I open Edit, **when** I change a name, email, role, location or the
  Faculty ticks and save, **then** the change is reflected in the list.
- The user's password must not be displayed in the dialog.

**US-66 — Activate / deactivate a user**
- **When** I toggle a user's status, **then** the badge changes and the change
  survives a refresh.
- A deactivated user must fail to sign in (US-04).

**US-67 — Delete a user**
- **Given** I press Delete, **then** a confirmation naming the user appears, and
  only confirming removes them. Cancelling changes nothing.
- After deleting, I must not be able to sign in as that user.

**US-68 — No self-lockout**
- **Given** I am signed in as the only Super Admin, **then** I cannot delete my own
  account or remove my own Super Admin role, so the system cannot be locked out.

---

### 3.10 Configuration (Super Admin only)

**US-69 — The tab is admin-only**
- **Given** I am a Program Manager, Location Admin or Faculty, **then** the
  Configuration tab is not shown and its URL does not open the page.

**US-70 — Add an assessment**
- **Given** I am in Configuration → Assessments, **when** I add an assessment with a
  name, description and score range, **then** it appears in the list and is offered
  to score entry and to the upload.
- A duplicate name, a missing name, or a maximum that is not above the minimum
  must be refused.

**US-71 — Edit an assessment**
- **When** I edit a name, description or maximum, **then** the change is saved and
  shown.

**US-72 — Delete an assessment**
- **Given** I press Delete, **then** a confirmation appears and only confirming
  removes it.
- An assessment that has already been used for a score must not be deletable; the
  app must say why. This protects historic results.

**US-73 — Deactivate an assessment**
- **Given** an assessment is made inactive, **then** it is badged Inactive and is
  not offered for new scores or new uploads, while existing results still show.

**US-74 — Edit the CEFR mapping**
- **Given** Configuration → CEFR Mapping, **when** I change a level's name, minimum
  or maximum, **then** Save Changes becomes available and saving updates the
  mapping everywhere — score entry, upload preview and reports.

**US-75 — Add and remove a CEFR level**
- **When** I add a level, **then** I can set its name, range and colour; **when** I
  remove one, **then** the others are kept in order.
- Overlapping or gapped ranges must be refused with a message, and Save must stay
  disabled until they are valid.

**US-76 — Reset the CEFR mapping**
- **When** I press Reset to Default, **then** the published Versant defaults are
  restored in the editor, and the change only reaches the live data on Save.

**US-77 — Invalid CEFR input is refused**
- **Then** a non-numeric score, a negative minimum, a maximum below its minimum,
  and an empty level name are each refused with a message naming the problem.

**US-78 — Configuration is not affected by my location**
- **Given** I am a Super Admin, **then** assessments and CEFR mapping are global —
  changing them affects every location. Confirm this is intended behaviour and not
  a scoping bug.

---



## 4. Access control — run these for every role

This section is the heart of the pack. Run it once per role: Super Admin,
Program Manager, Location Admin, and each of the four Faculty variants.

**AC-01 — Tabs match the role.** The tab bar shows only what §1.1 grants.

**AC-02 — Hidden pages cannot be reached by URL.** Type each of
`/dashboard/reports`, `/dashboard/user-management`, `/dashboard/configuration`
directly. A forbidden page must not render.

**AC-03 — Actions are hidden *and* refused.** For each action the role does not
hold (Initiate/Close on either track), confirm the control is not offered, and
confirm a direct request is refused by the server. A hidden button alone is not a
control.

**AC-04 — Location scoping holds on every screen.** With one location assigned,
confirm no trainee, batch, report, or dashboard figure from another location
appears anywhere — Home, Assessments, Remedial, LAP, and Reports.

**AC-05 — A location grant covers every batch inside it.** With a location holding
two or more batches, confirm both appear in the Batch dropdown and both appear in
the results. **A batch hidden from someone who holds the whole location is a bug
in this release's core change.**

**AC-06 — Cross-location is refused, not empty.** Request a batch or trainee in an
unassigned location. The expected answer is a **refusal**; an empty table is
wrong, because it reads as "this group has no trainees".

**AC-07 — A newly created batch is visible at once.** Add a batch inside a
location the user already holds, sign in fresh, and confirm it is offered without
any extra assignment step. This is the point of the change — no batch list to keep
in step.

**AC-08 — A location with no user.** Confirm a location holding trainees but no
assigned user is reachable only by Super Admin and Program Manager.

---

## 5. Cross-cutting checks

**CC-01 — Counts agree across screens.** On a given location, Home's "On
Remedial" must equal the number of rows on the Remedial list, and likewise for LAP
and for total trainees. They are computed by the same data, so a mismatch is a
defect.

**CC-02 — A change is visible everywhere.** Score a trainee, then check the
assessment, the dashboard count, the trainee report and any batch report all
reflect it without a manual refresh.

**CC-03 — Clearing a value clears it.** Clearing a score or a date must remove the
value, not store a zero or an empty string.

**CC-04 — The server re-checks what the browser allowed.** Anything the UI blocks
must also be blocked by the server when called directly.

**CC-05 — Dates and time zones.** Assessment dates, "started on" dates and batch
periods must display exactly as entered. A January date must never appear as
December.

**CC-06 — Long and unusual text.** Enter a very long name, a name with
accents/apostrophes, and an email at the length limit. Nothing should truncate
into another field or break the layout.

**CC-07 — Saving twice.** Double-click a Save/Upload/Confirm button. The action
must happen once, not twice.

**CC-08 — Losing your place.** With a dialog open and typed-in changes, press
Cancel or close it. Nothing should be saved.

**CC-09 — Slow connection.** The figures must not silently show as zero when the
request fails; a clear "could not be loaded" notice is expected.

**CC-10 — Refreshing mid-flow.** Refresh on a loaded results page, an open report,
and step 2 of the upload. Each must recover without a blank screen or a stuck
dialog.

**CC-11 — Keyboard only.** Every action — signing in, filtering, saving, deleting,
confirming — must be reachable and operable from the keyboard, with visible focus.

**CC-12 — Nothing sensitive left behind.** After signing out, no trainee data,
token or password remains viewable in the browser's developer tools.



## 6. Result log

Copy this table into your test report and fill it in.

| Story | Role used | Result | Defect ref | Notes |
|---|---|---|---|---|
| US-01 … US-78 | | | | |
| AC-01 … AC-08 (repeat per role) | | | | |
| CC-01 … CC-12 | | | | |

**Coverage summary**

| Section | Stories | Count |
|---|---|---|
| Authentication and session | US-01 – US-08 | 8 |
| Navigation | US-09 – US-10 | 2 |
| Home | US-11 – US-15 | 5 |
| Assessments | US-16 – US-22 | 7 |
| Bulk upload | US-23 – US-31 | 9 |
| Remedial | US-32 – US-40 | 9 |
| LAP | US-41 – US-47 | 7 |
| Reports | US-48 – US-53 | 6 |
| User Management | US-54 – US-68 | 15 |
| Configuration | US-69 – US-78 | 10 |
| Access control (× 4 roles) | AC-01 – AC-08 | 8 × 4 = 32 |
| Cross-cutting | CC-01 – CC-12 | 12 |
| **Total** | | **122** |