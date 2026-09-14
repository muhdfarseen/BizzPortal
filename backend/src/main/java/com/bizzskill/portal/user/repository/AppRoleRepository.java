package com.bizzskill.portal.user.repository;

import com.bizzskill.portal.user.entity.AppRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/** Read access to roles, with their permission sets eagerly fetched. */
public interface AppRoleRepository extends JpaRepository<AppRole, Long> {

    /**
     * Loads a role with its permissions in one query.
     *
     * <p>The join fetch matters: authentication needs the permission set
     * immediately, and letting it load lazily would fire a second query inside
     * the security filter, after the persistence context has closed.
     */
    @Query("select r from AppRole r left join fetch r.permissions where r.txtRoleCode = :code")
    Optional<AppRole> findByCodeWithPermissions(@Param("code") String code);

    @Query("select distinct r from AppRole r left join fetch r.permissions order by r.intSortOrder")
    List<AppRole> findAllWithPermissions();
}
