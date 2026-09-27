import { Component } from '@angular/core';
import { TrackManagementComponent, TrackTab } from '../../../../shared/ui/track-management/track-management';

/**
 * The two views of the Remedial track.
 *
 * `initiate-remedial` lists trainees on no track at all — the pool a placement
 * is made from — and `current-remedial` lists the trainees on the track, which
 * is where a completed one is closed. The LAP page configures the same two
 * views against the LAP track.
 */
const REMEDIAL_TABS: readonly TrackTab[] = [
  {
    status: 'none',
    label: 'Initiate Remedial',
    actions: [{ id: 'initiate-remedial', label: 'Initiate Remedial', variant: 'secondary' }],
    emptyHint: 'Every trainee in this group is already on a track.',
    showsTrackColumns: false,
  },
  {
    status: 'remedial',
    label: 'Current Remedial',
    actions: [
      { id: 'initiate-lap', label: 'Initiate LAP', variant: 'secondary' },
      { id: 'close-remedial', label: 'Close Remedial', variant: 'secondary' },
    ],
    emptyHint: 'No trainees are on Remedial for this group.',
    showsTrackColumns: true,
  },
];

/**
 * Remedial page: who is on Remedial, and who may be put on it.
 *
 * The whole screen is the shared track page configured with Remedial's two
 * views, so the query, the dialog and the table stay identical to LAP's.
 */
@Component({
  selector: 'app-remedial',
  standalone: true,
  imports: [TrackManagementComponent],
  template: '<app-track-management title="Remedial" [tabs]="tabs" />',
})
export class RemedialComponent {
  /** The Remedial page's two sub-tabs. */
  readonly tabs = REMEDIAL_TABS;
}