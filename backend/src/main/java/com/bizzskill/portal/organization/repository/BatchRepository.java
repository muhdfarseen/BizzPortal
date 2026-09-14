package com.bizzskill.portal.organization.repository;

import com.bizzskill.portal.organization.entity.Batch;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

/** Read access to the portal-owned {@code batch} table. */
public interface BatchRepository extends JpaRepository<Batch, Long> {

    List<Batch> findByTxtIlpLocationIdInOrderByTxtBatchNameAsc(Collection<String> locationIds);

    List<Batch> findByIntBatchIdInOrderByTxtBatchNameAsc(Collection<Long> batchIds);
}
