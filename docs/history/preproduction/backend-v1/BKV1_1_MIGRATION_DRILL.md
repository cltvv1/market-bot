# BKV1-1 migration verification drill

Date: 2026-08-19. Verdict: **PASS**.

## Safety boundary

The drill used only local development resources. No production database, production storage, messenger API, ATOL or OFD endpoint was contacted. Telegram and MAX polling were disabled and tokens were replaced with offline placeholders for runtime checks.

Destructive operations were restricted to databases named `vitma_bkv1_1_*` and a unique temporary directory. The source databases and repository `storage/` were queried or hashed read-only. The application was never bootstrapped against a source database.

## Source inventory

| Source | Migrations | Requests | Events | StoredFile rows | Suitable |
| --- | ---: | ---: | ---: | ---: | --- |
| current local development copy | 6, through `OrganizationAccessRequests` | 13 | 61 | 12 | selected real pre-migration source |
| old local `db` | migration table empty | 9 | 49 | table absent | too old for the primary drill |
| local test databases | mixed | 0-1 | test data | mixed | not representative |
| prior BKV1-1 test copy | canonical migration present | 1 | test data | present | not a valid pre-migration source |

The selected source had not received `CanonicalServiceRequests`. It contained four service types, MAX and web requests, answers, events, invoice/payment relations, cancelled requests and ATOL-related rows. It did not cover all required statuses or Telegram, so a separate synthetic fixture was also required.

## Source protection

- a custom-format PostgreSQL dump was created before migration;
- dump SHA-256: `cba821638e0ce258a002a9688bd9e432aa762bc9f57386d192c617128b450b20`;
- the dump restored successfully to `vitma_bkv1_1_precheck`;
- all 33 source storage files were copied to an isolated temporary root;
- the manifest recorded relative names, lengths and SHA-256 values outside the repository;
- all migrated runtime checks used copies of that storage, never the source root.

## Real legacy data

Pre-migration aggregates:

- 13 service requests and 61 request events;
- 12 StoredFile rows;
- service types: ATOL consent 2, firmware update 2, FN replacement 8, remote KKT work 1;
- statuses: cancelled 11, invoice required 2;
- sources: MAX 11, web 2;
- six requests with non-empty answers;
- one invoice relation and one payment-proof/paid indicator;
- two ATOL-related requests;
- no visit, engineer, completed, draft or Telegram example.

For every row, the drill generated an invariant from IDs, relations, platform, status, priority, answer hash, price, file-role IDs, visit/assignment/comment presence, timestamps, event count and event-sequence hash. The combined real-data fingerprint was identical before and after migration:

`13 / e4465f103454a7226e714d2e6afe3a0e`

No answer value or customer message was included in the report.

## Synthetic fixture

An isolated worktree at pre-BKV1-1 commit `9510b35eb18e7a9c618da9661304a8c23f94cafe` applied only the first six migrations. Documented synthetic SQL then created 16 requests covering:

1. simple request;
2. FN draft;
3. confirmed FN price;
4. invoice;
5. payment proof and paid state;
6. scheduled visit;
7. assigned engineer;
8. completed request;
9. cancelled request;
10. ATOL consent with generated and signed documents;
11. event history and internal comment;
12. legacy file relation;
13. Telegram;
14. MAX;
15. unknown platform/status;
16. malformed-but-previously-accepted nested answers.

The fixture contained 16 requests, 26 events and five physical synthetic PDF files. Its legacy-field fingerprint was also identical before and after migration:

`16 / 3d5bd804980f6fb82481d55919149bbc`

## Migration result

Both the real restored copy and synthetic restored copy were recreated from their pre-migration dumps after the corrective changes. On each copy:

- `migration:show` reported only `CanonicalServiceRequests` pending;
- the migration completed in one transaction;
- a second `migration:run` reported no pending migrations;
- `schema:log` reported no synchronization SQL;
- request/event/StoredFile counts and legacy fingerprints remained unchanged.

Real post-migration foundation rows:

- 13 unique deterministic request numbers;
- four form definitions and four published version-1 forms;
- two generic attachment rows: invoice 1, payment proof 1;
- zero messages, null form versions or public token hashes.

Synthetic post-migration foundation rows:

- 16 unique deterministic request numbers;
- three fixture form definitions and versions;
- six attachment links: invoice 3, payment proof 1, generated consent 1, signed consent 1;
- zero duplicate numbers, form versions or attachment roles.

## Mapping verification

- known `web`, `telegram` and `max` platforms preserve their source;
- an unsupported platform maps to `source=legacy` and does not invent a preferred channel or messenger identity;
- all legacy internal statuses remain unchanged;
- customer status mapping matches the documented central mapping;
- lifecycle timestamps are populated only when the old status proves the lifecycle point;
- existing request IDs, type/user links, answers, price, visit, assignment, comments and timestamps are preserved;
- public token hashes remain null for legacy rows;
- optimistic version is valid and request numbers are deterministic.

ATOL consent now receives a dedicated version with handler `atol_consent` and the five legacy keys: city, client name, INN, representative name and representative basis. Generic simple and FN legacy schemas remain unchanged.

## Ambiguity review

| Category | Real | Synthetic | Safe behavior | Merge blocker |
| --- | ---: | ---: | --- | --- |
| unknown source | 0 | 1 | `source=legacy`; no invented channel | no |
| unknown status | 0 | 1 | internal value preserved; customer status `received` | no |
| malformed answers | 0 | 1 | JSON preserved; admin legacy fallback renders raw fields | no |
| missing customer | 0 relevant | 1 | neutral contact name, no fabricated identity | no |
| unmatched service type | 0 | 0 | would retain row with null form for manual review | no observed case |
| orphan file relation | 0 | 0 | existing FK prevents the tested case | no |
| missing physical file | 0 | 0 | download fails safely without exposing a local path | no |
| duplicate request number | 0 | 0 | unique constraint and verification query | no |

The synthetic ambiguity rows are intentional fixture cases, not existing data defects.

## FileStorage

On the migrated real copy, all 12 StoredFile records resolved under the isolated storage root. All 12 physical files matched database size and SHA-256 metadata; no object key escaped the root. Synthetic invoice, payment, generated/signed ATOL and customer files also resolved through the normal download route. The application never read the source storage during runtime checks.

## Runtime and admin checks

NestJS booted against the synthetic migrated database and temporary storage with fake adapters. `/health/live`, `/health/ready`, `/site`, a nested site route, `/admin`, admin login and logout passed.

The React admin opened the migrated ATOL card with no browser console error. Structured answers, three events and both consent attachment roles were visible. The generated consent downloaded as `application/pdf`. Authenticated detail checks also covered paid invoice/payment, scheduled visit, assigned engineer, unknown source and malformed legacy answers.

## Bot compatibility

With polling disabled, the compatibility service read six migrated MAX and six migrated Telegram requests. Starting FN replacement for the MAX fixture resumed legacy draft `1002` instead of creating a duplicate. Telegram waiting-payment lookup returned legacy request `1004`; the ATOL request and events remained readable. Existing handler/service tests use fake messenger adapters and cover FN, invoice/payment/visit and ATOL paths without network access.

## New web flow

A separate browser smoke completed:

`session -> draft -> partial update -> resume -> image/PDF upload -> submit -> repeat submit -> admin detail -> engineer assignment -> transition -> customer/internal messages -> public token -> customer reply`.

The repeated submit returned the same token and no second request. Browser B received 404 for the request and file. Repeating the same transition created no event. Numeric ID without a session/token returned 400. The public response exposed the customer message and reply but not the internal note or internal request fields.

## Defects found and fixed

1. **Migration mapping defect:** unknown legacy platforms were copied into `contactSnapshot.messenger` and `preferredChannel`. The migration now emits only a neutral name when the platform is unsupported.
2. **Migration/compatibility defect:** ATOL consent inherited the generic simple form and handler. The migration now creates the dedicated ATOL legacy schema; `ServiceFormService` recognizes and recreates the same schema when necessary.

Because PR #9 is unmerged and the migration had only been applied to disposable test/drill databases, the existing migration was minimally corrected. All disposable migrated databases were recreated and the full migration comparison repeated.

## Source immutability proof

After runtime and browser checks:

- the source development copy remained at six migrations with canonical migration count zero;
- source counts remained 13 requests, 61 events and 12 StoredFile rows;
- old `db` remained 9 requests, 49 events and zero migration rows;
- the source dump SHA-256 was unchanged;
- source storage remained 33 files with zero length/hash mismatches;
- no source file was added, modified or deleted.

## Verdict

**PASS.** Legacy rows, business fields, events and files were preserved; mapping defects found by the expanded fixture were corrected and retested; runtime, admin, compatibility and new web flows passed on disposable resources. PR #9 may proceed to ready-for-review after the full CI-equivalent suite and hosted CI pass.
