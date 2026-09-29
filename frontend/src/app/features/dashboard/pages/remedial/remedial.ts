import { Component } from '@angular/core';
import {
  TrackManagementComponent,
  TrackPage,
} from '../../../../shared/ui/track-management/track-management';

/**
 * The Remedial track.
 *
 * The screen always lists the trainees on Remedial, and the Initiate Remedial
 * button swaps it for the trainees on no track at all — the pool a placement is
 * made from. The LAP page configures the same screen against the LAP track.
 *
 * <p>Only Close Remedial is offered here. Moving a trainee onto LAP is made from
 * the LAP page, so the two tracks are each managed in one place rather than the
 * Remedial table also carrying the LAP placement.
 */
const REMEDIAL_PAGE: TrackPage = {
  title: 'Remedial',
  status: 'remedial',
  actions: [{ id: 'close-remedial', label: 'Close Remedial', variant: 'secondary' }],
  emptyHint: 'No trainees are on Remedial for this group.',
  initiate: {
    title: 'Initiate Remedial',
    from: 'none',
    actions: [{ id: 'initiate-remedial', label: 'Initiate Remedial', variant: 'secondary' }],
    emptyHint: 'Every trainee in this group is already on a track.',
    // A trainee on no track has no start date or remark to carry yet.
    showsTrackColumns: false,
  },
};

/**
 * Remedial page: who is on Remedial, and who may be put on it.
 *
 * The whole screen is the shared track page configured with Remedial's own
 * track, so the query, the dialog and the table stay identical to LAP's.
 */
@Component({
  selector: 'app-remedial',
  standalone: true,
  imports: [TrackManagementComponent],
  template: '<app-track-management [page]="page" />',
})
export class RemedialComponent {
  /** How the shared track page is configured for Remedial. */
  readonly page = REMEDIAL_PAGE;
}