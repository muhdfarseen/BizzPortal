package com.bizzskill.portal.assessment.service;

import com.bizzskill.portal.assessment.dto.CefrBandRequest;
import com.bizzskill.portal.assessment.entity.AppCefrBand;
import com.bizzskill.portal.assessment.repository.AppCefrBandRepository;
import com.bizzskill.portal.common.error.RequestValidationException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The score to CEFR rule, tested exhaustively without a database.
 *
 * <p>This is the logic most likely to be got subtly wrong and the most expensive to
 * get wrong: every score on every screen is rendered through it, and the Versant
 * scale deliberately overlaps at 76. The tests below pin the published scale
 * boundaries rather than restating the implementation.
 */
class CefrMappingServiceTest {

    /** The published Versant scale the portal ships with. */
    private static List<AppCefrBand> versantScale() {
        return List.of(
                band("Below A1", 10, 22),
                band("A1", 23, 30),
                band("A2", 31, 36),
                band("A2+", 37, 43),
                band("B1", 44, 51),
                band("B1+", 52, 59),
                band("B2", 60, 67),
                band("B2+", 68, 76),
                band("C1", 76, 85),
                band("C2", 86, 90));
    }

    private static AppCefrBand band(String level, int min, int max) {
        return AppCefrBand.create(level, min, max, "red", min);
    }

    @Nested
    @DisplayName("resolving a score to a level")
    class Resolving {

        @ParameterizedTest(name = "{0} -> {1}")
        @CsvSource({
            "10, Below A1",
            "22, Below A1",
            "23, A1",
            "30, A1",
            "31, A2",
            "36, A2",
            "37, A2+",
            "43, A2+",
            "44, B1",
            "51, B1",
            "52, B1+",
            "59, B1+",
            "60, B2",
            "67, B2",
            "68, B2+",
            "85, C1",
            "86, C2",
            "90, C2",
        })
        @DisplayName("awards the band whose range contains the score")
        void awardsContainingBand(int score, String expected) {
            assertThat(CefrMappingService.levelFor(score, versantScale())).isEqualTo(expected);
        }

        @Test
        @DisplayName("resolves the 76 overlap upward to C1, matching the frontend")
        void resolvesOverlapUpward() {
            // B2+ is 68-76 and C1 is 76-85. The higher minimum wins.
            assertThat(CefrMappingService.levelFor(76, versantScale())).isEqualTo("C1");
        }

        @Test
        @DisplayName("on an equal minimum the later band wins")
        void laterBandWinsEqualMinimum() {
            List<AppCefrBand> bands = List.of(band("First", 50, 60), band("Second", 50, 60));

            assertThat(CefrMappingService.levelFor(55, bands)).isEqualTo("Second");
        }

        @Test
        @DisplayName("a score below the whole scale rounds down to the lowest band")
        void belowScaleRoundsDown() {
            // Not null: a very low score is a result, not a missing one.
            assertThat(CefrMappingService.levelFor(0, versantScale())).isEqualTo("Below A1");
        }

        @Test
        @DisplayName("a score above the scale rounds to the highest band ending below it")
        void aboveScaleRoundsToHighestBelow() {
            assertThat(CefrMappingService.levelFor(120, versantScale())).isEqualTo("C2");
        }

        @Test
        @DisplayName("a score in a gap between bands uses the nearest band below it")
        void gapUsesNearestBelow() {
            List<AppCefrBand> gapped = List.of(band("Low", 10, 20), band("High", 40, 50));

            assertThat(CefrMappingService.levelFor(30, gapped)).isEqualTo("Low");
        }

        @Test
        @DisplayName("an unconfigured mapping awards nothing")
        void emptyMappingAwardsNothing() {
            assertThat(CefrMappingService.levelFor(50, List.of())).isNull();
        }
    }

    @Nested
    @DisplayName("replacing the mapping")
    class Replacing {

        private final AppCefrBandRepository repository = mock(AppCefrBandRepository.class);
        private final CefrMappingService service = new CefrMappingService(repository);

        @Test
        @DisplayName("rejects an inverted range, naming the offending row")
        void rejectsInvertedRange() {
            when(repository.saveAll(anyList())).thenAnswer(call -> call.getArgument(0));

            assertThatThrownBy(() -> service.replace(List.of(
                    new CefrBandRequest("A1", 40, 20, "red"))))
                    .isInstanceOf(RequestValidationException.class)
                    .satisfies(thrown -> assertThat(
                            ((RequestValidationException) thrown).getViolations())
                            .anySatisfy(violation -> {
                                assertThat(violation.field()).isEqualTo("bands[0].min");
                                assertThat(violation.message()).contains("A1");
                            }));

            // Nothing may be written when the payload is rejected.
            verify(repository, never()).deleteAllInBatch();
        }

        @Test
        @DisplayName("rejects a duplicate level regardless of case")
        void rejectsDuplicateLevel() {
            assertThatThrownBy(() -> service.replace(List.of(
                    new CefrBandRequest("A1", 10, 20, "red"),
                    new CefrBandRequest("a1", 21, 30, "green"))))
                    .isInstanceOf(RequestValidationException.class)
                    .satisfies(thrown -> assertThat(
                            ((RequestValidationException) thrown).getViolations())
                            .anySatisfy(violation ->
                                    assertThat(violation.field()).isEqualTo("bands[1].level")));

            verify(repository, never()).deleteAllInBatch();
        }

        @Test
        @DisplayName("stores the bands in the order they were submitted")
        void storesSubmittedOrder() {
            when(repository.saveAll(anyList())).thenAnswer(call -> call.getArgument(0));

            service.replace(List.of(
                    new CefrBandRequest("A1", 10, 20, "red"),
                    new CefrBandRequest("B1", 21, 30, "green")));

            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<AppCefrBand>> captor = ArgumentCaptor.forClass(List.class);
            verify(repository).saveAll(captor.capture());

            assertThat(captor.getValue())
                    .extracting(AppCefrBand::getTxtCefrLevel, AppCefrBand::getIntSortOrder)
                    .containsExactly(
                            org.assertj.core.groups.Tuple.tuple("A1", 1),
                            org.assertj.core.groups.Tuple.tuple("B1", 2));
        }

        @Test
        @DisplayName("trims whitespace from submitted levels and colours")
        void trimsWhitespace() {
            when(repository.saveAll(anyList())).thenAnswer(call -> call.getArgument(0));

            service.replace(List.of(new CefrBandRequest("  A1  ", 10, 20, "  red  ")));

            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<AppCefrBand>> captor = ArgumentCaptor.forClass(List.class);
            verify(repository).saveAll(captor.capture());

            assertThat(captor.getValue().get(0).getTxtCefrLevel()).isEqualTo("A1");
            assertThat(captor.getValue().get(0).getTxtColorId()).isEqualTo("red");
        }

        @Test
        @DisplayName("an empty mapping is allowed, leaving no level configured")
        void allowsEmptyMapping() {
            when(repository.saveAll(anyList())).thenReturn(List.of());

            assertThat(service.replace(List.of())).isEmpty();
            verify(repository).deleteAllInBatch();
        }
    }
}
