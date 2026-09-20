import { Component, computed, inject, input } from '@angular/core';
import { formatIsoDate } from '../../../core/models/assessment.model';
import { ReportExam, ReportTrack, TraineeReport } from '../../../core/models/report.model';
import { CefrMappingService } from '../../../core/services/cefr-mapping.service';
import { CefrBadgeStyle, cefrBadge } from '../../../core/models/assessment.model';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { reiconClipboard, reiconDocumentText, reiconUser } from '@ng-icons/reicon';

/** One row of the trainee's fact grid. */
interface Fact {
  label: string;
  value: string;
}

/**
 * One trainee's report — who they are, their exam timeline and their LAP /
 * Remedial timeline.
 *
 * <p>Presentation only: the report is read by the page and handed in, so this
 * component holds no request state and can be rendered from a spec with a literal
 * report. Nothing here labels a value it was not given — an absent batch, group or
 * date reads as a dash rather than as a blank that looks like a bug.
 */
@Component({
  selector: 'app-trainee-report',
  standalone: true,
  imports: [NgIcon],
  providers: [provideIcons({ reiconUser, reiconClipboard, reiconDocumentText })],
  templateUrl: './trainee-report.html',
  styleUrl: './trainee-report.css',
})
export class TraineeReportComponent {
  private readonly cefrMapping = inject(CefrMappingService);

  /** The trainee report on screen, or `null` while none has been loaded. */
  readonly report = input<TraineeReport | null>(null);

  /** Whether the report is being read. */
  readonly loading = input(false);

  /** Whether the last read failed. */
  readonly failed = input(false);

  /** The trainee's identifying facts, as the header card renders them. */
  readonly facts = computed<Fact[]>(() => {
    const report = this.report();
    if (!report) {
      return [];
    }
    return [
      { label: 'Batch', value: dash(report.batchName) },
      { label: 'Learning group', value: dash(report.lgName) },
      { label: 'Location', value: dash(report.locationName) },
      { label: 'Phase', value: dash(report.phase) },
      { label: 'Recruit branch', value: dash(report.recruitBranch) },
      { label: 'Reference', value: dash(report.referenceId) },
      { label: 'ILP date', value: report.ilpDate ? formatIsoDate(report.ilpDate) : '—' },
      {
        label: 'Batch start',
        value: report.batchStartDate ? formatIsoDate(report.batchStartDate) : '—',
      },
    ];
  });

  /** The current track, as the header chip reads it; `null` when the trainee is on none. */
  readonly currentTrack = computed(() => {
    const report = this.report();
    if (!report?.currentTrack) {
      return null;
    }
    return {
      label: report.currentTrack === 'lap' ? 'LAP' : 'Remedial',
      css: report.currentTrack,
      since: report.currentTrackSince ? formatIsoDate(report.currentTrackSince) : null,
    };
  });

  /** The exams still to be sat — the tail of the timeline. */
  readonly pendingExams = computed(
    () => this.report()?.exams.filter((exam) => !exam.assessedOn).length ?? 0,
  );

  /** Whether the trainee has ever been on a track. */
  readonly hasTrackHistory = computed(() => (this.report()?.tracks.length ?? 0) > 0);

  /** Date rendering, so the templates read ISO dates the way every screen does. */
  protected readonly formatDate = formatIsoDate;

  /** How an exam entry's score reads, e.g. `62 / 90`. */
  examScore(exam: ReportExam): string {
    return exam.score === undefined ? 'Not assessed' : `${exam.score} / ${exam.maxScore}`;
  }

  /** The badge tint for a level, taken from the mapping the portal is running. */
  cefrStyle(level: string | undefined): CefrBadgeStyle | null {
    return level ? cefrBadge(this.cefrMapping.colorFor(level).accent) : null;
  }

  /** How a placement's period reads, e.g. `2 Mar 2026 → 14 May 2026` or `since 2 Mar 2026`. */
  trackPeriod(track: ReportTrack): string {
    const start = formatIsoDate(track.startDate);
    return track.closeDate ? `${start} → ${formatIsoDate(track.closeDate)}` : `since ${start}`;
  }
}

/** A value the report may not hold, rendered as a dash rather than as nothing. */
function dash(value: string | undefined | null): string {
  return value && value.trim() !== '' ? value : '—';
}
