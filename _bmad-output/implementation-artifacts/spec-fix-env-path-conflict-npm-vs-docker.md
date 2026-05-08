---
title: "Fix .env path conflict between npm run and Docker Compose"
type: "bugfix"
created: "2026-05-08"
status: "done"
baseline_commit: "fb81fc8"
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The `.env` file must serve two incompatible contexts — `npm run dev` needs local filesystem paths (`/home/user/project/_media/movies`) while Docker Compose needs container mount points (`/mnt/media/movies`). Currently `.env` has duplicate definitions for `MEDIA_MOVIES_PATH`, `MEDIA_TV_PATH`, and related vars; whichever value "wins" breaks the other context.

**Approach:** Add an `environment:` block in `docker-compose.yml` that hardcodes the fixed container-internal paths for `MEDIA_MOVIES_PATH`, `MEDIA_TV_PATH`, `MEDIA_OTHER_PATH`, and `CACHE_PATH`. These override the `env_file` values inside the container. The `.env` file then only needs local dev paths. Update `.env.example` to clarify the dual-context setup.

## Boundaries & Constraints

**Always:** Container-internal mount points stay `/mnt/media/*` and `/mnt/cache`. Existing Docker deployments with no `.env` must keep working. The `env_file` directive stays so non-path vars (TMDB_API_KEY, PORT, ADMIN_SUBNET) still pass through.

**Ask First:** Changing the default CACHE_PATH fallback in backend services away from `/mnt/cache`.

**Never:** Do not add `.env` to the Docker image. Do not create separate `.env.docker` / `.env.local` files — that adds operational complexity for self-hosters.

## I/O & Edge-Case Matrix

| Scenario                 | Input / State                                  | Expected Output / Behavior                                                           | Error Handling      |
| ------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------- |
| Local dev                | `.env` has `MEDIA_MOVIES_PATH=./_media/movies` | `npm run dev` scans local `_media/movies`                                            | N/A                 |
| Docker with defaults     | No `.env` file                                 | Container uses `/mnt/media/movies` from compose `environment`                        | App starts normally |
| Docker with `.env`       | `.env` has `MEDIA_MOVIES_PATH=./local/path`    | Compose `environment` overrides to `/mnt/media/movies`                               | N/A                 |
| Docker custom host paths | `.env` has `MOVIES_HOST_PATH=/nas/films`       | Host `/nas/films` mounted to `/mnt/media/movies`, container sees `/mnt/media/movies` | N/A                 |

</frozen-after-approval>

## Code Map

- `docker-compose.yml` -- add environment block overriding container-internal paths
- `.env` -- remove duplicate entries, keep only local dev values
- `.env.example` -- clarify which vars are local-only vs passed to Docker

## Tasks & Acceptance

**Execution:**

- [x] `docker-compose.yml` -- add `environment:` block setting `MEDIA_MOVIES_PATH=/mnt/media/movies`, `MEDIA_TV_PATH=/mnt/media/tv`, `MEDIA_OTHER_PATH=/mnt/media/other`, `CACHE_PATH=/mnt/cache` — these override env_file values inside the container
- [x] `.env` -- remove duplicate `MEDIA_MOVIES_PATH` and `MEDIA_TV_PATH` definitions (keep only the local dev values at the top), remove the Docker-oriented comment block for media source paths, keep `CACHE_PATH` once with the local value
- [x] `.env.example` -- restructure comments: group local-dev-only path vars separately from Docker host path vars, add a note that `MEDIA_*_PATH` and `CACHE_PATH` are overridden inside the container by docker-compose

**Acceptance Criteria:**

- Given `.env` has local paths for `MEDIA_MOVIES_PATH`, when `npm run dev` is run, then the backend reads the local paths and scans the local media directory
- Given `.env` has local paths for `MEDIA_MOVIES_PATH`, when `docker compose up` is run, then the container's `MEDIA_MOVIES_PATH` is `/mnt/media/movies` (overridden by compose environment block)
- Given no `.env` exists, when `docker compose up` is run, then the container starts with default paths and port 3000

## Verification

**Commands:**

- `docker compose config | grep MEDIA_MOVIES_PATH` -- expected: `/mnt/media/movies`
- `docker compose config | grep CACHE_PATH` -- expected: `/mnt/cache`
- `grep -c 'MEDIA_MOVIES_PATH' .env` -- expected: 1 (no duplicates)

## Suggested Review Order

- Environment block overrides local-dev paths with fixed container mount points
  [`docker-compose.yml:10`](../../docker-compose.yml#L10)

- Deduplicated env vars — single definition per var, local-dev values only
  [`.env:7`](../../.env#L7)

- Comments restructured to clarify local-dev-only vs Docker-only vars
  [`.env.example:7`](../../.env.example#L7)
