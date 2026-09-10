# P-PROOF: canonical ServiceRequest web payment proof

Implementation branch: `codex/p-proof-canonical-web-payment-proof`.
Report updated: 2026-09-10. Draft package, not merged. The requested document name
retains the FE-1B baseline date. No canonical main status is changed by this report.

## 1. Baseline

Base main: `341c0bcab409deb370f2cd4fe965f42ca1bab565`.
Hosted baseline verification: [Actions run 33734399712](https://github.com/cltvv1/market-bot/actions/runs/33734399712), green.
Work began in a clean separate worktree. The original dirty worktree, its lockfile,
user scripts/artifacts and running FE-1B review environment were left untouched.

## 2. Existing web gap

The site sends reply files to `messages/attachments`. Those files use purpose
`service-attachment`, kind `message` and create a message; they do not populate
`paymentProofFileId`. The FE-1B payment prerequisite therefore correctly stays blocked.

## 3. Existing Telegram/MAX behavior

Both handlers selected a waiting request before downloading, but the old channel
workflow selected the latest request again after download. It stored an active file
outside the transaction, accepted non-strict content, and populated attachment
provenance incompletely. Activity was written after commit and could report an error
after a successful mutation. Provider name fallbacks could invent an incorrect type.

## 4. Scope

One bounded `ServiceRequestPaymentProofService` now owns upload/replacement for all
three channels. No production frontend code, dependencies, schema or roles change.
The review seed only adapts to the new explicit command arguments.

## 5. ServiceRequest vs OrderDocument

This is service evidence, not a shop payment or invoice-revision model. It uses
the existing ServiceRequest pointer, attachment kind and `payment-proof` policy.
`OrderDocument`, its separate policies and its history are untouched.

## 6. Canonical identity

`request.paymentProofFileId` identifies exactly one current `payment_proof`
attachment. Attachment and file carry the canonical customer provenance. File
metadata binds purpose, request ID, attachment kind/ID, source and `canonical: true`.
No message is created by this command.

## 7. Owner endpoint

`POST /api/client/service-requests/:id/payment-proof` requires an authenticated
owner session. Rate limit is `public-payment-proof`, 10 requests per 600 seconds.
Success returns committed request ID/status, safe document and customer workflow.

## 8. No bearer endpoint

There is intentionally no public-token upload/download equivalent and no generic
file-ID endpoint. Knowing a request number, organization or attachment does not
grant upload authority. FE-1C needs the owner's session.

## 9. Origin and preflight

Guards run in order: WebSessionGuard, WebMutationOriginGuard, then the bounded
PaymentProofServiceRequestUploadGuard. The latter checks positive PostgreSQL ID
bounds, owner, waiting state and invoice before Multer; its denial drains the
unparsed body. Existing session/origin guards are not globally refactored.

## 10. Multipart contract

Exactly one `file` and one required `expectedVersion` field. Version is an integer
1..2147483647. Existing hardened Multer limits remain: 20 MiB file, one file, one
field, 64 KiB field value, 64-byte field name, zero nesting, 50 header pairs and
three parts including Busboy's sentinel slot. Unknown/duplicate fields are rejected.

## 11. Strict content matrix

Allowed detected signatures: PDF (`.pdf`), JPEG (`.jpg/.jpeg`), PNG (`.png`), WebP
(`.webp`). Detected MIME, supplied non-generic MIME and extension must agree.
Missing MIME or `application/octet-stream` is accepted only with valid detected
content and a matching name. Empty, unknown, HTML, archives and executables disguised
as documents are rejected before persistence. Signature validation establishes
format, not authenticity, lack of malware, or bank payment. No antivirus is added.

## 12. Names

Browser filenames remain mandatory and are not relabelled to disguise mismatches.
Portable basename sanitation, control-character/length checks and the existing
storage filename normalization apply. Provider filenames, when present, have the
same strict extension requirement. Only absent provider names are generated from
detected bytes. Display names never become object keys.

## 13. Shared application service

Web controller and both bot workflows call the same application service. The old
channel attachment implementation is removed. The thin facade keeps channel callers
inside the ServiceRequests boundary. The helper covers only proof content/workflow
and download disposition, not a new general media framework.

## 14. Web ownership

The locked final row must match exact path ID and session user ID. Foreign and
missing requests return indistinguishable 404s. Owner changes invalidate an upload
before attachment activation; organization membership is not upload authority.

## 15. Channel ownership

The current platform/chat resolves an existing channel user. The locked request
must match that canonical user ID or its exact platform/chat binding, and retain its
initial canonical owner. Channel existence is rechecked in the final transaction.
No profile merging, identity linking API, or cross-organization inference is added.
Cross-channel race fixtures use explicit synthetic pre-existing bindings, not new
product functionality; unrelated channel users are rejected before storage.

## 16. ExpectedVersion

Web submits the owner projection's version. Telegram/MAX capture ID and version
before any provider download; after download no second latest-request lookup is
allowed. A stale upload returns 409 and the bots send a safe retry message, never
a false success. Row-lock state/version checks serialize uploads with admin commands.

## 17. Pending to active

Strict validation precedes `savePendingBuffer`. Final transaction locks the request
and pending StoredFile, verifies ownership/version/state/invoice plus file purpose,
request/source/provenance/status and physical existence, and only then activates it.

## 18. Attachment invariant

The transaction removes previous proof attachment links, creates one visible proof
attachment with customer provenance, changes the pointer and saves the request once.
The VersionColumn increments exactly once; the status remains `waiting_payment`.
Other attachment kinds are untouched.

## 19. Replacement

Replacement is an explicit new-version action even for identical bytes. Old links
and pointer remain intact until commit. Only after commit is a correctly bound old
proof logically deleted; its bytes follow the existing grace period. Cleanup errors
are safely logged without reversing or misreporting the committed command. An
unexpected old-file purpose/binding is not permission to retire an unrelated file.

## 20. Transactional side effects

The same manager records Event `payment_proof_attached` (actor `customer`), Audit
`service_request.payment_proof.upload`, activity and staff notification intent.
Event/Audit payload is only `{attachmentId,replaced,source}`. Web audit has customer
and web session IDs; bots have customer ID without a web session. Activity gains
an optional manager, preserving existing callers. No private text, filenames,
provider URLs/tokens, binary data or bank details enter Event/Audit/notification.
Existing CH-R2/SEC-R2 recipients, authorization and outbox are reused. The dedupe
key includes request, attachment and recipient identity. No direct send occurs.

## 21. No automatic paid

A canonical proof merely unlocks the permission/state/version-dependent FE-1B
confirmation action after refresh. The operator must verify actual receipt of money.
Uploading a generic chat attachment continues to leave that action blocked.

## 22. Owner read

Authenticated detail adds `documents.paymentProof` and `customerWorkflow`.
The latter has `expectedVersion` and proof allowed/replacement/reason fields.
Reason codes are `REQUEST_NOT_WAITING_PAYMENT` and `INVOICE_REQUIRED`; they are
not replaced by frontend guesses. Invoice projection is unchanged and not duplicated.

## 23. Owner download

`GET /api/client/service-requests/:id/payment-proof` serves only the current fully
bound active non-purged physically available proof. The row lock covers stream
opening versus replacement. Headers: attachment disposition with ASCII/RFC5987
names, detected Content-Type, Content-Length, `private, no-store`, `nosniff`.
Bytes are streamed; no arbitrary file ID/object key, public URL, inline or Range API.

## 24. Public-token privacy

Public detail omits proof attachments and owner document/workflow projections.
Both generic public and owner attachment routes reject proof kind, even when
customerVisible is true. Old bot proofs receive the same bearer restriction without
a backfill. Generic message/customer attachments preserve their existing behavior.
Legacy proofs lacking canonical metadata/provenance are unavailable from the new
owner route, not silently trusted; existing staff-scoped review remains unchanged.

## 25. Errors

400: invalid file/version/multipart. 401: no current web session. 403: missing or
foreign origin. 404: unknown/foreign request or absent/unavailable/misbound document.
409: state, invoice, version or staged binding conflict. 413: file size limit.
No successful command is converted into a failed response by a post-commit read.

## 26. Concurrency

Real PostgreSQL lock-barrier tests cover web/web, web/Telegram, Telegram/MAX, and
both winner orders of replacement versus manual confirmation. Exactly one command
at a given version succeeds; losing staged uploads become rejected, with no extra
canonical attachment/Event/Audit/activity/outbox. No random sleeps are used.

## 27. Crash cleanup

Pre-commit failure rejects the pending file and preserves the old canonical proof.
Audit/enqueue failure rolls back all domain side effects. Cleanup failure logs only
a fixed safe message and does not mask the original error. A process crash may
leave a pending file or a committed old unreferenced active file: existing FS-1
reconciliation and operator-applied cleanup remain the recovery path. There is no
new scheduler or claim of automatic crash-gap cleanup.

## 28. Lifecycle/FK retention

Current files are protected by existing request and attachment FKs discovered by
StoredFileReferenceInspector. After replacement those old references are released.
Metadata does not introduce a hidden file reference; no outbox file attachment or
proof message is created. Existing lifecycle/purge rules remain authoritative.

## 29. Migration decision

No migration is required: purpose, pointer, kind, provenance, statuses and version
already exist. No constraint, index, table, dependency, or lockfile change is intended.
The expected schema remains 11 applied migrations with no pending/drift.

## 30. FE-1C handoff

Backend state in this branch: BACKEND_AVAILABLE / UI_NOT_CONNECTED. FE-1C should
connect owner detail/workflow, versioned multipart upload/replacement, protected
download and visible conflicts. Bearer-only visitors cannot upload proof. Neither
client pages/buttons nor FE-1B layout/navigation are implemented in this package.

## 31. Exclusions

No OrderDocument changes, bank integration, OCR, automatic payment, receipts,
invoice revision system, global MIME migration, antivirus, public proof bearer,
new file purpose, general deduplication, new delivery worker, frontend redesign or
cross-messenger profile linking. CH-R1 replay suppression remains unchanged.

## 32. Acceptance and verification

Local acceptance: PASS on 2026-09-10. The package is ready for a **draft** PR,
not for automatic merge. Hosted checks must be green on the final immutable head;
the PR checks and final handoff report are authoritative for that external result.

| Check | Result |
|---|---|
| `npm ci` | Pass; no dependency or lockfile change |
| `npm run build`, `npm run ci:build` | Nest, admin and client production builds pass |
| `npm run ci:quality` | Config isolation guard, lint ratchet and all 283 unit tests / 37 suites pass |
| `npm run lint:baseline` | No new violations; existing debt 692 errors / 6 warnings in 64 files |
| `npm run lint:site`, admin TypeScript, frontend contract tests | Pass; 9 frontend contract tests |
| `npm run ci:database` | Migration replay/schema check, all 270 integration tests / 22 suites and 7 e2e tests / 2 suites pass |
| Focused proof unit tests | Policy 13; preparation/workflow/headers 8; pre-parser guards 8 |
| Direct messenger regression | Telegram 10; MAX 11; four new rejection/snapshot regressions |
| Focused PostgreSQL proof suite | 53 pass, including real lock barriers, rollback and lifecycle references |
| Characterization + proof | 70 pass across two suites |
| Route/security follow-up | Route ownership 1; security foundation 13; SEC-R1 resource protection 8, all pass |
| `migration:show`, `migration:test:show` | 11 applied in each isolated application/test DB, no pending migrations |
| `schema:log`, `schema:test:log` | Zero drift |
| `npm run ci:offline-smoke` | Health/bootstrap, client routes, admin login/logout and all 28 FE-1B browser checks pass |
| `npm run test:site` | Existing desktop/mobile client regression passes |
| Additional browser harness | Session, same-origin upload, version +1, owner projection/download bytes/private headers, waiting state, staff login and confirmation availability after reload pass; no page errors |
| Agent-browser visual check | Existing site renders with interactive navigation, no page errors; screenshot inspected |

Synthetic files, an isolated PostgreSQL 16 container on loopback port 55438, and an
OS-temporary FileStorage root were used. Polling, outbound worker, MAX token and
integration bridge were disabled. No live messenger/provider, user DB/storage,
real customer/payment data or production credentials were used. Temporary browser
servers were stopped; the user's existing review servers were not interrupted.

The initial content-policy test was red (12 failures, 1 pass), then green after
strict validation. Integration tests also caught a missed generic bearer download
restriction; the corrected private boundary and unchanged staff download now pass.
The legacy characterization fixture was updated for the new injected dependency.
Expected failure-injection log messages contain no file contents or provider URLs.

### Exact frontend bundle comparison

Same baseline sources, dependency lock and `NODE_ENV=test` as hosted CI; Vite
baseline-source comparison confirms byte equality, not merely similar sizes.

| Bundle | Baseline bytes | Branch bytes | Gzip bytes (both) | Identical |
|---|---:|---:|---:|---|
| `admin-ui/dist/admin.js` | 633510 | 633510 | 165313 | Yes |
| `admin-ui/dist/admin.css` | 35325 | 35325 | 6481 | Yes |
| `client-ui/dist/site.js` | 749501 | 749501 | 182955 | Yes |
| `client-ui/dist/site.css` | 64432 | 64432 | 13348 | Yes |

Vite's existing large-chunk warnings remain; no optimization/new chunks were added.
The original dirty worktree's lockfile remains untouched, with SHA-256
`DA7D210AA534FCCC784F308E64CE20D7816AAC84618F9C4CA519EA7C37710666`.

### Review surfaces

New bounded service/helper/upload guard, owner controller/DTO/module wiring, shared
channel facade and Telegram/MAX handlers; strict existing file purpose; optional
activity transaction manager; unit/integration/route/characterization regressions;
review seed signature adaptation. Documentation updates are this report, route
inventory, FS-1 lifecycle addendum, interface architecture gap and FE-1B limitation
addendum. No canonical project status/roadmap/audit status was rewritten as merged.

FE-1C handoff addendum (2026-09-10, implementation branch): the production client
detail now connects the dedicated proof upload/replacement/download controls to
the accepted owner workflow and expectedVersion contract. Generic attachments
remain ordinary; public proof is absent; paid remains a staff-only decision.
409/lost-response review and client/operator browser acceptance are covered in
[the FE-1C report](../frontend/2026-09-10-client-service-production-migration.md).
The projection builder accepts the authorized row/transaction manager so detail
version, status and proof workflow are one consistent snapshot; commands unchanged.

Historical P-PROOF boundaries: UI_NOT_CONNECTED until FE-1C; staff verifies actual money;
legacy incomplete proof provenance stays unavailable to owner download; crash gaps
use existing FS-1 reconciliation rather than a newly introduced scheduler. No EM-0,
bank/OCR/1C/EDO or OrderDocument work was started.
