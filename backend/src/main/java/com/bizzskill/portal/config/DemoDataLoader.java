package com.bizzskill.portal.config;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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
 * Seeds a representative organisation into a development database.
 *
 * <p>Only ever active under the {@code local} profile, so a production
 * deployment never runs it, whatever the state of its tables.
 *
 * <p>The organisation is the fourteen locations the portal is deployed across.
 * Kochi carries the bulk of the data on purpose — three batches, two or three
 * learning groups each, and a roster of 52-60 in every group — because a single
 * page of ten cannot show whether paging, searching and ordering really work.
 * Every other location holds a smaller slice of the same shape, so the
 * location → batch → learning group → roster drill-down has something to show
 * wherever it is pointed.
 *
 * <p>Every insert is idempotent ({@code on conflict do nothing}) and nothing is
 * ever updated or deleted, so running it against a database that already holds
 * data tops it up rather than duplicating or overwriting it. Participants and
 * their scores are derived from the employee number rather than drawn at random,
 * so the same database always comes out the same.
 *
 * <p>Rows are written with {@code JdbcTemplate} rather than through the entities,
 * because the portal entities are {@code @Immutable} — the application genuinely
 * has no write path to those tables, and the seed should not invent one.
 */
@Component
@Profile("local")
public class DemoDataLoader implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoDataLoader.class);

    private static final String DEFAULT_BATCH_START = "2026-01-06";

    /** How many seeded trainees may be on each track; the app has no such limit. */
    private static final int MAX_REMEDIAL_TRACKS = 30;
    private static final int MAX_LAP_TRACKS = 8;

    // ── The organisation ────────────────────────────────────────────────────

    /** txtlocation_id, txtlocation_name. */
    private static final Object[][] LOCATIONS = {
            {"DEL", "Delhi"},
            {"VNS", "Varanasi"},
            {"KOL", "Kolkata"},
            {"BBS", "Bhubaneshwar"},
            {"HYD", "Hyderabad"},
            {"CHN", "Chennai"},
            {"TRV", "Trivandrum"},
            {"KOC", "Kochi"},
            {"BLR", "Bangalore"},
            {"PUN", "Pune"},
            {"BOM", "Mumbai"},
            {"NAG", "Nagpur"},
            {"IDR", "Indore"},
            {"AMD", "Ahmedabad"},
    };

    /** intbatch_id, txtbatch_name, txtilp_location_id, start, end. */
    private static final Object[][] BATCHES = {
            // Kochi runs three cycles; the rest of the country runs two.
            {101L, "Batch 01", "KOC", "2026-01-06", "2026-06-30"},
            {107L, "Batch 02", "KOC", "2026-02-03", "2026-07-31"},
            {108L, "Batch 03", "KOC", "2026-03-03", "2026-08-31"},
            {102L, "Batch 01", "TRV", "2026-01-06", "2026-06-30"},
            {109L, "Batch 02", "TRV", "2026-02-10", "2026-08-07"},
            {103L, "Batch 01", "BLR", "2026-02-02", "2026-07-31"},
            {104L, "Batch 02", "BLR", "2026-03-02", "2026-08-31"},
            {105L, "Batch 01", "CHN", "2026-01-20", "2026-07-15"},
            {110L, "Batch 02", "CHN", "2026-02-24", "2026-08-19"},
            {106L, "Batch 01", "PUN", "2026-02-16", "2026-08-14"},
            {111L, "Batch 02", "PUN", "2026-03-16", "2026-09-11"},
            {112L, "Batch 01", "DEL", "2026-01-12", "2026-07-06"},
            {113L, "Batch 02", "DEL", "2026-02-16", "2026-08-10"},
            {114L, "Batch 01", "VNS", "2026-01-19", "2026-07-13"},
            {115L, "Batch 02", "VNS", "2026-02-23", "2026-08-17"},
            {116L, "Batch 01", "KOL", "2026-01-26", "2026-07-20"},
            {117L, "Batch 02", "KOL", "2026-03-02", "2026-08-24"},
            {118L, "Batch 01", "BBS", "2026-02-02", "2026-07-27"},
            {119L, "Batch 02", "BBS", "2026-03-09", "2026-08-31"},
            {120L, "Batch 01", "HYD", "2026-01-05", "2026-06-29"},
            {121L, "Batch 02", "HYD", "2026-02-09", "2026-08-03"},
            {122L, "Batch 01", "BOM", "2026-01-12", "2026-07-06"},
            {123L, "Batch 02", "BOM", "2026-02-16", "2026-08-10"},
            {124L, "Batch 01", "NAG", "2026-01-19", "2026-07-13"},
            {125L, "Batch 02", "NAG", "2026-02-23", "2026-08-17"},
            {126L, "Batch 01", "IDR", "2026-01-26", "2026-07-20"},
            {127L, "Batch 02", "IDR", "2026-03-02", "2026-08-24"},
            {128L, "Batch 01", "AMD", "2026-02-02", "2026-07-27"},
            {129L, "Batch 02", "AMD", "2026-03-09", "2026-08-31"},
    };

    /**
     * intlg_id, txtlg_name, intbatch_id, txtlocation_id, roster size.
     *
     * <p>Ids are explicit. The groups the demo shipped with keep the id they were
     * first seeded with, so a database that already holds participants keeps them
     * in place; the groups added since take ids from 2001 upwards.
     */
    private static final Object[][] LEARNING_GROUPS = {
            // Kochi — three batches, eight groups, 52-60 trainees in each.
            {1001L, "LG Alpha", 101L, "KOC", 55},
            {1002L, "LG Beta", 101L, "KOC", 54},
            {2001L, "LG Gamma", 101L, "KOC", 52},
            {2002L, "LG Alpha", 107L, "KOC", 58},
            {2003L, "LG Beta", 107L, "KOC", 56},
            {2004L, "LG Alpha", 108L, "KOC", 60},
            {2005L, "LG Beta", 108L, "KOC", 53},
            {2006L, "LG Gamma", 108L, "KOC", 57},
            // Everywhere else — two batches of two groups, ten trainees in each.
            {1003L, "LG Alpha", 102L, "TRV", 10},
            {2010L, "LG Beta", 102L, "TRV", 10},
            {2011L, "LG Alpha", 109L, "TRV", 10},
            {2012L, "LG Beta", 109L, "TRV", 10},
            {1004L, "LG Alpha", 103L, "BLR", 10},
            {1005L, "LG Beta", 103L, "BLR", 10},
            {1006L, "LG Gamma", 104L, "BLR", 10},
            {2013L, "LG Delta", 104L, "BLR", 10},
            {1007L, "LG Alpha", 105L, "CHN", 10},
            {2014L, "LG Beta", 105L, "CHN", 10},
            {2015L, "LG Alpha", 110L, "CHN", 10},
            {2016L, "LG Beta", 110L, "CHN", 10},
            {2017L, "LG Alpha", 106L, "PUN", 10},
            {2018L, "LG Beta", 106L, "PUN", 10},
            {2019L, "LG Alpha", 111L, "PUN", 10},
            {2020L, "LG Beta", 111L, "PUN", 10},
            {2021L, "LG Alpha", 112L, "DEL", 10},
            {2022L, "LG Beta", 112L, "DEL", 10},
            {2023L, "LG Alpha", 113L, "DEL", 10},
            {2024L, "LG Beta", 113L, "DEL", 10},
            {2025L, "LG Alpha", 114L, "VNS", 10},
            {2026L, "LG Beta", 114L, "VNS", 10},
            {2027L, "LG Alpha", 115L, "VNS", 10},
            {2028L, "LG Beta", 115L, "VNS", 10},
            {2029L, "LG Alpha", 116L, "KOL", 10},
            {2030L, "LG Beta", 116L, "KOL", 10},
            {2031L, "LG Alpha", 117L, "KOL", 10},
            {2032L, "LG Beta", 117L, "KOL", 10},
            {2033L, "LG Alpha", 118L, "BBS", 10},
            {2034L, "LG Beta", 118L, "BBS", 10},
            {2035L, "LG Alpha", 119L, "BBS", 10},
            {2036L, "LG Beta", 119L, "BBS", 10},
            {2037L, "LG Alpha", 120L, "HYD", 10},
            {2038L, "LG Beta", 120L, "HYD", 10},
            {2039L, "LG Alpha", 121L, "HYD", 10},
            {2040L, "LG Beta", 121L, "HYD", 10},
            {2041L, "LG Alpha", 122L, "BOM", 10},
            {2042L, "LG Beta", 122L, "BOM", 10},
            {2043L, "LG Alpha", 123L, "BOM", 10},
            {2044L, "LG Beta", 123L, "BOM", 10},
            {2045L, "LG Alpha", 124L, "NAG", 10},
            {2046L, "LG Beta", 124L, "NAG", 10},
            {2047L, "LG Alpha", 125L, "NAG", 10},
            {2048L, "LG Beta", 125L, "NAG", 10},
            {2049L, "LG Alpha", 126L, "IDR", 10},
            {2050L, "LG Beta", 126L, "IDR", 10},
            {2051L, "LG Alpha", 127L, "IDR", 10},
            {2052L, "LG Beta", 127L, "IDR", 10},
            {2053L, "LG Alpha", 128L, "AMD", 10},
            {2054L, "LG Beta", 128L, "AMD", 10},
            {2055L, "LG Alpha", 129L, "AMD", 10},
            {2056L, "LG Beta", 129L, "AMD", 10},
    };

    /**
     * The participants the demo has always shipped with, kept because the README,
     * the demo scripts and the login examples all refer to these names and
     * numbers. intparticipant_id, intemployee_id, name, intbatch_id, intlg_id,
     * txtreference_id.
     */
    private static final Object[][] ORIGINAL_PARTICIPANTS = {
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

    /**
     * Name pools for the generated rosters. Forty given names by thirty surnames
     * is twelve hundred distinct combinations, comfortably more than the nine
     * hundred odd trainees, so the same name rarely appears twice in a group.
     */
    private static final String[] FIRST_NAMES = {
            "Aarav", "Aditya", "Aishwarya", "Ananya", "Anjali", "Aravind", "Arjun", "Bhavana",
            "Deepa", "Divya", "Gaurav", "Harish", "Ishita", "Karthik", "Kavya", "Lakshmi",
            "Manish", "Meera", "Mohan", "Nandini", "Naveen", "Nikhil", "Pooja", "Pranav",
            "Preeti", "Priya", "Rahul", "Rekha", "Ritika", "Rohan", "Sandeep", "Shruti",
            "Siddharth", "Sneha", "Suraj", "Swati", "Tanvi", "Varun", "Vikram", "Vinay",
    };

    private static final String[] SURNAMES = {
            "Acharya", "Banerjee", "Bhat", "Bose", "Chatterjee", "Choudhary", "Das", "Desai",
            "Fernandes", "Gupta", "Iyer", "Iyengar", "Joshi", "Krishnan", "Kulkarni", "Kumar",
            "Menon", "Mishra", "Naidu", "Nair", "Narayan", "Pandey", "Patel", "Pillai",
            "Ranganathan", "Rao", "Reddy", "Sharma", "Shetty", "Verma",
    };

    /**
     * Where generated rows start. Both follow on from the participants above, so
     * the demo holds a single trainee number range and never collides with a row
     * an earlier seed wrote.
     */
    private static final long FIRST_GENERATED_PARTICIPANT_ID = 5015L;
    private static final long FIRST_GENERATED_EMPLOYEE_ID = 41215L;

    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;

    public DemoDataLoader(JdbcTemplate jdbc, PasswordEncoder passwordEncoder) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        seedLocations();
        seedBatches();
        seedLearningGroups();
        seedParticipants();
        seedAssessmentResults();
        seedTracks();
        seedDemoAccounts();
        reportWhatIsInPlace();
    }

    private void seedLocations() {
        for (Object[] row : LOCATIONS) {
            jdbc.update("""
                    insert into location (txtlocation_id, txtlocation_name)
                    values (?, ?)
                    on conflict (txtlocation_id) do nothing
                    """, row);
        }
    }

    private void seedBatches() {
        for (Object[] row : BATCHES) {
            jdbc.update("""
                    insert into batch (intbatch_id, txtstatus, txtbatch_type, txtbatch_name,
                                       txtilp_location_id, datebatch_start_date, datebatch_end_date)
                    values (?, 'A', 'ILP', ?, ?, ?::date, ?::date)
                    on conflict (intbatch_id) do nothing
                    """, row[0], row[1], row[2], row[3], row[4]);
        }
    }

    private void seedLearningGroups() {
        for (Object[] row : LEARNING_GROUPS) {
            jdbc.update("""
                    insert into learning_group (intlg_id, txtlg_name, txtstatus, txtlg_type,
                                                intbatch_id, txtlocation_id, datestart_date)
                    values (?, ?, 'A', 'ILP', ?, ?, '2026-01-06'::date)
                    on conflict (intlg_id) do nothing
                    """, row[0], row[1], row[2], row[3]);
        }
    }

    /**
     * Writes the participants the demo shipped with, then fills every learning
     * group up to the roster size it is declared with.
     *
     * <p>Filling counts what is already in the group, so a group that arrived with
     * three named trainees receives the rest rather than three more on top.
     */
    private void seedParticipants() {
        Map<Long, Integer> alreadyPlaced = new HashMap<>();
        for (Object[] row : ORIGINAL_PARTICIPANTS) {
            jdbc.update("""
                    insert into participant (intparticipant_id, intemployee_id, txtparticipant_name,
                                             intbatch_id, intlg_id, txtreference_id, intstatus_id, txtphase_id)
                    values (?, ?, ?, ?, ?, ?, 1, 'P1')
                    on conflict (intparticipant_id) do nothing
                    """, row[0], row[1], row[2], row[3], row[4], row[5]);
            alreadyPlaced.merge((Long) row[4], 1, Integer::sum);
        }

        Map<String, Integer> referenceCounters = referenceCounters();
        long participantId = FIRST_GENERATED_PARTICIPANT_ID;
        long employeeId = FIRST_GENERATED_EMPLOYEE_ID;
        int nameIndex = 0;

        for (Object[] group : LEARNING_GROUPS) {
            long lgId = (Long) group[0];
            long batchId = (Long) group[2];
            String locationId = (String) group[3];
            int rosterSize = (Integer) group[4];

            for (int place = alreadyPlaced.getOrDefault(lgId, 0); place < rosterSize; place++) {
                String name = generatedName(nameIndex);
                int sequence = referenceCounters.merge(locationId, 1, Integer::sum);
                String reference = "%s-2026-%03d".formatted(locationId, sequence);

                jdbc.update("""
                        insert into participant (intparticipant_id, intemployee_id, txtparticipant_name,
                                                 intbatch_id, intlg_id, txtreference_id, intstatus_id, txtphase_id)
                        values (?, ?, ?, ?, ?, ?, 1, 'P1')
                        on conflict (intparticipant_id) do nothing
                        """, participantId, employeeId, name, batchId, lgId, reference);

                participantId++;
                employeeId++;
                nameIndex++;
            }
        }
    }

    /**
     * A name for the trainee at the given position in the generated rosters.
     *
     * <p>The two pools are walked at different rates — one by one, the other by a
     * stride coprime with its length — so a group does not end up with sixty
     * variations of the same surname, and no two trainees within one group share a
     * name while across the organisation the pools still repeat as real ones do.
     */
    private static String generatedName(int index) {
        String given = FIRST_NAMES[index % FIRST_NAMES.length];
        String surname = SURNAMES[(index * 7 + index / FIRST_NAMES.length) % SURNAMES.length];
        return given + " " + surname;
    }

    /** The next reference number to hand out per location, counting what is there. */
    private Map<String, Integer> referenceCounters() {
        Map<String, Integer> counters = new HashMap<>();
        jdbc.query("""
                select split_part(txtreference_id, '-', 1) as location_id, count(*) as issued
                from participant
                where txtreference_id is not null
                group by 1
                """, rs -> {
            counters.put(rs.getString("location_id"), rs.getInt("issued"));
        });
        return counters;
    }

    /**
     * Gives the seeded trainees a plausible history: a baseline for everyone, a
     * mid and a post for the trainees far enough through their cycle, and the CEFR
     * level the mapping awards for each score.
     *
     * <p>Scores are derived from the employee number and the level is resolved
     * against whatever mapping the database holds, so the same seed run twice
     * produces the same figures and the levels agree with the configured bands.
     * No audit rows are written: that trail records changes made in the portal,
     * and these rows carry {@code txtcreated_by = 'demo-seed'} to say where they
     * came from instead.
     */
    /**
     * The baseline a seeded trainee is given, derived from the employee number so
     * the same trainee carries the same score however often the seed runs. Both
     * the results and the track placement read it, so the two can never disagree
     * about who started below the line.
     */
    private static int baselineScore(long employeeId) {
        return 38 + (int) Math.floorMod(employeeId * 7, 44);
    }

    private void seedAssessmentResults() {
        List<Object[]> results = new ArrayList<>();
        for (Object[] trainee : roster()) {
            long employeeId = (Long) trainee[0];
            LocalDate start = (LocalDate) trainee[1];
            int pre = baselineScore(employeeId);
            int mid = Math.min(90, pre + 4 + (int) Math.floorMod(employeeId * 3, 8));
            int post = Math.min(90, mid + 3 + (int) Math.floorMod(employeeId * 5, 8));

            results.add(new Object[] {employeeId, 1L, pre, start.plusDays(12)});
            if (employeeId % 10 < 8) {
                results.add(new Object[] {employeeId, 2L, mid, start.plusDays(75)});
            }
            if (employeeId % 10 < 5) {
                results.add(new Object[] {employeeId, 3L, post, start.plusDays(135)});
            }
        }

        jdbc.batchUpdate("""
                insert into app_assessment_result (intemployee_id, intassessment_id, intscore,
                                                   txtcefr_level, dateassessed_on, txtcreated_by)
                select ?, ?, ?,
                       (select b.txtcefr_level
                        from app_cefr_band b
                        where ? >= b.intmin_score and ? <= b.intmax_score
                        order by b.intmin_score desc
                        limit 1),
                       ?::date, 'demo-seed'
                on conflict (intemployee_id, intassessment_id) do nothing
                """, results, 500, (statement, row) -> {
            statement.setLong(1, (Long) row[0]);
            statement.setLong(2, (Long) row[1]);
            statement.setInt(3, (Integer) row[2]);
            statement.setInt(4, (Integer) row[2]);
            statement.setInt(5, (Integer) row[2]);
            statement.setObject(6, (LocalDate) row[3]);
        });
    }

    /**
     * Puts a share of the seeded trainees on a track, so the LAP / Remedial screen
     * is not empty on a fresh database: the weakest baselines onto remedial, the
     * strongest onto the LAP. Capped, because this is a demo and not a policy.
     */
    private void seedTracks() {
        int remedial = 0;
        int lap = 0;
        int position = 0;

        for (Object[] trainee : roster()) {
            long employeeId = (Long) trainee[0];
            LocalDate start = (LocalDate) trainee[1];
            int pre = baselineScore(employeeId);

            if (remedial < MAX_REMEDIAL_TRACKS && pre < 44 && position % 4 == 0) {
                placeOnTrack(employeeId, "remedial", start,
                        "Baseline below B1; remedial support through this cycle.");
                remedial++;
            } else if (lap < MAX_LAP_TRACKS && pre >= 76 && position % 11 == 0) {
                placeOnTrack(employeeId, "lap", start,
                        "Baseline at C1; extended work on the LAP track.");
                lap++;
            }
            position++;
        }
    }

    private void placeOnTrack(long employeeId, String track, LocalDate start, String remark) {
        jdbc.update("""
                insert into app_lap_remedial (intemployee_id, intassessment_id, txttrack, txtstatus,
                                              txtremark, datestart_date, txtcreated_by)
                values (?, 1, ?, 'A', ?, ?::date, 'demo-seed')
                on conflict (intemployee_id) where txtstatus = 'A' do nothing
                """, employeeId, track, remark, start.plusDays(30));
    }

    /** Every seeded trainee with the start date of their batch, oldest id first. */
    private List<Object[]> roster() {
        return jdbc.query("""
                select p.intemployee_id, b.datebatch_start_date
                from participant p
                left join batch b on b.intbatch_id = p.intbatch_id
                order by p.intparticipant_id
                """, (rs, rowNum) -> {
            LocalDate start = rs.getObject("datebatch_start_date", LocalDate.class);
            return new Object[] {
                    rs.getLong("intemployee_id"),
                    start != null ? start : LocalDate.parse(DEFAULT_BATCH_START),
            };
        });
    }

    /**
     * Two accounts that make role scoping visible.
     *
     * <p>Their employee numbers are deliberately outside the trainee range, so the
     * demo never suggests a member of staff is also on their own roster. Kochi is
     * the location with the deep rosters, so signing in as its location admin shows
     * scoping against a group large enough to page through.
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
                on conflict (intemployee_id) do nothing
                """, employeeId, username, name, email, passwordEncoder.encode(password), roleCode);

        jdbc.update("""
                insert into app_user_location (intuser_id, txtlocation_id)
                select intuser_id, ? from app_user where intemployee_id = ?
                on conflict (intuser_id, txtlocation_id) do nothing
                """, locationId, employeeId);

        if (batchId != null) {
            jdbc.update("""
                    insert into app_user_batch (intuser_id, intbatch_id)
                    select intuser_id, ? from app_user where intemployee_id = ?
                    on conflict (intuser_id, intbatch_id) do nothing
                    """, batchId, employeeId);
        }
    }

    /**
     * Reports what the database now holds rather than what this run inserted, so
     * the line is equally true whether the seed filled an empty database or topped
     * up one that was already populated.
     */
    private void reportWhatIsInPlace() {
        record Counts(int locations, int batches, int groups, int participants,
                      int results, int tracks) {
        }

        Counts counts = jdbc.queryForObject("""
                select (select count(*) from location)                              as locations,
                       (select count(*) from batch)                                 as batches,
                       (select count(*) from learning_group)                        as groups,
                       (select count(*) from participant)                           as participants,
                       (select count(*) from app_assessment_result)                 as results,
                       (select count(*) from app_lap_remedial where txtstatus = 'A') as tracks
                """, (rs, rowNum) -> new Counts(
                rs.getInt("locations"), rs.getInt("batches"), rs.getInt("groups"),
                rs.getInt("participants"), rs.getInt("results"), rs.getInt("tracks")));

        if (counts != null) {
            log.info("Demo portal data in place: {} locations, {} batches, {} learning groups, "
                            + "{} participants, {} assessment results, {} open tracks.",
                    counts.locations(), counts.batches(), counts.groups(),
                    counts.participants(), counts.results(), counts.tracks());
        }
    }
}
