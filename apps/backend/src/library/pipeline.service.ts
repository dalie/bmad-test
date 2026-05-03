import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface PipelineStatus {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface PipelineJob {
  id: number;
  file_id: number;
  filename: string;
  tier: number;
  status: string;
  output_path: string | null;
  error_details: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class PipelineService implements OnModuleInit {
  private readonly logger = new Logger(PipelineService.name);

  constructor(private readonly database: DatabaseService) {}

  onModuleInit(): void {
    const db = this.database.getDatabase();
    const result = db
      .prepare(
        "UPDATE transcode_jobs SET status = 'queued', updated_at = datetime('now') WHERE status = 'processing'",
      )
      .run();
    if (result.changes > 0) {
      this.logger.warn(`Reset ${result.changes} stuck 'processing' job(s) to 'queued' on startup`);
    }
  }

  getStatus(): PipelineStatus {
    const db = this.database.getDatabase();

    const rows = db
      .prepare("SELECT status, COUNT(*) as count FROM transcode_jobs GROUP BY status")
      .all() as { status: string; count: number }[];

    const statusMap: Record<string, number> = {};
    for (const row of rows) {
      statusMap[row.status] = row.count;
    }

    return {
      queued: statusMap["queued"] ?? 0,
      processing: statusMap["processing"] ?? 0,
      completed: statusMap["completed"] ?? 0,
      failed: statusMap["failed"] ?? 0,
    };
  }

  getJobs(): PipelineJob[] {
    const db = this.database.getDatabase();

    return db
      .prepare(
        `SELECT tj.id, tj.file_id, mf.filename, tj.tier, tj.status,
                tj.output_path, tj.error_details, tj.created_at, tj.updated_at
         FROM transcode_jobs tj
         JOIN media_files mf ON mf.id = tj.file_id
         ORDER BY tj.created_at ASC, tj.id ASC
         LIMIT 500`,
      )
      .all() as PipelineJob[];
  }
}
