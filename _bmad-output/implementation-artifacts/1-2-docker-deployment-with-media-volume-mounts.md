# Story 1.2: Docker Deployment with Media Volume Mounts

Status: done

## Story

As an admin,
I want to deploy the application as a single Docker container with configurable media source folders,
So that I can run Cineplex Rigaud on any machine with Docker and point it at my media library.

## Acceptance Criteria

1. **Given** a Dockerfile and docker-compose.yml exist in the repository root, **When** the admin runs `docker compose up`, **Then** a single container builds and starts, serving both the Angular SPA and NestJS API.
2. **Given** the application is running in Docker, **Then** media source folders are configurable via Docker volume mounts (e.g., `/mnt/media/movies`, `/mnt/media/tv`).
3. **Given** the application is configurable, **Then** application configuration (TMDB API key, port, etc.) is loaded from `.env` files.
4. **Given** the container environment, **Then** FFmpeg is bundled in the Docker image and available on the container's PATH.
5. **Given** the container runs, **Then** it runs with read-only access to mounted media source volumes in the docker-compose (NFR9).
6. **Given** the container runs, **Then** a managed cache/output directory is mounted for generated artifacts (sidecars, thumbnails, transcodes).

## Developer Context

This story establishes the deployment foundation. While Story 1.1 created the development monorepo structure, 1.2 ensures it can be built and run in a production-like Docker container. The NestJS backend must serve the Angular frontend, and the environment must bundle FFmpeg for upcoming video processing stories.

### Current State
- The monorepo has `apps/backend` (NestJS) and `apps/frontend` (Angular).
- Running `npm run build` compiles both.
- Running `npm run start` starts the backend on port 3000, which serves the frontend static files.
- There are no Dockerfiles or Compose files yet.

## Tasks / Subtasks

- [x] Task 1: Create multi-stage `Dockerfile` (AC: #1, #4)
- [x] Task 2: Create `docker-compose.yml` (AC: #1, #2, #5, #6)
- [x] Task 3: Setup environment configuration (AC: #3)
- [x] Task 4: Verify Acceptance Criteria

### Review Findings

- [x] [Review][Patch] Missing .dockerignore [Dockerfile:1]
- [x] [Review][Patch] Missing node_modules copy from build stage / Build tools missing [Dockerfile:20-39]
- [x] [Review][Patch] Container runs as root user [Dockerfile:20-39]
- [x] [Review][Patch] Node spawned as PID 1 directly [Dockerfile:39]
- [x] [Review][Patch] Brittle Compose env_file declaration [docker-compose.yml:9-10]
- [x] [Review][Patch] Mount source directories missing on host [docker-compose.yml:12-14]
- [x] [Review][Patch] Deprecated root-level Compose Syntax [docker-compose.yml:1]
- [x] [Review][Patch] POSIX Formatting Violations (missing trailing newlines) [.env.example, Dockerfile, docker-compose.yml]
- [x] [Review][Patch] Sloppy whitespace (trailing space) [Dockerfile:24]
- [x] [Review][Defer] No Container Resource Limits [docker-compose.yml] — deferred, pre-existing
- [x] [Review][Defer] No Container Healthchecks [docker-compose.yml] — deferred, pre-existing
- [x] [Review][Defer] Missing Log Rotation [docker-compose.yml] — deferred, pre-existing

### What This Story Changes
- Creation of a root `Dockerfile` using a multi-stage build (build stage + production stage).
- Creation of a root `docker-compose.yml` to orchestrate the container and mount volumes.
- Creation of `.env.example` mapping out required environment variables.
- Addition of `ffmpeg` package to the Docker production image.

### What Must Be Preserved
- The ability to build and run the app locally without Docker (e.g., `npm run dev`).
- The `package.json` workspace structure.
- NestJS configuration that serves the frontend from the built `dist` folder.

## Technical Requirements

1. **Multi-stage Dockerfile**: Create a `Dockerfile` that:
   - Uses a Node.js base image (e.g., `node:22-alpine` or `node:22-slim`).
   - Copies `package.json`, `package-lock.json`, and installs dependencies.
   - Copies source code and runs the build script.
   - In the production stage, only copies the built `dist/` folders and production `node_modules` (or prune).
   - Installs `ffmpeg` via the package manager (e.g., `apk add --no-cache ffmpeg` or `apt-get install -y ffmpeg`).
   - Sets the default command to start the backend (`npm run start:prod` or `node dist/main`).

2. **Docker Compose**: Create a `docker-compose.yml`:
   - Defines a single service `cineplex-rigaud` built from `.`.
   - Maps host port (e.g., 3000) to container port.
   - Loads environment variables from `.env`.
   - Defines volume mounts for media:
     - `./media/movies:/mnt/media/movies:ro`
     - `./media/tv:/mnt/media/tv:ro`
   - Defines a volume mount for data/cache:
     - `./data:/mnt/cache`

3. **Environment Setup**: 
   - Define a `.env.example` file that shows `TMDB_API_KEY`, `MEDIA_MOVIES_PATH=/mnt/media/movies`, `MEDIA_TV_PATH=/mnt/media/tv`, `CACHE_PATH=/mnt/cache`.

## Architecture Compliance

- **Containerization**: Single container housing Node.js web server. Angular runs on the client-side after being served by NestJS.
- **Tools**: Keep it minimal. Do not add pm2 or nodemon within Docker unless absolutely necessary; standard `node` is preferred.
- **Filesystem Constraints**: Source volumes (`/mnt/media/*`) must be mapped read-only `ro` (NFR9).

## Library and Framework Requirements

- Base Image: `node:22-alpine` (or current LTS). If Alpine causes issues with better-sqlite3 later, `node:22-bookworm-slim` is recommended. Since `better-sqlite3` compiles native code, `bookworm-slim` is safer for compatibility. Ensure `ffmpeg` is installed (e.g., `apt-get update && apt-get install -y ffmpeg`).
- Angular and NestJS must be built in the builder stage.

## File Structure Requirements

Ensure output paths match exactly what is mapped in `apps/backend/src/app.module.ts`:
- Backend outputs to `apps/backend/dist` / `dist/apps/backend` (check actual CLI output). Note: NestJS `nest build` outputs to `dist/apps/backend` in a monorepo setup but since we haven't used nest CLI monorepo mode, it outputs to `apps/backend/dist` based on 1.1's setup. Verify paths during Dockerfile creation.
- Frontend outputs to `apps/frontend/dist/frontend/browser`.

## Testing Requirements

- Build the Docker image locally: `docker build -t bmad-cineplex .`
- Ensure the image builds successfully.
- Ensure `docker run --rm bmad-cineplex ffmpeg -version` responds.
- Ensure `docker compose up` starts the server and port 3000 serves the Angular placeholder.

## Previous Story Intelligence

From Story 1.1:
- `npm run build` from root builds both frontend and backend.
- `npm run start` from root starts the backend.
- The backend serves static assets natively using `@nestjs/serve-static` from `apps/frontend/dist/frontend/browser`.
- Ensure the Docker production container copies BOTH `apps/backend/dist` and `apps/frontend/dist` (and `node_modules`).

## Completion Status

Ultimate context engine analysis completed - comprehensive developer guide created.
