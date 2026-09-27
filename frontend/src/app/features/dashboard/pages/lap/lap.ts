import { Component } from '@angular/core';
import { TrackManagementComponent, TrackTab } from '../../../../shared/ui/track-management/track-management';

/**
 * The two views of the LAP track.
 *
 * `initiate-lap` lists the trainees on Remedial — the pool a LAP placement is
 * made from, which is how the track has always been entered — and `current-lap`
 * lists the trainees on LAP, which is where a completed one is closed.
 */
const LAP_TABS: readonly TrackTab[] = [
  {
    status: 'remedial',
    label: 'Initiate LAP',
    actions: [{ id: 'initiate-lap', label: 'Initiate LAP', variant: 'secondary' }],
    emptyHint:
      'No trainees are on Remedial for this group, so there is nobody to place on LAP.',
    // The pool carries the start date and remark of the Remedial track it is on.
    showsTrackColumns: true,
  },
  {
    status: 'lap',
    label: 'Current LAP',
    actions: [{ id: 'close-lap', label: 'Close LAP', variant: 'secondary' }],
    emptyHint: 'No trainees are on LAP for this group.',
    showsTrackColumns: true,
  },
];

/**
 * LAP page: who is on LAP, and who may be put on it.
 *
 * The whole screen is the shared track page configured with LAP's two views, so
 * the query, the dialog and the table stay identical to Remedial's.
 */
@Component({
  selector: 'app-lap',
  standalone: true,
  imports: [TrackManagementComponent],
  template: '<app-track-management title="LAP" [tabs]="tabs" />',
})
export class LapComponent {
  /** The LAP page's two sub-tabs. */
  readonly tabs = LAP_TABS;
}