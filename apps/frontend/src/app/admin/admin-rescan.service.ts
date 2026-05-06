import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ScanStatus {
  id: string;
  status: 'in_progress' | 'completed' | 'failed';
  startedAt: string;
  completedAt: string | null;
  discovered: number;
  processed: number;
  failed: number;
  errors: string[];
}

@Injectable({ providedIn: 'root' })
export class AdminRescanService {
  private readonly http = inject(HttpClient);

  triggerRescan(): Observable<{ scanId: string }> {
    return this.http.post<{ scanId: string }>('/api/admin/rescan', {});
  }

  getScanStatus(scanId: string): Observable<ScanStatus> {
    return this.http.get<ScanStatus>(`/api/admin/rescan/${scanId}`);
  }
}
