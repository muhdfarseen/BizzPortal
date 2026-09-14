package com.bizzskill.portal.organization.repository;

import com.bizzskill.portal.organization.entity.LearningGroup;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

/** Read access to the portal-owned {@code learning_group} table. */
public interface LearningGroupRepository extends JpaRepository<LearningGroup, Long> {

    List<LearningGroup> findByIntBatchIdInOrderByTxtLgNameAsc(Collection<Long> batchIds);
}
