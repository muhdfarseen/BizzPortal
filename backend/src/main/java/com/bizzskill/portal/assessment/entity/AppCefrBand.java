package com.bizzskill.portal.assessment.entity;

import com.bizzskill.portal.common.entity.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * One band of the score to CEFR mapping.
 *
 * <p>{@code txtCefrLevel} is free text rather than an enum, because administrators
 * may define their own level labels. {@code txtColorId} names an entry in the
 * frontend's colour palette; the badge itself is rendered client-side from that
 * id, so adding a colour is a frontend change and never a data migration.
 *
 * <p>Ranges are allowed to overlap (Versant publishes B2+ as 68-76 and C1 as
 * 76-85). The level awarding a score is therefore the band with the highest
 * {@code intMinScore} — see {@code CefrMappingService.levelFor}.
 */
@Entity
@Table(name = "app_cefr_band")
public class AppCefrBand extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "intcefr_band_id")
    private Long intCefrBandId;

    @Column(name = "txtcefr_level", length = 30, nullable = false, unique = true)
    private String txtCefrLevel;

    @Column(name = "intmin_score", nullable = false)
    private Integer intMinScore;

    @Column(name = "intmax_score", nullable = false)
    private Integer intMaxScore;

    @Column(name = "txtcolor_id", length = 30, nullable = false)
    private String txtColorId;

    @Column(name = "intsort_order", nullable = false)
    private Integer intSortOrder;

    protected AppCefrBand() {
        // Required by JPA.
    }

    public static AppCefrBand create(
            String level, Integer minScore, Integer maxScore, String colorId, Integer sortOrder) {
        AppCefrBand band = new AppCefrBand();
        band.txtCefrLevel = level;
        band.intMinScore = minScore;
        band.intMaxScore = maxScore;
        band.txtColorId = colorId;
        band.intSortOrder = sortOrder;
        return band;
    }

    public void setIntMinScore(Integer minScore) {
        this.intMinScore = minScore;
    }

    public void setIntMaxScore(Integer maxScore) {
        this.intMaxScore = maxScore;
    }

    public void setTxtColorId(String colorId) {
        this.txtColorId = colorId;
    }

    public void setIntSortOrder(Integer sortOrder) {
        this.intSortOrder = sortOrder;
    }

    public Long getIntCefrBandId() {
        return intCefrBandId;
    }

    public String getTxtCefrLevel() {
        return txtCefrLevel;
    }

    public Integer getIntMinScore() {
        return intMinScore;
    }

    public Integer getIntMaxScore() {
        return intMaxScore;
    }

    public String getTxtColorId() {
        return txtColorId;
    }

    public Integer getIntSortOrder() {
        return intSortOrder;
    }
}
