package com.bizzskill.portal.common.web;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * A liveness and readiness probe.
 *
 * <p>Public, because a load balancer or container platform has no credentials. It
 * therefore reports only whether the application is up and whether it can reach its
 * database — never a version, a hostname, a connection string or an error message,
 * all of which would be free reconnaissance.
 *
 * <p>Returns 200 only when the database answers. A process that is running but
 * cannot reach its database is not ready, and reporting it as healthy is how a
 * broken instance stays in a load balancer's rotation.
 */
@RestController
@RequestMapping("/api")
public class HealthController {

    private final JdbcTemplate jdbc;

    public HealthController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("status", databaseReachable() ? "UP" : "DOWN");
        status.put("time", Instant.now().toString());
        return status;
    }

    private boolean databaseReachable() {
        try {
            jdbc.queryForObject("select 1", Integer.class);
            return true;
        } catch (RuntimeException ex) {
            // Deliberately swallowed: the reason can name the host and the schema.
            return false;
        }
    }
}
