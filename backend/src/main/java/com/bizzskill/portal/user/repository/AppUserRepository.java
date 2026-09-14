package com.bizzskill.portal.user.repository;

import com.bizzskill.portal.common.enums.Status;
import com.bizzskill.portal.user.entity.AppUser;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/** Read/write access to portal accounts. */
public interface AppUserRepository extends JpaRepository<AppUser, Long> {

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
     * Every account for the user-management screen.
     *
     * <p>Role, locations and batches are all fetched up front: the screen renders
     * every user's role name and assignments, so lazy loading here would be a
     * textbook N+1.
     */
    @EntityGraph(attributePaths = {"role", "locationIds", "batchIds"})
    List<AppUser> findAllByOrderByTxtNameAsc();

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
