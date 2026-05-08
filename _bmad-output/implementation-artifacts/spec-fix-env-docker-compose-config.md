---
title: "Fix .env as single source of truth for Docker configuration"
type: "bugfix"
created: "2026-05-08"
status: "done"
baseline_commit: "9220517"
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Changing `.env` variables has no effect on several runtime behaviors because docker-compose.yml hardcodes volume mount paths and port mappings, `main.ts` hardcodes the listen port to 3000, and the NestJS `envFilePath` points to a file that doesn't exist inside the Docker container (`.env` is in `.dockerignore`). Users must edit docker-compose.yml directly to change configuration across machines, defeating the purpose of `.env`.

**Approach:** Make docker-compose.yml use `${VAR:-default}` substitution for all user-configurable values (host media paths, port), remove the redundant `environment` block, fix `main.ts` to read `PORT` from the environment, remove the broken `envFilePath` from the NestJS ConfigModule (let it use `process.env` only in production), and update `.env.example` with all supported variables.

## Boundaries & Constraints

**Always:** Existing deployments with no `.env` file must keep working (compose defaults match current hardcoded values). Container-internal paths (`/mnt/media/*`, `/mnt/cache`) stay fixed — only host-side paths become configurable.

**Ask First:** Changing the default port away from 3000.

**Never:** Do not add `.env` to the Docker image. Do not change container-internal media mount points.

## I/O & Edge-Case Matrix

| Scenario          | Input / State                            | Expected Output / Behavior                                      | Error Handling      |
| ----------------- | ---------------------------------------- | --------------------------------------------------------------- | ------------------- |
| No .env file      | Fresh clone, no .env                     | Compose uses defaults (`~/media/movies`, port 3000)             | App starts normally |
| Custom host paths | `.env` has `MOVIES_HOST_PATH=/nas/films` | Compose mounts `/nas/films:/mnt/media/movies:ro`                | N/A                 |
| Custom port       | `.env` has `PORT=8080`                   | Compose maps `8080:8080`, app listens on 8080                   | N/A                 |
| ADMIN_SUBNET set  | `.env` has `ADMIN_SUBNET=10.0.0.0/24`    | Passed to container via env_file, no `environment` block needed | N/A                 |

</frozen-after-approval>

## Code Map

- `docker-compose.yml` -- hardcoded ports, volume paths, redundant environment block
- `.env.example` -- missing ADMIN_SUBNET, TRUST_PROXY, host path vars
- `apps/backend/src/main.ts` -- hardcodes `app.listen(3000, "::")`
- `apps/backend/src/app.module.ts` -- `envFilePath` resolves to nonexistent `/app/.env` in container

## Tasks & Acceptance

**Execution:**

- [x] `docker-compose.yml` -- replace hardcoded port with `${PORT:-3000}:${PORT:-3000}`, replace hardcoded volume host paths with `${MOVIES_HOST_PATH:-~/media/movies}`, `${TV_HOST_PATH:-~/media/tv}`, `${OTHER_HOST_PATH:-~/media/other}`, remove the `environment` block (env_file already passes all vars)
- [x] `.env.example` -- add `MOVIES_HOST_PATH`, `TV_HOST_PATH`, `OTHER_HOST_PATH`, `ADMIN_SUBNET`, `TRUST_PROXY` with comments
- [x] `apps/backend/src/main.ts` -- read PORT from env with NaN validation and fallback to 3000
- [x] `apps/backend/src/app.module.ts` -- keep `envFilePath` (harmless no-op in Docker, supports local dev)

**Acceptance Criteria:**

- Given a fresh clone with no `.env`, when `docker compose up` is run, then the app starts with default paths and port 3000
- Given `.env` sets `PORT=8080`, when `docker compose up` is run, then compose maps port 8080 and the app listens on 8080
- Given `.env` sets `MOVIES_HOST_PATH=/custom/path`, when `docker compose up` is run, then `/custom/path` is mounted to `/mnt/media/movies`
- Given `.env` sets `ADMIN_SUBNET=10.0.0.0/24`, when the app starts, then `process.env.ADMIN_SUBNET` is `10.0.0.0/24` inside the container

## Verification

**Commands:**

- `docker compose config` -- expected: interpolated values from `.env` appear in resolved config
- `grep -n "envFilePath" apps/backend/src/app.module.ts` -- expected: present (kept for local dev)
- `grep -n "3000" apps/backend/src/main.ts` -- expected: only as fallback default, not hardcoded

## Suggested Review Order

- Compose is the root cause — port, paths, and env block all fixed here
  [`docker-compose.yml:6`](../../docker-compose.yml#L6)

- PORT read from env with NaN validation and 3000 fallback
  [`main.ts:27`](../../apps/backend/src/main.ts#L27)

- All supported env vars now documented for new-machine setup
  [`.env.example:7`](../../.env.example#L7)
