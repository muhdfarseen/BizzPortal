package com.bizzskill.portal.organization.dto;

import java.util.List;

/**
 * The organisation hierarchy as the frontend consumes it: Location → Batch → LG.
 *
 * <p>Grouped into one file as nested records because the three types only ever
 * exist as parts of this one tree, and they are pure wire shapes — no behaviour
 * belongs on them.
 *
 * <p>Ids are rendered as strings even though batches and learning groups are
 * numeric in the database. The client treats every id as an opaque string in its
 * filter state, so converting once here is better than making the frontend
 * parse numbers it never does arithmetic on.
 */
public final class OrganizationTree {

    private OrganizationTree() {
    }

    /**
     * A learning group: the unit an assessment table is loaded for.
     *
     * @param id   the portal's {@code intlg_id}, as a string.
     * @param name the display name, e.g. {@code LG Alpha}.
     */
    public record LgNode(String id, String name) {
    }

    /**
     * A batch at a location.
     *
     * @param id   the portal's {@code intbatch_id}, as a string.
     * @param name the display name, e.g. {@code Batch 01}.
     * @param lgs  the batch's learning groups; empty when the caller may see the
     *             batch but none of its groups.
     */
    public record BatchNode(String id, String name, List<LgNode> lgs) {
    }

    /**
     * A training location.
     *
     * @param id      the portal's {@code txtlocation_id}, e.g. {@code KOC}.
     * @param name    the display name, e.g. {@code Kochi}.
     * @param batches the batches running there.
     */
    public record LocationNode(String id, String name, List<BatchNode> batches) {
    }
}
