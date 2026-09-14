import { Component } from '@angular/core';

@Component({
  selector: 'app-reports',
  standalone: true,
  template: `
    <div class="page-shell">
      <div class="page-header">
        <h2 class="page-title">Reports</h2>
      </div>
      <div class="empty-state">
        <p>Reporting and analytics will appear here.</p>
      </div>
    </div>
  `,
  styles: `
    .page-shell {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .page-title {
      font-family: var(--font-heading);
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--color-foreground);
      margin: 0;
      line-height: 1.2;
    }
    .empty-state {
      padding: 3rem 2rem;
      text-align: center;
      color: var(--color-muted-foreground);
      font-size: 0.875rem;
      background: #ffffff;
      border-radius: var(--radius-xl);
      border: 1px dashed var(--color-border);
    }
  `,
})
export class ReportsComponent {}
