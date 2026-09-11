# FE-REG-2 Client KKT registration and resume

## 1. Baseline

Implemented for draft review; this is not a merge or production-readiness claim.
The user approved the current cleanup-only main as the baseline:
`e66ca52d12bee506d3a84c6f04924e0bd40bdf08`.
Compared with the prompt's baseline, only the unused Telegram admin keyboard
was deleted. Main CI run `34571730274` passed all required jobs.
The original worktree and its runtime data remain untouched.
No dependencies, migrations, roles or registration statuses were added. Real
provider calls and production resources are prohibited for verification.

## 2. Existing gap and initial inventory

| Screen/action | Baseline API | Ownership | State | Concurrency gap | Change |
| --- | --- | --- | --- | --- | --- |
| Landing/start | POST registrations/start | Platform/chat | Draft | Existing per-chat advisory lock | Explicit shared session start, resume existing draft |
| Owned list | Absent | Exact web principal required | All owned statuses | Read snapshot | New capped 50-item projection |
| Detail/resume | GET :id/checklist | Platform/chat only | Any | Lazy checklist writes on GET | Coherent owner snapshot, no read mutations |
| Edit/save | POST registrations/form submits immediately | Platform/chat | Draft | No client precondition | Scoped PATCH, root lock and expectedUpdatedAt |
| Submit | Legacy finishReg | Implicit active draft | Draft to new | PDF produced before unguarded transition | Two short transactions with generation outside locks and fingerprint recheck |
| Provide value | POST :id/requirements/:kind/value | Platform/chat | Verified blocked only | No HTTP version | Exact owner, new/in_work, expectedRequirementVersion |
| Upload evidence | POST :id/requirements/:kind/evidence | Pre-Multer chat check | Verified blocked only | No expected version | Origin/owner/state preflight and locked version recheck |
| Download evidence | Absent for owner | Exact owner plus subject/file binding | Customer-visible only | Read snapshot | Protected download; no generated PDF access |
| Session lost | Generic boundary creates identity | New browser identity | Any | Separate bootstrap risk | Share FE-1C explicit single-flight transport |

## 3. Scope

The current-browser customer can discover registrations, resume a saved draft,
submit it and respond to staff readiness requests. The existing FE-REG-1 staff
workspace remains authoritative for verification and handoff. No account, login,
Organization authorization, new aggregate, FNS integration or registration PDF
download for customers is introduced. ServiceRequest backend and admin UI are
unchanged.

## 4. Identity/session boundary

Registration routes are outside the legacy automatic WebSessionBoundary. GET
session checks never create identity. Explicit start shares the same single-flight
session bootstrap with FE-1C via `client-ui/src/api/client-session.ts`; the service
API re-exports its original names. Registration hooks own session-loss handling;
the reused public shell does not replace their error with a service-request CTA.

Owner policy: `platform=web` and `userId=session.userId`; only legacy rows with
null userId may match the exact web chatId. Matching organization, membership,
INN, submitted display name or another messenger profile grants no access.
Foreign and absent IDs yield the same 404. No browser storage contains form data,
raw OFD, files or an application-owned access token.

## 5. Same-browser resume

Explicit start reuses the existing platform/chat draft and advisory lock. New
draft and all three requirements are now committed in one transaction, avoiding
a concurrent start returning a partially initialized checklist. Repeating start
does not reset fields or create duplicate initialization Audit. List/detail and
direct `/edit` routes reload from the server, not React memory. Dirty inputs are
not saved automatically; the save button states whether changes are unsaved.

## 6. No cross-device claim

Recovery depends on the existing browser session cookie. Its expiry, revocation
or deletion does not transfer ownership to a new session. Error copy explains
this and offers an explicit new-registration entry point, not a recovery promise.
No SMS/email authentication or Telegram/MAX linking was added.

## 7. Route map

| Route | Contract |
| --- | --- |
| `/site/cash-registration` | Intro, explicit start or existing-draft CTA |
| `/site/registrations` | Up to 50 current-owner records, newest first |
| `/site/registrations/:id/edit` | Saved draft and explicit conflict reconciliation |
| `/site/registrations/:id` | Read-only application, checklist, responses and evidence |
| `GET /api/client/registrations` | `{items,limit:50}` |
| `GET /api/client/registrations/:id` | Coherent owner projection |
| `POST /api/client/registrations/drafts` | Explicit create/resume, returns owner detail |
| `PATCH /api/client/registrations/:id/draft` | `{expectedUpdatedAt,values}` |
| `POST /api/client/registrations/:id/submit` | `{expectedUpdatedAt}` |
| `POST /api/client/registrations/:id/requirements/:kind/value` | `{value,expectedRequirementVersion}` |
| `POST /api/client/registrations/:id/requirements/:kind/evidence` | One file and mandatory expectedRequirementVersion |
| `GET /api/client/registrations/:id/evidence/:evidenceId` | Protected owner download |

Compatibility `/start`, `/answer`, `/form` remain guarded. They use canonical
save/submit rather than exposing legacy unguarded web finalization. `/answer`
keeps the equipment-photo skip convention; internal ClientWorkflowService and
Telegram/MAX handlers are not replaced. `/form` requires all three mandatory
fields on the server. Production React never calls one-shot `/form`.

## 8. Owner list/detail

List orders createdAt DESC then id DESC with a hard 50-record cap; the UI states
this limit and does not fake pagination or totals. Detail reads root, requirements,
current form, evidence and data requests in a REPEATABLE READ transaction. Root
ownership is checked before dependent reads. No lazy initialization, Audit write,
file repair or status change occurs on read. A missing/malformed checklist is
explicitly unavailable, never reconstructed by a GET. Unavailable form definitions
disable editing without erasing saved application values.

## 9. Form projection

Current registration_fields are projected to name/label/step/inputKind/required/
maxLength and availability, not raw entities. Only the 18 existing application
fields are editable; equipmentPhoto is excluded and handled as readiness evidence.
The existing required fields are orgName, innKpp and phoneToCall. Text limits are
1000 characters, bankReqs 10000; overlong input is rejected, never truncated.
Drafts may omit required values. Submit validates them again on the server.

## 10. Non-versioned form limitation

registration_fields is not a versioned aggregate. This UI deliberately uses the
current supported definition. Saved values survive an omitted/removed field and
form reload; no false immutable form-version guarantee is made. Submit fingerprints
the fields used to render its PDF and rejects an intervening definition change.
Versioned forms would require a separate package.

## 11. Draft save precondition

PATCH uses documented patch semantics: omitted keys are unchanged; explicit empty
or whitespace-only strings become null. Other strings are trimmed; null, arrays,
non-strings and unknown/protected keys are rejected. The UI sends all currently
displayed editable fields, including explicit empty strings.

The transaction locks the registration, checks owner/draft/no handoff and exact
ISO updatedAt, validates checklist/form and saves once with a compact Audit event.
updatedAt advances by at least one millisecond so two same-tick commands cannot
reuse a precondition. It is not advertised as a universal aggregate version.
A stale request returns 409. The editor preserves local inputs, fetches current
values and asks the user to reconcile before issuing a fresh command.

## 12. Submit/PDF concurrency

Phase A locks and validates draft, owner, updatedAt, required fields, checklist
and form; it takes a deterministic fingerprint. PDF rendering and existing
generated-pdf storage run outside the DB lock. Phase B locks the same root and
rechecks the snapshot, then attaches one current PDF, advances the legacy step,
sets new and transactionally records Audit plus existing durable staff text/file
intents. Readiness is preserved, not manually promoted.

No second current PDF or successful notification effect is created by a losing
submit. A stale/failed generated file is logically deleted using existing FS-1;
the prior file is retired only after successful attachment. Audit/notification
failure rolls back the domain update. A lost HTTP response is resolved by GET:
non-draft opens the existing detail, never a new draft or automatic resubmit.
No new outbox, idempotency table or exactly-once claim was added.

## 13. Requirement version concurrency

Web value and evidence mutations require a bounded integer version. Root lock,
owner/state and requirement version are rechecked before mutation. Only new and
in_work without handoff accept responses; verified/not_required reject them.
Each accepted response advances the existing requirement version and answers the
open request without verifying it. Bot internal calls retain their existing draft
photo behavior and do not acquire a new mandatory HTTP precondition.

PostgreSQL tests hold the root row, wait for actual pg_stat_activity lock waiters
and release competing customer/staff commands. Both lock orders are covered for
value/verify, evidence/verify and value/re-request. No process-local mutex substitutes
for DB concurrency. Staff verification needs a canonical value and source: after
receiving a photo, the operator reads it, enters the number and separately verifies.

## 14. Evidence lifecycle

Uses the existing registration-evidence purpose, StoredFile, FileStoragePort and
RegistrationEvidence relation: PDF/JPEG/PNG/WebP, 15 MiB, one multipart file plus
one version field. Current policy checks size/MIME/extension; FE-REG-2 does not
claim malware scanning or a new strict signature policy. File keys remain random,
never user filenames. Final attachment rechecks ownership, state, version and
StoredFile binding; losers are logically deleted through the existing lifecycle.

Download checks owner, exact registration/evidence relation, customer visibility,
not removed, active/nonpurged StoredFile, matching purpose/registration metadata
and physical existence. It opens storage without the old read-side missing-file
repair. Responses use private/no-store, nosniff, attachment disposition with UTF-8
filename and bounded streaming. No generic file URL or new generated-PDF permission.
Unknown upload outcome keeps the selected File in memory and re-reads; filename
matching is never treated as proof of successful upload. Explicit retry is enabled
only after fresh server data has been obtained and checked by the user.

## 15. Data-request semantics

Existing web request lifecycle is reused: publication on the site is not push
delivery, proof of reading or an external messenger send. Client sees safe request
text and lifecycle dates/status; internal delivery diagnostics and response tokens
are excluded. Actual value/evidence receipt answers the request. Re-request and
verification remain staff actions with their existing RBAC/preconditions.

## 16. Status/readiness/handoff semantics

Draft means not sent; new means sent for review; in_work means processing;
processed means internally handed to the engineer. Readiness remains an independent
server value. Neither a PDF, ready nor processed proves external FNS registration
or OFD activation. The handed-off customer view says this explicitly and has no
response/edit controls. No new status aliases are persisted.

## 17. OFD privacy

All customer projections mask the code (at most the final four characters), exclude
operator comments/staff identifiers/raw metadata and never expose a reveal API.
Unavailable or incorrectly bound StoredFile records expose neither a download nor
their original filename/MIME/size. The compatibility checklist read is also no-store.
An OFD input starts blank; a displayed mask is not prefilled or sent back as a code.
Success clears only the submitted input, preserving any other unsent input/File.
No raw code is written to URLs, browser storage, logs, screenshots or Audit metadata.

## 18. Security/origin

All eight registration web mutations require existing WebMutationOriginGuard.
Session, canonical decimal ID range 1..2147483647, kind, ownership and web state
are checked before Multer. Body validators run before any storage command.
The final locked command repeats authorization/preconditions. Read/download IDs
are bounded before Number/SQL; empty, signed, fractional, scientific and oversized
IDs fail safely. Permissions, roles and unrelated domain endpoints are unchanged.

## 19. Frontend architecture

Small registration feature modules separate API/types, keyed owner reads, list,
editor, detail, requirement response, evidence download and accessible form rendering.
One router, existing approved neutral public shell and lucide controls are reused.
Only session/error transport is shared with service; no new state/form/router library.
Legacy CashRegistrationPage and unused automatic registration helper are removed.

Active detail refreshes every 30 seconds while visible with non-overlap, capped
exponential backoff and abort on route/unmount. Terminal 400/401/403/404 and processed
stop automatic reads. Polling updates the projection without replacing unsent text
or File. Mutations are explicit and guarded against double click. Styling is scoped
to client registration and uses the approved neutral palette; no green theme.

## 20. Browser workflow

`scripts/client-registration-browser-smoke.cjs` is wired into hosted CI. Customer
and operator use independent cookies. The primary flow is driven by browser UI,
not SQL to emulate user actions: start, partial save/reload, required validation,
submit, owner list/detail, staff request, customer value/evidence, staff review,
ready and engineer handoff. SQL fixtures only provision staff/current field data
and simulate negative expiry/deleted-file conditions. Messenger adapter is fake
and its call count remains zero.

Additional checks cover lost submit/upload responses, retained input/File, two-tab
conflict, foreign identity, read-only processed, unavailable file, masked OFD,
direct URLs, Back/Forward, session loss and no silent bootstrap. Four viewport sizes
(1440x1000, 1280x800, 768x1024, 390x844) test long fields, keyboard focus and horizontal
overflow. Six synthetic screenshots are in [the evidence directory](screenshots/2026-09-11-fe-reg2/).
This is not a full screen-reader certification.

Real browser clock/transport tests additionally verify terminal 400/401/403/404,
visibility changes, slow single-flight reads, transient-error backoff and stopping
on processed. Once the current requirement becomes readonly, obsolete mutation
errors are no longer presented as unresolved work. Active-input conflicts still
retain their text/File and require explicit reconciliation.

## 21. Remaining limitations

- Current-browser cookie is the only web identity/recovery mechanism.
- Owner list is bounded at 50 and form definitions are not versioned.
- No autosave, malware scanner, OCR, client registration-PDF download or FNS/OFD integration.
- FS-1 cleanup/retention must still be operated; synchronous cleanup can fail without masking the original error.
- Read-time physical existence cannot prevent an external deletion after a stream has opened.
- Other client domains retain their previous UI/session behavior and are not redesigned here.

## 22. Verification

| Verification | Result |
| --- | --- |
| Unit / bot / characterization / config | 357 tests, 41 suites |
| PostgreSQL integration / security / file / workflow | 406 tests, 24 suites; includes 64 new registration cases |
| E2E | 7 tests, 2 suites |
| Frontend contracts | 46: admin 9, admin registration 10, client service 15, client registration 12 |
| Existing browser suites | 28 admin shell/service + 29 client service + 27 admin registration |
| New client/operator browser suite | 22 checks; 106 browser checks in total |
| Production builds | NestJS, admin, client passed; both TypeScript projects checked |
| Offline bootstrap / health / built UI | Passed with synthetic fixtures and disabled messengers |
| Vite and site smoke | Passed; explicit draft save/reload/list/Back additionally checked through Vite |
| Migration and schema checks | 11 existing migrations, none pending, zero schema drift on isolated application/test databases |
| Lint | Site lint clean; ratchet unchanged: 684 errors, 6 warnings, 63 files |

The PostgreSQL barrier tests observe `pg_blocking_pids`, not truncated SQL strings
from `pg_stat_activity`; commands are drained before database reset. Both lock
orders are verified for customer value/evidence versus staff verification and
customer value versus re-request. Failure-injection logs contain synthetic errors.

Production bundles are measured with the same normal build environment (not a
test-mode React development bundle). Admin JS/CSS are byte-identical to baseline.

| Asset | Baseline bytes | Final bytes | Delta | Percent |
| --- | ---: | ---: | ---: | ---: |
| admin.js | 360908 | 360908 | 0 | 0% |
| admin.css | 40568 | 40568 | 0 | 0% |
| site.js | 418297 | 439112 | +20815 | +4.98% |
| site.css | 79501 | 83046 | +3545 | +4.46% |

The lockfile remains unchanged, SHA-256
`E9BFAFF22F0DE711E8089F60C0FC1DEBF476423CEA3042A0C53B7EFBED5E27C4`.

Local review used `vitma-fe-reg2-postgres` on loopback 55443, separate
`vitma_fe_reg2_test` and `vitma_fe_reg2_review_test` databases/storage roots.
Built API/admin was checked on loopback 3015; Vite client on loopback 5186 with
that origin explicitly allowed only in the review process environment. These
temporary servers are stopped after verification; the user's main servers remain
untouched. No public rollout is implied by these review URLs.

Review credentials are generated at runtime, not source literals. The local
manual review account is `fe-reg2-review`; its credential is protected by Windows
DPAPI in `%LOCALAPPDATA%/VitmaMarket/fe-reg2-review-20260911.clixml`, outside Git.
On the same Windows account, copy the password without printing it:

```powershell
(Import-Clixml (Join-Path $env:LOCALAPPDATA 'VitmaMarket/fe-reg2-review-20260911.clixml')).GetNetworkCredential().Password | Set-Clipboard
```

Browser automation uses separate per-run credentials, directly in its isolated
browser contexts. Exact commit SHAs, hosted CI run and GitGuardian results are
recorded in the draft PR verification comment, avoiding a self-referential commit.

## 23. Acceptance verdict

Local acceptance passes. Deliverable remains a **draft PR only**, not a merge,
deployment or approval to use production resources. The exact final HEAD must pass
hosted Quality, Production builds, PostgreSQL/tests/offline smoke and GitGuardian
before handing off; their authoritative status is attached to the PR. Historical
roadmap state is not advanced to merged.
