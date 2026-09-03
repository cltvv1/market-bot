# FE-1B Production admin shell and ServiceRequest workspace

Status: implemented in `codex/fe-1b-admin-shell-service-workspace`, for draft PR review.
Not merged, not a deployment, and not a change to PSR-1 readiness grades.

## 1. Baseline

- Exact baseline: `af143a00f65b298b7170e2bda4f33afcd0083c34`, PR #26 merge.
- [Baseline CI 33720610438](https://github.com/cltvv1/market-bot/actions/runs/33720610438):
  Quality, Production builds, PostgreSQL/tests/offline smoke passed, including the frontend reference step.
- Dedicated worktree: `C:\CODING\learn-bot-fe1b`.
- The original worktree's unrelated edits were not moved, reset, stashed or committed.
- Original `C:\CODING\learn-bot\package-lock.json` SHA-256 remains
  `DA7D210AA534FCCC784F308E64CE20D7816AAC84618F9C4CA519EA7C37710666`.

## 2. Approved FE-1A direction

The product owner's 2026-09-03 approval is preserved: quiet white/graphite/taupe
workspace, restrained typography, persistent sidebar, queue-to-detail navigation,
four detail tabs, and a dedicated payment stage. Approval screenshots remain intact.
No green tokens were introduced in the promoted shell or ServiceRequest slice.
The legacy interiors may still contain their previous green styling.

## 3. FE-1B scope

Production admin shell/router, bounded ServiceRequest read/command contracts,
real operator forms, isolated legacy screens, and regression coverage. No client
production redesign, dependency upgrade, schema expansion or new business scenario.

## 4. Production router

One `BrowserRouter` with `/admin` basename; the root chooses the first permitted
implemented section. Owned routes:

| Group | Paths relative to `/admin` |
|---|---|
| Work | `/work` |
| Requests | `/requests/service`, `/requests/service/:id`, `/requests/registrations`, `/requests/tickets` |
| Customers | `/customers/access`, `/customers/organizations`, `/customers/equipment` |
| Integrations | `/integrations/signals`, `/integrations/runs` |
| Settings | `/settings/staff`, `/settings/notifications`, `/settings/audit` |

Nest serves built HTML only at these owned paths. Unknown paths, `/admin/api/*`,
assets, health and file routes do not fall through to React HTML. The obsolete
catch-all was removed; old invented nested registration URLs are not aliases.

## 5. Production shell

`app/AdminApp.tsx` owns routes, sidebar, utility bar and mobile drawer.
`app/session.tsx` owns cookie authentication, login/logout and session state.
Login preserves the requested route and browser password-manager autocomplete.
401 clears private UI and requests login. 403 refreshes the principal without
an unmount/refetch loop; denied data is cleared and a safe state is displayed.
There is no duplicate login, top bar, horizontal global tab strip or business localStorage.

## 6. Permission navigation

Navigation uses current `admin.permissions`, not role-name shortcuts. Groups with
no permitted entries disappear. Orders, Catalog, Support and Knowledge are
non-focusable unavailable labels, not links or endpoints that fetch hidden data.
Engineer retains assigned-only read access and no operator commands. Sales has
no ServiceRequest workspace. Superadmin still obeys version/state/object rules.
Personal notifications reuse existing endpoints, without a new notification package.

## 7. Legacy compatibility

The former 2,233-line `App.tsx` is removed. Its remaining domain screens live in
`legacy/LegacyAdminSections.tsx`, reached through a route adapter. Authentication,
global navigation and ServiceRequest UI are no longer duplicated there.
Registration, tickets, signals, organization access, organizations, kits, integration
runs, staff and audit keep their existing contracts and mutations. Customer-card
links navigate through the shared router, including the production service detail.
Styles are scoped under `.legacy-admin-root`; new select styles explicitly exclude
legacy controls. An inherited blank organizations state now displays empty/error
feedback. This is compatibility work, not a redesign of those screens.

## 8. Service queue contract

`GET /admin/api/service-requests` accepts canonical `status` plus `active|all`,
`platform`, `priority`, `scope=all|mine|unassigned`, `responsibleStaffId`, `page`, `limit`.
Default is active, page 1, limit 25; maximum limit 100. Active excludes draft,
completed, closed and cancelled. Mine matches acting operator or assigned engineer;
unassigned requires neither. Explicit filters never expand an assigned-only scope.
Response: `{ items, page, limit, total, hasNext }`. Sorting is `createdAt DESC, id DESC`.
Filtering/pagination happen in SQL, not by filtering a previously downloaded list.

Rows project request identity/type/state/priority, safe contact/organization/equipment,
timestamps, document-presence flags and bounded `{id, displayName, isActive}` staff.
No password hashes, sessions, messenger IDs, public tokens or StoredFile object keys.
The responsible-ID filter is numeric; no global employee directory was exposed.

## 9. Service detail contract

`GET /admin/api/service-requests/:id` returns `{request,messages,attachments,
documents,events,deliveries,workflow}`. Assigned-only foreign and nonexistent IDs
both produce the same 404 response. Message authors and event staff identities
use a bounded lookup, not a global staff list. Event payloads and raw audit metadata
are not serialized. Customer-visible and internal messages remain distinct.
Detail history is still a full per-request history; history pagination is deferred.

## 10. Authoritative workflow actions

`service-request-admin-policy.ts` shares canonical transition checks from
`service-request-status.ts` with command authorization. The frontend renders
`{id,allowed,reasonCode,reason,targetStatus,expectedVersion}`, not its own state machine.
Permissions absent: action omitted. Business prerequisite absent: disabled action
with stable safe reason (`PAYMENT_PROOF_REQUIRED`, `INVOICE_REQUIRED`,
`REQUEST_ALREADY_TERMINAL`, `REQUEST_NOT_READY`, `CURRENT_STATUS_NOT_SUPPORTED`,
`ENGINEER_REQUIRED`).

Actions: `assign_engineer`, `update_operator_state`, `send_customer_message`,
`add_internal_note`, `submit_request`, `mark_review_required`, `request_clarification`,
`mark_invoice_required`, `upload_invoice`, `replace_invoice`, `confirm_payment`,
`schedule_visit`, `reschedule_visit`, `start_work`, `complete_work`, `close_request`,
`cancel_request`.

Primary actions are upload at invoice_required, confirm at waiting_payment,
start at scheduled, complete at in_progress and close at completed. Other stages
may have no primary action. Generic transitions cannot bypass invoice upload or scheduling.

## 11. ExpectedVersion

Transition, assignment, operator fields, invoice upload/replacement and scheduling
require integer `expectedVersion` in 1..2147483647. Commands load the aggregate
with `pessimistic_write` inside a transaction, compare exactly, and save once.
Stale input returns 409 with no secondary effect. Same engineer/unchanged operator
fields/unchanged visit are no-ops without another version/event/audit.
Append-only messages use a row lock and current state check without requiring a version.

On 409 the interface refreshes authoritative data, keeps the current tab and the
unsaved form text, disables resubmission of that stale form and asks the operator
to reopen the action. It never silently repeats a mutation or shows fake success.

## 12. Real command behavior

Manual create uses safe active types, phone/admin source, contact, phone and description.
It creates a draft, then supports explicit submission. Assignment accepts an active
engineer and records the acting operator. Priority/comment are versioned.
Customer messages preserve delivery intent; internal notes never enqueue customer delivery.
Closed/cancelled customer messages are blocked; internal notes remain available.
Payment, visits, start, complete, close and cancel follow server-projected actions.
Native local date/time is converted to absolute ISO before submission; internal
visit comments are not included in customer notifications.

## 13. File/invoice behavior

PDF invoice upload has a 15 MiB purpose limit, server MIME/extension/signature
validation, one bounded version form field, pending StoredFile staging and
transactional activation/linking. A failed/stale/denied command rejects the staged
file through the existing lifecycle; it does not leave an intentionally active orphan.
Cleanup errors are logged without replacing the original command error.

Replacing a waiting-payment invoice atomically changes the canonical file reference,
retains the old attachment as staff-only history and enqueues the new invoice intent.
Existing invoice behavior retains files referenced by history/delivery; it does not
have an invoice-revision aggregate or an old-invoice logical-delete rule. FE-1B
preserves that retention policy rather than deleting a file still referenced by
durable delivery. Automatic retirement of obsolete delivery/file references is deferred.
This differs from payment-proof replacement, which has its own existing deletion policy.

Document rows contain safe name, MIME, size, timestamp, visibility, availability,
reason and protected download URL. Missing/deleted/purged/storage-missing files
have no link. Canonical invoice/proof/signed-consent root references support legacy
rows without an attachment entry; generated consent is available through its existing
attachment. No public object key/provider URL is promoted into a permanent link.

## 14. Payment-proof limitation

Only canonical `paymentProofFileId` enables confirmation, subject to permission,
waiting_payment state and exact version. Its presence never automatically marks paid.
The operator must independently verify actual receipt of money. A generic web message
attachment is not canonical proof and does not enable payment confirmation.
P-PROOF customer upload remains a separate package; FE-1B adds no customer endpoint.

## 15. Event/Audit transaction

Migrated mutations, ServiceRequestEvent, applicable CH-R2 OutboundDelivery intent
and AuditEvent share the transaction. Manual create is now atomic with event/audit.
The controller no longer duplicates these audit writes. Existing action names are
preserved: manual.create, message.add, status.transition, engineer.assign,
invoice.upload, visit.schedule, operator_state.update under `service_request`.
Audit metadata excludes comments, message text, snapshots, tokens and file paths.
No provider call occurs in a transaction. Delivery workers remain disabled for review.

## 16. URL/history behavior

Filters and pagination use search parameters. Detail ID is a path parameter;
request/messages/documents/history tabs use `tab`. Queue context is passed through
router history and the selected row regains focus on return. Direct entry has a
safe queue fallback. Late aborted reads cannot flash a previous request's data.

## 17. Accessibility

Semantic navigation, main/skip target, headings, labelled fields, buttons and file
links; roving keyboard tabs with Left/Right/Home/End; native modal dialogs with
focus containment, Escape and restoration; no focusable disabled navigation labels.
Mutation buttons have synchronous double-submit guards. Failed forms retain values.
The mobile drawer locks page scroll, closes on navigation and restores the trigger.

## 18. Responsive verification

CI Chromium checked 1440x1000, 1280x900, 768x1024 and 390x844 without horizontal
page overflow in service detail. The in-app browser additionally inspected queue,
payment stage and legacy registrations. The capture tool emits a cropped raster
of 1425x990 for desktop and 375x812 for the 390x844 viewport; dimensions were checked
from the DOM separately. Screenshot pixels were only converted from JPEG to PNG,
without resizing, retouching or replacing UI content.

Screenshots under `screenshots/2026-09-03-fe1b/`:

- `admin-service-queue-production-desktop.png`
- `admin-service-detail-payment-desktop.png`
- `admin-service-detail-mobile.png`
- `admin-legacy-registration-inside-shell.png`

## 19. Browser workflows

`scripts/ui-browser-smoke.mjs` now invokes the production workflow suite in
`admin-ui/src/test-tools/browser-workflows.mjs` using the existing offline CI harness.
26 assertions/groups cover direct login/reload, URL filters, manual create, operator
fields, submission, customer/internal messages, invoice upload/replacement,
no-proof denial, cancellation, terminal messaging, history Back/Forward, all 11
other owned routes, four viewport sizes and drawer Escape/focus/scroll restoration.
Successful runs have no console errors, React warnings or unhandled page errors.

Additional in-app browser checks against the disposable review DB:

- Active engineer assignment updates safe staff labels.
- Two tabs conflict on operator fields: one success, one explicit 409; unsaved text retained.
- Canonical proof displays; confirmation changes paid; schedule and reschedule persist.
- Start, complete and close persist; event author names and queued delivery states display.
- Engineer has no mutation/staff buttons; foreign request gets safe unavailable state.
- Sales has no service navigation and a forbidden direct-route state.
- Expired server session clears detail; login returns to that exact nested URL.
- Built Nest direct documents route and reload render without Vite.
- Legacy registration data/controls remain inside the new shell.

These extra review cases are not claimed to be 26 additional automated tests;
their backend equivalents are covered by the integration suite.

## 20. Reference cleanup

Removed the admin reference entry/router, queue/detail runtime, duplicate model,
styles and reference-only test/seed helpers. Shared design was promoted into app/
and features/service-requests/. Client reference remains dev-server-only and unchanged.
FE-1A documents and screenshots are historical approval evidence, not runtime copies.

## 21. Remaining backend gaps

P-PROOF, registration resume, cross-device identity, current PSR-1 security findings,
large-history pagination and obsolete invoice delivery/file retirement are deferred.
The numeric staff filter can later use a purpose-built bounded employee picker.
No global directory, new task system, invoice revisions or permission model was added.

## 22. Deferred screens

Client FE-1C; registration/ticket/org/equipment production redesign; Orders, Catalog,
Support and Knowledge UIs; EM-0, 1C, EDO, renewals and new notifications. Existing
legacy features remain available, but this package does not certify them as redesigned.

## 23. Verification

- `npm ci` on the unchanged lockfile; inherited audit warnings not remediated here.
- `lint:site`, both frontend TypeScript checks, Nest production build.
- `ci:quality`: 33 suites / 249 tests, including 25 policy assertions.
- Lint ratchet: no new violations; existing debt 705 errors / 6 warnings in 65 files.
- Integration: 21 suites / 210 tests, including 14 focused workspace tests.
- Offline e2e: 2 suites / 7 tests. Frontend contracts: 8 tests.
- Four controlled concurrency races: transition/transition, assignment/state,
  operator-state/schedule, invoice/invoice. A held DB row and observed lock waiters
  provide the barrier, not fixed sleeps. One winner, one 409, no lost update.
- Audit failure injection rolls back transition and invoice state, event and outbound;
  the losing invoice is rejected and the previous canonical file remains intact.
- RBAC, forged generic transitions, missing version, multipart limits, PDF validation,
  assigned file scope, unavailable file and generic-attachment-not-proof tests pass.
- 11 migrations unchanged; both isolated database schema logs report zero drift.
- `ci:build`, `ci:offline-smoke` with 26 browser checks, and `test:site` pass.
- Hosted CI and GitGuardian must be checked at the exact final PR HEAD; the PR
  remains draft regardless of green checks. See the PR checks for immutable results.

Bundle comparison uses exact baseline git blobs and the same dependencies and
`NODE_ENV=test` as CI, not a comparison between different build modes. Exact final
raw/gzip sizes in bytes:

| Asset | Baseline raw / gzip | FE-1B raw / gzip | Raw delta |
|---|---:|---:|---:|
| admin.js | 520341 / 140228 | 631284 / 165282 | +110943 |
| admin.css | 12555 / 3091 | 35325 / 6481 | +22770 |
| site.js | 745733 / 182896 | 745733 / 182896 | 0 |
| site.css | 64432 / 13348 | 64432 / 13348 | 0 |

Client JS/CSS are byte-for-byte identical. Both apps retain a single JS/CSS output;
the existing large-chunk advisory is not hidden or turned into an optimization package.

## 24. Acceptance verdict

Implemented for draft review with local contract, concurrency, UI and compatibility
checks. Merge/deployment require separate approval. No migration/schema/dependency/
lockfile/client-production change, no P-PROOF/new domain UI, no provider API calls,
no production resources. The original worktree remains untouched.

Dedicated disposable review: `vitma-fe1b-postgres`, loopback port 55437,
`vitma_fe1b_review_test`, OS-temp `vitma-fe1b-review-storage`. Verification uses
separate `vitma_fe1b_application` and `vitma_fe1b_test` databases. User container
`vitma_postgres` on 5432 and user storage were not used.

Review URLs while the dedicated preview runs:

- <http://localhost:5173/admin/requests/service>
- <http://localhost:5173/admin/requests/service/36>
- <http://localhost:5173/admin/requests/registrations>
- Built Nest alternative: <http://localhost:3000/admin/requests/service>

Synthetic login `fe1b-review`, password `Review-Only-2026!`. Engineer, sales and
operator fixtures use `fe1b-engineer`, `fe1b-sales`, `fe1b-operator` with the same
disposable password. Never deploy these accounts to a shared/production database.
