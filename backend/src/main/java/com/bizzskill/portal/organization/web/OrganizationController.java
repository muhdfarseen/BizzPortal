package com.bizzskill.portal.organization.web;

import com.bizzskill.portal.organization.dto.OrganizationTree.LocationNode;
import com.bizzskill.portal.organization.service.OrganizationService;
import com.bizzskill.portal.security.CurrentUser;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The organisation hierarchy endpoints.
 */
@RestController
@RequestMapping("/api/organization")
public class OrganizationController {

    private final OrganizationService organization;
    private final CurrentUser currentUser;

    public OrganizationController(OrganizationService organization, CurrentUser currentUser) {
        this.organization = organization;
        this.currentUser = currentUser;
    }

    /**
     * The location → batch → LG tree, already narrowed to the caller's scope.
     *
     * <p>Guarded by {@code dashboard.view} rather than a permission of its own:
     * every screen needs the filter bar, and all four roles hold this permission.
     * The scope filter, not the permission, is what protects the data.
     */
    @GetMapping("/locations")
    @PreAuthorize("hasAuthority('dashboard.view')")
    public List<LocationNode> locations() {
        return organization.locationTree(currentUser.require());
    }
}
