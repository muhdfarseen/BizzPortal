import {
  Component,
  computed,
  inject,
  signal,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FilterBarComponent, FilterState } from '../../../../shared/filter-bar/filter-bar';
import { DashboardService } from '../../../../core/services/dashboard.service';
import { defineChart, mountChart, type ChartHost } from '@tanstack/charts';
import { pie, polar, radialArc } from '@tanstack/charts/polar';
import { tooltip } from '@tanstack/charts/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { reiconLayers, reiconUsers, reiconBookOpen, reiconClipboardList } from '@ng-icons/reicon';

interface DonutDatum {
  category: 'Regular' | 'Remedial' | 'LAP';
  label: string;
  count: number;
  color: string;
}

export interface LocationSummary {
  locationName: string;
  totalBatch: number;
  totalTrainee: number;
  lapCount: number;
  remedialCount: number;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FilterBarComponent, NgIcon],
  providers: [
    provideIcons({
      reiconLayers,
      reiconUsers,
      reiconBookOpen,
      reiconClipboardList,
    }),
  ],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomeComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartContainer', { static: false })
  chartContainer?: ElementRef<HTMLElement>;

  private host: ChartHost<any, any, any> | null = null;
  readonly activeFilter = signal<FilterState | null>(null);

  private readonly dashboard = inject(DashboardService);

  /** The server's figures for the current selection, already narrowed to this user's scope. */
  private readonly summary = this.dashboard.summary;

  /** Whether the figures failed to load, so the page can say so rather than show zeroes. */
  readonly loadFailed = this.dashboard.failed;

  readonly metrics = computed(() => {
    const totals = this.summary().totals;

    return {
      totalBatch: totals.batches,
      totalTrainee: totals.trainees,
      remedialCount: totals.remedial,
      lapCount: totals.lap,
    };
  });

  readonly locationSummaries = computed<LocationSummary[]>(() =>
    this.summary().locations.map((location) => ({
      locationName: location.locationName,
      totalBatch: location.totalBatch,
      totalTrainee: location.totalTrainee,
      remedialCount: location.remedialCount,
      lapCount: location.lapCount,
    })),
  );

  readonly distribution = computed(() => {
    const totals = this.summary().totals;

    return {
      total: totals.trainees,
      regular: totals.regular,
      remedial: totals.remedial,
      lap: totals.lap,
    };
  });

  /**
   * Reports the selection the page is showing — including the bar's opening state,
   * which it emits from its own `ngOnInit`, so this is also the page's first load.
   *
   * There is deliberately no load in the constructor. That fired a second, unscoped
   * request — no batch and no quarter — and whichever of the two answered last
   * painted the cards: a slow unscoped response would land on top of the quarter the
   * bar was showing, which is how the page came to display the whole portal's figures
   * under a Q3 2026 filter. The period the page opens on is the bar's business (it
   * reads the calendar), so the page waits to be told rather than guessing.
   */
  onFilterChange(state: FilterState): void {
    this.activeFilter.set(state);
    this.reload();
  }

  /** Re-reads the figures for the active selection. */
  private reload(): void {
    const filter = this.activeFilter();

    this.dashboard
      .load({
        locationId: filter?.locationId ?? null,
        batchId: filter?.batchId ?? null,
        lgId: filter?.lgId ?? null,
        // The period is part of the request, not only of the dropdown: with no batch
        // chosen, "All" means the quarter's batches, and the figures have to agree
        // with the list the user just picked from.
        year: filter?.year ?? null,
        quarter: filter?.quarter ?? null,
      })
      .subscribe({
        next: () => this.updateChart(),
        error: () => this.updateChart(),
      });
  }

  private updateChart(): void {
    if (this.host) {
      this.host.destroy();
      this.host = null;
    }
    this.mountAnalyticsChart();
  }

  ngAfterViewInit(): void {
    this.mountAnalyticsChart();
  }

  ngOnDestroy(): void {
    if (this.host) {
      this.host.destroy();
      this.host = null;
    }
  }

  private mountAnalyticsChart(): void {
    if (!this.chartContainer?.nativeElement) {
      return;
    }

    const container = this.chartContainer.nativeElement;
    container.innerHTML = '';
    const definition = this.createChartDefinition();

    this.host = mountChart(container, {
      definition,
      height: 280,
      width: 280,
      initialWidth: 280,
      ariaLabel: 'Trainee distribution donut chart',
    });
  }

  private createChartDefinition() {
    const dist = this.distribution();
    const data: DonutDatum[] = [];

    if (dist.total > 0) {
      if (dist.regular > 0) {
        data.push({
          category: 'Regular',
          label: 'No LAP/Remedial',
          count: dist.regular,
          color: '#2469bc',
        });
      }
      if (dist.remedial > 0) {
        data.push({
          category: 'Remedial',
          label: 'Remedial',
          count: dist.remedial,
          color: '#f59e0b',
        });
      }
      if (dist.lap > 0) {
        data.push({
          category: 'LAP',
          label: 'LAP',
          count: dist.lap,
          color: '#ef4444',
        });
      }
    } else {
      data.push({
        category: 'Regular',
        label: 'No Trainees',
        count: 1,
        color: '#e2e8f0',
      });
    }

    const slices = pie(data, {
      value: 'count',
      gapAngle: data.length > 1 ? 0.03 : 0,
    });

    return defineChart({
      marks: [
        polar({
          inset: 6,
          radiusRatio: 0.92,
          marks: [
            radialArc(slices, {
              innerRadius: ({ radius }) => radius * 0.68,
              cornerRadius: 4,
              fill: (d: any) => d.color,
              key: 'category',
            }),
          ],
          scales: { angle: null, radius: null },
        }),
      ],
      scales: { x: null, y: null },
      tooltip: {
        use: tooltip,
        content: (points: readonly any[]) => {
          const p = points[0];
          const d = p?.datum;
          if (!d || d.count === undefined) {
            return { rows: [] };
          }
          const pct = d.fraction != null ? Math.round(d.fraction * 100) : 0;
          return {
            title: d.label || d.category,
            color: d.color,
            rows: [
              {
                label: 'Trainees',
                value: `${d.count}`,
                color: d.color,
              },
              {
                label: 'Share',
                value: `${pct}%`,
              },
            ],
          };
        },
      },
    });
  }
}
