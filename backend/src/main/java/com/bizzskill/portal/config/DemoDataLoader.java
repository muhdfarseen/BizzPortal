package com.bizzskill.portal.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seeds a small, representative organisation into a development database.
 *
 * <p>Only ever active under the {@code local} profile, and only when the portal
 * tables are empty. In production those tables are populated by the technical
 * assessment portal, so this class does nothing there — which is why the guard is
 * "is the table empty" rather than a command-line flag someone could forget.
 *
 * <p>The organisation is deliberately shaped to exercise role scoping: two
 * locations, one of them with two batches, and accounts restricted to a single
 * location and to a single batch — the two restrictions that behave differently.
 *
 * <p>Rows are written with {@code JdbcTemplate} rather than through the entities,
 * because the portal entities are {@code @Immutable} — the application genuinely
 * has no write path to those tables, and the seed should not invent one.
 */
@Component
@Profile("local")
public class DemoDataLoader implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoDataLoader.class);

    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;

    public DemoDataLoader(JdbcTemplate jdbc, PasswordEncoder passwordEncoder) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        Integer existing = jdbc.queryForObject("select count(*) from participant", Integer.class);
        if (existing != null && existing > 0) {
            log.info("Portal tables already hold {} participant(s); skipping the demo seed.", existing);
            return;
        }

        seedLocations();
        seedBatches();
        seedLearningGroups();
        seedParticipants();
        seedDemoAccounts();

        log.info("Seeded demo portal data: 5 locations, 6 batches, 7 learning groups, "
                + "14 participants, 2 restricted accounts (kocadmin, faculty1).");
    }

    private void seedLocations() {
        Object[][] rows = {
                {"KOC", "Kochi"},
                {"TRV", "Trivandrum"},
                {"BLR", "Bangalore"},
                {"CHN", "Chennai"},
                {"PUN", "Pune"},
        };
        for (Object[] row : rows) {
            jdbc.update("insert into location (txtlocation_id, txtlocation_name) values (?, ?)", row);
        }
    }

    private void seedBatches() {
        // intbatch_id, txtbatch_name, txtilp_location_id, start, end
        Object[][] rows = {
                {101L, "Batch 01", "KOC", "2026-01-06", "2026-06-30"},
                {102L, "Batch 01", "TRV", "2026-01-06", "2026-06-30"},
                {103L, "Batch 01", "BLR", "2026-02-02", "2026-07-31"},
                {104L, "Batch 02", "BLR", "2026-03-02", "2026-08-31"},
                {105L, "Batch 01", "CHN", "2026-01-20", "2026-07-15"},
                {106L, "Batch 01", "PUN", "2026-02-16", "2026-08-14"},
        };
        for (Object[] row : rows) {
            jdbc.update("""
                    insert into batch (intbatch_id, txtstatus, txtbatch_type, txtbatch_name,
                                       txtilp_location_id, datebatch_start_date, datebatch_end_date)
                    values (?, 'A', 'ILP', ?, ?, ?::date, ?::date)
                    """, row[0], row[1], row[2], row[3], row[4]);
        }
    }

    private void seedLearningGroups() {
        // intlg_id, txtlg_name, intbatch_id, txtlocation_id
        Object[][] rows = {
                {1001L, "LG Alpha", 101L, "KOC"},
                {1002L, "LG Beta", 101L, "KOC"},
                {1003L, "LG Alpha", 102L, "TRV"},
                {1004L, "LG Alpha", 103L, "BLR"},
                {1005L, "LG Beta", 103L, "BLR"},
                {1006L, "LG Gamma", 104L, "BLR"},
                {1007L, "LG Alpha", 105L, "CHN"},
        };
        for (Object[] row : rows) {
            jdbc.update("""
                    insert into learning_group (intlg_id, txtlg_name, txtstatus, txtlg_type,
                                                intbatch_id, txtlocation_id, datestart_date)
                    values (?, ?, 'A', 'ILP', ?, ?, '2026-01-06'::date)
                    """, row[0], row[1], row[2], row[3]);
        }
    }

    private void seedParticipants() {
        // intparticipant_id, intemployee_id, name, intbatch_id, intlg_id, reference
        Object[][] rows = {
                {5001L, 41201L, "Aarav Nair", 101L, 1001L, "KOC-2026-001"},
                {5002L, 41202L, "Meera Iyer", 101L, 1001L, "KOC-2026-002"},
                {5003L, 41203L, "Rohan Das", 101L, 1001L, "KOC-2026-003"},
                {5004L, 41204L, "Ananya Menon", 101L, 1002L, "KOC-2026-004"},
                {5005L, 41205L, "Vikram Pillai", 101L, 1002L, "KOC-2026-005"},
                {5006L, 41206L, "Sneha Krishnan", 102L, 1003L, "TRV-2026-001"},
                {5007L, 41207L, "Arjun Rao", 102L, 1003L, "TRV-2026-002"},
                {5008L, 41208L, "Divya Sharma", 103L, 1004L, "BLR-2026-001"},
                {5009L, 41209L, "Karthik Reddy", 103L, 1004L, "BLR-2026-002"},
                {5010L, 41210L, "Priya Verma", 103L, 1005L, "BLR-2026-003"},
                {5011L, 41211L, "Nikhil Joshi", 104L, 1006L, "BLR-2026-004"},
                {5012L, 41212L, "Ishita Bose", 104L, 1006L, "BLR-2026-005"},
                {5013L, 41213L, "Rahul Kumar", 105L, 1007L, "CHN-2026-001"},
                {5014L, 41214L, "Lakshmi Narayan", 105L, 1007L, "CHN-2026-002"},
        };
        for (Object[] row : rows) {
            jdbc.update("""
                    insert into participant (intparticipant_id, intemployee_id, txtparticipant_name,
                                             intbatch_id, intlg_id, txtreference_id, intstatus_id, txtphase_id)
                    values (?, ?, ?, ?, ?, ?, 1, 'P1')
                    """, row[0], row[1], row[2], row[3], row[4], row[5]);
        }
    }

    /**
     * Two accounts that make role scoping visible.
     *
     * <p>Their employee numbers are deliberately outside the trainee range, so the
     * demo never suggests a member of staff is also on their own roster.
     *
     * <p>Passwords go through the configured {@link PasswordEncoder} rather than
     * being written as literals, so seeding keeps working unchanged when the portal
     * is switched from plain text to BCrypt.
     */
    private void seedDemoAccounts() {
        account(10295L, "kocadmin", "Kochi Location Admin", "koc@bizzskill.local",
                "Koc@123", "location-admin", "KOC", null);
        account(10296L, "faculty1", "Divya Sharma", "fac@bizzskill.local",
                "Fac@123", "faculty", "BLR", 103L);
    }

    private void account(
            Long employeeId,
            String username,
            String name,
            String email,
            String password,
            String roleCode,
            String locationId,
            Long batchId) {

        jdbc.update("""
                insert into app_user (intemployee_id, txtusername, txtname, txtemail, txtpassword,
                                      introle_id, txtstatus, txtcreated_by)
                select ?, ?, ?, ?, ?, r.introle_id, 'A', 'demo-seed'
                from app_role r where r.txtrole_code = ?
                """, employeeId, username, name, email, passwordEncoder.encode(password), roleCode);

        jdbc.update("""
                insert into app_user_location (intuser_id, txtlocation_id)
                select intuser_id, ? from app_user where intemployee_id = ?
                """, locationId, employeeId);

        if (batchId != null) {
            jdbc.update("""
                    insert into app_user_batch (intuser_id, intbatch_id)
                    select intuser_id, ? from app_user where intemployee_id = ?
                    """, batchId, employeeId);
        }
    }
}
