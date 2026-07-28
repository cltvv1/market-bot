# Bot Test Coverage Audit

## Existing suites

| Suite | Level | Bot-relevant coverage |
|---|---|---|
| `test/critical-workflows.integration-spec.ts` | PostgreSQL | registration, ticket history, simple request, FN transitions, ATOL |
| `src/service-requests/service-request.flows.spec.ts` | unit | simple fields and FN pricing/steps |
| `src/files/file-policies.spec.ts` | unit | signatures and selected policies |
| `src/files/local-file-storage.provider.spec.ts` | unit | bounded writes, checksum, temporary cleanup |
| `test/security-foundation.integration-spec.ts` | API/PostgreSQL | file ownership, RBAC, web workflow continuity |
| `test/service-request-routes.integration-spec.ts` | Nest metadata | unique HTTP route ownership |
| `test/app.e2e-spec.ts` | offline e2e | bootstrap and routing with bot classes stopped/mocked |
| `scripts/ci-guard.mjs` | safety guard | fake token, polling off, empty MAX, isolated DB/storage |
| `scripts/offline-smoke.mjs` | process smoke | built app/UI with polling disabled |

## Coverage matrix

| Scenario | TG unit | MAX unit | Integration | Characterization | E2E | Error tests |
|---|---:|---:|---:|---:|---:|---:|
| start/menu | no | no | no | no | bootstrap only | no |
| registration answers | no | no | yes | yes | no | limited |
| registration photo/PDF | no | no | partial | partial | no | file policy only |
| simple service request | no | no | yes | yes | no | limited |
| FN replacement | no | no | yes | yes | no | limited |
| ATOL consent | no | no | yes | partial | no | no platform/media errors |
| ticket text/history | no | no | yes | yes | no | web ownership only |
| ticket media | no | no | partial | no | no | file policy only |
| operator connect/chat | no | no | no | no | no | no |
| admin chat binding | no | no | no | no | no | no |
| outgoing routing | no | no | no | no | offline only | no |
| polling shutdown | no | no | no | no | process smoke | no direct assertion |

## Required cases not found

- unknown input behavior for each mode;
- repeated update/callback and stale callback;
- process restart and resume;
- parallel events for one user;
- API timeout and rate limit;
- failed upload and post-upload send;
- oversized remote media before buffering;
- legacy callback access control and foreign record access;
- MAX operator binary media;
- graceful shutdown of both MAX clients;
- direct interception proving zero external messenger HTTP calls.

The CI guard strongly prevents intentional polling, but it is configuration
protection rather than adapter-level network interception.

## Assessment

Shared happy-path business behavior has useful PostgreSQL characterization.
Platform adapters, state routing, callback authorization, duplicates, restart,
delivery failure and most media errors have little or no automated coverage.
This is not enough to safely refactor either large update class.

Future packages should first add focused characterization with fake contexts and
fake delivery ports. This audit intentionally added no broad test suite.

## Verification run

The following commands passed on 2026-07-28 with
`BOT_POLLING_ENABLED=false`, an empty `MAX_BOT_TOKEN`, a clearly fake Telegram
token, a disposable PostgreSQL 16 container on localhost and temporary storage
outside the repository:

- `npm run ci:quality`: 10 suites, 32 tests passed; lint baseline unchanged;
- `npm run ci:build`: admin, client and NestJS production builds passed;
- `npm run ci:database`: all 3 migrations applied to a new `*_test` database,
  then 3 integration suites/19 tests and 2 e2e suites/6 tests passed;
- `npm run ci:offline-smoke`: health, client SPA, nested route and admin
  login/logout browser smoke passed.

No real Telegram/MAX credential was supplied and polling was disabled by both
environment configuration and `scripts/ci-guard.mjs`.
