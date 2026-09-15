# FE-ORD-1: Admin sales order workspace

Baseline: `7f03ef1f11fc7c31ebccdb45497cfb7a98886bf7` (FE-REG-2 merged).
Baseline hosted CI: [34923598824](https://github.com/cltvv1/market-bot/actions/runs/34923598824), successful.
Branch: `codex/fe-ord-1-admin-orders-workspace`. Implemented for draft PR review;
not merged or publicly deployed. Exact-head hosted evidence is attached to the PR
after push, separately from this pre-push local verification record.

## Pre-implementation inventory

Reviewed Orders controllers, DTOs, entity constraints, CO-2/3A/3B/3C services and
integration tests; AdminSessionGuard and existing permission matrix; Catalog read
API; organization membership used by order intake; FileStorage policies and
pending-file activation; OrderEvent/Audit writes; AdminShell, registration
workspace patterns, legacy navigation, CI, PROJECT_STATUS and ROADMAP.

Sales managers and superadmins already have Orders permissions. Operators and
engineers do not. Assignment eligibility must reuse the command's status-specific
permission checks, not general staff access. Orders commands do not enqueue
outbound notifications. This package does not change that contract.

### Action matrix (recorded before implementation)

All paths below are relative to `/admin/api/orders`. All mutations require a
current staff session, matching Origin, permission and `expectedVersion`.
Commands lock the root Order and recheck version/state/assignment inside their
transaction. Event and Audit writes commit together with business changes.
Their current response is the admin detail DTO; the UI rereads authoritative
detail after a command. Outbound effects are **none** for every row.

| Action | Endpoint | Permission | State / assignment | Concurrency, file and event effects |
| --- | --- | --- | --- | --- |
| Queue | GET `/` | orders.read.all | Any; all/mine/unassigned scope | Existing page/limit (max 100), status, escaped search; createdAt DESC, id DESC; summary DTO only |
| Detail | GET `/:id` | orders.read.all | Any | Read only; bounded ordered history and safe document presentation |
| Eligible managers (new read) | GET `/:id/assignees` | orders.assign | Nonterminal | Active staff with orders.read.all + target-state permissions; id/displayName only |
| Assign / reassign | POST `/:id/assign` | orders.assign | All nonterminal states, not just submitted/in_review; actor need not be current assignee | Version +1; manager_assigned/reassigned; assigning the same manager is an existing no-op |
| Start review | POST `/:id/start-review` | orders.review | submitted: unassigned or assigned to actor; in_review: assigned actor | Creates draft quote from immutable original lines; auto-assigns actor; review_started; repeated in_review is a no-op |
| Edit quote | PUT `/:id/quote` | orders.quote | in_review, draft quote, assigned actor | Replaces current quote lines, increments quote revision and Order version; quote_updated; no file writes |
| Confirm quote | POST `/:id/confirm` | orders.confirm | in_review, draft complete priced quote, assigned actor | Validates exact decimal-string totals; confirmed event; quote becomes immutable |
| Issue / revise invoice | POST `/:id/invoices` | orders.invoice | confirmed or waiting_payment, confirmed quote, assigned actor | Pre-Multer permission/state/assignment checks; PDF <=15 MiB; pending file, locked final version/state check, activate + invoice revision; old invoice superseded but staff-downloadable; reject new pending on failure |
| Review proof | GET document download | orders.read.all | Any existing proof | Read-only inspection; **no separate proof-review command or review flag exists** |
| Confirm payment | POST `/:id/confirm-payment` | orders.payment | waiting_payment, valid confirmed quote/current invoice, assigned actor | Records source, received date, comment; payment_confirmed; proof upload alone never confirms payment |
| Fulfill | POST `/:id/fulfill` | orders.fulfill | paid, assigned actor, complete payment facts | Whole order only; fulfillment method/time/details; fulfilled event; no warehouse/provider integration |
| Complete | POST `/:id/complete` | orders.complete | fulfilled, assigned actor, complete payment/fulfillment facts | Realization and document handoff facts; completed event; no automatic 1C/EDO success |
| Download | GET `/:id/documents/:documentId/download` | orders.read.all | Document belongs to this order and valid active StoredFile | Authenticated streaming, private/no-store, physical-file checks; no provider URLs or storage keys |

Eligible target permissions by current status: submitted/in_review -> review;
confirmed/waiting_payment -> invoice AND payment; paid -> fulfill; fulfilled ->
complete. Every target also needs orders.read.all and an active staff account.

Customer proof upload remains the existing owner-only endpoint
`POST /api/client/orders/:id/payment-proofs`: expectedVersion, PDF/JPEG/PNG/WebP
<=20 MiB, pending file and transactional activation, root version increment,
payment_proof_received event. No client UI or ServiceRequest proof contract changes.

## Deliberate limits

- Quote revisions are counters/events, not stored historical line snapshots.
  Display current quote, immutable original customer request, and revision events;
  do not invent previous quote compositions.
- Cancelled/completed orders are read-only; no new cancellation command.
- Payment proof inspection is a download followed by explicit existing payment
  confirmation. No fabricated review state, OCR, bank reconciliation or acquiring.
- Completion records internal facts only. No partial fulfillment, refund, return,
  1C/EDO integration, client commerce, catalog editor or background delivery work.
- Server action projection is advisory, not authorization. Every command retains
  fresh request guards and locked final checks; no blind automatic mutation retry.

## Verification

### Read and UI contracts

- Production shell routes: `/admin/sales/orders` and
  `/admin/sales/orders/:id`. Nest's explicit HTML routes support direct reload.
- Queue uses the existing summary's **`quote`** field, not a parallel price
  calculation or a made-up `quoteSummary` property. Prices are decimal minor-unit
  strings; editing/formatting uses string/BigInt conversion without floating-point
  money. The initial customer snapshot remains separately visible.
- Filters: existing status, all/mine/unassigned and server search (order number,
  organization/INN, phone/email, realization number). Page and filters are in the
  URL; detail navigation retains the queue URL and selected row.
- Tabs: overview, current quote, payment, fulfillment, domain history. URL tab
  state, keyboard arrows/Home/End, shared shell drawer and modal focus handling
  are retained. No business state is persisted to browser storage.
- Detail is read in a REPEATABLE READ transaction. It returns the latest 100
  OrderEvents with `history.hasMore`; sorting is deterministic by createdAt/id.
  Arbitrary event metadata is replaced with typed business facts in admin JSON;
  StoredFile hashes are omitted there. Downloads retain existing authorization.
  History uses the actual `revision` and `documentRevision` event fields for
  quote and invoice revisions, alongside the recorded `quoteRevision` reference.
- Physical file existence is checked for the detail projection. Missing files
  are unavailable rather than advertised as valid permanent download links.
- Assignee options return only `id`, `displayName`, and the order version.
  Selector and assignment command share `isEligibleOrderManager`. No new role,
  permission or generic staff access is introduced.
- Action projection includes assign/review/quote/confirm/invoice/payment/fulfill/
  complete with allowed/reason. It uses existing status helpers, exact quote
  totals and payment/fulfillment/completion assertions. It is not a replacement
  for the current request guards or locked command checks.
- Conflicts and unknown results keep the mounted form, including the selected
  File. Reconciliation reads may fail without losing inputs. Commands remain
  disabled until a successful reread and explicit confirmation; there is no
  automatic mutation retry. Authentication/access failures discard protected UI.
- Document inspection uses a context-scoped authenticated fetch, a temporary
  blob URL, PDF/image preview and download. Blob URLs are revoked on close.
  Provider URLs and arbitrary download targets are rejected.

### Regression coverage

New `order-workspace.spec.ts` covers all eight statuses, role and assignment
decisions, missing/inconsistent facts, shared eligibility and safe event metadata.
`admin-order-workspace.integration-spec.ts` exercises real PostgreSQL reads and
HTTP permissions, bounded queue behavior, role revocation, historical read-only
state, missing/scoped documents and current-file linkage.

Seven races use an explicit PostgreSQL lock barrier (including transitive
blocking PIDs), not a timing sleep: assignment/assignment, quote/reassignment,
quote/quote, invoice/reassignment, payment/reassignment, fulfill/reassignment,
complete/reassignment. Exactly one succeeds, one returns 409, and the root version
increments once. A separate barrier pauses after physical invoice write to prove
stale-file rejection while preserving the previous current invoice. Existing
CO-3B/3C tests remain responsible for MIME/signature/size rejection, transactional
rollback and other domain constraints.

Frontend contracts cover URL adapters, role-filtered navigation, exact decimal
money, command routes/versions, scoped URLs, safe errors, server action reasons,
retained forms and scoped styling. The previous shell contract now explicitly
keeps the three Catalog/Support/Knowledge entries disabled while enabling Orders.

`scripts/order-browser-smoke.cjs` drives real API and UI commands from submitted
to completed, including a customer-session proof upload, invoice revision, image
inspection, payment confirmation and history. It tests two-window conflicts,
lost mutation response plus failed reread, role revocation, negative roles,
deep reload, queue navigation, empty/missing records and four viewport sizes.
Its new CI step supplements rather than replaces the previous browser workflows.

### Review and reproduction

Use an isolated migrated test database and temporary FileStorage root only.
Set NODE_ENV=test, BOT_POLLING_ENABLED=false, MAX_BOT_TOKEN empty and
OUTBOUND_DELIVERY_WORKER_ENABLED=false; provide the normal DB/TEST_DB variables.
No real tokens or provider connectivity are required. Build with `npm run ci:build`,
then run `node -r ts-node/register -r tsconfig-paths/register scripts/order-browser-smoke.cjs`.
The runner creates synthetic staff/catalog data and orders through canonical
commands; it closes its loopback server and browser afterward. Optional
`FE_ORD1_SCREENSHOTS` specifies an evidence output directory.

Screenshots in `screenshots/2026-09-15-fe-ord1/` contain synthetic data only.
Review queue, quote and payment at desktop widths, then mobile detail. The tablet
history capture provides the fourth viewport. Review source changes separately
from the backend action matrix above; no customer commerce activation is implied.

### Operational limits

- Client production store/catalog, admin Catalog/Support/Knowledge workspaces,
  acquiring, 1C, EDO, cancellation/refunds/returns, partial fulfillment, general
  legacy cleanup and monitoring automation are outside this package.
- Proof inspection is not persisted as a separate reviewed flag because the
  existing model has no such command. Payment source/comment are explicit facts.
- Full historical quote line snapshots do not exist; current quote plus original
  order and bounded revision events are shown honestly.
- A no-eligible-manager UI state exists, but with the current fixed roles an
  active caller with orders.assign is itself eligible for every nonterminal
  status. No artificial permission model was added to manufacture this case.
- Main branch protection was read as `protected: false` on 2026-09-15. Repository
  settings were not changed; branch protection remains separate operational debt.

### Local results (2026-09-15)

| Verification | Actual result |
| --- | --- |
| Clean install | `npm ci`, no dependency or lockfile changes |
| Config/messenger isolation guard | Passed |
| Unit | 381 tests / 42 suites (23 new Orders policy tests) |
| PostgreSQL integration | 438 tests / 25 suites (22 new Orders workspace tests) |
| E2E | 7 tests / 2 suites |
| Frontend contracts | 57: shell 9, admin Registration 10, Orders 10, client service 15, client Registration 13 |
| Browser workflows | 124: existing admin 28, client service 29, admin Registration 27, client Registration 23, new Orders 17 |
| Database | 11 migrations, 0 pending, 0 schema drift |
| Lint ratchet | Unchanged: 684 errors, 6 warnings, 63 files; no new violations |
| Type checks / client lint | Both frontend TypeScript configurations and `lint:site` passed |
| Production builds | Nest, admin and client passed |
| Offline bootstrap | Health, built HTML routes and browser workflows passed |
| Client site smoke | Existing `site-smoke.mjs` passed against an isolated loopback test app; zero provider dispatches |

All full suites ran locally. After the final typed history-field adjustment,
unit/quality, the 22-test PostgreSQL workspace suite, all frontend contracts,
admin typecheck, production builds and the 17-check Orders browser workflow were
rerun successfully. The full unchanged regression suites also run on the final
PR head in hosted CI. Screenshots were regenerated from the final UI build.

The two-window browser check waits for the actual detail response and rendered
new total, rather than treating an already-idle page as evidence of a completed
refresh. It separately verifies the committed database quote total.
The first hosted push run exposed another synchronous test assertion: keyboard
navigation was checked before React committed the selected-tab attribute. The
browser test now waits for the actual selected tab before asserting it, without
fixed sleeps or retrying a business command. Hosted checks must pass on the
follow-up commit, not merely on the earlier implementation head.
The corrected 17-check workflow passed locally against both production-mode
assets and assets built with CI's `NODE_ENV=test` settings.

### Production bundle comparison

Measurements are actual UTF-8 file bytes, not Vite's displayed character counts.
Both baseline and final builds use the same production build settings.

| Asset | Baseline bytes | FE-ORD-1 bytes | Delta bytes | Delta |
| --- | ---: | ---: | ---: | ---: |
| admin.js | 360908 | 399182 | +38274 | +10.60% |
| admin.css | 40568 | 48199 | +7631 | +18.81% |
| site.js | 439112 | 439112 | 0 | 0.00% |
| site.css | 83046 | 83046 | 0 | 0.00% |

Client hashes match baseline byte-for-byte: JS
`8039594e00035801799d7397cc15d9f11a913b8e984446e0773b5916a9b57dc7`,
CSS `2c6af062fb6327ee3af54965c4f4df2f057f128b9d595eebb719178fd2539833`.

No migrations, package manifests, lockfiles, client source, messenger handlers,
provider integrations or production resources were changed. The original user
worktree, its untracked output directories, lockfile and running processes were
preserved. Verification used a separate loopback PostgreSQL container and
temporary storage with synthetic data and offline/fake delivery only.
