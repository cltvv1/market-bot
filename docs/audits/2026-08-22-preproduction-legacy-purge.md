# Pre-production legacy purge report

## 1. Executive summary

VITMA MARKET was rebaselined from the approved `main` commit
`8f137b6790989c9a8de1d814846863ef9a72da4a`. The active application now uses
only the current organization-access, service-request, KKT-registration,
StoredFile, RBAC and React UI paths. The historical migration chain was
replaced by one reviewed initial migration.

The clean contract was proved locally with fresh development/test databases,
bootstrap and health checks, repeatable migrations, schema-drift checks,
canonical workflow tests, production builds and an isolated backup/restore
drill. All hosted draft-PR checks passed on the implementation head, and the
temporary insurance backup was verified again and deleted.

## 2. Baseline SHA

- source `main`: `8f137b6790989c9a8de1d814846863ef9a72da4a`;
- source merge: PR #10, `Unify KKT registration readiness across channels`;
- implementation branch: `codex/preproduction-legacy-purge`;
- Git history was not rewritten.

## 3. Pre-production status

The owner explicitly confirmed that VITMA MARKET has never been deployed to
production, no production PostgreSQL/storage exists, and all old development
requests, registrations, files, IDs and form versions are disposable. Every DB
and storage resource touched by this package was traced to local Docker and the
workspace configuration. No production DB or production storage was accessed.

## 4. Scope

- remove development-data compatibility from entities, services, controllers,
  bot adapters, React contracts, scripts and active documentation;
- make StoredFile the only persisted file reference;
- consolidate service-request application entry points;
- remove static HTML UI mode;
- reset disposable development/test data and storage;
- replace eight historical migrations with one current baseline migration;
- preserve and characterize canonical workflows.

## 5. Exclusions

- Catalog + Orders implementation or redesign;
- partner cabinet and direct 1C/ATOL/OFD integration;
- outbox, durable deduplication or large bot-handler decomposition;
- dependency upgrades and general lint-debt cleanup;
- production deployment or provider API verification.

## 6. Legacy inventory

| ID | Path or DB object | Symbol/object | Previous purpose | Why legacy | Canonical replacement | Action | Safety evidence |
|---|---|---|---|---|---|---|---|
| P-01 | `admin_users.role` | single role column | pre-RBAC authorization | duplicated `admin_user_roles` | multi-role assignments | delete | permission/integration tests and schema assertion |
| P-02 | `users` | `sendNews`, `sendImportant`, `isAdmin`, `isOperator` | bot-era flags | staff identity/RBAC is separate | admin users, roles and notification bindings | delete | bot/unit/security tests; no active consumer |
| P-03 | `service_requests` | raw invoice/operator/executor fields and `source=legacy` | pre-canonical request records | duplicated StoredFile/staff FKs | canonical fields and centralized transitions | delete | web/admin/channel integration tests |
| P-04 | `service_requests.formVersionId` | nullable form link | accepted records without a current form | old rows are discarded | required FK to versioned form | consolidate | fresh bootstrap creates a published version; FK test |
| P-05 | `registration_requests` | type, boolean state, raw photo/PDF paths | original questionnaire persistence | replaced by status/readiness/evidence/StoredFile | one RegistrationRequest plus checklist | delete | registration readiness integration suite |
| P-06 | registration constraints | `legacy` source, `legacy_photo` evidence | BKV1-2 backfill markers | no historical records remain | current source/evidence values | delete | schema constraint assertion |
| P-07 | `ticket_messages` | provider IDs, URLs, names, MIME, size and local path | persisted provider/file fallback | duplicates StoredFile and leaks provider details | `storedFileId` FK | delete | ticket media unit/integration tests |
| S-01 | `canonical-service-requests.service.ts` | `CanonicalServiceRequestsService` | temporary parallel canonical facade | two public application services | `ServiceRequestsService` | consolidate | route ownership and all channel tests |
| S-02 | old bot workflow service body | formerly `ServiceRequestsService` | channel conversation workflow | name conflicted with public facade | internal `ServiceRequestChannelWorkflowService` | consolidate | Telegram/MAX canonical DB characterization |
| F-01 | service-request files | `AtolTemporaryFileService` | generated consent on local path | second file lifecycle | Buffer -> StoredFile | delete | consent workflow and backup drill |
| F-02 | FilesService/scripts | `registerLegacy`, `files:backfill` | ingest old filesystem files | old storage is discarded | direct StoredFile writes | delete | repository search and fresh storage bootstrap |
| UI-01 | Nest static HTML | `admin.page.ts`, `site.page.ts` | pre-React interfaces | React apps are current | built React entries | delete | e2e SPA routes and browser smoke |
| UI-02 | config/CI | `ENABLE_LEGACY_UI` | React/static switch | only React is supported | `SERVE_BUILT_UI` built/disabled modes | delete | UI-serving unit/e2e tests |
| R-01 | client service routes | start/answer/confirm aliases | old step API | web uses server drafts and submit | `/drafts` API | delete | route metadata negative assertions |
| R-02 | admin request routes | raw invoice/status aliases | old direct field/status handlers | StoredFile + `/transition` | canonical admin routes | delete | route metadata and security tests |
| R-03 | admin registration routes | process/equipment-photo aliases | boolean/path workflow | readiness handoff/evidence APIs | current checklist routes | delete | route metadata and readiness tests |
| M-01 | migration chain | eight historical migrations/backfills | upgrade disposable development schemas | no production lineage exists | one initial baseline | delete | empty DB migration, repeat run and schema drift |
| T-01 | migration tests | BKV1-1/BKV1-2 old-data drills | compatibility requirement | requirement was explicitly cancelled | clean schema/current flow tests | delete | new baseline integration suite |
| D-01 | local DB/storage | old development rows and files | manual test history | owner declared disposable | clean bootstrap data | delete | verified external insurance dump/archive |
| DOC-01 | active audit trees | pre-rebaseline audits | described superseded contracts | misleading as current docs | explicit history archive | consolidate | active-doc search and archive README |
| KEEP-01 | bot transport media | transient `fileId`, `fileUniqueId`, `externalUrl` inputs | download provider media before storage | current transport requirement, not persistence fallback | materialize Buffer then StoredFile | keep | entity has no provider columns; media tests assert sanitization |
| KEEP-02 | client catalog demo | mock/localStorage catalog and checkout | visual pre-backend demo | no canonical Catalog + Orders replacement yet | future domain package | keep | explicitly excluded from purge |

## 7. Removed entities

No complete active TypeORM entity class was removed. The immediate pre-purge
code had no `BidEntity`, ServiceRequest V2 or Registration V2. Removing a whole
entity would therefore be a false claim. Persistence cleanup removed obsolete
fields and values from existing canonical entities instead.

Deleted service classes were compatibility/application facades, not entities:

- `CanonicalServiceRequestsService`;
- `AtolTemporaryFileService`.

## 8. Removed tables and columns

The restored immediate pre-purge `vitma_dev` had 36 tables. It had no table that
was absent from the new schema; the new baseline additionally introduces the
BKV1-2 tables `registration_requirements`, `registration_evidence` and
`registration_data_requests`.

Earlier development-only tables `bids` and `bid_fields` were already absent
from that immediate database and have no entity/runtime consumer. They remain
explicitly excluded from the baseline. The associated `bids_type_enum` is also
absent.

Removed pre-purge columns (25):

- `admin_users.role`;
- `users.sendNews`, `sendImportant`, `isAdmin`, `isOperator`;
- `service_requests.invoiceFileId`, `invoiceFileName`,
  `responsibleOperatorId`, `executorName`;
- `registration_requests.type`, `equipmentPhotoPath`, `equipmentPhotoName`,
  `equipmentPhotoFileId`, `isFilled`, `isStopped`, `isProcessed`, `pdfLink`,
  `pdfPath`;
- `ticket_messages.fileId`, `fileUniqueId`, `fileName`, `mimeType`, `fileSize`,
  `externalUrl`, `localPath`.

Removed enum: `registration_requests_type_enum`. Schema tests assert the
absence of this enum, `bids_type_enum`, discarded tables and all listed
columns.

## 9. Removed migrations and backfills

Deleted migrations:

1. `InitialSchema1785067383157`;
2. `SecurityFoundation1785079000000`;
3. `FileStorageAndAudit1785085000000`;
4. `ServiceRequestPaymentProof1785226500000`;
5. `IntegrationFoundation1786953600000`;
6. `OrganizationAccessRequests1787040000000`;
7. `CanonicalServiceRequests1787126400000`;
8. `KktRegistrationReadiness1787212800000`.

The old database had the first seven recorded; BKV1-2 had not been applied to
that disposable DB. Removed backfill tooling: `scripts/files-backfill.mjs` and
the `files:backfill` npm command. Removed compatibility-only migration tests:
`canonical-service-request-migration.integration-spec.ts` and
`kkt-registration-readiness-migration.integration-spec.ts`.

## 10. Removed routes

| Removed route | Current replacement |
|---|---|
| `POST /api/client/service-requests/start` | `POST /api/client/service-requests/drafts` |
| `POST /api/client/service-requests/:id/answers` | `PATCH /api/client/service-requests/drafts/:id` |
| `POST /api/client/service-requests/:id/confirm-price` | draft submit plus canonical transition rules |
| `POST /admin/api/service-requests/:id/invoice` | `POST .../:id/invoice-file` |
| `POST /admin/api/service-requests/:id/payment-received` | `POST .../:id/transition` |
| `POST /admin/api/service-requests/:id/complete` | `POST .../:id/transition` |
| `POST /admin/api/service-requests/:id/cancel` | `POST .../:id/transition` |
| `POST /admin/api/registrations/:id/process` | `POST .../:id/handoff` with readiness gate |
| `GET /admin/api/registrations/:id/equipment-photo` | registration evidence file endpoint |

No alias or redirect remains. Route metadata tests prove these method/path
pairs are unregistered, so normal Nest `404` applies.

## 11. Removed forms and form versions

The pre-purge database contained six disposable rows:

- `firmware_update`: retired version 1 and published version 2;
- `fn_replacement`: retired version 1 and published version 2;
- `kkt_remote_work`: retired version 1 and published version 2.

They were not migrated. Bootstrap now creates exactly one current published
baseline version `1` for each of those three service types. The versioning
mechanism and future publish/retire behavior remain intact.

## 12. Removed frontend components

- deleted Nest-generated `src/admin/admin.page.ts`;
- deleted Nest-generated `src/site/site.page.ts`;
- deleted the static-only hero image used by the old site page;
- removed React/HTML compatibility transforms and old admin DTO fields;
- removed `ENABLE_LEGACY_UI` from runtime config, CI and `.env.example`.

No visual redesign or Catalog + Orders implementation was performed. The
current React client/admin applications and their routes remain.

## 13. Removed bot paths

- Telegram and MAX no longer read generated consent or registration PDFs from
  raw filesystem paths;
- ticket media is materialized to a Buffer and persisted as StoredFile before
  a message row is created;
- old user `isAdmin`/`isOperator` lookup paths were removed in favor of current
  staff access services;
- service requests from both messengers use the shared application facade and
  current form version.

No current Telegram/MAX menu, registration checklist, service-request flow,
operator chat or media type was intentionally removed.

## 14. Removed fixtures, dumps and storage

Confirmed disposable local databases dropped during reset:

- `db`;
- `vitma_dev`;
- `vitma_test`;
- `vitma_e0_test`;
- `vitma_code_health_test`;
- `vitma_baseline_generation_test`.

Only `vitma_dev` and `vitma_test` were recreated. No old rows or IDs were
restored. Workspace `storage/` (12 old files) and `backups/` (6 old backup
artifacts) were emptied and are Git-ignored. Both currently contain zero files.

A temporary insurance set was created outside the repository at
`%TEMP%/vitma-preproduction-purge-20260822-160246`: PostgreSQL custom dump,
storage archive, old-backups archive and SHA-256 manifest. Its restore matched
36 tables and 54 total rows, and all 12 storage plus 6 backup files matched
size/hash. After hosted CI passed, all four top-level artifacts were verified
again by size/SHA-256 and the complete temporary set was deleted. A follow-up
filesystem check confirmed that no matching insurance directory remains.

## 15. Preserved canonical components

- pending organization access request -> staff approval -> representative
  membership, with RBAC and audit;
- one canonical ServiceRequest model, structured answers, form-version FK,
  server drafts, messages, attachments, public token and transitions;
- RegistrationRequest with requirements, evidence, data requests, manual
  verification, readiness gate and OFD masking;
- StoredFile/FileStoragePort and authenticated backend file delivery;
- admin/web sessions, role assignments, validation, Helmet, CORS, rate limits,
  health, Swagger restrictions and audit log;
- React client/admin applications;
- Telegram/MAX adapters and common client/application workflows;
- integration staging entities and adapter boundaries.

## 16. New baseline migration

`InitialPreproductionBaseline1787388476982` creates 38 entity tables plus
`typeorm_migrations` with the current columns, FKs, unique/partial indexes and
check constraints. It contains no old-ID mapping, backfill, seed data, secrets,
environment paths, rename or data-dependent SQL. `synchronize` remains false.

The migration was generated against an empty disposable DB, manually reviewed,
then verified through independent fresh DB and schema-drift tests.

## 17. Fresh database bootstrap

- `vitma_dev` and `vitma_test` were recreated from empty PostgreSQL;
- exactly one migration row was applied;
- a repeat migration run reported no pending migrations;
- bootstrap created 19 registration fields, 3 service types and 3 published
  form versions;
- no users, registrations, service requests, tickets or StoredFile rows were
  restored to development;
- offline application start succeeded with messenger polling disabled;
- `/health/live` returned `ok`;
- `/health/ready` returned database `available`, migrations `current`;
- React site/admin browser smoke and admin login/logout passed.

## 18. Schema drift

`schema:log` and `schema:test:log` both reported no queries to execute.
`migration:show` for both databases lists only:

```text
[X] 1 InitialPreproductionBaseline1787388476982
```

## 19. Backup/restore

An additional isolated current-baseline drill used
`vitma_backup_validation_test`, a `%TEMP%` storage root and `%TEMP%` backup root.
Synthetic current data covered one registration with evidence/PDF, one service
request, one ticket media message, one admin/role and three StoredFiles.

Results:

- backup create: passed;
- manifest/checksum verify: passed;
- restore into a new database/storage: passed;
- 39 table counts and 3 physical file hashes matched;
- domain-integrity checks passed;
- restored Nest process started with polling disabled;
- restored `/health/live` and `/health/ready` passed;
- temporary drill DBs/storage/backups were deleted.

## 20. Unit, integration and e2e

Final local results:

- unit: 20 suites, 93 tests passed;
- integration: 8 suites, 56 tests passed;
- e2e: 2 suites, 7 tests passed;
- lint ratchet: passed; no new violations, existing debt 932 errors/10 warnings.

GitHub Actions passed `Quality`, `Production builds`, and
`PostgreSQL, tests, and offline smoke` on implementation head `577219e` and
again on the report-only final head `e59c8bc`; the GitGuardian check also
passed. The final PR run was
[32565416411](https://github.com/cltvv1/market-bot/actions/runs/32565416411)
and the matching push run was
[32565414452](https://github.com/cltvv1/market-bot/actions/runs/32565414452).

The first e2e invocation exposed that `setup-e2e.ts` inherited local messenger
tokens and attempted Telegram/MAX polling. It sent no business message, failed
with Telegram `409`/MAX TLS, and was stopped. Test setup now requires the test
DB, sets a fake Telegram token, disables all polling and uses temporary storage;
the repeated e2e run passed without external provider calls.

## 21. Production builds

- Nest backend build: passed;
- React client-ui TypeScript/Vite build: passed;
- React admin-ui Vite build: passed;
- offline built-UI smoke: passed.

## 22. Repository-wide legacy search

Active runtime/frontend/scripts contain no compatibility branch, DTO, entity,
repository, controller, route, migration, seed or fallback file reader.

Remaining classified matches outside `docs/history`:

- this purge report and the baseline decision document;
- negative schema assertions for `bids`, `bid_fields`, discarded columns,
  enum/source/evidence values;
- a negative test description that unknown fields are not flattened into old
  text;
- FileStorage guide statement that no migration/backfill command exists;
- `S3-compatible` wording, which describes a provider interface rather than
  data compatibility;
- the active project-audit link to this report.

Historical reports with such terms are under `docs/history/preproduction/` and
are explicitly marked non-current.

## 23. Unresolved items

No unresolved active legacy data model or behavior is known.

Items deliberately kept for future packages:

- transient provider media identifiers/URLs before Buffer materialization;
- active `tickets` question/chat domain, which has no proven replacement;
- mock/localStorage catalog and checkout, pending Catalog + Orders design;
- general bot duplication, durable delivery and lint debt, to be reassessed by
  a new code-health audit after this PR is merged.

## 24. Limitations

- no live Telegram, MAX, ATOL or OFD provider was used for successful
  functional verification; the unintended first-e2e polling attempt is
  disclosed in section 20 and the test boundary is fixed;
- no production migration drill was applicable because production does not
  exist;
- Git history retains old implementation files and archived reports by design.

## 25. Verdict

**PASS — active legacy behavior and legacy data model were removed.**

The clean database, canonical flows, zero schema drift, absent discarded
tables/routes, hosted CI for the final report head and temporary-backup deletion
were all proved.
