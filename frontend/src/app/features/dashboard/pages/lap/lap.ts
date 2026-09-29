import { Component } from '@angular/core';
import {
  TrackManagementComponent,
  TrackPage,
} from '../../../../shared/ui/track-management/track-management';

/**
 * The LAP track.
 *
 * The screen always lists the trainees on LAP, and the Initiate LAP button swaps
 * it for the trainees on Remedial — the pool a LAP placement is made from, which
 * is how the track has always been entered.
 */
const LAP_PAGE: TrackPage = {
  title: 'LAP',
  status: 'lap',
  actions: [{ id: 'close-lap', label: 'Close LAP', variant: 'secondary' }],
  emptyHint: 'No trainees are on LAP for this group.',
  initiate: {
    title: 'Initiate LAP',
    from: 'remedial',
    actions: [{ id: 'initiate-lap', label: 'Initiate LAP', variant: 'secondary' }],
    emptyHint:
      'No trainees are on Remedial for this group, so there is nobody to place on LAP.',
    // The pool carries the start date and remark of the Remedial track it is on.
    showsTrackColumns: true,
  },
};

/**
 * LAP page: who is on LAP, and who may be put on it.
 *
 * The whole screen is the shared track page configured with LAP's own track, so
 * the query, the dialog and the table stay identical to Remedial's.
 */
@Component({
  selector: 'app-lap',
  standalone: true,
  imports: [TrackManagementComponent],
  template: '<app-track-management [page]="page" />',
})
export class LapComponent {
  /** How the shared track page is configured for LAP. */
  readonly page = LAP_PAGE;
}