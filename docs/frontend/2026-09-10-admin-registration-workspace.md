# FE-REG-1: Admin KKT registration workspace

Implemented on `codex/fe-reg-1-admin-registration-workspace` for draft PR review, **not merged**. Hosted evidence for the final commit is recorded in that PR's checks and verification comment. This is not a public-production rollout approval.

## Baseline and initial inventory

- Baseline: `44b1f5657b28eae992ac148f5633ca2ec69930ae`, green hosted run `34461252193`.
- Separate worktree: `learn-bot-fe-reg1`. User worktree and FE-1C preview are untouched.
- Actual router and legacy adapter reside in `admin-ui/src/app/AdminApp.tsx` and `admin-ui/src/legacy/LegacyAdminSections.tsx`; there is no separate LegacyRouteAdapter file.
- Registration status: draft/new/in_work/processed. Readiness: incomplete/awaiting_customer/awaiting_verification/ready.
- Requirements: kkt_serial/fiscal_drive_serial/ofd_code; missing/requested/provided/verified/not_required.
- No Registration VersionColumn. Requirement versions already exist. Handoff is internal transfer, not an FNS result; PDF is not a prerequisite for handoff.

| Screen/action | Existing endpoint | Permission/scope | Domain/transaction baseline | Required change |
| --- | --- | --- | --- | --- |
| Queue | GET registrations | read OR read.assigned | Array capped at 100; status all excludes drafts | Authorized SQL pagination and minimal DTO |
| Detail | GET registrations/:id | read OR assigned | Lazy checklist initialization, raw entities | Authorized read-only snapshot, masked whitelist |
| Value / verify / exemption | POST provide-value, verify, not-required | update | Root and requirement locks; no stale precondition | Check displayed requirement version, safe response |
| Request / re-request | POST request-data, re-request | update | Existing request reuse; re-request has two transactions | One manager-aware change, delivery after commit |
| OFD mode | POST ofd-mode | update | Existing applicability/reason rules | Expected mode/version, explicit reason |
| Equipment kit | POST equipment-kit | update | Kit read outside lock, stale verifier retained | Root/requirements/kit lock, reset verification, safe options |
| Evidence | POST link-evidence, evidence/:evidenceId/remove | update | Inconsistent lock order/version updates | Root first, binding/version preconditions |
| PDF | POST final-pdf; GET :id/pdf | update; scoped read | Long generation followed by stale entity save | Snapshot/recheck attachment; prior PDF retained on failure |
| Handoff | POST handoff | update | Existing readiness gate and atomic CH-R2 hook | Relevant versions/root preconditions, same domain gate |
| Operator state | POST operator-state | update | Unlocked partial update; processed rejected | Locked expected status/priority, atomic Audit |
| Evidence file | GET registration-evidence/:id/file | read OR assigned | Scoped lookup and FilesService | Preserve active binding/streaming/private response |

## Routes and interface

The existing BrowserRouter, session boundary, sidebar/mobile drawer and approved FE-1B primitives remain the only admin shell. The former registration components and their unused helpers are removed from `LegacyAdminSections.tsx`. Tickets, equipment, organizations, integrations and staff stay there unchanged.

| Production route | Behavior |
| --- | --- |
| `/admin/requests/registrations` | SQL-backed queue, filters/page/limit in URL |
| `/admin/requests/registrations/:id?tab=readiness` | Direct, authorized detail; default tab |
| `?tab=application` | Read-only existing questionnaire fields, grouped by purpose |
| `?tab=documents` | Protected evidence downloads, current PDF and final-PDF command |
| `?tab=history` | Actual data requests and bounded, related Audit facts |

The Nest HTML route is exact; it does not catch `/admin/api/**`. Old `?status=all&selected=123` links redirect to the detail while preserving the queue URL. The historical UI `closed` alias becomes `processed` only in the browser query adapter. The API rejects `closed`. Staff customer-card links now target the detail route directly.

Queue defaults: `status=new`, `page=1`, `limit=25`. Allowed page range is 1..100000, limit 1..100; UI choices are 25/50/100. Status, platform, priority and readiness filters plus assigned scope are applied in SQL before count/offset/limit. `all` includes new/in_work/processed, not customer drafts. Sorting is createdAt DESC, id DESC. Domain/channel array-returning helpers remain compatible; the administrative HTTP response is now `{items,page,limit,total,hasNext}`.

The header separates processing status, readiness, internal handoff, engineer and PDF classification. Requirement cards separate value, source, verification facts and evidence. Frequent value/check actions are visible; less frequent actions use a disclosure. There is no local readiness algorithm, fake search, second sidebar or green styling. New CSS uses scoped `.reg-*` selectors and approved neutral tokens.

## Canonical meaning

No status, requirement kind, OFD mode or aggregate was added. Manual values and kit imports are `provided`, never automatically `verified`. A photo is evidence, not a canonical verified number. Verified values retain neither the previous verifier nor verification date after a relevant edit. Removing or adding a linked proof invalidates a verification where applicable and advances the requirement version even if the canonical value is unchanged.

`ready` means applicable data has been checked. `processed` and `handedOffAt` record the existing internal handoff, not successful external FNS registration. Changes after handoff can lower readiness without erasing the historical handoff fact; this existing distinction is intentionally visible. Final PDF existence does not imply current readiness and is not required for handoff. Repeat handoff preserves the existing no-op rule and does not reassign an engineer.

An explicit reason is required for not_required/not_applicable; the UI does not supply a default exemption. The existing backend permits a staff exemption with a reason and does not encode additional legal cases. FE-REG-1 does not invent them. For purchase_from_vitma, the code remains VITMA's responsibility; the admin request/re-request policy blocks asking the customer to procure it. Receiving and verifying the code remain separate actions.

## Read projection and authorization

`RegistrationAdminReadService` builds queue/detail/options/reveal DTOs inside read-only REPEATABLE READ transactions. It reads current staff roles, authorizes the root registration, and only then reads related rows. Detail never calls `initializeIfMissing()`. Missing checklists stay incomplete and readiness-dependent actions are blocked; no GET/backfill/Audit writes are introduced. The existing client checklist read now checks ownership before its legacy lazy initialization, closing the same demonstrated ordering gap without changing client UI/resume contracts.

- `registrations.read` authorizes full reads; `registrations.read.assigned` authorizes exact assigned objects; their existing union is preserved.
- `registrations.update` is required for commands and options, with a live permission check again under the command lock. No role-name shortcuts or new permission exist.
- Assigned engineers receive no mutations or options request from the interface. Their detail, PDF, evidence, history and OFD reveal have the same object scope. Foreign and missing objects produce safe 404; sales has no Registration access.
- Disabled accounts fail the session check. A revoked assignment fails the next read. Failed reads clear the old detail; 401/403 go through the existing session boundary.
- Normal DTOs expose selected fields, safe `{id,displayName}` staff identities and context-bound download URLs, not TypeORM entities. No responseToken, objectKey, raw file metadata, staff credentials/bindings or arbitrary Audit metadata are returned. All command responses use the same safe detail builder.
- `/admin/api/registrations/:id/options` returns at most 100 available kits (safe model/KKT/FN fields) and 100 active eligible engineers (id/displayName), without broad Assets/Staff permission or directory requests.

## Actions and preconditions

The small `registration-admin-policy.ts` module supplies action ID, allowed, safe reasonCode/reason, input field requirements, action-specific precondition, and a nullable primary action. The command path calls the same policy under lock, then existing domain validation. Permission-absent actions are omitted; blocked actions explain their prerequisites. Primary action is null rather than guessing an operator's decision.

All commands keep the existing POST routes under `/admin/api/registrations/:id/`. Required common preconditions are `expectedStatus` and nullable `expectedHandedOffAt`; neither raw OFD values nor a fabricated Registration.version appear in them.

| Command | Additional checked precondition | Input |
| --- | --- | --- |
| provide-value / verify / request-data / re-request / not-required | expectedRequirementVersion for supplied kind | Existing value/source, comment, request text or explicit reason |
| link-evidence | expectedRequirementVersion for destination kind; active same-registration source checked under lock | evidenceId |
| evidence/:evidenceId/remove | versions of all three bounded requirements; current binding/removedAt checked | Evidence ID in route |
| ofd-mode | all requirement versions, expectedOfdMode | mode; explicit reason for not_applicable |
| equipment-kit | all requirement versions, expectedOfdMode, expectedKitId | kitId |
| final-pdf | all requirement versions, expectedOfdMode, expectedKitId, expectedPdfFileId | No questionnaire replacement |
| handoff | all requirement versions, expectedOfdMode, expectedEngineerId | Optional eligible engineerId under current contract |
| operator-state | expectedPriority | Optional priority and existing new/in_work processing state |

Missing/malformed preconditions fail 400; mismatched snapshots fail 409. Versions are compared while the registration and relevant requirement rows are locked. Multi-requirement guards are deliberately conservative (at most three versions), so an unrelated requirement edit may require review. No updatedAt-as-version claim or migration is made.

Lock order is root registration, requirements, then evidence/kit/request. Customer value/evidence writers also take the root lock first and advance the real requirement version. Kit availability and serial/code values come from its locked DB row, not a browser snapshot; two registrations cannot claim the same available kit through this workflow. Two unused legacy unguarded AdminService mutators were removed; controller commands no longer expose raw-update alternatives. Existing array read helpers and channel method signatures remain.

The frontend captures a precondition when opening a form. Refresh never silently replaces that snapshot. A 409 or unknown network outcome preserves input, refreshes the card, and disables resubmission until explicit review. An OFD verification conflict requires closing the dialog and checking the newly revealed code. No mutation is automatically retried or treated as locally successful. Switching IDs unmounts the previous dialog and aborts/ignores old reads.

## OFD privacy

Normal detail and mutation responses contain a constant mask plus hasValue, never the activation code. List/options have no activation code. `GET /admin/api/registrations/:id/ofd-value` performs the same current-role/assigned-root authorization and returns only `{value}`, with `Cache-Control: private, no-store`. Reveal is requested only on explicit interaction and cleared on closing the tab/card, changing ID/version, refresh or 401/403. No browser storage, URL/query/state or log records the code.

The authorized final PDF can contain the code as part of the existing document contract. This is an explicit protected download, not a public URL or normal JSON projection. Screenshots use masked synthetic codes.

## Documents and delivery

- Existing protected routes remain `GET /admin/api/registrations/:id/pdf` and `GET /admin/api/registration-evidence/:id/file`. FilesService enforces active storage state; evidence must retain an active binding. Downloads use canonical MIME/size, attachment disposition, private/no-store and nosniff. The shared stream helper now sets Content-Length and closes interrupted/error streams safely.
- PDF classification uses only trusted `draft`/`final` metadata; unknown documents remain labelled "Document". Filename/readiness does not classify them. A missing file is an unavailable document, not a successful download.
- Final PDF: take a locked ready snapshot, generate outside the transaction, save with the existing generated-pdf purpose, then lock/recheck readiness, requirements, root snapshot and current pointer before partial attachment plus Audit. A stale result receives 409 and the new file is logically retired; the previous pointer/file survives. The complete old Registration entity is never saved over newer data.
- A content/snapshot hash in safe file metadata allows an unchanged final-PDF repeat to return the existing result. No new version table or file lifecycle is created. Process-crash leftovers remain subject to existing FS-1 reconciliation; failed retirement logs a constant safe warning without masking the original error.
- Evidence removal unlinks that domain relation, not the physical file. Other requirement links stay active. Linking unavailable StoredFiles is rejected.
- Re-request revocation, requirement transition, request reuse/creation and manager-aware Audit are now one transaction. Provider calls happen after commit. A failed delivery is shown honestly; explicit retry reuses its request. Delivery completion conditionally updates only an open request and cannot overwrite a concurrently answered/closed state.
- Web "delivered" means published to the existing current-browser registration scenario, not email/SMS/push. Registration discovery/resume after reload remains deferred. There is no new outbox or exactly-once delivery guarantee; a crash during direct request delivery still has the existing ambiguous-outcome window.

## History

The detail contains up to 100 stored, allowlisted Audit facts related by root/requirement/evidence/data-request IDs, with safe labels, actor category, result and stored dates. Verification cards separately show the verifier's safe name/date. Requests expose their actual delivery/answer/closure states. No browser call to global Audit, no new RegistrationEvent table, and no claim of a complete historical chat timeline are made. Registration read permission does not become audit.read.

## Supporting backend changes

| Addition/change | Specific gap addressed |
| --- | --- |
| Administrative DTO/read/policy/command services | Bounded authorized queue, safe projection, authoritative actions and stale form guards |
| Existing readiness methods accept optional command context | Web admin version protection without changing Telegram/MAX method contracts |
| Consistent root-first evidence writes and explicit version advancement | Prevent verification of a stale value/proof set; remove stale verifier facts |
| Locked kit availability and imports | Prevent concurrent double link and importing old verified state |
| Atomic re-request and conditional post-delivery update | Prevent half-revoked checks or lost concurrent customer answers |
| PDF snapshot/recheck/partial pointer update | Prevent outdated document attachment or overwriting current root fields |
| Scoped no-store code/options reads | Explicit access without leaking all kit codes or widening Staff/Assets scope |
| Auth before legacy client lazy read | Prevent foreign GET from initializing requirements/Audit |
| Remove unused raw AdminService registration mutators | Prevent retaining an alternative unsafe registration write path |

No dependency, lockfile, entity, migration, new role, provider integration or general infrastructure change. Existing CH-R2 doReg/handoff transaction/enqueue tests pass, including rollback when enqueue or Audit fails. Other ServiceRequest, Ticket, Order, catalog and integration behavior is covered by the unchanged regression suites.

## Verification

Local checks use isolated PostgreSQL 16, application/test DBs, an OS-temp file root, fake messengers, synthetic staff/documents and runtime-only credentials. The existing user DB, FE-1C preview and original worktree are untouched.

| Check | Result |
| --- | --- |
| npm ci / config validation | Passed; unchanged dependency manifests and locks |
| ci:quality | 306 unit / 39 suites; baseline 290 / 38 |
| New policy unit tests | 14 |
| ci:database | 302 integration / 23 suites; baseline 277 / 22 |
| New PostgreSQL HTTP/workspace suite | 25, including controlled lock barriers |
| e2e | 7 / 2 suites, unchanged |
| Frontend contracts | 9 existing admin + 10 registration + 15 existing client = 34 |
| Existing offline browser workflows | 28 admin + 29 client = 57, preserved |
| Registration browser workflow | 27 checks in a separate CI step; total browser checks: 84 |
| Builds / admin and client typechecks / lint:site / test:site | Passed |
| Application and test DB migration/schema checks | 11 applied each, 0 pending, 0 drift |
| Lint ratchet | Passed; unchanged actual debt: 692 errors / 6 warnings / 64 files; baseline not weakened |

The new PostgreSQL cases cover all readiness/requirement states, role union/revocation, unauthorized reads without lazy writes, masked normal/mutation projections, explicit exemptions, stale value edits, verification/re-request, evidence removal/verification, kit contention, handoff/edit and generation/edit races, Audit rollback, provider-call transaction boundaries, late delivery versus answer, repeat handoff/PDF and protected files. Controlled barriers wait on real row locks or explicit deferred generation gates, not arbitrary sleeps.

The browser workflow uses separate operator/assigned engineer/foreign engineer/sales cookies. The primary journey uses real customer/domain commands and UI commands, not SQL ready/processed updates. Negative assignment/account revocation is deliberately simulated in the isolated DB. It also checks two-window stale input, unknown network outcome, failed delivery/retry, linking/unlinking, missing files, explicit reasons, URL compatibility, Back/Forward, keyboard/focus and four viewport sizes. It does not claim a full screen-reader audit.

Committed screenshots (synthetic data, masked OFD):

- [Queue, desktop](screenshots/2026-09-10-fe-reg1/registration-queue-desktop.png)
- [Readiness, desktop](screenshots/2026-09-10-fe-reg1/registration-readiness-desktop.png)
- [Documents, desktop](screenshots/2026-09-10-fe-reg1/registration-documents-desktop.png)
- [Detail, mobile](screenshots/2026-09-10-fe-reg1/registration-detail-mobile.png)

## Bundle comparison

Both revisions were installed from the same unchanged lock and built with Node 22.20.0 and `NODE_ENV=production`. This avoids absolute JSX development-source paths affecting test-mode byte comparisons across different worktree directory names.

| Asset | Baseline bytes | FE-REG-1 bytes | Delta |
| --- | ---: | ---: | ---: |
| admin.js | 336012 | 360908 | +24896 |
| admin.css | 35325 | 40568 | +5243 |
| site.js | 418297 | 418297 | 0, identical SHA-256 |
| site.css | 79501 | 79501 | 0, identical SHA-256 |

No bundle-optimization package was started. The normal CI-equivalent test-environment builds were run as well.

## Review and remaining limitations

A subsequent hosted run exposed an unchanged client keyboard-test synchronization gap: after clicking Overview, the test could issue ArrowRight before that tab transition committed, then observe the previous Messages selection. The test now waits for Overview to be selected before exercising the keyboard transition. The existing assertions/check count and client application/bundle are unchanged; no timing sleeps or automatic test retries were added.

The initial hosted browser run also exposed an initialization-order issue in the new smoke script: CI starts with built UI disabled, and Nest validates configuration at module import time. The script now enables built UI before importing AppModule and explicitly checks the route's HTTP status before login; it is rerun with the initial CI value disabled. No application serving defaults were changed.

Hosted CI follow-up: the first run exposed a pre-existing random-password fixture failure in the P-PROOF Audit-rollback test. Base64url output does not guarantee three character groups. A test-only generator now validates runtime candidates with the actual password policy, including login exclusion, and retries with a bounded limit. The P-PROOF operator fixture and new Registration fixtures use it; no application password policy or payment-proof behavior changed. GitGuardian incident 37171012 flagged the original Registration fixture's random-password template expression, not a usable committed credential. Its historical occurrence still requires false-positive triage; no published history or check policy was rewritten.

The optional synthetic server `scripts/registration-browser-smoke.cjs --review` requires NODE_ENV=test, a named test DB, disabled polling/workers and an externally supplied `FE_REG1_REVIEW_PASSWORD` (at least 16 characters). Never place a password in a tracked file, command line, PR or screenshot. Locally the persistent admin credential is stored using Windows DPAPI and retrieved through the existing local admin helper; it is not a production bootstrap or shared hardcoded password. The review URL is loopback port 3013, separate from the pre-existing 3011 preview. Provider adapters are fake even in review mode.

The package meets the bounded Registration workspace contract for draft review, subject to green checks on the exact PR head. It does not authorize merge/public rollout. Remaining limits:

- No customer registration list/resume, cross-device identity or client redesign.
- No FNS/partner-cabinet actions or new legal/business exemptions.
- No reassign-after-handoff lifecycle; optional engineer/no-op behavior remains canonical.
- No global exactly-once deduplication/retry infrastructure for direct data-request messages or generic administrative commands. Conflicts require explicit review.
- Bounded history/options, no full-text search or complete historical reconstruction/backfill.
- A trusted old final PDF is a historical document, not proof that subsequently changed requirements remain ready. Physical availability is confirmed on protected download.
- No new permissions/global Audit or Staff access, aggregate/workflow, migrations, FilePurpose, S3, antivirus, ServiceRequest/Order redesign, Catalog/Support/EM-0/1C/EDO work or real provider/production-data use.

PR remains draft. The next package is not started.
