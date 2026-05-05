import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

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

@Injectable()
export class AdminStatsService {
  private readonly logger = new Logger(AdminStatsService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  getStats(): AdminStats {
    try {
      return this.queryStats();
    } catch (error) {
      this.logger.error("Failed to query admin stats", error);
      return {
        library: { totalTitles: 0, movieCount: 0, tvShowCount: 0 },
        transcode: {
          byTier: { tier1: 0, tier2: 0, tier3: 0 },
          byStatus: {
            ready: 0,
            queued: 0,
            processing: 0,
            failed: 0,
            completed: 0,
          },
        },
        pipeline: {
          discovered: 0,
          probed: 0,
          matched: 0,
          unmatched: 0,
          totalErrors: 0,
        },
      };
    }
  }

  private queryStats(): AdminStats {
    const db = this.databaseService.getDatabase();

    const movieCount =
      (
        db
          .prepare(
            `SELECT COUNT(*) as count FROM metadata WHERE media_type = 'movie'`,
          )
          .get() as { count: number }
      )?.count ?? 0;

    const tvShowCount =
      (
        db
          .prepare(
            `SELECT COUNT(DISTINCT tmdb_id) as count FROM metadata WHERE media_type = 'tv'`,
          )
          .get() as { count: number }
      )?.count ?? 0;

    const totalTitles = movieCount + tvShowCount;

    // Transcode by tier from media_files
    const tierRows = db
      .prepare(
        `SELECT tier, COUNT(*) as count FROM media_files WHERE tier IS NOT NULL GROUP BY tier`,
      )
      .all() as { tier: number; count: number }[];

    const byTier = { tier1: 0, tier2: 0, tier3: 0 };
    for (const row of tierRows) {
      if (row.tier === 1) byTier.tier1 = row.count;
      else if (row.tier === 2) byTier.tier2 = row.count;
      else if (row.tier === 3) byTier.tier3 = row.count;
    }

    // Transcode by status from transcode_jobs
    const statusRows = db
      .prepare(
        `SELECT status, COUNT(*) as count FROM transcode_jobs GROUP BY status`,
      )
      .all() as { status: string; count: number }[];

    const byStatus = {
      ready: 0,
      queued: 0,
      processing: 0,
      failed: 0,
      completed: 0,
    };
    for (const row of statusRows) {
      if (row.status in byStatus) {
        byStatus[row.status as keyof typeof byStatus] = row.count;
      }
    }

    // Pipeline status counts from media_files
    const pipelineRows = db
      .prepare(
        `SELECT status, COUNT(*) as count FROM media_files GROUP BY status`,
      )
      .all() as { status: string; count: number }[];

    const pipeline = {
      discovered: 0,
      probed: 0,
      matched: 0,
      unmatched: 0,
      totalErrors: 0,
    };
    const matchedStatuses = new Set([
      "matched",
      "classified",
      "ready",
      "completed",
    ]);

    for (const row of pipelineRows) {
      if (row.status === "discovered") pipeline.discovered = row.count;
      else if (row.status === "probed") pipeline.probed = row.count;
      else if (row.status === "match_failed") pipeline.unmatched = row.count;
      else if (row.status === "probe_failed") pipeline.totalErrors += row.count;
      else if (matchedStatuses.has(row.status)) pipeline.matched += row.count;
    }

    // Total scan errors
    pipeline.totalErrors +=
      (
        db.prepare(`SELECT COUNT(*) as count FROM scan_errors`).get() as {
          count: number;
        }
      )?.count ?? 0;

    return {
      library: { totalTitles, movieCount, tvShowCount },
      transcode: { byTier, byStatus },
      pipeline,
    };
  }
}
