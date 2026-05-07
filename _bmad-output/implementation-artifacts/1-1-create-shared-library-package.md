# Story 1.1: Create Shared Library Package

Status: done

## Story

As a developer,
I want to create a new npm workspace package for shared TypeScript types,
so that I have a single location for all data contracts consumed by both apps.

## Acceptance Criteria

1. **Given** the existing monorepo with `apps/backend` and `apps/frontend`, **when** the shared library package is created, **then** a new package directory exists at `packages/shared` with its own `package.json` and `tsconfig.json`.
2. **And** the root `package.json` workspaces array includes the new package (`packages/shared`).
3. **And** the shared library compiles independently via its own build/typecheck command (`npm run build --workspace=packages/shared`).
4. **And** the package contains zero runtime code — only type definitions, interfaces, and enums.
5. **And** TypeScript strict mode is enabled in the shared library's tsconfig.
6. **And** no circular dependencies exist (shared lib imports nothing from apps).

## Tasks / Subtasks

- [x] Task 1: Create the `packages/shared/` directory structure (AC: #1)
  - [x] 1.1 Create `packages/shared/package.json` with package name, version, types entry point, and build script
  - [x] 1.2 Create `packages/shared/tsconfig.json` with strict mode, composite, declaration output
  - [x] 1.3 Create `packages/shared/src/index.ts` as the package entry point (initially exporting a placeholder type to prove compilation)
- [x] Task 2: Register the shared library in the monorepo workspace (AC: #2)
  - [x] 2.1 Add `packages/shared` to the root `package.json` `workspaces` array
  - [x] 2.2 Add `packages/shared` to the root `tsconfig.json` `references` array
  - [x] 2.3 Run `npm install` at the root to create the workspace symlink in `node_modules`
- [x] Task 3: Configure the shared library build (AC: #3, #5)
  - [x] 3.1 Add a `build:shared` script to the root `package.json`
  - [x] 3.2 Update the root `build` script to build shared first, then frontend and backend
  - [x] 3.3 Verify `npm run build --workspace=packages/shared` compiles independently without errors
- [x] Task 4: Verify the package contains zero runtime code (AC: #4)
  - [x] 4.1 Ensure the shared library's `src/index.ts` contains ONLY type exports (interfaces, types, enums) — no classes, functions, or executable statements
  - [x] 4.2 Verify the compiled output (if any `.js` files are emitted) contains no meaningful runtime code
- [x] Task 5: Verify no circular dependencies (AC: #6)
  - [x] 5.1 Confirm the shared library's `tsconfig.json` `include` covers only `src/**/*` within the shared package
  - [x] 5.2 Confirm no imports from `backend` or `frontend` packages exist in the shared library source
- [x] Task 6: Update the Dockerfile to include the shared library (AC: implicit — Docker must still work)
  - [x] 6.1 Add `COPY packages/shared/package*.json ./packages/shared/` to the build stage
  - [x] 6.2 Add `COPY --from=build /app/packages/shared/dist ./packages/shared/dist` to the production stage (only if the shared lib emits compiled output needed at runtime)
  - [x] 6.3 Verify Docker build still succeeds

## Dev Notes

### Critical Architecture Constraints

- **Zero runtime code (NFR2):** The shared library MUST contain only `type`, `interface`, and `enum` definitions. No classes, no functions, no executable statements. Enums are acceptable since they compile to runtime objects but are specifically included in the architecture requirements.
- **No circular dependencies (NFR3):** The shared library MUST NOT import from `backend` or `frontend`. It is the leaf of the dependency graph.
- **TypeScript strict mode (NFR6):** Strict mode MUST remain enabled — do not loosen any compiler options.
- **No barrel/index.ts within apps (Architecture enforcement):** The "no barrel files" rule applies to internal app organization. The shared library's `src/index.ts` serves as the package entry point (standard npm package practice), which is distinct from a barrel file within an app's internal module structure.
- **Direct imports convention:** When apps later import from the shared library, they should import from the package name directly (e.g., `import { MovieListItem } from 'shared'`). The shared library may organize types into subdirectories with re-exports from the main index if needed for clarity.

### Package Configuration Details

**Package name:** `shared` (matching the existing naming convention — `backend`, `frontend` use simple names without scope)

**Package location:** `packages/shared/` (as specified in architecture: "e.g. packages/shared or libs/shared")

**`packages/shared/package.json` specification:**

```json
{
  "name": "shared",
  "version": "1.0.0",
  "private": true,
  "description": "Shared TypeScript types, interfaces, and enums for Cineplex Rigaud",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "typescript": "~5.7.0"
  }
}
```

**`packages/shared/tsconfig.json` specification:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Key tsconfig decisions:**

- `module: "commonjs"` — matches the backend (NestJS requires CommonJS). The frontend's Angular build system can consume CommonJS packages from node_modules without issue.
- `composite: true` — enables TypeScript project references and incremental builds.
- `declaration: true` + `declarationMap: true` — emits `.d.ts` files so consuming apps resolve types correctly. DeclarationMap enables "Go to Definition" to navigate into the shared lib source.
- `outDir: "./dist"` — compiled output goes to dist/, keeping source clean.
- `rootDir: "./src"` — ensures dist/ mirrors the src/ structure.

### TypeScript Version Compatibility

- **Backend:** TypeScript ~5.7.0, `module: "commonjs"`
- **Frontend:** TypeScript ~5.9.2, `module: "preserve"`
- **Shared library:** TypeScript ~5.7.0 (use the lower version for maximum backward compatibility)
- Both apps will consume the shared library's `.d.ts` declarations, which are version-agnostic. No compatibility issues expected.

### Initial Source File

**`packages/shared/src/index.ts`** — start with a placeholder to prove compilation:

```typescript
/**
 * Shared type library for Cineplex Rigaud.
 * Contains all data contracts consumed by both backend and frontend.
 *
 * This package contains ONLY type definitions, interfaces, and enums.
 * No runtime code, no classes, no functions.
 */

// Placeholder type to verify package compilation and consumption.
// Will be replaced with actual shared types in Epic 2 (backend migration)
// and Epic 3 (frontend migration).
export type Placeholder = Record<string, never>;
```

### Root package.json Changes

**Current workspaces:**

```json
"workspaces": ["apps/backend", "apps/frontend"]
```

**Updated workspaces:**

```json
"workspaces": ["packages/shared", "apps/backend", "apps/frontend"]
```

The shared library MUST be listed first so it builds before consumers.

**Updated scripts:**

```json
"scripts": {
  "build": "npm run build:shared && npm run build:frontend && npm run build:backend",
  "build:shared": "npm run build --workspace=packages/shared",
  "build:frontend": "npm run build --workspace=apps/frontend",
  "build:backend": "npm run build --workspace=apps/backend",
  "start": "npm run build:frontend && npm run start:prod --workspace=apps/backend",
  "dev": "npm run watch --workspace=apps/frontend & npm run start:dev --workspace=apps/backend",
  "test": "npm run test --workspace=apps/backend && npm run test --workspace=apps/frontend",
  "test:frontend": "npm run test --workspace=apps/frontend"
}
```

### Root tsconfig.json Changes

**Add reference to shared library:**

```json
{
  "compilerOptions": { ... },
  "references": [
    { "path": "packages/shared" },
    { "path": "apps/backend" },
    { "path": "apps/frontend" }
  ]
}
```

### Dockerfile Changes

The Dockerfile must copy the shared library's package.json for `npm ci` workspace resolution, and copy its built output for the production stage.

**Build stage additions (after existing COPY lines for apps):**

```dockerfile
COPY packages/shared/package*.json ./packages/shared/
```

**Production stage — copy shared lib dist (needed for runtime enum resolution):**

```dockerfile
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
```

**Note:** Since the shared lib contains only types and enums, the production stage needs the dist/ only if enums are used (they compile to runtime objects). If the lib is purely interfaces/types, the COPY can be skipped. Include it defensively for now — it costs almost nothing.

Also update the production stage to copy the shared lib's package.json for workspace resolution:

```dockerfile
COPY packages/shared/package*.json ./packages/shared/
```

### What NOT to Do

- **DO NOT** add the shared library as a `dependency` in the backend or frontend `package.json` yet. That is Story 1.2's scope (configuring app consumption). Story 1.1 only creates the package and registers it in the workspace.
- **DO NOT** move any existing types/interfaces into the shared library yet. That is Epic 2 and Epic 3's scope.
- **DO NOT** create subdirectory organization for types yet (e.g., `src/browse/`, `src/pipeline/`). Start with a flat `src/index.ts` and let the migration stories determine the final structure.
- **DO NOT** modify any existing backend or frontend code.
- **DO NOT** create test files for the shared library — it contains only type definitions, which are verified by compilation.
- **DO NOT** use `console.log` anywhere (NestJS Logger is the standard, but the shared lib shouldn't have any logging anyway).

### Project Structure Notes

After this story, the monorepo structure adds:

```
cineplex-rigaud/
├── packages/
│   └── shared/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           └── index.ts
├── package.json          (updated: workspaces, scripts)
├── tsconfig.json         (updated: references)
├── Dockerfile            (updated: COPY shared package)
└── ... (existing unchanged)
```

This aligns with the architecture's directory structure specification which shows the project using npm workspaces for monorepo management.

### Verification Checklist

1. `npm run build --workspace=packages/shared` — compiles without errors
2. `ls packages/shared/dist/` — contains `index.js`, `index.d.ts`, `index.d.ts.map`
3. `cat packages/shared/dist/index.js` — contains no meaningful runtime code (just empty exports or enum objects)
4. `cat packages/shared/dist/index.d.ts` — contains the exported type declaration
5. `grep -r "from.*backend\|from.*frontend" packages/shared/src/` — returns nothing (no circular deps)
6. `npm run build` — full monorepo build succeeds
7. `docker build .` — Docker build succeeds

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 1 - Story 1.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture Decision]
- [Source: _bmad-output/planning-artifacts/prd.md#Shared Type Library]
- [Source: _bmad-output/planning-artifacts/prd.md#Technical Architecture Considerations]
- [Source: TypeScript Handbook - Project References]
- [Source: npm docs - Workspaces]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (GitHub Copilot)

### Debug Log References

None

### Completion Notes List

- Created `packages/shared/` directory with `package.json`, `tsconfig.json`, and `src/index.ts`
- Package configured with TypeScript strict mode, composite builds, declaration output
- Registered in root workspace (first in array for build ordering)
- Added `build:shared` script and updated root `build` to build shared first
- Shared lib compiles independently: `npm run build --workspace=packages/shared`
- Verified compiled output has zero meaningful runtime code (only empty module export)
- Verified no circular dependencies (no imports from backend/frontend)
- Updated Dockerfile: shared package.json copied in both build and production stages, dist copied to production
- Full monorepo build succeeds, Docker build succeeds
- Pre-existing test failures in WatcherService (4 tests) confirmed unrelated to this story

### File List

- packages/shared/package.json (new)
- packages/shared/tsconfig.json (new)
- packages/shared/src/index.ts (new)
- package.json (modified — workspaces, scripts)
- tsconfig.json (modified — references)
- Dockerfile (modified — shared lib COPY lines)
- package-lock.json (modified — workspace resolution)

### Review Findings

- [x] [Review][Patch] `tsconfig.tsbuildinfo` committed to version control — added `*.tsbuildinfo` to `.gitignore` and unstaged [packages/shared/tsconfig.tsbuildinfo]

### Change Log

- 2026-05-07: Created shared library package at packages/shared/ with TypeScript strict mode, registered in monorepo workspace, configured build pipeline, updated Dockerfile for Docker compatibility. All acceptance criteria satisfied.
- 2026-05-07: Code review — 1 patch applied (tsbuildinfo gitignored), 11 dismissed.
