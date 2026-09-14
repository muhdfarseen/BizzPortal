package com.bizzskill.portal;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * BizzSkill Portal API.
 *
 * <p>Reads the training organisation (locations, batches, learning groups and
 * participants) from the tables owned by the existing technical assessment
 * portal, and owns the assessment configuration, results, CEFR mapping and
 * LAP/Remedial data on top of them.
 *
 * <p>The database schema is managed entirely by Flyway
 * ({@code src/main/resources/db/migration}); Hibernate is configured to
 * validate against it rather than create it.
 */
@SpringBootApplication
public class PortalApplication {

    public static void main(String[] args) {
        SpringApplication.run(PortalApplication.class, args);
    }
}
