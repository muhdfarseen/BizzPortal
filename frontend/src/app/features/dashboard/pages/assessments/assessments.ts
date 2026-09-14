import { Component } from '@angular/core';
import { AssessmentResultsComponent } from '../../../../shared/ui/assessment-results/assessment-results';

@Component({
  selector: 'app-assessments',
  standalone: true,
  imports: [AssessmentResultsComponent],
  templateUrl: './assessments.html',
})
export class AssessmentsComponent {}
