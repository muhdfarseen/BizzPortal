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
                    .andExpect(jsonPath("$.length()").value(2))
                    .andExpect(jsonPath("$[*].employeeId")
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
        @DisplayName("faculty cannot move a trainee onto a remedial track")
        void facultyCannotManageLapRemedial() throws Exception {
            // Faculty hold lap-remedial.view but not lap-remedial.manage.
            mvc.perform(patch("/api/assessments/trainees/70001/lap-remedial")
                            .header("Authorization", bearer(facultyToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"remedial\",\"remark\":\"Needs support.\"}"))
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
                                    {"examId":"1","batchId":9001,"rows":[
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
                                    {"examId":"1","batchId":9001,"rows":[
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
                                    {"examId":"1","batchId":9001,"rows":[
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
                                    {"examId":"1","batchId":9002,"rows":[
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
    }

    private static String bearer(String token) {
        return "Bearer " + token;
    }
}
