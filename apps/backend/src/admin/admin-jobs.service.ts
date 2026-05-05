import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

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
  stage: "scan" | "probe" | "match" | "transcode" | "subtitle";
  errorMessage: string;
  timestamp: string;
  retryable: boolean;
}

export interface JobDetail {
  id: string;
  filename: string;
  filePath: string;
  stage: "scan" | "probe" | "match" | "transcode" | "subtitle";
  tier: number | null;
  status: string;
  errorMessage: string;
  errorDetails: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class AdminJobsService {
  private readonly logger = new Logger(AdminJobsService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  getPipelineStatus(): PipelineMonitorStatus {
    try {
      const db = this.databaseService.getDatabase();

      const transcodeRows = db
        .prepare(
          `SELECT status, COUNT(*) as count FROM transcode_jobs GROUP BY status`,
        )
        .all() as { status: string; count: number }[];

      const transcode = { queued: 0, processing: 0, completed: 0, failed: 0 };
      for (const row of transcodeRows) {
        if (row.status in transcode) {
          transcode[row.status as keyof typeof transcode] = row.count;
        }
      }

      const scanErrorRows = db
        .prepare(
          `SELECT error_type, COUNT(*) as count FROM scan_errors GROUP BY error_type`,
        )
        .all() as { error_type: string; count: number }[];

      let scanErrors = 0;
      let probeFailures = 0;
      for (const row of scanErrorRows) {
        scanErrors += row.count;
        if (row.error_type === "PROBE_FAILED") {
          probeFailures = row.count;
        }
      }

      const matchFailures =
        (
          db
            .prepare(
              `SELECT COUNT(*) as count FROM media_files WHERE status = 'match_failed'`,
            )
            .get() as { count: number }
        )?.count ?? 0;

      return { transcode, scanErrors, probeFailures, matchFailures };
    } catch (error) {
      this.logger.error("Failed to query pipeline status", error);
      return {
        transcode: { queued: 0, processing: 0, completed: 0, failed: 0 },
        scanErrors: 0,
        probeFailures: 0,
        matchFailures: 0,
      };
    }
  }

  getFailedJobs(): FailedJobSummary[] {
    try {
      const db = this.databaseService.getDatabase();

      const transcodeFailures = db
        .prepare(
          `SELECT tj.id, mf.filename, 'transcode' as stage, tj.error_details as errorMessage,
                  tj.updated_at as timestamp, 1 as retryable
           FROM transcode_jobs tj
           JOIN media_files mf ON mf.id = tj.file_id
           WHERE tj.status = 'failed'
           ORDER BY tj.updated_at DESC`,
        )
        .all() as any[];

      const scanFailures = db
        .prepare(
          `SELECT se.id, se.file_path as filename,
                  CASE se.error_type
                    WHEN 'SCAN_ERROR' THEN 'scan'
                    WHEN 'PROBE_FAILED' THEN 'probe'
                    WHEN 'MATCH_FAILED' THEN 'match'
                    ELSE 'scan'
                  END as stage,
                  se.error_message as errorMessage, se.created_at as timestamp, 0 as retryable
           FROM scan_errors se
           ORDER BY se.created_at DESC`,
        )
        .all() as any[];

      const results: FailedJobSummary[] = [
        ...transcodeFailures.map((r) => ({
          id: String(r.id),
          filename: r.filename,
          stage: r.stage as FailedJobSummary["stage"],
          errorMessage: r.errorMessage || "",
          timestamp: r.timestamp,
          retryable: true,
        })),
        ...scanFailures.map((r) => ({
          id: `se-${r.id}`,
          filename: r.filename,
          stage: r.stage as FailedJobSummary["stage"],
          errorMessage: r.errorMessage || "",
          timestamp: r.timestamp,
          retryable: false,
        })),
      ];

      return results;
    } catch (error) {
      this.logger.error("Failed to query failed jobs", error);
      return [];
    }
  }

  getJobDetails(id: string): JobDetail {
    try {
      const db = this.databaseService.getDatabase();

      if (id.startsWith("se-")) {
        const numericId = parseInt(id.slice(3), 10);
        if (isNaN(numericId)) {
          throw new NotFoundException(`Job ${id} not found`);
        }

        const row = db
          .prepare(
            `SELECT se.id, se.file_path, se.error_type, se.error_message, se.created_at
             FROM scan_errors se WHERE se.id = ?`,
          )
          .get(numericId) as any;

        if (!row) {
          throw new NotFoundException(`Job ${id} not found`);
        }

        const stageMap: Record<string, JobDetail["stage"]> = {
          SCAN_ERROR: "scan",
          PROBE_FAILED: "probe",
          MATCH_FAILED: "match",
        };

        return {
          id,
          filename: row.file_path.split("/").pop() || row.file_path,
          filePath: row.file_path,
          stage: stageMap[row.error_type] || "scan",
          tier: null,
          status: "failed",
          errorMessage: row.error_message,
          errorDetails: null,
          createdAt: row.created_at,
          updatedAt: row.created_at,
        };
      }

      const numericId = parseInt(id, 10);
      if (isNaN(numericId)) {
        throw new NotFoundException(`Job ${id} not found`);
      }

      const row = db
        .prepare(
          `SELECT tj.id, mf.filename, mf.path as file_path, tj.tier, tj.status,
                  tj.error_details, tj.created_at, tj.updated_at
           FROM transcode_jobs tj
           JOIN media_files mf ON mf.id = tj.file_id
           WHERE tj.id = ?`,
        )
        .get(numericId) as any;

      if (!row) {
        throw new NotFoundException(`Job ${id} not found`);
      }

      return {
        id: String(row.id),
        filename: row.filename,
        filePath: row.file_path,
        stage: "transcode",
        tier: row.tier,
        status: row.status,
        errorMessage: row.error_details || "",
        errorDetails: row.error_details,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(`Failed to get job details for ${id}`, error);
      throw new NotFoundException(`Job ${id} not found`);
    }
  }

  retryJob(id: number): { success: boolean } {
    try {
      const db = this.databaseService.getDatabase();

      const job = db
        .prepare(`SELECT id, status FROM transcode_jobs WHERE id = ?`)
        .get(id) as any;

      if (!job) {
        throw new NotFoundException(`Transcode job ${id} not found`);
      }

      if (job.status !== "failed") {
        throw new BadRequestException(
          `Job ${id} is not in failed status (current: ${job.status})`,
        );
      }

      db.prepare(
        `UPDATE transcode_jobs SET status = 'queued', error_details = NULL, updated_at = datetime('now') WHERE id = ?`,
      ).run(id);

      return { success: true };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(`Failed to retry job ${id}`, error);
      throw new BadRequestException(`Failed to retry job ${id}`);
    }
  }
}
