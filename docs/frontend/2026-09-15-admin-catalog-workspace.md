# FE-CAT-1: Admin catalog workspace

## Baseline

Approved main: `1780c3bdc4c3f63b0a2d4637e71f12fe4da7780e`.
FE-ORD-1 is merged; main CI [34932993321](https://github.com/cltvv1/market-bot/actions/runs/34932993321) passed.
Branch: `codex/fe-cat-1-admin-catalog-workspace`. Draft review only, no merge or deployment.

## Existing Catalog contract (pre-implementation inventory)

Reviewed CO-1 controllers, DTOs, entities, service, existing PostgreSQL tests,
AdminShell and registration/service/order workspaces, permissions, audit,
Orders catalog consumer, CI and status documents. No legacy admin Catalog editor
exists; the shell currently disables its Catalog entry. Public client catalog is
still demonstration UI and will not be activated here.

All paths below are relative to `/admin/api/catalog`. Existing guards require a
current employee session, command Origin and the stated permission. Read responses
are explicit presentations, not ORM entities. Existing updates have transactions
but no row locks or optimistic preconditions. Existing uniqueness failures map to
bounded 409 responses. Successful mutation Audit writes use the same transaction.

| Operation | Existing endpoint | Permission | Current validation | Transaction | Conflict semantics | Audit action | Public impact | Concurrency/precondition gap | UI need |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| List categories | GET /categories | catalog.read | None | Read | None | None | None | updatedAt available | Parent selector and management list |
| Create category | POST /categories | catalog.manage | Name/slug/description limits; parent exists | Yes | Duplicate slug 409 | catalog.category.create | Initially hidden | Bound parentId; concurrent hierarchy changes | Form, unpublished default |
| Edit category | PATCH /categories/:id | catalog.manage | Partial fields; self/cycle/missing parent checks | Yes | Hierarchy/slug 409 | catalog.category.update | Changes existing visible metadata | Lock, expectedUpdatedAt, bounded path/FK | Preserve local input on conflict |
| Publish category | POST /categories/:id/publish | catalog.manage | Exists | Yes | Same state is no-op | catalog.category.publish | Category and eligible products become visible | Lock and precondition | Explicit command |
| Unpublish category | POST /categories/:id/unpublish | catalog.manage | Exists | Yes | Same state is no-op | catalog.category.unpublish | Hides products, does not rewrite product rows | Lock and precondition | Show effective visibility separately |
| List products | GET /products | catalog.read | Search/category/availability/page/limit | Read | None | None | None | No active/publication filters; no readiness facts | Server-paginated URL queue |
| Get product | GET /products/:id | catalog.read | ParseIntPipe only | Read | Missing 404 | None | None | Bounded ID; dependency snapshot | Explicit actions and category visibility |
| Create product | POST /products | catalog.manage | Required fields, enums, integer minor price, lists/specs/aliases | Yes | SKU/slug/normalized alias 409 | catalog.product.create | Active, unpublished | Bound categoryId | Full bounded form; no auto-publish |
| Edit product | PATCH /products/:id | catalog.manage | Partial content, enums, lists; generic isPublished excluded | Yes | SKU/slug/alias 409 | catalog.product.update | Deactivation unpublishes; reactivation does not publish | Lock and precondition, aliases-only timestamp | Preserve unspecified aliases; exact money |
| Publish product | POST /products/:id/publish | catalog.manage | Active, category published, nonempty name/SKU/slug | Yes | Unready 409; same state no-op | catalog.product.publish | Visible if category remains published | Product + category locks; snapshot checks | Server readiness, no blind retry |
| Unpublish product | POST /products/:id/unpublish | catalog.manage | Exists | Yes | Same state no-op | catalog.product.unpublish | Hidden | Lock and precondition | Explicit command |

## Scope and routes

Production `/admin/catalog/products`, `/admin/catalog/products/new`,
`/admin/catalog/products/:id`, `/admin/catalog/categories`, in the existing shell.
CO-1 metadata only: no deletion, media, inventory, 1C synchronization, EDO,
bulk/import tools or client store. No schema, dependency or role changes.

## Concurrency design

Optional compatibility `expectedUpdatedAt`; production UI always sends the exact
server token for updates and publication. Row locks precede comparisons. Catalog
writes advance timestamps by at least one millisecond, including aliases-only
edits, to avoid timestamp truncation and same-clock-tick lost updates. Audit and
mutation commit together. Old callers may omit the precondition.

Product publication also checks the category snapshot when supplied. Product
commands lock product then category; category commands never lock products.
Hierarchy changes serialize with a PostgreSQL transaction-scoped hierarchy lock,
not a process mutex, and still run authoritative cycle detection.

Same-target races must have one success and one stale 409. Category/product are
different targets: ordering must preserve current semantics, not invent a shared
aggregate version. If category unpublish wins first, publication is rejected; if
product publish wins first, a subsequent category unpublish may succeed and hide
the still-internally-published product. This is required CO-1 behavior.

## Verification

Measured on Node 22.20.0 / npm 11.18.0, PostgreSQL 16, an isolated test database,
temporary FileStorage and loopback review ports. No user workspace or processes
were changed. No real provider calls, production data or deployment.

| Check | Actual result |
| --- | --- |
| `npm ci` | Passed; package.json and package-lock.json unchanged |
| Admin TypeScript / client TypeScript | Passed via admin tsconfig and client build |
| `npm run lint:site` | Passed |
| `npm run ci:quality` | 403 unit tests / 43 suites; config and messenger guard passed |
| `npm run ci:database` | 468 integration tests / 26 suites; 7 e2e / 2 suites |
| Schema | 11 migrations, zero pending, zero schema drift; no new migration |
| Frontend contracts | 71: shell 9, admin Registration 10, Orders 10, Catalog 14, client ServiceRequest 15, client Registration 13 |
| `npm run ci:build` | Nest, admin and client builds passed |
| `npm run ci:offline-smoke` | Offline bootstrap/health/HTML plus 28 admin and 29 client browser checks |
| Existing browser workflows | Admin Registration 27, client Registration/operator 23, Orders 17 |
| New Catalog browser workflow | 26 checks against the real local API with synthetic data |
| Total browser checks | 150 (baseline 124 + Catalog 26), excluding the separate site smoke |
| `npm run test:site` | Passed against a separate isolated backend, without skip-backend |
| Lint ratchet | Baseline and final: 684 errors, 6 warnings, 63 files; no increase |
| Scope / whitespace | `git diff --check` passed; no client-ui, migration or dependency changes |

New coverage is 22 Catalog policy unit tests, 30 Catalog workspace integration
tests, 14 frontend contracts and 26 browser checks. Seven real PostgreSQL lock
races cover three same-product transitions, three same-category transitions and
category publication versus product publication. Same-target stale writers return
409, never a second success Audit. A separate same-millisecond test covers token
advancement; Audit failure rolls back changes. Public Catalog and the Orders
consumer keep their contracts.

The browser suite includes both role removal and full session revocation with an
open form; product/category two-window reconciliation; lost PATCH response with
failed reread; lost POST response reconciled by the captured normalized SKU; long
fields; four viewports and keyboard/dialog behavior. Native textarea labels also
have stable accessible names after entering text. No full accessibility audit is
claimed.

The required GitHub jobs retain the existing registration and Orders browser
steps and add Catalog contracts/browser. Exact final-head run IDs and the
GitGuardian result/scanned-commit count are recorded in the draft PR verification
comment after push; this document does not substitute baseline checks for them.

### Production bundle measurement

Measured UTF-8 file bytes after the same `npm run ci:build` command with NODE_ENV
unset (Vite production), separately from the CI NODE_ENV=test asset variant.

| Asset | FE-ORD-1 baseline | FE-CAT-1 | Delta | Change |
| --- | ---: | ---: | ---: | ---: |
| Admin JS | 399182 | 433323 | +34141 | +8.55% |
| Admin CSS | 48199 | 53953 | +5754 | +11.94% |
| Client JS | 439112 | 439112 | 0 | 0% |
| Client CSS | 83046 | 83046 | 0 | 0% |

Client files are byte-identical to baseline (not just equal in size). SHA-256:
JS `8039594E00035801799D7397CC15D9F11A913B8E984446E0773B5916A9B57DC7`,
CSS `2C6AF062FB6327EE3AF54965C4F4DF2F057F128B9D595EEBB719178FD2539833`.
The existing CI/test-mode Vite large-chunk warning remains non-fatal; no dependency
or unrelated bundle optimization was introduced.

## Category semantics

The existing all-category endpoint feeds a dense hierarchical list and parent
selector. No new hierarchy schema, delete command or archive state. Iterative
client presentation tolerates malformed read cycles without recursion overflow;
authoritative parent existence and cycle validation remain on the server.
Category publication changes effective product visibility, not product rows.
Publication and unpublication keep their existing same-state no-op behavior,
but a supplied stale precondition is rejected before the no-op check.

## Product semantics

Explicit forms cover the existing fields only. Creation is active/unpublished.
PATCH sends only edited fields, not the whole snapshot, publication, timestamps
or embedded category. Aliases are not replaced when another field is edited.
Deactivation removes publication; reactivation does not restore it.

Browser inspection exposed an existing partial-PATCH defect: class-transformed
DTOs own optional properties whose value is undefined. `Object.hasOwn` therefore
cleared omitted nullable fields (including category parent, price and brand).
A PostgreSQL regression first failed with an unexpectedly null parent; mutation
checks now distinguish undefined (unchanged) from explicit null (clear).
This correction is limited to CO-1 Catalog mutations.

## Publication and effective visibility

Admin presentations add actions with allowed/reason, exact expectedUpdatedAt,
category publication/timestamp and effectivePublicVisibility. The command guards
and locked domain checks remain the authority. Public visibility is exactly
active AND product-published AND category-published, not a persisted new field.
No fake client preview link or Store activation.

## Money, VAT and availability

The UI imports the existing pure CO-1 constants. Availability remains in_stock,
low_stock, on_request or unavailable; VAT remains the existing basis-point enum.
Price input is string -> BigInt minor units -> bounded integer, with an exact
maximum 2147483647, distinct zero and null. No floating-point money, cost prices
or stock accounting. Existing field/list/specification limits are retained;
legacy empty feature entries remain preservable, while new empty-row spam is
prevented. Specification key collisions and normalized aliases have explicit errors.
oneCRef is reference metadata, oneCSyncedAt is read-only, no sync commands.

## Bounded IDs

Catalog-scoped string validation rejects zero, signs, decimals, exponents, mixed
text, leading zeros and values beyond 2147483647 before Number or service/SQL.
HTTP invalid paths return 400 VALIDATION_ERROR; valid missing maximum returns
404. Numeric category/parent inputs and integer sortOrder are bounded as well.
No global ID validator or migration was changed.

## RBAC and Audit

sales_manager and superadmin retain their existing catalog.read/catalog.manage
permissions. operator and engineer have no links and cannot read or mutate
through direct API/deep links. Request guards reauthorize revoked roles/sessions.
No staff.read or audit.read capability is granted. Existing catalog.category.*
and catalog.product.* Audit actions remain transactional; stale failures do not
write a success event. Audit failure rolls back the business mutation.

## Orders compatibility and public API regression

Admin product list retains its response shape and fields consumed by the Orders
quote editor. Optional admin-only active/publication filters are server-side;
public DTO/behavior is unchanged. An additional optional exact SKU admin query
supports bounded one-row reconciliation after a lost creation response, without
loading the entire catalog or relying on fuzzy search pagination.
Public Catalog remains category-published plus product-active/published, with
the existing search, availability, pagination and slug-detail routes.

## Conflict and unknown-result UX

Editors keep local fields mounted on stale or failed reconciliation reads. A
successful read and explicit acknowledgement are required before another command;
only fields the employee actually edited are reapplied. No automatic retries,
business localStorage or silent merge. Background reads cannot reset dirty forms.
Unknown creation captures the submitted SKU/slug rather than later keystrokes;
an existing record is opened explicitly, never automatically overwritten.

## Browser workflow and screenshots

`scripts/catalog-browser-smoke.cjs` uses synthetic staff/data, a migrated test
database, temporary storage, fake messenger and loopback-only browser traffic.
It closes its server/browser. Build assets first and run with ts-node/register
and tsconfig-paths/register, NODE_ENV=test and both polling/delivery disabled.
Optional FE_CAT1_SCREENSHOTS writes evidence to the supplied directory.

Synthetic evidence: `screenshots/2026-09-15-fe-cat1/`, including product queue,
editor, category management and mobile editor. Checks include four viewports
(1440x1000, 1280x800, 768x1024, 390x844), page overflow, labels, keyboard focus,
dialog focus return and text-based status presentation. Not a full WCAG audit.

## Deferred work

Client store/product page/cart/checkout, images, quantities/reserves, 1C sync,
EDO, acquiring, imports, bulk tools, Support/Knowledge UI and production deployment
are not implemented. EM-0 remains the parallel monitoring audit/design track.
No next package or automatic merge is authorized by this work.
