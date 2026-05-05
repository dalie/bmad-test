import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AdminStats {
  library: {
    totalTitles: number;
    movieCount: number;
    tvShowCount: number;
  };
  transcode: {
    byTier: { tier1: number; tier2: number; tier3: number };
    byStatus: {
      ready: number;
      queued: number;
      processing: number;
      failed: number;
      completed: number;
    };
  };
  pipeline: {
    discovered: number;
    probed: number;
    matched: number;
    unmatched: number;
    totalErrors: number;
  };
}

@Injectable({ providedIn: 'root' })
export class AdminStatsService {
  private readonly http = inject(HttpClient);

  getStats(): Observable<AdminStats> {
    return this.http.get<AdminStats>('/api/admin/stats');
  }
}
