# Continuous integration guide

## Workflows

`.github/workflows/ci.yml` is the required GitHub Actions workflow. It runs for
pull requests, pushes to `main`, and manual dispatch. Repository permissions are
read-only and stale runs on the same ref are cancelled.

Required jobs:

| Job | Main checks |
|---|---|
| `Quality` | isolated config guard, reviewed lint baseline, unit and characterization tests |
| `Production builds` | admin React build, client React/typecheck build, Nest production build |
| `PostgreSQL, tests, and offline smoke` | PostgreSQL 16, clean and repeated migrations, migration inventory, schema drift, integration/security/route tests, offline e2e, backup verification, production builds, Nest bootstrap, health and browser smoke |

`.github/workflows/backup-drill.yml` is manual only. It starts an isolated
PostgreSQL 16 container, migrates it, inserts synthetic records and files,
creates and verifies a coordinated backup, restores it into a separate database
and storage directory, checks domain integrity, then removes all resources.

No workflow uses a developer `.env`, repository `storage/`, real credentials, or
Telegram/MAX polling. Required CI stores no artifacts. The manual drill also
stores no dump because even synthetic backup files should not become a habitually
downloadable artifact.

## Local equivalents

Set an isolated environment first. PowerShell example:

```powershell
$env:NODE_ENV = "test"
$env:BOT_TOKEN = "ci-offline-telegram-token"
$env:BOT_POLLING_ENABLED = "false"
$env:MAX_BOT_TOKEN = ""
$env:DB_HOST = "localhost"
$env:DB_PORT = "5432"
$env:DB_NAME = "vitma_dev"
$env:DB_USER = "user"
$env:DB_PASS = "pass"
$env:TEST_DB_HOST = "localhost"
$env:TEST_DB_PORT = "5432"
$env:TEST_DB_NAME = "vitma_test"
$env:TEST_DB_USER = "user"
$env:TEST_DB_PASS = "pass"
$env:FILE_STORAGE_ROOT = "$env:TEMP\vitma-ci-storage"
```

Then run:

```powershell
npm ci
npm run ci:quality
npm run ci:build
npm run ci:database
npm run ci:offline-smoke
```

`ci-guard.mjs` rejects non-test mode, enabled polling, a real-looking Telegram
token, a MAX token, unsafe database hosts/names, and storage under the repository
`storage/` directory. `database-check.mjs` recreates only a `*_test` database,
runs migrations twice, requires every migration to be marked applied, and
requires TypeORM to report no schema drift.

The full local drill requires the application to be stopped and a populated,
disposable database:

```powershell
npm run backup:drill
```

## Branch protection

Protect `main` and require these checks:

- `Quality`
- `Production builds`
- `PostgreSQL, tests, and offline smoke`

Do not require the manual backup drill on every pull request.

## Hosted verification

Stage 0 was merged through
[pull request #1](https://github.com/cltvv1/market-bot/pull/1) with merge commit
`3bf9d3be679bbe5e6ed8da76682676839adb2b98`. The resulting `main` workflow was
verified on GitHub-hosted runners on 2026-07-28:

- run: [30334738735](https://github.com/cltvv1/market-bot/actions/runs/30334738735);
- `Quality`: passed in 57 seconds;
- `Production builds`: passed in 38 seconds;
- `PostgreSQL, tests, and offline smoke`: passed in 106 seconds.

The first hosted attempts exposed Linux-only path validation and concurrent
Supertest server-lifecycle issues. The storage provider now recognizes both
POSIX and Windows absolute paths on every host, and the HTTP e2e checks run
sequentially. The workflow also uses job-level `RUNNER_TEMP` initialization
because the `runner` context is unavailable in workflow-level `env`.

The full manual backup/restore drill passed both locally and in hosted
`workflow_dispatch`
[run 30334884014](https://github.com/cltvv1/market-bot/actions/runs/30334884014)
from `main`. The hosted job used an isolated PostgreSQL 16 container and
temporary runner storage, created synthetic fixtures, ran migrations, created
and verified the coordinated backup, restored and inspected the separate copy,
and removed its ephemeral resources. It published no dump or storage artifact.

Stage 0: completed and verified in hosted CI and hosted backup restore drill.

Known non-blocking debt:

- the reviewed lint ratchet remains in `scripts/lint-baseline.json`; the hosted
  quality job rejects regressions without rewriting unrelated modules;
- the previous Jest open-handle warning was removed by explicitly stopping the
  mocked Telegram adapter during route-inventory teardown;
- the Linux client production build reports a 677.57 kB Vite chunk, above the
  500 kB advisory threshold; code splitting is deferred to the frontend backlog;
- `npm ci` reports 40 dependency advisories (4 low, 16 moderate, 19 high, and
  1 critical); no blind `npm audit fix` was applied.

## How to trace one CI run

1. Start at `.github/workflows/ci.yml` and select a job.
2. Follow the `npm run ci:*` entry in `package.json`.
3. Open the referenced Node script, such as `scripts/database-check.mjs`.
4. Follow database configuration to `src/database/test-data-source.ts`.
5. Follow migration commands to `src/database/migrations/`.
6. Follow Jest configuration to `test/jest-integration.json` or
   `test/jest-e2e.json`.
7. Open the concrete `*.spec.ts` or `*.integration-spec.ts` suite.
8. For builds, inspect the Vite config or Nest `dist/` output named by the npm
   script.
9. The first non-zero process exit code fails the step, job, and required check.

## How to inspect a duplicate route in code

For `POST /api/client/service-requests/drafts`:

1. Controller prefix and method decorator:
   `ServiceRequestsController.createDraft` in
   `src/service-requests/service-requests.controller.ts`.
2. Authentication: the controller has a class-level `@UseGuards(WebSessionGuard)`.
3. Input contract: `CreateServiceRequestDraftDto` in
   `src/service-requests/dto/canonical-service-request.dto.ts`.
4. Application call: `ServiceRequestsService.createWebDraft`.
5. Ownership regression:
   `test/service-request-routes.integration-spec.ts` reads Nest route metadata
   and asserts that this method/path is owned exactly once by
   `ServiceRequestsController`.
6. Frontend caller: `serviceRequestService.create` in
   `client-ui/src/services/client.ts`.

The same traversal works for every endpoint: URL decorator, guard, DTO, service,
route inventory test, then caller.
