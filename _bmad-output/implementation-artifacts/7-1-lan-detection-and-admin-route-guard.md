# Story 7.1: LAN Detection and Admin Route Guard

Status: done

## Story

As an admin,
I want the admin panel to only be accessible from my local network,
so that viewers outside my LAN never see admin functionality.

## Acceptance Criteria

1. Given a client accesses the application, when the client requests admin API endpoints, then the backend determines whether the client IP is on the server's local network subnet (FR33).
2. An endpoint `GET /api/admin/access` returns `{ "admin": true }` or `{ "admin": false }` based on whether the current client has admin access.
3. Admin API routes (`/api/admin/*`) return 403 Forbidden for non-LAN clients (NFR10).
4. The Angular frontend uses the access check to conditionally show or hide the admin route and navigation link.
5. The TMDB API key is never included in any frontend-facing response (NFR12) — verified by reviewing all existing endpoints (already compliant; no new exposure introduced).

## Tasks / Subtasks

- [x] Task 1: Create `AdminModule` with `LanGuard` service (AC: #1, #3)
  - [x] Create `apps/backend/src/admin/admin.module.ts`
  - [x] Create `apps/backend/src/admin/lan.guard.ts` implementing `CanActivate`
  - [x] Create `apps/backend/src/admin/lan-detection.service.ts` with subnet comparison logic
  - [x] The `LanDetectionService` uses `os.networkInterfaces()` to discover the server's non-internal IPv4 interfaces and their CIDR/netmask
  - [x] The guard extracts client IP from `request.ip` (or `request.headers['x-forwarded-for']` when behind a proxy) and checks if it's on the same subnet
  - [x] Private/reserved ranges: also treat `127.0.0.1`, `::1`, and `::ffff:127.0.0.1` as local (loopback is always admin)
  - [x] Guard returns 403 `ForbiddenException` for non-LAN clients

- [x] Task 2: Create `AdminController` with access-check endpoint (AC: #2)
  - [x] Create `apps/backend/src/admin/admin.controller.ts`
  - [x] Implement `GET /admin/access` — does NOT use the guard; instead calls `LanDetectionService.isLan(request)` and returns `{ admin: boolean }`
  - [x] This endpoint must be accessible from any IP (it's the check itself, not a protected resource)

- [x] Task 3: Apply `LanGuard` to all other admin routes (AC: #3)
  - [x] Use `@UseGuards(LanGuard)` on the controller class level for a new `AdminProtectedController` (or via `@Controller('admin')` with guard on all methods except `access`)
  - [x] For now, the only protected route placeholder is `GET /admin/stats` returning `{}` (will be fleshed out in story 7-2)
  - [x] Verify 403 is returned when client IP is not on server's LAN

- [x] Task 4: Register `AdminModule` in `AppModule` (AC: #1, #3)
  - [x] Import `AdminModule` in `apps/backend/src/app.module.ts`

- [x] Task 5: Create Angular `AdminAccessService` (AC: #4)
  - [x] Create `apps/frontend/src/app/services/admin-access.service.ts`
  - [x] Inject `HttpClient`, call `GET /api/admin/access`
  - [x] Expose an `isAdmin` signal (or observable converted to signal via `toSignal`) that caches the result for the session

- [x] Task 6: Create Angular `adminGuard` route guard (AC: #4)
  - [x] Create `apps/frontend/src/app/admin/admin.guard.ts` as a functional `CanActivateFn`
  - [x] Inject `AdminAccessService`, check `isAdmin` — redirect to `/` if `false`

- [x] Task 7: Create placeholder `AdminComponent` and route (AC: #4)
  - [x] Create `apps/frontend/src/app/admin/admin.component.ts` (standalone, OnPush)
  - [x] Simple template: `<h1>Admin Panel</h1><p>Coming in stories 7-2 through 7-4.</p>`
  - [x] Add route `{ path: 'admin', loadComponent: ..., canActivate: [adminGuard] }` in `app.routes.ts`

- [x] Task 8: Conditionally show admin link in navigation (AC: #4)
  - [x] Add a nav element in `apps/frontend/src/app/app.html` (or `app.ts` template)
  - [x] Show an "Admin" link (`routerLink="/admin"`) only when `AdminAccessService.isAdmin()` is `true`
  - [x] Viewers (non-LAN) never see this link

- [x] Task 9: Write unit tests for LAN detection logic (AC: #1, #3)
  - [x] Create `apps/backend/src/admin/lan-detection.service.spec.ts`
  - [x] Test: loopback IPs (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) → `true`
  - [x] Test: same-subnet IP (e.g., server on `192.168.1.108/24`, client `192.168.1.50`) → `true`
  - [x] Test: different-subnet IP (e.g., `10.0.0.5`) → `false`
  - [x] Test: IPv4-mapped IPv6 on same subnet → `true`
  - [x] Create `apps/backend/src/admin/lan.guard.spec.ts`
  - [x] Test: guard allows request from LAN IP
  - [x] Test: guard throws ForbiddenException for non-LAN IP

- [x] Task 10: Write integration test for admin access endpoint (AC: #2, #3)
  - [x] Create `apps/backend/src/admin/admin.controller.spec.ts`
  - [x] Test: `GET /admin/access` returns `{ admin: true }` from loopback
  - [x] Test: protected endpoint returns 403 for non-LAN (mock `LanDetectionService`)

- [x] Task 11: Write frontend unit tests (AC: #4)
  - [x] Create `apps/frontend/src/app/services/admin-access.service.spec.ts`
  - [x] Test: service calls `/api/admin/access` and exposes boolean signal
  - [x] Create `apps/frontend/src/app/admin/admin.guard.spec.ts`
  - [x] Test: guard allows navigation when admin is true
  - [x] Test: guard redirects to `/` when admin is false

## Dev Notes

### LAN Detection Algorithm

The core logic uses Node.js built-in `os.networkInterfaces()` which returns objects with `address`, `netmask`, `family`, `internal`, and `cidr` for each interface.

**Algorithm:**

1. On service initialization, enumerate all non-internal IPv4 interfaces from `os.networkInterfaces()`
2. For each interface, store the network address and prefix length (from `cidr` field, e.g., `192.168.1.108/24`)
3. When checking a client IP:
   - If loopback (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) → return `true`
   - Strip `::ffff:` prefix if present (IPv4-mapped IPv6)
   - For each server interface, apply the subnet mask to both server and client IPs
   - If masked IPs match → client is on the same subnet → return `true`
4. If no interface matches → return `false`

**Subnet masking (pure math, no external libs):**

```typescript
function ipToInt(ip: string): number {
  return (
    ip
      .split(".")
      .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
  );
}

function isOnSubnet(clientIp: string, networkCidr: string): boolean {
  const [networkIp, prefixStr] = networkCidr.split("/");
  const prefix = parseInt(prefixStr, 10);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipToInt(clientIp) & mask) === (ipToInt(networkIp) & mask);
}
```

### Docker Networking Consideration

When running in Docker with `docker-compose.yml` port mapping (`"3000:3000"`), client IPs arrive as the host's Docker bridge IP or the actual client IP depending on network mode. The current setup uses default bridge networking, so:

- Requests from the Docker host itself appear as `172.17.0.1` (or similar bridge IP)
- The `ADMIN_SUBNET` environment variable (optional override) allows the admin to explicitly set the trusted subnet CIDR if Docker networking obscures real client IPs
- If `ADMIN_SUBNET` is set in `.env`, use that CIDR for LAN detection instead of auto-discovery

**Implementation:** `LanDetectionService` checks `process.env.ADMIN_SUBNET` first. If set (e.g., `192.168.1.0/24`), it uses that single CIDR for all checks. Otherwise, it auto-discovers from `os.networkInterfaces()`.

### NestJS Guard Pattern

```typescript
// lan.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { LanDetectionService } from "./lan-detection.service";

@Injectable()
export class LanGuard implements CanActivate {
  constructor(private readonly lanDetection: LanDetectionService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!this.lanDetection.isLan(request)) {
      throw new ForbiddenException("Admin access is restricted to LAN clients");
    }
    return true;
  }
}
```

### Client IP Extraction

```typescript
getClientIp(request: any): string {
  // Support reverse proxy (X-Forwarded-For) when configured
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    return (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
  }
  // NestJS/Express: request.ip includes ::ffff: prefix for IPv4
  return request.ip || request.connection?.remoteAddress || '';
}
```

### Angular Functional Guard Pattern (Latest Angular)

```typescript
// admin.guard.ts
import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AdminAccessService } from "../services/admin-access.service";

export const adminGuard: CanActivateFn = () => {
  const adminAccess = inject(AdminAccessService);
  const router = inject(Router);

  if (adminAccess.isAdmin()) {
    return true;
  }
  return router.createUrlTree(["/"]);
};
```

### AdminAccessService Pattern

```typescript
// admin-access.service.ts
import { Injectable, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { toSignal } from "@angular/core/rxjs-interop";
import { map, catchError, of, shareReplay } from "rxjs";

@Injectable({ providedIn: "root" })
export class AdminAccessService {
  private readonly http = inject(HttpClient);

  private readonly access$ = this.http
    .get<{ admin: boolean }>("/api/admin/access")
    .pipe(
      map((res) => res.admin),
      catchError(() => of(false)),
      shareReplay(1),
    );

  readonly isAdmin = toSignal(this.access$, { initialValue: false });
}
```

### Project Structure Notes

**New backend files:**

- `apps/backend/src/admin/admin.module.ts`
- `apps/backend/src/admin/admin.controller.ts`
- `apps/backend/src/admin/lan-detection.service.ts`
- `apps/backend/src/admin/lan.guard.ts`
- `apps/backend/src/admin/lan-detection.service.spec.ts`
- `apps/backend/src/admin/lan.guard.spec.ts`
- `apps/backend/src/admin/admin.controller.spec.ts`

**New frontend files:**

- `apps/frontend/src/app/services/admin-access.service.ts`
- `apps/frontend/src/app/services/admin-access.service.spec.ts`
- `apps/frontend/src/app/admin/admin.component.ts`
- `apps/frontend/src/app/admin/admin.guard.ts`
- `apps/frontend/src/app/admin/admin.guard.spec.ts`

**Modified files:**

- `apps/backend/src/app.module.ts` — add `AdminModule` import
- `apps/frontend/src/app/app.routes.ts` — add admin route
- `apps/frontend/src/app/app.ts` — add conditional admin nav link
- `apps/frontend/src/app/app.html` — add nav template with admin link

### Existing Patterns to Follow

- **Backend modules:** Follow `LibraryModule` pattern — controller + service in dedicated folder, exported from module
- **Backend controller prefix:** All controllers use class-level route prefix; global prefix `api` is set in `main.ts` via `app.setGlobalPrefix("api")`
- **Frontend services:** Follow `LibraryService` pattern in `apps/frontend/src/app/services/`
- **Frontend components:** Standalone, OnPush change detection (see `App` component)
- **Frontend routing:** Lazy-loaded via `loadComponent` in `app.routes.ts`
- **No external auth libraries** — this is purely IP-based, zero dependencies added

### Security Considerations

- **No authentication bypass:** The LAN guard is purely subnet-based. There is no login fallback — this is by design (architecture decision: "No Authentication (LAN-Only)")
- **X-Forwarded-For spoofing:** In a trusted LAN environment without a reverse proxy, `X-Forwarded-For` should not be trusted blindly. The implementation should prefer `request.ip` and only fall back to `X-Forwarded-For` if an env var `TRUST_PROXY=true` is set (and NestJS `app.set('trust proxy', true)` is configured)
- **TMDB key isolation (NFR12):** Already handled — TMDB key is in `.env`, used only by `TmdbService` on backend, never serialized to responses. This story introduces no new exposure vectors.

### References

- [Source: architecture.md - Security: No Authentication (LAN-Only)]
- [Source: architecture.md - Admin UI: Same SPA, admin routes visible only when client IP is on the server's LAN subnet]
- [Source: epics.md - Epic 7, Story 7.1: LAN Detection and Admin Route Guard]
- [Source: Node.js os.networkInterfaces() API - provides address, netmask, family, internal, cidr]
- [Source: NestJS Guards documentation - CanActivate, @UseGuards, ForbiddenException]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (GitHub Copilot)

### Debug Log References

- Initial `jest.spyOn(os, 'networkInterfaces')` failed due to non-configurable property; switched to `jest.mock('os')` module-level mock.

### Completion Notes List

- Implemented LAN detection using pure subnet math (no external dependencies)
- `ADMIN_SUBNET` env var override supported for Docker networking scenarios
- `TRUST_PROXY` env var controls whether `X-Forwarded-For` is trusted (off by default for security)
- Frontend uses `toSignal()` with `shareReplay(1)` for session-scoped caching of admin access
- Admin nav link conditionally rendered via `@if` block in app template
- All acceptance criteria satisfied; 20 backend tests + 155 frontend tests passing

### File List

New:

- apps/backend/src/admin/admin.module.ts
- apps/backend/src/admin/admin.controller.ts
- apps/backend/src/admin/lan-detection.service.ts
- apps/backend/src/admin/lan.guard.ts
- apps/backend/src/admin/lan-detection.service.spec.ts
- apps/backend/src/admin/lan.guard.spec.ts
- apps/backend/src/admin/admin.controller.spec.ts
- apps/frontend/src/app/services/admin-access.service.ts
- apps/frontend/src/app/services/admin-access.service.spec.ts
- apps/frontend/src/app/admin/admin.component.ts
- apps/frontend/src/app/admin/admin.guard.ts
- apps/frontend/src/app/admin/admin.guard.spec.ts

Modified:

- apps/backend/src/app.module.ts
- apps/frontend/src/app/app.routes.ts
- apps/frontend/src/app/app.ts
- apps/frontend/src/app/app.html

### Review Findings

- [x] [Review][Decision] Docker bridge networking grants admin to all external traffic by default — Fixed: added ADMIN_SUBNET env var to docker-compose.yml with commented example.
- [x] [Review][Decision] Guard per-method vs class-level — future admin endpoints unprotected by default — Fixed: split into AccessController (unguarded /access) and AdminController (class-level @UseGuards(LanGuard)).
- [x] [Review][Patch] ADMIN_SUBNET lacks validation — Fixed: parseAdminSubnet() supports comma-separated multi-CIDR, validates prefix, logs warnings, falls back to auto-discovery on all-invalid.
- [x] [Review][Patch] Frontend adminGuard race condition — Fixed: guard now returns Observable from access$ pipe instead of sync signal read.
- [x] [Review][Defer] X-Forwarded-For spoofable when TRUST_PROXY=true — deferred, operational risk (off by default, deployment-time concern)
- [x] [Review][Defer] No IPv6 subnet matching support — deferred, fails closed (no security impact, IPv6-only LAN clients denied)

## Change Log

- 2026-05-05: Implemented story 7-1 — LAN detection service with subnet comparison, NestJS guard for admin route protection, Angular admin access service + route guard + conditional nav link. All tasks complete.
