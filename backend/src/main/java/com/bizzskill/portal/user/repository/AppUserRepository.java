package com.bizzskill.portal.user.repository;

import com.bizzskill.portal.common.enums.Status;
import com.bizzskill.portal.user.entity.AppUser;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/** Read/write access to portal accounts. */
public interface AppUserRepository
        extends JpaRepository<AppUser, Long>, JpaSpecificationExecutor<AppUser> {

    /**
     * Looks an account up for sign-in.
     *
     * <p>The role is fetched with the account because the token's authorities are
     * built from it; the permission set is then loaded within the same
     * transaction by the authentication service.
     */
    @EntityGraph(attributePaths = "role")
    Optional<AppUser> findByTxtUsernameIgnoreCase(String username);

    @EntityGraph(attributePaths = "role")
    Optional<AppUser> findByIntEmployeeId(Long intEmployeeId);

    /**
     * The accounts named, with everything the user-management screen renders.
     *
     * <p>The second half of a paged read. Assembling a page in one query would mean
     * joining {@code locationIds} and {@code batchIds}, which are element
     * collections — and Hibernate cannot apply a row limit across a collection join,
     * so it silently loads the whole table and pages in memory. Paging the accounts
     * first and fetching their collections for just that page keeps the limit in the
     * database, which is the entire point.
     */
    @EntityGraph(attributePaths = {"role", "locationIds", "batchIds"})
    List<AppUser> findByIntUserIdIn(Collection<Long> intUserIds);

    boolean existsByTxtUsernameIgnoreCase(String username);

    boolean existsByIntEmployeeId(Long intEmployeeId);

    /**
     * Counts the usable accounts holding a role.
     *
     * <p>Used to refuse removing the last active Super Admin, which would leave the
     * portal with nobody able to manage users or configuration.
     */
    long countByRole_TxtRoleCodeAndTxtStatus(String roleCode, Status status);
}
