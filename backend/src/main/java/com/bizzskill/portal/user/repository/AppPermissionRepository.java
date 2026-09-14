package com.bizzskill.portal.user.repository;

import com.bizzskill.portal.user.entity.AppPermission;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/** Read access to the permission catalogue. */
public interface AppPermissionRepository extends JpaRepository<AppPermission, Long> {

    List<AppPermission> findAllByOrderByIntSortOrderAsc();
}
