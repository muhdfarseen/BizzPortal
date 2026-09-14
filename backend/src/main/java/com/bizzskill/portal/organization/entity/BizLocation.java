package com.bizzskill.portal.organization.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

/**
 * A training location (the portal's {@code LOCATION} table).
 *
 * <p><strong>Read-only.</strong> The table is owned by the existing technical
 * assessment portal; this application never writes to it. {@code @Immutable}
 * makes Hibernate discard any accidental update rather than silently issuing
 * one, and the repository deliberately exposes read methods only.
 *
 * <p>Also note there is no {@code @GeneratedValue}: the ids come from the
 * portal's own sequences, and this application has no business minting them.
 */
@Entity
@Immutable
@Table(name = "location")
public class BizLocation {

    @Id
    @Column(name = "txtlocation_id", length = 4, nullable = false)
    private String txtLocationId;

    @Column(name = "txtlocation_name", length = 25)
    private String txtLocationName;

    protected BizLocation() {
        // Required by JPA.
    }

    public String getTxtLocationId() {
        return txtLocationId;
    }

    public String getTxtLocationName() {
        return txtLocationName;
    }
}
