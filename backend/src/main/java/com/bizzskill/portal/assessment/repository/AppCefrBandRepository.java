package com.bizzskill.portal.assessment.repository;

import com.bizzskill.portal.assessment.entity.AppCefrBand;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/** Read/write access to the score to CEFR mapping. */
public interface AppCefrBandRepository extends JpaRepository<AppCefrBand, Long> {

    /**
     * The mapping in band order.
     *
     * <p>Ascending {@code intMinScore} puts the lowest band first, which is both
     * how the configuration screen renders it and the order in which the
     * score-to-level lookup walks it.
     */
    List<AppCefrBand> findAllByOrderByIntMinScoreAsc();
}
