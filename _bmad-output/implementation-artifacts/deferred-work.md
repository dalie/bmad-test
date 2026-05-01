## Deferred from: code review (2026-05-01) of 1-1-scaffold-monorepo-with-nestjs-backend-and-angular-frontend.md

* Incomplete backend health endpoint HTTP test coverage: Backend test coverage only verifies the health endpoint via direct controller method call, not over HTTP.
* No end-to-end test verification of monorepo service serving: No E2E/integration test verifying Nest actually serves the Angular app at `/`.
* Empty Angular route table: Routing is enabled in Angular, but the route table is empty without a fallback or home route.
* Placeholder uses "Cineplex Rigaud" instead of correct title: The user-facing placeholder says "Cineplex Rigaud" while document title says "Frontend".
* Frontend package contains app-local .vscode noise: The diff adds app-local .vscode files and `.vscode/mcp.json` into the frontend package.
## Deferred from: code review (2026-05-01) of 1-2-docker-deployment-with-media-volume-mounts
* No Container Resource Limits [docker-compose.yml] - deferred, pre-existing
* No Container Healthchecks [docker-compose.yml] - deferred, pre-existing
* Missing Log Rotation [docker-compose.yml] - deferred, pre-existing
