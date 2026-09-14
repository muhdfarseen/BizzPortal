package com.bizzskill.portal.organization.repository;

import com.bizzskill.portal.organization.entity.BizLocation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Read access to the portal-owned {@code location} table.
 *
 * <p>Deliberately extends {@code JpaRepository} but is only ever used for reads;
 * the entity is {@code @Immutable}, so an accidental {@code save} would not write
 * anything anyway.
 */
public interface BizLocationRepository extends JpaRepository<BizLocation, String> {

    List<BizLocation> findAllByOrderByTxtLocationNameAsc();
}
