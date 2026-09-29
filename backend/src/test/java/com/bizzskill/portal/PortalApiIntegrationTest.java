package com.bizzskill.portal;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end tests of the API against a real PostgreSQL database.
 *
 * <p>Runs the full stack — filters, token validation, method security, JPA, the
 * scoping queries — because the rules most worth protecting here (who may see
 * which trainees, and who may score them) only exist in the interaction between
 * those layers. A mocked-out test would assert that the code calls itself.
 *
 * <p>{@code @Transactional} rolls the fixtures back after each test, so the suite
 * is repeatable and leaves the database as it found it.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class PortalApiIntegrationTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    private String adminToken;
    private String facultyToken;
    /** Faculty granted Remedial management on their own account, never LAP. */
    private String remedialFacultyToken;
    /** Faculty granted both track managements on their own account. */
    private String lapRemedialFacultyToken;

    /**
     * A two-location, two-batch fixture, so every scoping assertion has something
     * outside the scope to be refused.
     *
     * <p>The bootstrap admin comes from migration V3; the restricted faculty
     * account is created here because its assignments are what the tests are about.
     *
     * <p>The two batches begin in different quarters (Q1 and Q3 2026) so the
     * dashboard's period filter has one batch to include and one to exclude.
     */
    @BeforeEach
    void setUp() throws Exception {
        jdbc.update("""
                insert into location (txtlocation_id, txtlocation_name) values
                    ('KOC', 'Kochi'), ('TRV', 'Trivandrum')
                on conflict do nothing
                """);
        jdbc.update("""
                insert into batch (intbatch_id, txtstatus, txtbatch_type, txtbatch_name,
                                   txtilp_location_id, datebatch_start_date, datebatch_end_date)
                values (9001, 'A', 'ILP', 'Batch 01', 'KOC', '2026-01-06', '2026-06-30'),
                       (9002, 'A', 'ILP', 'Batch 01', 'TRV', '2026-07-01', '2026-12-20')
                on conflict do nothing
                """);
        jdbc.update("""
                insert into learning_group (intlg_id, txtlg_name, txtstatus, txtlg_type,
                                            intbatch_id, txtlocation_id, datestart_date)
                values (8001, 'LG Alpha', 'A', 'ILP', 9001, 'KOC', '2026-01-06')
                on conflict do nothing
                """);
        jdbc.update("""
                insert into participant (intparticipant_id, intemployee_id, txtparticipant_name,
                                         intbatch_id, intlg_id, txtreference_id, intstatus_id, txtphase_id)
                values (6001, 70001, 'Aarav Nair', 9001, 8001, 'KOC-1', 1, 'P1'),
                       (6002, 70002, 'Meera Iyer', 9001, 8001, 'KOC-2', 1, 'P1'),
                       (6003, 70003, 'Rahul Kumar', 9002, null, 'TRV-1', 1, 'P1')
                on conflict do nothing
                """);

        // Faculty, assigned the Kochi location — so batch 9002 at Trivandrum and its
        // trainee are out of scope.
        // Three of them, one per faculty role, so the split between the two track
        // permissions is exercised against the real database rather than asserted
        // only in the matrix.
        seedFaculty(70009L, "faculty1", "Divya Sharma", "fac1@test.local", "faculty");
        seedFaculty(70021L, "facultyrem", "Meera Iyer", "facrem@test.local", "faculty");
        seedFaculty(70022L, "facultyboth", "Arjun Menon", "facboth@test.local", "faculty");

        // The two faculty accounts differ only in the track permissions granted
        // to the account itself, which is what ticking the box in User
        // Management does. Neither is a different role.
        grantTrackPermissions("facultyrem", "lap-remedial.remedial-manage");
        grantTrackPermissions("facultyboth",
                "lap-remedial.remedial-manage", "lap-remedial.lap-manage");

        adminToken = signIn("admin", "Admin@123");
        facultyToken = signIn("faculty1", "Fac@123");
        remedialFacultyToken = signIn("facultyrem", "Fac@123");
        lapRemedialFacultyToken = signIn("facultyboth", "Fac@123");
    }

    /** Grants track permissions to one account, over and above its role's. */
    private void grantTrackPermissions(String username, String... codes) {
        for (String code : codes) {
            jdbc.update("""
                    insert into app_user_permission (intuser_id, intpermission_id)
                    select u.intuser_id, p.intpermission_id
                    from app_user u, app_permission p
                    where u.txtusername = ? and p.txtpermission_code = ?
                    on conflict do nothing
                    """, username, code);
        }
    }

    /** One faculty account on the named role, scoped to the Kochi location. */
    private void seedFaculty(long employeeId, String username, String name, String email, String role) {
        jdbc.update("""
                insert into app_user (intemployee_id, txtusername, txtname, txtemail, txtpassword,
                                      introle_id, txtstatus, txtcreated_by)
                select ?, ?, ?, ?, ?, r.introle_id, 'A', 'test'
                from app_role r where r.txtrole_code = ?
                on conflict (intemployee_id) do nothing
                """, employeeId, username, name, email, "Fac@123", role);
        // Location only: every batch inside Kochi — 9001 — comes with it, while
        // 9002 at Trivandrum stays out of reach.
        jdbc.update("""
                insert into app_user_location (intuser_id, txtlocation_id)
                select intuser_id, 'KOC' from app_user where txtusername = ?
                on conflict do nothing
                """, username);
    }

    private String signIn(String employeeId, String password) throws Exception {
        String body = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"employeeId\":\"" + employeeId + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.accessToken");
    }

    @Nested
    @DisplayName("signing in")
    class SigningIn {

        @Test
        @DisplayName("returns the account, its role and its permissions")
        void returnsAccountAndPermissions() throws Exception {
            mvc.perform(post("/api/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"employeeId\":\"admin\",\"password\":\"Admin@123\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.accessToken").isNotEmpty())
                    .andExpect(jsonPath("$.user.role").value("superadmin"))
                    .andExpect(jsonPath("$.user.permissions.length()").value(9))
                    // The two track permissions are separate, so a Super Admin
                    // holds both and an endpoint can check either one.
                    .andExpect(jsonPath("$.user.permissions").value(
                            hasItems("lap-remedial.remedial-manage", "lap-remedial.lap-manage")));
        }

        @Test
        @DisplayName("never returns the password")
        void neverReturnsThePassword() throws Exception {
            mvc.perform(post("/api/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"employeeId\":\"admin\",\"password\":\"Admin@123\"}"))
                    .andExpect(jsonPath("$.user.password").doesNotExist())
                    .andExpect(jsonPath("$.user.txtPassword").doesNotExist());
        }

        @Test
        @DisplayName("rejects a wrong password with 401")
        void rejectsWrongPassword() throws Exception {
            mvc.perform(post("/api/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"employeeId\":\"admin\",\"password\":\"wrong\"}"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("answers an unknown account the same way as a wrong password")
        void unknownAccountLooksLikeWrongPassword() throws Exception {
            // Same status and same message, so the response cannot be used to
            // discover which employee numbers exist.
            mvc.perform(post("/api/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"employeeId\":\"999999\",\"password\":\"whatever\"}"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.message")
                            .value("Your Employee ID or password is incorrect."));
        }

        @Test
        @DisplayName("rejects an empty payload with field errors")
        void rejectsEmptyPayload() throws Exception {
            mvc.perform(post("/api/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"employeeId\":\"\",\"password\":\"\"}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors.length()").value(2));
        }
    }

    @Nested
    @DisplayName("paged lists")
    class PagedLists {

        @Test
        @DisplayName("a roster page carries the total, not just the rows")
        void rosterPageCarriesTheTotal() throws Exception {
            mvc.perform(get("/api/assessments/trainees?batchId=9001&page=0&size=1")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items.length()").value(1))
                    // Two trainees are in batch 9001, so the client can draw a pager
                    // without having been sent both.
                    .andExpect(jsonPath("$.totalElements").value(2))
                    .andExpect(jsonPath("$.totalPages").value(2))
                    .andExpect(jsonPath("$.page").value(0))
                    .andExpect(jsonPath("$.size").value(1))
                    .andExpect(jsonPath("$.hasNext").value(true));
        }

        @Test
        @DisplayName("the last page returns the remainder and says there is no more")
        void lastPageReturnsTheRemainder() throws Exception {
            mvc.perform(get("/api/assessments/trainees?batchId=9001&page=1&size=1")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items.length()").value(1))
                    .andExpect(jsonPath("$.totalElements").value(2))
                    .andExpect(jsonPath("$.hasNext").value(false));
        }

        @Test
        @DisplayName("search narrows the whole group, not just the page")
        void searchNarrowsTheWholeGroup() throws Exception {
            // Sized to one row: were the filter applied after the page was chosen,
            // this would find nothing and report a total of one.
            mvc.perform(get("/api/assessments/trainees?batchId=9001&page=0&size=1&search=Meera")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items.length()").value(1))
                    .andExpect(jsonPath("$.totalElements").value(1))
                    .andExpect(jsonPath("$.items[0].name").value("Meera Iyer"));
        }

        @Test
        @DisplayName("search matches a partial employee number")
        void searchMatchesPartialEmployeeNumber() throws Exception {
            mvc.perform(get("/api/assessments/trainees?batchId=9001&search=7000")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totalElements").value(2));
        }

        @Test
        @DisplayName("search is case-insensitive")
        void searchIgnoresCase() throws Exception {
            mvc.perform(get("/api/assessments/trainees?batchId=9001&search=aArAv")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totalElements").value(1))
                    .andExpect(jsonPath("$.items[0].name").value("Aarav Nair"));
        }

        @Test
        @DisplayName("searching for nobody reports an empty page rather than a failure")
        void searchWithNoMatches() throws Exception {
            mvc.perform(get("/api/assessments/trainees?batchId=9001&search=nobodyhere")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items.length()").value(0))
                    .andExpect(jsonPath("$.totalElements").value(0))
                    .andExpect(jsonPath("$.totalPages").value(0))
                    .andExpect(jsonPath("$.hasNext").value(false));
        }

        @Test
        @DisplayName("the requested order is applied across the whole group")
        void sortIsApplied() throws Exception {
            mvc.perform(get("/api/assessments/trainees?batchId=9001&sort=employeeId&direction=desc")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[0].employeeId").value("70002"))
                    .andExpect(jsonPath("$.items[1].employeeId").value("70001"));
        }

        @Test
        @DisplayName("an unknown sort key is refused instead of reaching the query")
        void unknownSortKeyIsRefused() throws Exception {
            // The property it names is real but must never be sortable.
            mvc.perform(get("/api/assessments/trainees?batchId=9001&sort=txtpassword")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("sort"));
        }

        @Test
        @DisplayName("a direction that is not asc or desc is refused")
        void badDirectionIsRefused() throws Exception {
            mvc.perform(get("/api/assessments/trainees?batchId=9001&sort=name&direction=sideways")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("direction"));
        }

        @Test
        @DisplayName("a page larger than the cap is refused")
        void oversizedPageIsRefused() throws Exception {
            mvc.perform(get("/api/assessments/trainees?batchId=9001&size=100000")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("size"));
        }

        @Test
        @DisplayName("a negative page is refused rather than clamped")
        void negativePageIsRefused() throws Exception {
            mvc.perform(get("/api/assessments/trainees?batchId=9001&page=-1")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("page"));
        }

        @Test
        @DisplayName("the track filter narrows to one tab")
        void trackFilterNarrowsToATab() throws Exception {
            mvc.perform(get("/api/assessments/trainees?batchId=9001&status=none")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    // Nobody in batch 9001 is on a track yet.
                    .andExpect(jsonPath("$.totalElements").value(2));

            mvc.perform(get("/api/assessments/trainees?batchId=9001&status=lap")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totalElements").value(0));
        }

        @Test
        @DisplayName("an unknown track filter is refused")
        void unknownTrackFilterIsRefused() throws Exception {
            mvc.perform(get("/api/assessments/trainees?batchId=9001&status=sideways")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("status"));
        }

        @Test
        @DisplayName("the lookup answers only about the numbers it was given")
        void lookupAnswersAboutTheNumbersGiven() throws Exception {
            mvc.perform(post("/api/assessments/trainees/lookup?batchId=9001")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"employeeIds\": [70001, 99999]}"))
                    .andExpect(status().isOk())
                    // The group holds two, however many were asked about...
                    .andExpect(jsonPath("$.groupSize").value(2))
                    // ...but only the one that is really in it comes back.
                    .andExpect(jsonPath("$.trainees.length()").value(1))
                    .andExpect(jsonPath("$.trainees[0].employeeId").value("70001"))
                    .andExpect(jsonPath("$.trainees[0].name").value("Aarav Nair"));
        }

        @Test
        @DisplayName("the lookup refuses an empty list")
        void lookupRefusesAnEmptyList() throws Exception {
            mvc.perform(post("/api/assessments/trainees/lookup?batchId=9001")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"employeeIds\": []}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("employeeIds"));
        }

        @Test
        @DisplayName("the lookup refuses a trainee outside the caller's scope")
        void lookupIsScoped() throws Exception {
            // 70003 belongs to batch 9002, which faculty cannot see.
            mvc.perform(post("/api/assessments/trainees/lookup")
                            .header("Authorization", bearer(facultyToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"employeeIds\": [70001, 70003]}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.groupSize").value(2))
                    .andExpect(jsonPath("$.trainees.length()").value(1))
                    .andExpect(jsonPath("$.trainees[0].employeeId").value("70001"));
        }

        @Test
        @DisplayName("accounts page with a total too")
        void accountsPageWithATotal() throws Exception {
            mvc.perform(get("/api/users?page=0&size=1")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items.length()").value(1))
                    .andExpect(jsonPath("$.totalElements").value(org.hamcrest.Matchers.greaterThan(1)))
                    .andExpect(jsonPath("$.hasNext").value(true));
        }

        @Test
        @DisplayName("accounts can be filtered by role and by status")
        void accountsCanBeFiltered() throws Exception {
            mvc.perform(get("/api/users?role=faculty").header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[*].role")
                            .value(org.hamcrest.Matchers.everyItem(
                                    org.hamcrest.Matchers.is("faculty"))));

            mvc.perform(get("/api/users?status=inactive").header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[*].status")
                            .value(org.hamcrest.Matchers.everyItem(
                                    org.hamcrest.Matchers.is("inactive"))));
        }

        @Test
        @DisplayName("an account search reaches beyond the first page")
        void accountSearchReachesBeyondTheFirstPage() throws Exception {
            mvc.perform(get("/api/users?page=0&size=1&search=fac1@test.local")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items.length()").value(1))
                    .andExpect(jsonPath("$.totalElements").value(1))
                    .andExpect(jsonPath("$.items[0].employeeId").value("70009"));
        }

        @Test
        @DisplayName("the default page is the first, at the default size")
        void defaultsApply() throws Exception {
            mvc.perform(get("/api/assessments/trainees?batchId=9001")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.page").value(0))
                    .andExpect(jsonPath("$.size").value(25));
        }
    }

    @Nested
    @DisplayName("authentication is required")
    class RequiresAuthentication {

        @Test
        @DisplayName("a request with no token is refused")
        void noTokenIsRefused() throws Exception {
            mvc.perform(get("/api/organization/locations")).andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("a forged token is refused")
        void forgedTokenIsRefused() throws Exception {
            mvc.perform(get("/api/organization/locations")
                            .header("Authorization", "Bearer not.a.real.token"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("the error body matches the API's own error shape")
        void errorShapeIsConsistent() throws Exception {
            mvc.perform(get("/api/organization/locations"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.status").value(401))
                    .andExpect(jsonPath("$.path").value("/api/organization/locations"));
        }

        @Test
        @DisplayName("an unmatched path is a 404, not a 500")
        void unmatchedPathIsNotFound() throws Exception {
            // Regression: this used to fall into the catch-all and be reported as a
            // server fault, which pollutes error monitoring and misleads the client.
            mvc.perform(get("/api/organization/nope").header("Authorization", bearer(adminToken)))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.status").value(404));
        }

        @Test
        @DisplayName("the health probe is public and reports readiness")
        void healthIsPublic() throws Exception {
            mvc.perform(get("/api/health"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("UP"));
        }
    }

    @Nested
    @DisplayName("role scope narrows what is visible")
    class ScopeIsEnforced {

        @Test
        @DisplayName("an unrestricted admin sees every location")
        void adminSeesEveryLocation() throws Exception {
            mvc.perform(get("/api/organization/locations").header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(2));
        }

        @Test
        @DisplayName("faculty see only their assigned batch")
        void facultySeeOnlyTheirBatch() throws Exception {
            mvc.perform(get("/api/organization/locations").header("Authorization", bearer(facultyToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].id").value("KOC"))
                    .andExpect(jsonPath("$[0].batches.length()").value(1))
                    .andExpect(jsonPath("$[0].batches[0].id").value("9001"))
                    // The filter bar groups batches into quarters by this date.
                    .andExpect(jsonPath("$[0].batches[0].startDate").value("2026-01-06"));
        }

        @Test
        @DisplayName("faculty see only their own trainees, even with no filter")
        void facultySeeOnlyTheirTrainees() throws Exception {
            mvc.perform(get("/api/assessments/trainees").header("Authorization", bearer(facultyToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items.length()").value(2))
                    .andExpect(jsonPath("$.totalElements").value(2))
                    .andExpect(jsonPath("$.items[*].employeeId")
                            .value(org.hamcrest.Matchers.containsInAnyOrder("70001", "70002")));
        }

        @Test
        @DisplayName("asking for a batch in another location is refused, not silently emptied")
        void anotherBatchIsRefused() throws Exception {
            mvc.perform(get("/api/assessments/trainees?batchId=9002")
                            .header("Authorization", bearer(facultyToken)))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("asking for another location is refused")
        void anotherLocationIsRefused() throws Exception {
            mvc.perform(get("/api/assessments/trainees?locationId=TRV")
                            .header("Authorization", bearer(facultyToken)))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    @DisplayName("scoring is scoped and permission-checked")
    class ScoringIsProtected {

        @Test
        @DisplayName("faculty cannot score a trainee in another location, even knowing the id")
        void cannotScoreOutsideTheirLocation() throws Exception {
            // The knowledge that employee 70003 exists must not be enough. 70003
            // sits at Trivandrum; Kochi is the only location assigned.
            mvc.perform(patch("/api/assessments/trainees/70003")
                            .header("Authorization", bearer(facultyToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"results\":{\"1\":{\"score\":50}}}"))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("faculty can score their own location's trainee")
        void canScoreTheirOwnTrainee() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70001")
                            .header("Authorization", bearer(facultyToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"results\":{\"1\":{\"score\":50}}}"))
                    .andExpect(status().isNoContent());
        }

        @Test
        @DisplayName("a faculty granted a track on their account carries it in the token")
        void facultyCarriesTheirOwnGrant() throws Exception {
            // The per-person grant has to reach the token, or ticking the box in
            // User Management would appear to work and then not.
            mvc.perform(post("/api/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"employeeId\":\"facultyrem\",\"password\":\"Fac@123\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.user.role").value("faculty"))
                    .andExpect(jsonPath("$.user.permissions").value(hasItem("lap-remedial.remedial-manage")))
                    .andExpect(jsonPath("$.user.permissions").value(not(hasItem("lap-remedial.lap-manage"))));
        }

        @Test
        @DisplayName("an administrator can grant one track to a new faculty account")
        void createsFacultyWithOneTrackPermission() throws Exception {
            // The flow the client asked for: pick Faculty, tick one track.
            mvc.perform(post("/api/users")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"employeeId":"70023","name":"Nisha Rao","role":"faculty",
                                     "locationIds":["KOC"],
                                     "trackPermissions":["lap-remedial.remedial-manage"]}
                                    """))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.user.role").value("faculty"))
                    .andExpect(jsonPath("$.user.permissions").value(hasItem("lap-remedial.remedial-manage")))
                    .andExpect(jsonPath("$.user.permissions").value(not(hasItem("lap-remedial.lap-manage"))));
        }

        @Test
        @DisplayName("a faculty can be granted both tracks")
        void createsFacultyWithBothTrackPermissions() throws Exception {
            mvc.perform(post("/api/users")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"employeeId":"70024","name":"Om Prakash","role":"faculty",
                                     "locationIds":["KOC"],
                                     "trackPermissions":["lap-remedial.remedial-manage",
                                                        "lap-remedial.lap-manage"]}
                                    """))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.user.permissions").value(
                            hasItems("lap-remedial.remedial-manage", "lap-remedial.lap-manage")));
        }

        @Test
        @DisplayName("a faculty grant cannot be used to hand out any other permission")
        void refusesToGrantOtherPermissions() throws Exception {
            // The boundary that matters: `trackPermissions` is not a way to grant
            // users.manage to a faculty, and is refused rather than ignored.
            mvc.perform(post("/api/users")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"employeeId":"70026","name":"Sneaky Iyer","role":"faculty",
                                     "locationIds":["KOC"],
                                     "trackPermissions":["users.manage"]}
                                    """))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("trackPermissions[0]"));
        }

        @Test
        @DisplayName("faculty cannot move a trainee onto a remedial track")
        void facultyCannotManageLapRemedial() throws Exception {
            // The base faculty role holds lap-remedial.view but neither manage
            // permission, so it can read the tracks and move nobody.
            mvc.perform(patch("/api/assessments/trainees/70001/lap-remedial")
                            .header("Authorization", bearer(facultyToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"remedial\",\"remark\":\"Needs support.\"}"))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("faculty cannot move a trainee onto LAP either")
        void facultyCannotMoveToLap() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70001/lap-remedial")
                            .header("Authorization", bearer(facultyToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"lap\",\"remark\":\"No improvement.\"}"))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("a Remedial-only faculty member can place a trainee on Remedial")
        void remedialFacultyCanInitiateRemedial() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70001/lap-remedial")
                            .header("Authorization", bearer(remedialFacultyToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"remedial\",\"remark\":\"Needs support.\"}"))
                    .andExpect(status().isNoContent());
        }

        @Test
        @DisplayName("a Remedial-only faculty member cannot place a trainee on LAP")
        void remedialFacultyCannotInitiateLap() throws Exception {
            // The point of the split: holding the Remedial permission must not
            // carry over to the other track.
            mvc.perform(patch("/api/assessments/trainees/70001/lap-remedial")
                            .header("Authorization", bearer(remedialFacultyToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"lap\",\"remark\":\"No improvement.\"}"))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("a faculty member with both permissions can place a trainee on LAP")
        void lapRemedialFacultyCanInitiateLap() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70001/lap-remedial")
                            .header("Authorization", bearer(lapRemedialFacultyToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"lap\",\"remark\":\"No improvement.\"}"))
                    .andExpect(status().isNoContent());
        }

        @Test
        @DisplayName("closing a LAP track needs the LAP permission, not just Remedial's")
        void remedialFacultyCannotCloseLap() throws Exception {
            // Admin puts the trainee on LAP first, so the close is judged against
            // the track they are actually on rather than the one in the body.
            mvc.perform(patch("/api/assessments/trainees/70001/lap-remedial")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"lap\",\"remark\":\"No improvement.\"}"))
                    .andExpect(status().isNoContent());

            mvc.perform(patch("/api/assessments/trainees/70001/lap-remedial")
                            .header("Authorization", bearer(remedialFacultyToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"none\",\"remark\":\"Finished.\"}"))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("a Remedial-only faculty member can close their own Remedial track")
        void remedialFacultyCanCloseRemedial() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70001/lap-remedial")
                            .header("Authorization", bearer(remedialFacultyToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"remedial\",\"remark\":\"Needs support.\"}"))
                    .andExpect(status().isNoContent());

            mvc.perform(patch("/api/assessments/trainees/70001/lap-remedial")
                            .header("Authorization", bearer(remedialFacultyToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"none\",\"remark\":\"Support completed.\"}"))
                    .andExpect(status().isNoContent());
        }

        @Test
        @DisplayName("faculty cannot reach user management")
        void facultyCannotReachUserManagement() throws Exception {
            mvc.perform(get("/api/users").header("Authorization", bearer(facultyToken)))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("faculty cannot change the CEFR mapping")
        void facultyCannotChangeTheMapping() throws Exception {
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                            .put("/api/configuration/cefr-mapping")
                            .header("Authorization", bearer(facultyToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("[]"))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("a score is stored with the level the current mapping awards")
        void scoreIsStoredWithItsLevel() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70001")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"results\":{\"1\":{\"score\":76}}}"))
                    .andExpect(status().isNoContent());

            // 76 sits in both B2+ (68-76) and C1 (76-85); the higher minimum wins.
            Integer stored = jdbc.queryForObject(
                    "select intscore from app_assessment_result where intemployee_id = 70001",
                    Integer.class);
            String level = jdbc.queryForObject(
                    "select txtcefr_level from app_assessment_result where intemployee_id = 70001",
                    String.class);

            assertThat(stored).isEqualTo(76);
            assertThat(level).isEqualTo("C1");
        }

        @Test
        @DisplayName("every score change is written to the audit trail")
        void everyChangeIsAudited() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70001")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"results\":{\"1\":{\"score\":40}}}"))
                    .andExpect(status().isNoContent());
            mvc.perform(patch("/api/assessments/trainees/70001")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"results\":{\"1\":{\"score\":55}}}"))
                    .andExpect(status().isNoContent());

            Integer changes = jdbc.queryForObject(
                    "select count(*) from app_assessment_result_audit where intemployee_id = 70001",
                    Integer.class);
            Integer previousScore = jdbc.queryForObject(
                    "select intold_score from app_assessment_result_audit "
                            + "where intemployee_id = 70001 and txtaction = 'UPDATE'",
                    Integer.class);
            // The new half matters as much as the old: this row exists to answer
            // "what was it changed to", and asserting only the old value let a
            // writer that recorded 40 -> 40 pass.
            Integer newScore = jdbc.queryForObject(
                    "select intnew_score from app_assessment_result_audit "
                            + "where intemployee_id = 70001 and txtaction = 'UPDATE'",
                    Integer.class);
            String previousLevel = jdbc.queryForObject(
                    "select txtold_cefr from app_assessment_result_audit "
                            + "where intemployee_id = 70001 and txtaction = 'UPDATE'",
                    String.class);
            String newLevel = jdbc.queryForObject(
                    "select txtnew_cefr from app_assessment_result_audit "
                            + "where intemployee_id = 70001 and txtaction = 'UPDATE'",
                    String.class);

            assertThat(changes).isEqualTo(2);
            assertThat(previousScore).isEqualTo(40);
            assertThat(newScore).isEqualTo(55);
            assertThat(previousLevel).isNotEqualTo(newLevel);
        }

        @Test
        @DisplayName("a cleared score is audited with the value that was removed")
        void clearingIsAudited() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70001")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"results\":{\"1\":{\"score\":40}}}"))
                    .andExpect(status().isNoContent());
            mvc.perform(patch("/api/assessments/trainees/70001")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"results\":{\"1\":{\"score\":null}}}"))
                    .andExpect(status().isNoContent());

            Map<String, Object> removed = jdbc.queryForMap(
                    "select intold_score, intnew_score from app_assessment_result_audit "
                            + "where intemployee_id = 70001 and txtaction = 'DELETE'");

            assertThat(removed.get("intold_score")).isEqualTo(40);
            assertThat(removed.get("intnew_score")).isNull();
        }

        @Test
        @DisplayName("a score above the assessment maximum is refused")
        void rejectsScoreAboveMaximum() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70001")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"results\":{\"1\":{\"score\":91}}}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("results.1"));
        }

        @Test
        @DisplayName("an assessment's maximum cannot be lowered below a recorded score")
        void refusesMaximumBelowRecordedScore() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70001")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"results\":{\"1\":{\"score\":70}}}"))
                    .andExpect(status().isNoContent());

            // 70 is on record, so a maximum of 50 would make it impossible.
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                            .put("/api/configuration/assessments/1")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"Pre Assessment\",\"maxScore\":50}"))
                    .andExpect(status().isUnprocessableEntity());

            // Lowering it as far as the recorded scores allow is still permitted.
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                            .put("/api/configuration/assessments/1")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"Pre Assessment\",\"maxScore\":70}"))
                    .andExpect(status().isOk());
        }
    }

    @Nested
    @DisplayName("bulk upload")
    class BulkUpload {

        @Test
        @DisplayName("the template lists the group's trainees with their current scores")
        void templateListsTheGroup() throws Exception {
            mvc.perform(get("/api/assessments/uploads/template?examId=1&batchId=9001")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(result -> assertThat(result.getResponse().getContentAsString())
                            .startsWith("Emp ID,Name,Score")
                            .contains("70001,Aarav Nair")
                            .contains("70002,Meera Iyer"));
        }

        @Test
        @DisplayName("commits a sheet and stores every row")
        void commitsASheet() throws Exception {
            mvc.perform(post("/api/assessments/uploads")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"examId":"1","batchId":9001,"assessedOn":"2026-09-18","rows":[
                                      {"employeeId":"70001","score":33},
                                      {"employeeId":"70002","score":80}]}
                                    """))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.saved").value(2));

            Integer stored = jdbc.queryForObject(
                    "select count(*) from app_assessment_result where intassessment_id = 1", Integer.class);
            assertThat(stored).isEqualTo(2);
        }

        @Test
        @DisplayName("refuses the whole sheet when any row is wrong, storing nothing")
        void refusesTheWholeSheet() throws Exception {
            mvc.perform(post("/api/assessments/uploads")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"examId":"1","batchId":9001,"assessedOn":"2026-09-18","rows":[
                                      {"employeeId":"70001","score":33},
                                      {"employeeId":"70002","score":500}]}
                                    """))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("rows[1].score"));

            // The valid row must not have been applied.
            Integer stored = jdbc.queryForObject(
                    "select count(*) from app_assessment_result where intassessment_id = 1", Integer.class);
            assertThat(stored).isZero();
        }

        @Test
        @DisplayName("refuses a sheet naming a trainee from another group")
        void refusesAnotherGroupsTrainee() throws Exception {
            mvc.perform(post("/api/assessments/uploads")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"examId":"1","batchId":9001,"assessedOn":"2026-09-18","rows":[
                                      {"employeeId":"70003","score":50}]}
                                    """))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("rows[0].employeeId"));
        }

        @Test
        @DisplayName("faculty cannot upload outside their own batch")
        void facultyCannotUploadOutsideTheirBatch() throws Exception {
            mvc.perform(post("/api/assessments/uploads")
                            .header("Authorization", bearer(facultyToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"examId":"1","batchId":9002,"assessedOn":"2026-09-18","rows":[
                                      {"employeeId":"70003","score":50}]}
                                    """))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    @DisplayName("user management")
    class UserManagement {

        @Test
        @DisplayName("creates an account and returns a one-time password when none is given")
        void createsAccountWithGeneratedPassword() throws Exception {
            String body = mvc.perform(post("/api/users")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"employeeId":"70010","name":"New Admin","role":"location-admin",
                                     "locationIds":["KOC"]}
                                    """))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.user.employeeId").value("70010"))
                    .andExpect(jsonPath("$.user.password").doesNotExist())
                    .andExpect(jsonPath("$.temporaryPassword").isNotEmpty())
                    .andReturn().getResponse().getContentAsString();

            // The generated password must actually work.
            String password = JsonPath.read(body, "$.temporaryPassword");
            mvc.perform(post("/api/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"employeeId\":\"70010\",\"password\":\"" + password + "\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.user.role").value("location-admin"));
        }

        @Test
        @DisplayName("refuses a role whose scope needs assignments when none are given")
        void refusesMissingAssignments() throws Exception {
            mvc.perform(post("/api/users")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"employeeId\":\"70011\",\"name\":\"No Loc\",\"role\":\"location-admin\"}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("locationIds"));
        }

        @Test
        @DisplayName("a location assignment reaches every batch inside it")
        void aLocationGrantsAllItsBatches() throws Exception {
            // Batch-level access is gone, so a location-scoped faculty sees the
            // whole location. 9002 sits at Trivandrum, a different location, and
            // stays out of reach.
            mvc.perform(get("/api/assessments/trainees?locationId=KOC")
                            .header("Authorization", bearer(facultyToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items.length()").value(2));

            mvc.perform(get("/api/assessments/trainees?batchId=9002")
                            .header("Authorization", bearer(facultyToken)))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("refuses a duplicate employee number")
        void refusesDuplicateEmployeeNumber() throws Exception {
            mvc.perform(post("/api/users")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"employeeId\":\"70009\",\"name\":\"Copy\",\"role\":\"faculty\","
                                    + "\"locationIds\":[\"KOC\"]}"))
                    .andExpect(status().isConflict());
        }

        @Test
        @DisplayName("an administrator cannot delete their own account")
        void cannotDeleteOwnAccount() throws Exception {
            // 10294 is the bootstrap admin created by migration V3.
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                            .delete("/api/users/10294")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isUnprocessableEntity());
        }
    }

    @Nested
    @DisplayName("dashboard summary")
    class DashboardSummary {

        @Test
        @DisplayName("counts the whole organisation for an unrestricted admin")
        void countsEverythingForAdmin() throws Exception {
            mvc.perform(get("/api/dashboard/summary").header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totals.trainees").value(3))
                    .andExpect(jsonPath("$.totals.batches").value(2))
                    .andExpect(jsonPath("$.locations.length()").value(2));
        }

        @Test
        @DisplayName("counts only the caller's own group for faculty")
        void countsOnlyTheirOwnGroup() throws Exception {
            // The whole point: a summary endpoint is the easiest place to leak the
            // size of groups a user cannot open.
            mvc.perform(get("/api/dashboard/summary").header("Authorization", bearer(facultyToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totals.trainees").value(2))
                    .andExpect(jsonPath("$.totals.batches").value(1))
                    .andExpect(jsonPath("$.locations.length()").value(1))
                    .andExpect(jsonPath("$.locations[0].locationId").value("KOC"))
                    .andExpect(jsonPath("$.locations[0].totalTrainee").value(2));
        }

        @Test
        @DisplayName("refuses a group outside the caller's scope")
        void refusesOutOfScopeGroup() throws Exception {
            mvc.perform(get("/api/dashboard/summary?batchId=9002")
                            .header("Authorization", bearer(facultyToken)))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("the three track counts always add up to the trainee count")
        void trackCountsAreExhaustive() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70001/lap-remedial")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"remedial\",\"remark\":\"Needs support.\"}"))
                    .andExpect(status().isNoContent());
            mvc.perform(patch("/api/assessments/trainees/70002/lap-remedial")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"lap\",\"remark\":\"Escalated.\"}"))
                    .andExpect(status().isNoContent());

            String body = mvc.perform(get("/api/dashboard/summary")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totals.remedial").value(1))
                    .andExpect(jsonPath("$.totals.lap").value(1))
                    .andExpect(jsonPath("$.totals.regular").value(1))
                    .andReturn().getResponse().getContentAsString();

            int trainees = JsonPath.read(body, "$.totals.trainees");
            int regular = JsonPath.read(body, "$.totals.regular");
            int remedial = JsonPath.read(body, "$.totals.remedial");
            int lap = JsonPath.read(body, "$.totals.lap");

            assertThat(regular + remedial + lap).isEqualTo(trainees);
        }

        @Test
        @DisplayName("a closed track returns the trainee to the regular count")
        void closedTrackReturnsToRegular() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70001/lap-remedial")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"remedial\",\"remark\":\"Needs support.\"}"))
                    .andExpect(status().isNoContent());
            mvc.perform(patch("/api/assessments/trainees/70001/lap-remedial")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"none\",\"remark\":\"Completed.\"}"))
                    .andExpect(status().isNoContent());

            mvc.perform(get("/api/dashboard/summary").header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totals.remedial").value(0))
                    .andExpect(jsonPath("$.totals.regular").value(3));
        }

        @Test
        @DisplayName("narrows to a filtered group")
        void narrowsToFilteredGroup() throws Exception {
            mvc.perform(get("/api/dashboard/summary?batchId=9001")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totals.trainees").value(2))
                    .andExpect(jsonPath("$.totals.batches").value(1));
        }

        @Test
        @DisplayName("counts only the batches that began in the chosen quarter")
        void narrowsToOneQuarter() throws Exception {
            // No batch named, so "all" has to mean the period's batches: 9001 began in
            // Q1 2026 and holds both Kochi trainees, 9002 in Q3 2026 and holds
            // Trivandrum's. Without this the cards would count a batch the dropdown
            // right above them did not offer.
            mvc.perform(get("/api/dashboard/summary?year=2026&quarter=1")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totals.trainees").value(2))
                    .andExpect(jsonPath("$.totals.batches").value(1))
                    .andExpect(jsonPath("$.locations.length()").value(1))
                    .andExpect(jsonPath("$.locations[0].locationId").value("KOC"));

            mvc.perform(get("/api/dashboard/summary?year=2026&quarter=3")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totals.trainees").value(1))
                    .andExpect(jsonPath("$.totals.batches").value(1))
                    .andExpect(jsonPath("$.locations[0].locationId").value("TRV"));
        }

        @Test
        @DisplayName("a quarter holding no batch reports nothing, not everything")
        void emptyQuarterReportsNothing() throws Exception {
            // The failure this guards against is the opposite answer: a period that is
            // not applied looks exactly like a period with no data unless it is checked.
            mvc.perform(get("/api/dashboard/summary?year=2026&quarter=2")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totals.trainees").value(0))
                    .andExpect(jsonPath("$.totals.batches").value(0))
                    .andExpect(jsonPath("$.locations.length()").value(0));
        }

        @Test
        @DisplayName("the period and the chosen group are applied together")
        void periodAndGroupAreIntersected() throws Exception {
            // Q3 holds 9002, not 9001, so naming 9001 is a selection narrowed to
            // nothing — not a reason to ignore the period.
            mvc.perform(get("/api/dashboard/summary?batchId=9001&year=2026&quarter=3")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totals.trainees").value(0));
        }

        @Test
        @DisplayName("the period cannot reach past the caller's scope")
        void periodCannotWidenScope() throws Exception {
            // Faculty hold batch 9001 only. A quarter asked about is a narrowing, never
            // a widening: Trivandrum's Q3 batch stays out of their figures.
            mvc.perform(get("/api/dashboard/summary?year=2026&quarter=3")
                            .header("Authorization", bearer(facultyToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totals.trainees").value(0))
                    .andExpect(jsonPath("$.locations.length()").value(0));
        }
    }

    @Nested
    @DisplayName("reports")
    class Reports {

        @Test
        @DisplayName("a trainee report carries the record and both timelines")
        void traineeReportCarriesTheRecord() throws Exception {
            mvc.perform(get("/api/reports/trainees/70001").header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value("Aarav Nair"))
                    .andExpect(jsonPath("$.batchName").value("Batch 01"))
                    .andExpect(jsonPath("$.lgName").value("LG Alpha"))
                    .andExpect(jsonPath("$.locationId").value("KOC"))
                    .andExpect(jsonPath("$.locationName").value("Kochi"))
                    // Every configured exam is on the timeline, so what is still to be
                    // sat is visible rather than simply missing.
                    .andExpect(jsonPath("$.exams.length()").value(3))
                    .andExpect(jsonPath("$.exams[0].score").doesNotExist())
                    .andExpect(jsonPath("$.currentTrack").doesNotExist())
                    .andExpect(jsonPath("$.tracks.length()").value(0));
        }

        @Test
        @DisplayName("a scored exam joins the timeline with the level the mapping awards")
        void scoredExamJoinsTheTimeline() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70001")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"results\":{\"1\":{\"score\":62}}}"))
                    .andExpect(status().isNoContent());

            mvc.perform(get("/api/reports/trainees/70001").header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    // 62 sits in the 60–67 band, so the report must read B2 — the same
                    // level the assessment table would show for the same score.
                    .andExpect(jsonPath("$.exams[0].assessmentName").value("Pre Assessment"))
                    .andExpect(jsonPath("$.exams[0].score").value(62))
                    .andExpect(jsonPath("$.exams[0].cefr").value("B2"))
                    .andExpect(jsonPath("$.exams[0].assessedOn").isNotEmpty());
        }

        @Test
        @DisplayName("an open placement is the current track and the first timeline entry")
        void openPlacementIsTheCurrentTrack() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70002/lap-remedial")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"remedial\",\"remark\":\"Below threshold.\"}"))
                    .andExpect(status().isNoContent());

            mvc.perform(get("/api/reports/trainees/70002").header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.currentTrack").value("remedial"))
                    .andExpect(jsonPath("$.currentTrackSince").isNotEmpty())
                    .andExpect(jsonPath("$.tracks.length()").value(1))
                    .andExpect(jsonPath("$.tracks[0].status").value("open"))
                    .andExpect(jsonPath("$.tracks[0].remark").value("Below threshold."))
                    .andExpect(jsonPath("$.tracks[0].closeDate").doesNotExist());
        }

        @Test
        @DisplayName("a closed placement stays on the timeline instead of disappearing")
        void closedPlacementStaysOnTheTimeline() throws Exception {
            // The whole point of the timeline: a trainee who was on Remedial and was
            // then cleared has that history, not a blank report.
            mvc.perform(patch("/api/assessments/trainees/70002/lap-remedial")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"remedial\",\"remark\":\"Needs support.\"}"))
                    .andExpect(status().isNoContent());
            mvc.perform(patch("/api/assessments/trainees/70002/lap-remedial")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"none\",\"remark\":\"Completed.\"}"))
                    .andExpect(status().isNoContent());

            mvc.perform(get("/api/reports/trainees/70002").header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.currentTrack").doesNotExist())
                    .andExpect(jsonPath("$.tracks.length()").value(1))
                    .andExpect(jsonPath("$.tracks[0].track").value("remedial"))
                    .andExpect(jsonPath("$.tracks[0].status").value("closed"))
                    .andExpect(jsonPath("$.tracks[0].remark").value("Completed."))
                    .andExpect(jsonPath("$.tracks[0].closeDate").isNotEmpty());
        }

        @Test
        @DisplayName("another group's trainee is refused, not reported")
        void traineeOutsideScopeIsRefused() throws Exception {
            // 70003 is Trivandrum's; faculty hold Kochi's batch 9001 only. A report is
            // not a way around the scope the roster enforces.
            mvc.perform(get("/api/reports/trainees/70003").header("Authorization", bearer(facultyToken)))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("the trainee search offers only who the caller may open")
        void traineeSearchIsScoped() throws Exception {
            mvc.perform(get("/api/reports/trainees?search=Rahul")
                            .header("Authorization", bearer(facultyToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(0));

            mvc.perform(get("/api/reports/trainees?search=meera")
                            .header("Authorization", bearer(facultyToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].employeeId").value("70002"))
                    .andExpect(jsonPath("$[0].name").value("Meera Iyer"))
                    // The batch is carried so two trainees with one name can be told
                    // apart before either report is opened.
                    .andExpect(jsonPath("$[0].batchName").value("Batch 01"));
        }

        @Test
        @DisplayName("a location report counts the batches, the tracks and the assessments run")
        void locationReportCountsEverything() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70002/lap-remedial")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"lap\",\"remark\":\"No improvement.\"}"))
                    .andExpect(status().isNoContent());
            mvc.perform(patch("/api/assessments/trainees/70001")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"results\":{\"1\":{\"score\":62}}}"))
                    .andExpect(status().isNoContent());

            mvc.perform(get("/api/reports/location?locationId=KOC")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.locationName").value("Kochi"))
                    .andExpect(jsonPath("$.totals.trainees").value(2))
                    .andExpect(jsonPath("$.totals.batches").value(1))
                    .andExpect(jsonPath("$.totals.regular").value(1))
                    .andExpect(jsonPath("$.totals.lap").value(1))
                    .andExpect(jsonPath("$.batches.length()").value(1))
                    .andExpect(jsonPath("$.batches[0].batchName").value("Batch 01"))
                    .andExpect(jsonPath("$.batches[0].trainees").value(2))
                    .andExpect(jsonPath("$.batches[0].lap").value(1))
                    // Which assessments were conducted, and when: read from the results
                    // themselves rather than from a timetable kept beside them.
                    .andExpect(jsonPath("$.conducted.length()").value(1))
                    // The row names the batch it belongs to: two batches sit the same
                    // exam on the same day, and a date alone cannot say whose marks the
                    // count covers.
                    .andExpect(jsonPath("$.conducted[0].batchName").value("Batch 01"))
                    .andExpect(jsonPath("$.conducted[0].assessmentName").value("Pre Assessment"))
                    .andExpect(jsonPath("$.conducted[0].traineeCount").value(1))
                    .andExpect(jsonPath("$.conducted[0].conductedOn").isNotEmpty());
        }

        @Test
        @DisplayName("a batch carries the assessments it has sat")
        void batchCarriesItsOwnAssessments() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70001")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"results\":{\"1\":{\"score\":62}}}"))
                    .andExpect(status().isNoContent());

            mvc.perform(get("/api/reports/location?locationId=KOC")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.batches[0].conducted.length()").value(1))
                    .andExpect(jsonPath("$.batches[0].conducted[0].assessmentName")
                            .value("Pre Assessment"))
                    .andExpect(jsonPath("$.batches[0].conducted[0].conductedOn").isNotEmpty())
                    .andExpect(jsonPath("$.batches[0].conducted[0].traineeCount").value(1));
        }

        @Test
        @DisplayName("one exam sat by two batches reads as two rows, each naming its batch")
        void locationSittingsNameTheirBatch() throws Exception {
            // A second Kochi batch, so the location has two batches sitting the same
            // exam on the same day — the case a date alone cannot describe.
            jdbc.update("""
                    insert into batch (intbatch_id, txtstatus, txtbatch_type, txtbatch_name,
                                       txtilp_location_id, datebatch_start_date, datebatch_end_date)
                    values (9003, 'A', 'ILP', 'Batch 02', 'KOC', '2026-02-03', '2026-07-31')
                    on conflict do nothing
                    """);
            jdbc.update("""
                    insert into participant (intparticipant_id, intemployee_id, txtparticipant_name,
                                             intbatch_id, intlg_id, txtreference_id, intstatus_id, txtphase_id)
                    values (6004, 70004, 'Nisha Menon', 9003, null, 'KOC-3', 1, 'P1')
                    on conflict do nothing
                    """);

            mvc.perform(patch("/api/assessments/trainees/70001")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"results\":{\"1\":{\"score\":62}}}"))
                    .andExpect(status().isNoContent());
            mvc.perform(patch("/api/assessments/trainees/70004")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"results\":{\"1\":{\"score\":44}}}"))
                    .andExpect(status().isNoContent());

            mvc.perform(get("/api/reports/location?locationId=KOC")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.batches.length()").value(2))
                    // Each batch lists its own sitting…
                    .andExpect(jsonPath("$.batches[0].conducted.length()").value(1))
                    .andExpect(jsonPath("$.batches[0].conducted[0].traineeCount").value(1))
                    .andExpect(jsonPath("$.batches[1].conducted.length()").value(1))
                    // …and the location carries both, told apart by batch rather than
                    // merged into one row that could not say whose marks it counted.
                    .andExpect(jsonPath("$.conducted.length()").value(2))
                    .andExpect(jsonPath("$.conducted[0].batchName").value("Batch 01"))
                    .andExpect(jsonPath("$.conducted[1].batchName").value("Batch 02"))
                    .andExpect(jsonPath("$.conducted[0].traineeCount").value(1));
        }

        @Test
        @DisplayName("a location report counts only the batches that began in the period")
        void locationReportHonoursThePeriod() throws Exception {
            // Kochi's batch began in Q1 2026. Asking about Q3 is a narrowing, not a
            // reason to count every batch the location has ever had.
            mvc.perform(get("/api/reports/location?locationId=KOC&year=2026&quarter=3")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totals.trainees").value(0))
                    .andExpect(jsonPath("$.batches.length()").value(0))
                    .andExpect(jsonPath("$.conducted.length()").value(0));

            mvc.perform(get("/api/reports/location?locationId=KOC&year=2026&quarter=1")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totals.trainees").value(2))
                    .andExpect(jsonPath("$.batches.length()").value(1));
        }

        @Test
        @DisplayName("a batch outside the period takes its trainees and its marks with it")
        void periodNarrowsTheConductedAssessments() throws Exception {
            // The score belongs to a Q1 batch, so it is not part of the Q3 report even
            // though it was recorded today.
            mvc.perform(patch("/api/assessments/trainees/70001")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"results\":{\"1\":{\"score\":62}}}"))
                    .andExpect(status().isNoContent());

            mvc.perform(get("/api/reports/location?locationId=KOC")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.conducted.length()").value(1));

            mvc.perform(get("/api/reports/location?locationId=KOC&year=2026&quarter=3")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.conducted.length()").value(0));
        }

        @Test
        @DisplayName("a released trainee counts as cleared, not as regular")
        void releasedTraineeCountsAsCleared() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70001/lap-remedial")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"remedial\",\"remark\":\"Needs support.\"}"))
                    .andExpect(status().isNoContent());
            mvc.perform(patch("/api/assessments/trainees/70001/lap-remedial")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"none\",\"remark\":\"Completed.\"}"))
                    .andExpect(status().isNoContent());

            mvc.perform(get("/api/reports/location?locationId=KOC")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totals.cleared").value(1))
                    .andExpect(jsonPath("$.totals.remedial").value(0))
                    // The other Kochi trainee has never been placed, so they are the
                    // only regular one: being released is not the same as never needing it.
                    .andExpect(jsonPath("$.totals.regular").value(1));
        }

        @Test
        @DisplayName("the location counters add up to the trainee count")
        void locationCountersAreExhaustive() throws Exception {
            String body = mvc.perform(get("/api/reports/location?locationId=KOC")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString();

            int trainees = JsonPath.read(body, "$.totals.trainees");
            int regular = JsonPath.read(body, "$.totals.regular");
            int remedial = JsonPath.read(body, "$.totals.remedial");
            int lap = JsonPath.read(body, "$.totals.lap");
            int cleared = JsonPath.read(body, "$.totals.cleared");

            assertThat(regular + remedial + lap + cleared).isEqualTo(trainees);
        }

        @Test
        @DisplayName("another location's report is refused, not emptied")
        void locationOutsideScopeIsRefused() throws Exception {
            // An empty report would be indistinguishable from a location that really
            // holds nobody, which is exactly what hides a probe.
            mvc.perform(get("/api/reports/location?locationId=TRV")
                            .header("Authorization", bearer(facultyToken)))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("a location report without a location is refused")
        void locationIsRequired() throws Exception {
            mvc.perform(get("/api/reports/location").header("Authorization", bearer(adminToken)))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("reports need the reports permission")
        void reportsNeedThePermission() throws Exception {
            // Faculty are seeded with reports.view, so the check is that the endpoint
            // is guarded at all: without a token it is refused outright.
            mvc.perform(get("/api/reports/location?locationId=KOC"))
                    .andExpect(status().isUnauthorized());
            mvc.perform(get("/api/reports/trainees/70001"))
                    .andExpect(status().isUnauthorized());
        }
    }

    private static String bearer(String token) {
        return "Bearer " + token;
    }
}
