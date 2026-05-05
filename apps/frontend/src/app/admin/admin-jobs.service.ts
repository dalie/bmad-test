import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PipelineMonitorStatus {
  transcode: {
    queued: number;
    processing: number;
    completed: number;
    failed: number;
  };
  scanErrors: number;
  probeFailures: number;
  matchFailures: number;
}

export interface FailedJobSummary {
  id: string;
  filename: string;
  stage: 'scan' | 'probe' | 'match' | 'transcode' | 'subtitle';
  errorMessage: string;
  timestamp: string;
  retryable: boolean;
}

export interface JobDetail {
  id: string;
  filename: string;
  filePath: string;
  stage: 'scan' | 'probe' | 'match' | 'transcode' | 'subtitle';
  tier: number | null;
  status: string;
  errorMessage: string;
  errorDetails: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class AdminJobsService {
  private readonly http = inject(HttpClient);

  getPipelineStatus(): Observable<PipelineMonitorStatus> {
    return this.http.get<PipelineMonitorStatus>('/api/admin/pipeline');
  }

  getFailedJobs(): Observable<FailedJobSummary[]> {
    return this.http.get<FailedJobSummary[]>('/api/admin/jobs');
  }

  getJobDetails(id: string): Observable<JobDetail> {
    return this.http.get<JobDetail>(`/api/admin/jobs/${id}`);
  }

  retryJob(id: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`/api/admin/jobs/${id}/retry`, {});
  }
}
