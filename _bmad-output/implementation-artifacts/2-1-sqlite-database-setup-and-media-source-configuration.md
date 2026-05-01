# Story 2.1: SQLite Database Setup and Media Source Configuration

Status: ready-for-dev

## Story

As an admin,
I want to configure media source folders and have the system store library data in a SQLite database,
so that the system knows where to find my files and can persist library state.

## Acceptance Criteria

1. **Given** the application starts for the first time, **When** the backend initializes, **Then** a SQLite database is created (via better-sqlite3) with schema applied via `CREATE TABLE IF NOT EXISTS`.
2. **Given** the database is created, **Then** initial migration creates tables for: `media_sources` (path, type, created_at), `media_files` (path, filename, source_id, status, probe_data, created_at, updated_at).
3. **Given** the application is configured, **Then** media source folders are configurable via environment variables (e.g., `MEDIA_MOVIES_PATH`, `MEDIA_TV_PATH`).
4. **Given** the application is running, **Then** a REST endpoint `GET /api/config/sources` returns the configured media source folders.
5. **Given** the database is created, **Then** the database file is stored in the managed cache directory (not in media source folders).

## Tasks / Subtasks

- [ ] Task 1: Install dependencies (AC: #1)
  - [ ] 1.1 Add `better-sqlite3` and `@types/better-sqlite3` to backend dependencies
- [ ] Task 2: Create database module and service (AC: #1, #2, #5)
  - [ ] 2.1 Create `apps/backend/src/database/database.module.ts` — NestJS module exporting the database service
  - [ ] 2.2 Create `apps/backend/src/database/database.service.ts` — singleton service that opens/manages the SQLite connection
  - [ ] 2.3 Database file location: use `CACHE_PATH` env var (defaults to `/mnt/cache`), store as `{CACHE_PATH}/cineplex.db`
  - [ ] 2.4 Enable WAL mode (`PRAGMA journal_mode=WAL`) on connection open for concurrency
  - [ ] 2.5 Enable foreign keys (`PRAGMA foreign_keys=ON`)
  - [ ] 2.6 Run `CREATE TABLE IF NOT EXISTS` statements on initialization (idempotent schema setup)
- [ ] Task 3: Define schema (AC: #2)
  - [ ] 3.1 `media_sources` table: id (INTEGER PRIMARY KEY), path (TEXT NOT NULL UNIQUE), type (TEXT NOT NULL CHECK IN ('movies', 'tv')), created_at (TEXT NOT NULL DEFAULT current_timestamp)
  - [ ] 3.2 `media_files` table: id (INTEGER PRIMARY KEY), path (TEXT NOT NULL UNIQUE), filename (TEXT NOT NULL), source_id (INTEGER NOT NULL REFERENCES media_sources(id)), status (TEXT NOT NULL DEFAULT 'discovered'), probe_data (TEXT), created_at (TEXT NOT NULL DEFAULT current_timestamp), updated_at (TEXT NOT NULL DEFAULT current_timestamp)
  - [ ] 3.3 Add index on `media_files(source_id)` and `media_files(status)`
- [ ] Task 5: Create configuration module (AC: #3, #4)
  - [ ] 5.1 Create `apps/backend/src/config/config.module.ts` — NestJS module for app configuration
  - [ ] 5.2 Create `apps/backend/src/config/config.service.ts` — reads environment variables, provides typed access to media paths
  - [ ] 5.3 Create `apps/backend/src/config/config.controller.ts` — exposes `GET /config/sources` endpoint (note: /api prefix applied globally)
  - [ ] 5.4 Endpoint returns JSON array of configured sources: `[{ path: string, type: 'movies' | 'tv' }]`
- [ ] Task 6: Seed media sources on startup (AC: #3)
  - [ ] 6.1 On startup, read `MEDIA_MOVIES_PATH` and `MEDIA_TV_PATH` from environment
  - [ ] 6.2 Insert/update media_sources table with configured paths (upsert on path)
  - [ ] 6.3 Handle missing env vars gracefully — log warning, don't crash
- [ ] Task 7: Update .env.example and verify (AC: #3, #5)
  - [ ] 7.1 Ensure `.env.example` includes `CACHE_PATH`, `MEDIA_MOVIES_PATH`, `MEDIA_TV_PATH` (already present from 1.2)
  - [ ] 7.2 Write unit tests for database service initialization
  - [ ] 7.3 Write unit tests for config controller response shape
  - [ ] 7.4 Verify database is created in CACHE_PATH, not in media source folders

## Dev Notes

### Critical Architecture Constraints

- **better-sqlite3** — synchronous API, no Promises needed for queries. This is intentional — SQLite is single-writer and the synchronous API is faster and simpler in Node.js.
- **No ORM** — raw SQL only. Do NOT add TypeORM, Prisma, Sequelize, Drizzle, or any other ORM.
- **No migration framework** — use `CREATE TABLE IF NOT EXISTS` directly in the database service on startup. Schema is simple enough that a migration tool adds unnecessary complexity.
- **NestJS v11.x** — use standard module/service/controller patterns. The app uses `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`.
- **Global API prefix** — `/api` is set in `main.ts` via `app.setGlobalPrefix('api')`. Controllers should NOT include `/api` in their route decorators.
- **No Swagger/OpenAPI** decorators — excluded by architecture decision.
- **No class-validator** yet — keep it simple for this story. Validation layer will be added when user input endpoints arrive (Story 2.5).

### better-sqlite3 Key Usage Patterns

```typescript
import Database from "better-sqlite3";

// Open database (creates file if not exists)
const db = new Database("/mnt/cache/cineplex.db");

// MUST enable WAL mode for concurrent reads during writes
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Prepared statements (preferred for all queries)
const stmt = db.prepare("SELECT * FROM media_sources WHERE type = ?");
const sources = stmt.all("movies");

// Transactions for multiple writes
const insertMany = db.transaction((items) => {
  for (const item of items) {
    insertStmt.run(item);
  }
});

// Graceful shutdown
process.on("exit", () => db.close());
```

**CRITICAL**: better-sqlite3 is fully synchronous. Do NOT wrap calls in Promises or use async/await for database operations. NestJS services can still be used normally — the synchronous nature is a feature, not a bug.

### Schema Initialization Pattern

```typescript
// In DatabaseService.onModuleInit():
this.db.exec(`
  CREATE TABLE IF NOT EXISTS media_sources (...);
  CREATE TABLE IF NOT EXISTS media_files (...);
  CREATE INDEX IF NOT EXISTS idx_media_files_source_id ON media_files(source_id);
  CREATE INDEX IF NOT EXISTS idx_media_files_status ON media_files(status);
`);
```

This is idempotent — safe to run on every startup. Future stories that add tables simply add more `CREATE TABLE IF NOT EXISTS` statements.

### NestJS Module Pattern for Database

```typescript
// database.module.ts
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}

// database.service.ts
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private db: Database.Database;

  onModuleInit() {
    // Initialize database connection and run migrations
  }

  onModuleDestroy() {
    this.db.close();
  }

  getDatabase(): Database.Database {
    return this.db;
  }
}
```

### Environment Variables

Already defined in `.env.example` from Story 1.2:

- `MEDIA_MOVIES_PATH=/mnt/media/movies`
- `MEDIA_TV_PATH=/mnt/media/tv`
- `CACHE_PATH=/mnt/cache`

The database file will live at `${CACHE_PATH}/cineplex.db`. This keeps it in the managed Docker volume (`./data:/mnt/cache`), separate from the read-only media volumes.

### SQL Schema

```sql
CREATE TABLE IF NOT EXISTS media_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('movies', 'tv')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  source_id INTEGER NOT NULL REFERENCES media_sources(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'discovered',
  probe_data TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_media_files_source_id ON media_files(source_id);
CREATE INDEX IF NOT EXISTS idx_media_files_status ON media_files(status);
```

**Note on timestamps**: Use `TEXT` with ISO 8601 format (`datetime('now')`) rather than INTEGER unix timestamps. This is more readable in debugging and SQLite's date functions work natively with ISO strings.

**Note on status values**: The `status` column will hold values from this progression: `discovered` → `probed` → `matched` → `classified` → `ready`. Also `probe_failed`, `match_failed` for error states. Do NOT add a CHECK constraint on status — the valid values will expand in future stories.

### Project Structure After This Story

```
apps/backend/src/
├── app.module.ts              (UPDATE — import DatabaseModule, ConfigModule)
├── main.ts                    (no change)
├── health/
│   ├── health.controller.ts   (no change)
│   └── health.controller.spec.ts (no change)
├── database/
│   ├── database.module.ts     (NEW)
│   └── database.service.ts    (NEW)
└── config/
    ├── config.module.ts       (NEW)
    ├── config.service.ts      (NEW)
    └── config.controller.ts   (NEW)
```

### What This Story Changes

- `apps/backend/src/app.module.ts` — add imports for DatabaseModule and ConfigModule
- `apps/backend/package.json` — add better-sqlite3, @types/better-sqlite3 dependencies
- Creation of database module with service (schema applied directly on startup)
- Creation of config module with service and controller

### What Must Be Preserved

- Health endpoint at `GET /api/health` must continue working
- Angular SPA serving via ServeStaticModule must remain functional
- Docker build must still succeed (better-sqlite3 requires native compilation — build tools already in Dockerfile build stage)
- All existing tests must pass
- The `.env.example` already has the needed variables

### Previous Story Intelligence

**From Story 1.1:**

- Root `package.json` has npm workspace scripts — new deps must be added to `apps/backend/package.json`, NOT root
- Backend builds with `nest build` which outputs to `apps/backend/dist/`
- Tests run with jest via `npm run test --workspace=apps/backend`

**From Story 1.2:**

- Dockerfile build stage already has `python3 make g++` for native module compilation (needed by better-sqlite3)
- Production image uses `node:22-bookworm-slim` — compatible with better-sqlite3 native bindings
- `./data:/mnt/cache` volume is already mounted in docker-compose.yml
- Container runs as `node` user — ensure CACHE_PATH directory is writable by that user

**Review findings from previous stories:**

- Always add trailing newlines to files
- Watch for ServeStaticModule exclude pattern — new `/api/config/*` routes will work because of the `exclude: ['/api/(.*)']` pattern in ServeStaticModule config (API routes are excluded from static serving)

### Docker Compatibility Notes

- `better-sqlite3` compiles native code. The Dockerfile build stage already includes `python3 make g++` for this purpose.
- The compiled `.node` binary from the build stage is copied to production via `COPY --from=build /app/node_modules ./node_modules` — this works because both stages use the same base OS (bookworm-slim).
- No additional Dockerfile changes needed for this story.

### Testing Requirements

- Unit test `DatabaseService`: verify database file is created at expected path, WAL mode is enabled, tables exist after migration
- Unit test `ConfigController`: verify `GET /config/sources` returns expected shape
- Use in-memory database (`:memory:`) for unit tests to avoid filesystem side effects
- Jest is already configured in the backend package

### Anti-Patterns to Avoid

| Anti-Pattern                           | Why                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| TypeORM / Prisma / Sequelize / Drizzle | Architecture mandates raw SQL with better-sqlite3                                          |
| Async database calls with Promises     | better-sqlite3 is synchronous by design                                                    |
| Storing DB in media source directory   | Must use CACHE_PATH — media is read-only                                                   |
| umzug or any migration framework       | Overkill — CREATE TABLE IF NOT EXISTS is sufficient                                        |
| Adding class-validator decorators      | Not needed this story — no user input endpoints                                            |
| CHECK constraint on status column      | Status values will expand in future stories                                                |
| Using `@nestjs/config` module          | Keep it simple — direct `process.env` access in a service is fine for this project's scale |

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture Decision]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1]
- [Source: _bmad-output/planning-artifacts/prd.md#Additional Requirements]
- [Source: _bmad-output/implementation-artifacts/1-2-docker-deployment-with-media-volume-mounts.md#Technical Requirements]
- [Source: better-sqlite3 API docs — github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
