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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
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

    /**
     * A two-location, two-batch fixture, so every scoping assertion has something
     * outside the scope to be refused.
     *
     * <p>The bootstrap admin comes from migration V3; the restricted faculty
     * account is created here because its assignments are what the tests are about.
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
                       (9002, 'A', 'ILP', 'Batch 01', 'TRV', '2026-01-06', '2026-06-30')
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

        // Faculty, assigned to batch 9001 only — so 9002 and its trainee are out of scope.
        jdbc.update("""
                insert into app_user (intemployee_id, txtusername, txtname, txtemail, txtpassword,
                                      introle_id, txtstatus, txtcreated_by)
                select 70009, 'faculty1', 'Divya Sharma', 'fac1@test.local', 'Fac@123',
                       r.introle_id, 'A', 'test'
                from app_role r where r.txtrole_code = 'faculty'
                on conflict (intemployee_id) do nothing
                """);
        jdbc.update("""
                insert into app_user_location (intuser_id, txtlocation_id)
                select u.intuser_id, 'KOC' from app_user u where u.txtusername = 'faculty1'
                on conflict do nothing
                """);
        jdbc.update("""
                insert into app_user_batch (intuser_id, intbatch_id)
                select u.intuser_id, 9001 from app_user u where u.txtusername = 'faculty1'
                on conflict do nothing
                """);

        adminToken = signIn("admin", "Admin@123");
        facultyToken = signIn("faculty1", "Fac@123");
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
                    .andExpect(jsonPath("$.user.permissions.length()").value(8));
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
        @DisplayName("the status filter narrows to one tab")
        void statusFilterNarrowsToATab() throws Exception {
            mvc.perform(get("/api/assessments/trainees?batchId=9001&status=regular")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    // Nobody in batch 9001 holds a status yet.
                    .andExpect(jsonPath("$.totalElements").value(2));

            mvc.perform(get("/api/assessments/trainees?batchId=9001&status=lap")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totalElements").value(0));
        }

        @Test
        @DisplayName("an unknown status filter is refused")
        void unknownStatusFilterIsRefused() throws Exception {
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
                    .andExpect(jsonPath("$[0].batches[0].id").value("9001"));
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
        @DisplayName("asking for another batch is refused, not silently emptied")
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
        @DisplayName("faculty cannot score a trainee outside their batch, even knowing the id")
        void cannotScoreOutsideTheirBatch() throws Exception {
            // The knowledge that employee 70003 exists must not be enough.
            mvc.perform(patch("/api/assessments/trainees/70003")
                            .header("Authorization", bearer(facultyToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"results\":{\"1\":{\"score\":50}}}"))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("faculty can score their own trainee")
        void canScoreTheirOwnTrainee() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70001")
                            .header("Authorization", bearer(facultyToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"results\":{\"1\":{\"score\":50}}}"))
                    .andExpect(status().isNoContent());
        }

        @Test
        @DisplayName("faculty can change the status of a trainee in their batch")
        void facultyCanManageTraineeStatus() throws Exception {
            // V5 grants Faculty trainee-status.manage: they are the people who decide
            // who needs remedial support, and both the row action and the bulk sheet
            // depend on it.
            mvc.perform(patch("/api/assessments/trainees/70001/trainee-status")
                            .header("Authorization", bearer(facultyToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"remedial\",\"remark\":\"Needs support.\"}"))
                    .andExpect(status().isNoContent());

            mvc.perform(get("/api/assessments/trainees")
                            .param("status", "remedial")
                            .header("Authorization", bearer(facultyToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totalElements").value(1))
                    .andExpect(jsonPath("$.items[0].employeeId").value("70001"));
        }

        @Test
        @DisplayName("the granted permission is still bounded by the caller's batches")
        void facultyCannotManageTraineeStatusOutsideTheirBatch() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70003/trainee-status")
                            .header("Authorization", bearer(facultyToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"remedial\",\"remark\":\"Out of scope.\"}"))
                    .andExpect(status().isForbidden());
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
                                    {"examId":"1","assessedOn":"2026-05-04","batchId":9001,"rows":[
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
        @DisplayName("records the date the exam was conducted against every row")
        void recordsTheConductedDate() throws Exception {
            mvc.perform(post("/api/assessments/uploads")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"examId":"1","assessedOn":"2026-05-04","batchId":9001,"rows":[
                                      {"employeeId":"70001","score":33},
                                      {"employeeId":"70002","score":80}]}
                                    """))
                    .andExpect(status().isOk());

            // Not the day the sheet was uploaded: the date the group sat the exam.
            List<String> stored = jdbc.queryForList("""
                    select to_char(dateassessed_on, 'YYYY-MM-DD')
                    from app_assessment_result
                    where intassessment_id = 1
                    order by intemployee_id
                    """, String.class);
            assertThat(stored).containsExactly("2026-05-04", "2026-05-04");
        }

        @Test
        @DisplayName("refuses a sheet that does not say when the exam was conducted")
        void refusesAMissingConductedDate() throws Exception {
            mvc.perform(post("/api/assessments/uploads")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"examId":"1","batchId":9001,"rows":[
                                      {"employeeId":"70001","score":33}]}
                                    """))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("assessedOn"));

            Integer stored = jdbc.queryForObject(
                    "select count(*) from app_assessment_result where intassessment_id = 1", Integer.class);
            assertThat(stored).isZero();
        }

        @Test
        @DisplayName("refuses a conducted date in the future")
        void refusesAFutureConductedDate() throws Exception {
            // Computed rather than written down, so the test does not quietly become
            // a test of a date that has since passed.
            String future = LocalDate.now(ZoneOffset.UTC).plusDays(30).toString();

            mvc.perform(post("/api/assessments/uploads")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"examId":"1","assessedOn":"%s","batchId":9001,"rows":[
                                      {"employeeId":"70001","score":33}]}
                                    """.formatted(future)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("assessedOn"));

            Integer stored = jdbc.queryForObject(
                    "select count(*) from app_assessment_result where intassessment_id = 1", Integer.class);
            assertThat(stored).isZero();
        }

        @Test
        @DisplayName("the roster reads the conducted date back")
        void rosterReturnsTheConductedDate() throws Exception {
            mvc.perform(post("/api/assessments/uploads")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"examId":"1","assessedOn":"2026-05-04","batchId":9001,"rows":[
                                      {"employeeId":"70001","score":33}]}
                                    """))
                    .andExpect(status().isOk());

            mvc.perform(get("/api/assessments/trainees?batchId=9001&page=0&size=25")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[?(@.employeeId == '70001')].results.1.assessedOn")
                            .value("2026-05-04"));
        }

        @Test
        @DisplayName("refuses the whole sheet when any row is wrong, storing nothing")
        void refusesTheWholeSheet() throws Exception {
            mvc.perform(post("/api/assessments/uploads")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"examId":"1","assessedOn":"2026-05-04","batchId":9001,"rows":[
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
                                    {"examId":"1","assessedOn":"2026-05-04","batchId":9001,"rows":[
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
                                    {"examId":"1","assessedOn":"2026-05-04","batchId":9002,"rows":[
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
        @DisplayName("refuses a batch that is not inside the assigned locations")
        void refusesBatchOutsideAssignedLocations() throws Exception {
            mvc.perform(post("/api/users")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"employeeId":"70012","name":"Mismatch","role":"faculty",
                                     "locationIds":["KOC"],"batchIds":[9002]}
                                    """))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("batchIds"));
        }

        @Test
        @DisplayName("refuses a duplicate employee number")
        void refusesDuplicateEmployeeNumber() throws Exception {
            mvc.perform(post("/api/users")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"employeeId\":\"70009\",\"name\":\"Copy\",\"role\":\"faculty\","
                                    + "\"locationIds\":[\"KOC\"],\"batchIds\":[9001]}"))
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
    @DisplayName("trainee status")
    class TraineeStatusChange {

        /** Puts a trainee on a status and returns the response. */
        private ResultActions change(String employeeId, String json)
                throws Exception {
            return mvc.perform(patch("/api/assessments/trainees/" + employeeId + "/trainee-status")
                    .header("Authorization", bearer(adminToken))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json));
        }

        private List<Map<String, Object>> storedPeriods(long employeeId) {
            return jdbc.queryForList("""
                    select txttrainee_status, txtstate, txtremark as remark,
                           to_char(datestart_date, 'YYYY-MM-DD') as start_date,
                           to_char(dateclose_date, 'YYYY-MM-DD') as close_date
                    from app_trainee_status where intemployee_id = ?
                    order by inttrainee_status_id
                    """, employeeId);
        }

        @Test
        @DisplayName("puts a regular trainee on a status and dates it")
        void movesARegularTraineeOntoAStatus() throws Exception {
            change("70001", """
                    {"status":"remedial","remark":"Baseline below B1.","effectiveDate":"2026-02-02"}
                    """).andExpect(status().isNoContent());

            assertThat(storedPeriods(70001)).hasSize(1);
            assertThat(storedPeriods(70001).getFirst())
                    .containsEntry("txttrainee_status", "remedial")
                    .containsEntry("txtstate", "A")
                    .containsEntry("remark", "Baseline below B1.")
                    .containsEntry("start_date", "2026-02-02");
        }

        @Test
        @DisplayName("supersedes the old status and keeps it as history")
        void keepsTheHistoryWhenStatusChanges() throws Exception {
            change("70001", """
                    {"status":"remedial","remark":"Needs support.","effectiveDate":"2026-02-02"}
                    """).andExpect(status().isNoContent());
            change("70001", """
                    {"status":"lap","remark":"Needs more than remedial.","effectiveDate":"2026-03-09"}
                    """).andExpect(status().isNoContent());

            var periods = storedPeriods(70001);
            assertThat(periods).hasSize(2);

            // The first period is closed on the day the second began, so the two
            // never overlap — and the reason it was held is not overwritten.
            assertThat(periods.get(0))
                    .containsEntry("txttrainee_status", "remedial")
                    .containsEntry("txtstate", "C")
                    .containsEntry("close_date", "2026-03-09")
                    .containsEntry("remark", "Needs support.");
            assertThat(periods.get(1))
                    .containsEntry("txttrainee_status", "lap")
                    .containsEntry("txtstate", "A")
                    .containsEntry("start_date", "2026-03-09");
        }

        @Test
        @DisplayName("records an outcome, which sticks until it is changed again")
        void recordsAnOutcome() throws Exception {
            change("70001", """
                    {"status":"cleared","remark":"Cleared the post-assessment.",
                     "effectiveDate":"2026-04-01"}
                    """).andExpect(status().isNoContent());

            // Not a closed track: cleared is what they hold now, which is what lets
            // the figures account for them.
            mvc.perform(get("/api/assessments/trainees?batchId=9001&page=0&size=25")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(jsonPath("$.items[?(@.employeeId == '70001')].status")
                            .value("cleared"));

            change("70001", """
                    {"status":"resigned","remark":"Left the organisation.","effectiveDate":"2026-05-04"}
                    """).andExpect(status().isNoContent());

            var periods = storedPeriods(70001);
            assertThat(periods).hasSize(2);
            assertThat(periods.get(1)).containsEntry("txttrainee_status", "resigned");
        }

        @Test
        @DisplayName("records every exit a trainee can leave by")
        void recordsEveryExit() throws Exception {
            for (String exit : java.util.List.of("discontinued", "purged", "resigned")) {
                change("70003", "{\"status\":\"" + exit + "\",\"remark\":\"Left.\"}")
                        .andExpect(status().isNoContent());
                // Each one supersedes the last, so the trainee holds exactly one.
                mvc.perform(get("/api/assessments/trainees?batchId=9002&page=0&size=25")
                                .header("Authorization", bearer(adminToken)))
                        .andExpect(jsonPath("$.items[0].status").value(exit));
            }
        }

        @Test
        @DisplayName("ends a status, returning the trainee to regular")
        void endsAStatus() throws Exception {
            change("70001", """
                    {"status":"remedial","remark":"Needs support.","effectiveDate":"2026-02-02"}
                    """).andExpect(status().isNoContent());
            change("70001", """
                    {"status":"regular","remark":"No longer needs support.","effectiveDate":"2026-05-04"}
                    """).andExpect(status().isNoContent());

            var periods = storedPeriods(70001);
            assertThat(periods).hasSize(1);
            assertThat(periods.getFirst())
                    .containsEntry("txtstate", "C")
                    .containsEntry("close_date", "2026-05-04");

            // Holding no status, the row carries no status key at all.
            mvc.perform(get("/api/assessments/trainees?batchId=9001&page=0&size=25")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(jsonPath("$.items[?(@.employeeId == '70001')].status").doesNotExist());
        }

        @Test
        @DisplayName("filters each tab by the status it stands for")
        void filtersEachTab() throws Exception {
            change("70001", "{\"status\":\"remedial\",\"remark\":\"Support.\"}")
                    .andExpect(status().isNoContent());
            change("70002", "{\"status\":\"discontinued\",\"remark\":\"Left.\"}")
                    .andExpect(status().isNoContent());

            mvc.perform(get("/api/assessments/trainees?batchId=9001&page=0&size=25&status=remedial")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(jsonPath("$.items.length()").value(1))
                    .andExpect(jsonPath("$.items[0].employeeId").value("70001"));

            // "Other" is one tab over the three ways a trainee can leave.
            mvc.perform(get("/api/assessments/trainees?batchId=9001&page=0&size=25&status=other")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(jsonPath("$.items.length()").value(1))
                    .andExpect(jsonPath("$.items[0].employeeId").value("70002"))
                    .andExpect(jsonPath("$.items[0].status").value("discontinued"));

            // 70003 is in the other batch and holds nothing: the Regular tab.
            mvc.perform(get("/api/assessments/trainees?batchId=9002&page=0&size=25&status=regular")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(jsonPath("$.items.length()").value(1))
                    .andExpect(jsonPath("$.items[0].employeeId").value("70003"));

            // The tabs nobody is on are empty rather than showing everyone.
            mvc.perform(get("/api/assessments/trainees?batchId=9001&page=0&size=25&status=lap")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(jsonPath("$.items.length()").value(0));
        }

        @Test
        @DisplayName("carries the status, its date and its reason back to the table")
        void returnsTheStatusToTheTable() throws Exception {
            change("70001", """
                    {"status":"lap","remark":"Escalated after the mid.","effectiveDate":"2026-03-09"}
                    """).andExpect(status().isNoContent());

            mvc.perform(get("/api/assessments/trainees?batchId=9001&page=0&size=25")
                            .header("Authorization", bearer(adminToken)))
                    .andExpect(jsonPath("$.items[?(@.employeeId == '70001')].status").value("lap"))
                    .andExpect(jsonPath("$.items[?(@.employeeId == '70001')].startDate").value("2026-03-09"))
                    .andExpect(jsonPath("$.items[?(@.employeeId == '70001')].remark")
                            .value("Escalated after the mid."));
        }

        @Test
        @DisplayName("dates a status change to today when none is given")
        void defaultsTheDateToToday() throws Exception {
            change("70001", "{\"status\":\"remedial\",\"remark\":\"Support.\"}")
                    .andExpect(status().isNoContent());

            String today = jdbc.queryForObject(
                    "select to_char(now() at time zone 'utc', 'YYYY-MM-DD')", String.class);
            assertThat(storedPeriods(70001).getFirst()).containsEntry("start_date", today);
        }

        @Test
        @DisplayName("refuses a change with no reason recorded")
        void refusesAMissingRemark() throws Exception {
            change("70001", "{\"status\":\"remedial\"}")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("remark"));
            assertThat(storedPeriods(70001)).isEmpty();
        }

        @Test
        @DisplayName("refuses a status it does not recognise")
        void refusesAnUnknownStatus() throws Exception {
            change("70001", "{\"status\":\"sacked\",\"remark\":\"Nope.\"}")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("status"));
            assertThat(storedPeriods(70001)).isEmpty();
        }

        @Test
        @DisplayName("refuses a status starting in the future")
        void refusesAFutureStatus() throws Exception {
            String future = LocalDate.now(ZoneOffset.UTC).plusDays(30).toString();
            change("70001", "{\"status\":\"remedial\",\"remark\":\"Early.\","
                            + "\"effectiveDate\":\"" + future + "\"}")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("effectiveDate"));
            assertThat(storedPeriods(70001)).isEmpty();
        }

        @Test
        @DisplayName("refuses a change dated before the status it replaces began")
        void refusesABackdatedStatus() throws Exception {
            change("70001", """
                    {"status":"remedial","remark":"Support.","effectiveDate":"2026-03-09"}
                    """).andExpect(status().isNoContent());

            // The database holds this as a check constraint too; the test pins the
            // message the user gets instead of it, and that nothing was written.
            change("70001", """
                    {"status":"lap","remark":"Too early.","effectiveDate":"2026-02-02"}
                    """).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("effectiveDate"))
                    .andExpect(jsonPath("$.fieldErrors[0].message")
                            .value(org.hamcrest.Matchers.containsString("2026-03-09")));

            var periods = storedPeriods(70001);
            assertThat(periods).hasSize(1);
            assertThat(periods.getFirst()).containsEntry("txtstate", "A");
        }

        @Test
        @DisplayName("refuses a status the trainee already holds")
        void refusesTheStatusTheyAlreadyHold() throws Exception {
            change("70001", "{\"status\":\"remedial\",\"remark\":\"Support.\"}")
                    .andExpect(status().isNoContent());
            change("70001", "{\"status\":\"remedial\",\"remark\":\"Again.\"}")
                    .andExpect(status().isUnprocessableEntity());

            // Refused rather than silently ignored, so the reason typed is not lost.
            assertThat(storedPeriods(70001)).hasSize(1);
        }

        @Test
        @DisplayName("refuses to end a status a regular trainee does not hold")
        void refusesToEndAStatusThatIsNotHeld() throws Exception {
            change("70001", "{\"status\":\"regular\",\"remark\":\"Nothing to end.\"}")
                    .andExpect(status().isUnprocessableEntity());
            assertThat(storedPeriods(70001)).isEmpty();
        }

        @Test
        @DisplayName("refuses a trainee the caller cannot see")
        void refusesAnOutOfScopeTrainee() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70003/trainee-status")
                            .header("Authorization", bearer(facultyToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"remedial\",\"remark\":\"Outside my batch.\"}"))
                    .andExpect(status().isForbidden());
            assertThat(storedPeriods(70003)).isEmpty();
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
        @DisplayName("the five status counts always add up to the trainee count")
        void trackCountsAreExhaustive() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70001/trainee-status")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"remedial\",\"remark\":\"Needs support.\"}"))
                    .andExpect(status().isNoContent());
            mvc.perform(patch("/api/assessments/trainees/70002/trainee-status")
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
                    .andExpect(jsonPath("$.totals.cleared").value(0))
                    .andExpect(jsonPath("$.totals.others").value(0))
                    .andReturn().getResponse().getContentAsString();

            int trainees = JsonPath.read(body, "$.totals.trainees");
            int regular = JsonPath.read(body, "$.totals.regular");
            int remedial = JsonPath.read(body, "$.totals.remedial");
            int lap = JsonPath.read(body, "$.totals.lap");
            int cleared = JsonPath.read(body, "$.totals.cleared");
            int others = JsonPath.read(body, "$.totals.others");

            assertThat(regular + remedial + lap + cleared + others).isEqualTo(trainees);
        }

        @Test
        @DisplayName("a closed track returns the trainee to the regular count")
        void closedTrackReturnsToRegular() throws Exception {
            mvc.perform(patch("/api/assessments/trainees/70001/trainee-status")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"remedial\",\"remark\":\"Needs support.\"}"))
                    .andExpect(status().isNoContent());
            mvc.perform(patch("/api/assessments/trainees/70001/trainee-status")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"regular\",\"remark\":\"Completed.\"}"))
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
    }

    @Nested
    @DisplayName("trainee status bulk sheet")
    class TraineeStatusUpload {

        /** Downloads the sheet for one tab of the fixture's group. */
        private String template(String status, String... examIds) throws Exception {
            var request = get("/api/assessments/trainee-status/uploads/template")
                    .header("Authorization", bearer(adminToken))
                    .param("locationId", "KOC")
                    .param("batchId", "9001")
                    .param("lgId", "8001")
                    .param("status", status);
            for (String examId : examIds) {
                request = request.param("examIds", examId);
            }
            return mvc.perform(request)
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString();
        }

        /** Commits a sheet body as the admin. */
        private ResultActions upload(String body) throws Exception {
            return upload(body, adminToken);
        }

        private ResultActions upload(String body, String token)
                throws Exception {
            return mvc.perform(post("/api/assessments/trainee-status/uploads")
                    .header("Authorization", bearer(token))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(body));
        }

        /** A one-row sheet body for the fixture's group. */
        private String oneRow(String employeeId, String status, String remark, String date) {
            String effectiveDate = date == null ? "" : ",\"effectiveDate\":\"" + date + "\"";
            return """
                    {"locationId":"KOC","batchId":9001,"lgId":8001,"rows":[
                      {"employeeId":"%s","status":"%s","remark":"%s"%s}
                    ]}
                    """.formatted(employeeId, status, remark, effectiveDate);
        }

        private List<Map<String, Object>> storedPeriods(long employeeId) {
            return jdbc.queryForList("""
                    select txttrainee_status, txtstate, txtremark as remark,
                           to_char(datestart_date, 'YYYY-MM-DD') as start_date
                    from app_trainee_status where intemployee_id = ?
                    order by inttrainee_status_id
                    """, employeeId);
        }

        // ── The template ───────────────────────────────────────────────────────

        @Test
        @DisplayName("the sheet is the tab on screen: its trainees, their marks, and blank columns to fill")
        void sheetMirrorsTheTab() throws Exception {
            // A mark to appear in the sheet, recorded the way the portal records one.
            mvc.perform(patch("/api/assessments/trainees/70001")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"results\":{\"1\":{\"score\":50}}}"))
                    .andExpect(status().isNoContent());

            String csv = template("regular", "1");
            var lines = csv.strip().split("\n");

            // Identity, then the marks, then the status they hold, then the three
            // columns the user is meant to type into.
            assertThat(lines[0]).isEqualTo(
                    "Emp ID,Name,Pre Assessment,Current Status,New Status,Effective Date,Remark");
            assertThat(lines[1]).isEqualTo("70001,Aarav Nair,50 - B1,Regular,,,");
            assertThat(lines[2]).isEqualTo("70002,Meera Iyer,,Regular,,,");
            assertThat(lines).hasSize(3);
        }

        @Test
        @DisplayName("a trainee holding no mark shows an empty cell, not a zero")
        void missingMarkIsBlankNotZero() throws Exception {
            assertThat(template("regular", "1")).contains("70001,Aarav Nair,,Regular,,,");
        }

        @Test
        @DisplayName("one column per assessment asked for, in the order asked for")
        void oneColumnPerAssessment() throws Exception {
            var lines = template("regular", "2", "1").strip().split("\n");
            assertThat(lines[0]).startsWith("Emp ID,Name,Mid Assessment,Pre Assessment,");
        }

        @Test
        @DisplayName("the Regular tab excludes everyone holding a status")
        void regularTabExcludesStatusHolders() throws Exception {
            upload(oneRow("70001", "remedial", "Needs support.", "2026-02-02"))
                    .andExpect(status().isOk());

            assertThat(template("regular")).doesNotContain("70001");
            assertThat(template("remedial")).contains("70001,Aarav Nair,Remedial,,,");
            assertThat(template("remedial")).doesNotContain("70002");
        }

        @Test
        @DisplayName("the Other tab names the status each trainee actually holds")
        void otherTabNamesTheStatus() throws Exception {
            upload(oneRow("70001", "resigned", "Left the organisation.", "2026-02-02"))
                    .andExpect(status().isOk());

            // All three exits share one tab, so the sheet has to say which is which.
            assertThat(template("other")).contains("70001,Aarav Nair,Resigned,,,");
        }

        @Test
        @DisplayName("faculty may download a sheet, and only for their own group")
        void facultyMayDownloadTheirOwnGroup() throws Exception {
            mvc.perform(get("/api/assessments/trainee-status/uploads/template")
                            .header("Authorization", bearer(facultyToken))
                            .param("batchId", "9001")
                            .param("status", "regular"))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Content-Disposition",
                            "attachment; filename=\"trainee-status-template.csv\""))
                    .andExpect(content().string(org.hamcrest.Matchers.containsString("70001,Aarav Nair")));

            // Batch 9002 is not theirs. Refused, not silently emptied — the same
            // answer the table gives when asked for a group outside the caller's scope.
            mvc.perform(get("/api/assessments/trainee-status/uploads/template")
                            .header("Authorization", bearer(facultyToken))
                            .param("batchId", "9002")
                            .param("status", "regular"))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("an unknown assessment is refused rather than silently dropped")
        void unknownAssessmentIsRefused() throws Exception {
            mvc.perform(get("/api/assessments/trainee-status/uploads/template")
                            .header("Authorization", bearer(adminToken))
                            .param("status", "regular")
                            .param("examIds", "999"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("examIds"));
        }

        // ── The commit ─────────────────────────────────────────────────────────

        @Test
        @DisplayName("applies a sheet's changes through the same path as a single change")
        void appliesTheSheet() throws Exception {
            upload("""
                    {"locationId":"KOC","batchId":9001,"lgId":8001,"rows":[
                      {"employeeId":"70001","status":"remedial","remark":"Baseline below B1.",
                       "effectiveDate":"2026-02-02"},
                      {"employeeId":"70002","status":"lap","remark":"Needs more than remedial.",
                       "effectiveDate":"2026-03-09"}
                    ]}
                    """)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.updated").value(2));

            assertThat(storedPeriods(70001)).hasSize(1);
            assertThat(storedPeriods(70001).getFirst())
                    .containsEntry("txttrainee_status", "remedial")
                    .containsEntry("txtstate", "A")
                    .containsEntry("start_date", "2026-02-02");
            assertThat(storedPeriods(70002).getFirst())
                    .containsEntry("txttrainee_status", "lap");
        }

        @Test
        @DisplayName("supersedes what the trainee held, keeping the history")
        void supersedesTheHeldStatus() throws Exception {
            upload(oneRow("70001", "remedial", "Needs support.", "2026-02-02"))
                    .andExpect(status().isOk());
            upload(oneRow("70001", "lap", "Escalated.", "2026-03-09"))
                    .andExpect(status().isOk());

            var periods = storedPeriods(70001);
            assertThat(periods).hasSize(2);
            assertThat(periods.get(0))
                    .containsEntry("txttrainee_status", "remedial")
                    .containsEntry("txtstate", "C")
                    .containsEntry("remark", "Needs support.");
            assertThat(periods.get(1))
                    .containsEntry("txttrainee_status", "lap")
                    .containsEntry("txtstate", "A");
        }

        @Test
        @DisplayName("a blank date is dated today, so a filled status is never undated")
        void blankDateMeansToday() throws Exception {
            upload(oneRow("70001", "remedial", "Needs support.", null))
                    .andExpect(status().isOk());

            assertThat(storedPeriods(70001).getFirst())
                    .containsEntry("start_date", LocalDate.now(ZoneOffset.UTC).toString());
        }

        @Test
        @DisplayName("returning a trainee to regular closes the status and opens nothing")
        void returningToRegularEndsTheStatus() throws Exception {
            upload(oneRow("70001", "remedial", "Needs support.", "2026-02-02"))
                    .andExpect(status().isOk());
            upload(oneRow("70001", "regular", "Completed the programme.", "2026-04-01"))
                    .andExpect(status().isOk());

            // Regular is not a stored status: the period is closed, and the trainee
            // holds nothing. Closing keeps the reason it was held, and the date it
            // closed is what explains how they came to be regular again.
            var periods = storedPeriods(70001);
            assertThat(periods).hasSize(1);
            assertThat(periods.getFirst())
                    .containsEntry("txttrainee_status", "remedial")
                    .containsEntry("txtstate", "C")
                    .containsEntry("remark", "Needs support.");

            assertThat(template("regular")).contains("70001,Aarav Nair,Regular,,,");
        }

        // ── Refusals ───────────────────────────────────────────────────────────

        @Test
        @DisplayName("refuses the whole sheet when one row names a trainee outside the group")
        void refusesAndWritesNothingWhenARowIsOutsideTheGroup() throws Exception {
            // 70003 is in batch 9002. The valid first row must not be written:
            // a half-applied sheet leaves the roster in a state nobody can explain.
            upload("""
                    {"locationId":"KOC","batchId":9001,"lgId":8001,"rows":[
                      {"employeeId":"70001","status":"remedial","remark":"Needs support.",
                       "effectiveDate":"2026-02-02"},
                      {"employeeId":"70003","status":"lap","remark":"Not in this group.",
                       "effectiveDate":"2026-02-02"}
                    ]}
                    """)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("rows[2].employeeId"));

            assertThat(storedPeriods(70001)).isEmpty();
            assertThat(storedPeriods(70003)).isEmpty();
        }

        @Test
        @DisplayName("faculty cannot upload for a group that is not theirs")
        void facultyCannotUploadOutsideTheirBatch() throws Exception {
            // The group is out of scope, so the sheet is refused before a single row
            // is looked at — the scope check comes first on purpose.
            upload("""
                    {"locationId":"TRV","batchId":9002,"rows":[
                      {"employeeId":"70003","status":"remedial","remark":"Out of scope.",
                       "effectiveDate":"2026-02-02"}
                    ]}
                    """, facultyToken)
                    .andExpect(status().isForbidden());

            assertThat(storedPeriods(70003)).isEmpty();
        }

        @Test
        @DisplayName("a trainee outside an in-scope group is refused by row")
        void facultyCannotUploadATraineeOutsideTheirGroup() throws Exception {
            // The group is theirs, the trainee is not: the sheet was generated from a
            // roster, so a row naming someone else is a hand-edited file.
            upload("""
                    {"locationId":"KOC","batchId":9001,"lgId":8001,"rows":[
                      {"employeeId":"70003","status":"remedial","remark":"Not in this group.",
                       "effectiveDate":"2026-02-02"}
                    ]}
                    """, facultyToken)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].message")
                            .value("70003 is not in the group this sheet was generated for."));

            assertThat(storedPeriods(70003)).isEmpty();
        }

        @Test
        @DisplayName("refuses a trainee listed twice, which would contradict itself")
        void refusesADuplicateTrainee() throws Exception {
            upload("""
                    {"locationId":"KOC","batchId":9001,"lgId":8001,"rows":[
                      {"employeeId":"70001","status":"remedial","remark":"First.","effectiveDate":"2026-02-02"},
                      {"employeeId":"70001","status":"lap","remark":"Second.","effectiveDate":"2026-03-09"}
                    ]}
                    """)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("rows[2].employeeId"));

            assertThat(storedPeriods(70001)).isEmpty();
        }

        @Test
        @DisplayName("refuses the status the trainee already holds, rather than discarding the reason")
        void refusesTheStatusAlreadyHeld() throws Exception {
            upload(oneRow("70001", "remedial", "Needs support.", "2026-02-02"))
                    .andExpect(status().isOk());

            upload(oneRow("70001", "remedial", "Typed again by mistake.", "2026-03-09"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].message")
                            .value("Employee 70001 already holds Remedial."));

            // Still on the first period: the rejected sheet changed nothing.
            assertThat(storedPeriods(70001)).hasSize(1);
        }

        @Test
        @DisplayName("refuses to end a status for a trainee who holds none")
        void refusesEndingAStatusThatIsNotHeld() throws Exception {
            upload(oneRow("70001", "regular", "Nothing to end.", "2026-02-02"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].message")
                            .value("Employee 70001 is already regular — they hold no status to end."));
        }

        @Test
        @DisplayName("refuses a date in the future")
        void refusesAFutureDate() throws Exception {
            upload(oneRow("70001", "remedial", "Needs support.", "2099-01-01"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("rows[1].effectiveDate"));
        }

        @Test
        @DisplayName("refuses a date before the status it replaces began")
        void refusesABackdatedDate() throws Exception {
            upload(oneRow("70001", "remedial", "Needs support.", "2026-03-09"))
                    .andExpect(status().isOk());

            upload(oneRow("70001", "lap", "Before that status began.", "2026-02-02"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].message")
                            .value("Employee 70001 has been on Remedial since 2026-03-09. "
                                    + "Choose that date or later."));
        }

        @Test
        @DisplayName("refuses a row with no reason, because an unexplained change is not auditable")
        void refusesAMissingReason() throws Exception {
            upload("""
                    {"locationId":"KOC","batchId":9001,"rows":[
                      {"employeeId":"70001","status":"remedial","remark":"   ","effectiveDate":"2026-02-02"}
                    ]}
                    """)
                    .andExpect(status().isBadRequest());

            assertThat(storedPeriods(70001)).isEmpty();
        }

        @Test
        @DisplayName("refuses an unknown status and a malformed date")
        void refusesNonsenseValues() throws Exception {
            upload("""
                    {"locationId":"KOC","batchId":9001,"rows":[
                      {"employeeId":"70001","status":"promoted","remark":"Not a status.",
                       "effectiveDate":"2026-02-02"}
                    ]}
                    """)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("rows[0].status"));

            upload("""
                    {"locationId":"KOC","batchId":9001,"rows":[
                      {"employeeId":"70001","status":"remedial","remark":"Bad date.",
                       "effectiveDate":"02/02/2026"}
                    ]}
                    """)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors[0].field").value("rows[0].effectiveDate"));
        }

        @Test
        @DisplayName("refuses an empty sheet, which asks for nothing")
        void refusesAnEmptySheet() throws Exception {
            upload("""
                    {"locationId":"KOC","batchId":9001,"rows":[]}
                    """)
                    .andExpect(status().isBadRequest());
        }

        // ── The preview lookup ─────────────────────────────────────────────────

        @Test
        @DisplayName("the lookup answers with what each trainee holds now, and since when")
        void lookupAnswersWithTheCurrentStatus() throws Exception {
            upload(oneRow("70001", "remedial", "Needs support.", "2026-02-02"))
                    .andExpect(status().isOk());

            mvc.perform(post("/api/assessments/trainee-status/uploads/lookup")
                            .header("Authorization", bearer(adminToken))
                            .param("locationId", "KOC")
                            .param("batchId", "9001")
                            .param("lgId", "8001")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"employeeIds\":[70001,70002]}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.trainees.length()").value(2))
                    .andExpect(jsonPath("$.trainees[0].employeeId").value("70001"))
                    .andExpect(jsonPath("$.trainees[0].name").value("Aarav Nair"))
                    .andExpect(jsonPath("$.trainees[0].status").value("remedial"))
                    .andExpect(jsonPath("$.trainees[0].startDate").value("2026-02-02"))
                    // Nulls are what "holds nothing", and so Regular, looks like.
                    .andExpect(jsonPath("$.trainees[1].status").doesNotExist())
                    .andExpect(jsonPath("$.trainees[1].startDate").doesNotExist());
        }

        @Test
        @DisplayName("the lookup answers only about trainees the caller may see")
        void lookupIsScoped() throws Exception {
            // 70003 is in batch 9002, which is not the group asked about, so the
            // lookup leaves them out rather than reporting their status.
            mvc.perform(post("/api/assessments/trainee-status/uploads/lookup")
                            .header("Authorization", bearer(adminToken))
                            .param("batchId", "9001")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"employeeIds\":[70001,70003]}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.trainees.length()").value(1))
                    .andExpect(jsonPath("$.trainees[0].employeeId").value("70001"));
        }

        @Test
        @DisplayName("the lookup is readable with the view permission alone")
        void lookupNeedsOnlyTheViewPermission() throws Exception {
            mvc.perform(post("/api/assessments/trainee-status/uploads/lookup")
                            .header("Authorization", bearer(facultyToken))
                            .param("batchId", "9001")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"employeeIds\":[70001]}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.trainees.length()").value(1));
        }

        @Test
        @DisplayName("the lookup refuses an empty list rather than answering everything")
        void lookupRefusesAnEmptyList() throws Exception {
            mvc.perform(post("/api/assessments/trainee-status/uploads/lookup")
                            .header("Authorization", bearer(adminToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"employeeIds\":[]}"))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("a sheet is not readable or writable without signing in")
        void requiresAuthentication() throws Exception {
            mvc.perform(get("/api/assessments/trainee-status/uploads/template"))
                    .andExpect(status().isUnauthorized());
            mvc.perform(post("/api/assessments/trainee-status/uploads")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"rows\":[]}"))
                    .andExpect(status().isUnauthorized());
            mvc.perform(post("/api/assessments/trainee-status/uploads/lookup")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"employeeIds\":[70001]}"))
                    .andExpect(status().isUnauthorized());
        }
    }

    private static String bearer(String token) {
        return "Bearer " + token;
    }
}
