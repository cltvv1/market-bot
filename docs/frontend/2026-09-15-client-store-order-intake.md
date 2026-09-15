# FE-STORE-1: Production client store and canonical order intake

## 1. Baseline

- Repository: `cltvv1/market-bot`; branch: `codex/fe-store-1-client-store-order-intake`.
- Reviewed main: `54112d9dfeb48f47300d124593e158c0219f7caa`, merged FE-CAT-1 (#34).
- Exact baseline CI: [34941653068](https://github.com/cltvv1/market-bot/actions/runs/34941653068), successful.
- Isolated worktree `learn-bot-fe-store1`; the original worktree, its modified lockfile and user processes were not changed.
- This is a draft review package, not a merge or deployment. No next package is included.

## 2. Demo gaps removed

The baseline Catalog, Product, Cart, Checkout, Search and Home product sections
used static Catalog facts. Checkout generated a random local order number.
`client-ui/src/data/catalog.ts`, its production imports, `orderService`, and the
`vitma_order_*` writer are removed. Unrelated callback and organization helpers
remain. No order copies, prices or publication flags are saved in browser storage.
Existing `/site/catalog`, `/site/catalog/:slug`, `/site/cart`, `/site/checkout`,
`/site/search` and home routes remain; `/site/orders` and `/site/orders/:id` are added.

## 3. Public Catalog contract

The UI uses existing public categories, SQL-paginated products and slug detail.
Products contain ID, slug, SKU, name, brand, category, descriptions, minor-unit
display price, VAT, availability, features, specifications, package contents,
and the real new/popular flags. No admin fields are exposed.

Catalog URL state is `category`, `search`, `availability`, `page`; legacy `q`
remains readable and becomes `search` when a filter changes. Page size is 12.
Search submits explicitly. No client-side filtering after pagination, fake stock,
discounts, ratings, delivery promises, arbitrary sorting or brand filter remains.
The existing backend ordering is unchanged. Search uses a bounded result set of
8 and Home uses 4 actual products, without claiming they are all popular.
Absent product images are honest neutral placeholders, not invented photography.

## 4. Cart persistence boundary

`localStorage.vitma_cart` stores only:

```json
[{ "productId": 1, "quantity": 2 }]
```

The reader rejects malformed/non-array/oversized input, drops invalid lines,
enforces integer IDs 1..2147483647, quantities 1..1000 and at most 100 lines.
First valid duplicate wins deterministically. It rebuilds objects with only the
two allowed properties. Updates are bounded before persistence; a storage event
rehydrates another tab's cart. Unavailable storage leaves a visible in-memory
cart warning. This is not a server cart or cross-device account.

## 5. Product hydration

One narrow public endpoint was necessary: `POST /api/catalog/products/resolve`.
The existing list cannot safely resolve arbitrary missing IDs across pages and
one request per cart line would require up to 100 reads.

- Body: `{ids: number[]}`, 1..100 unique positive int32 IDs; no coercion or extra fields.
- Read-only, no session/cookies required; rate limit 120 requests / 60 seconds.
- Response: `{items: PublicProduct[]}`, ordered by numeric ID independently of input.
- Only active, published products in published categories; same public presenter.
- Missing/hidden IDs are omitted without admin visibility hints; UI maps by ID.

Missing cart entries remain visible without stale name/price and block checkout
until explicitly removed. Current unavailable products also block it. Price and
availability come from every fresh hydration, including a pre-submit eligibility
read; backend intake still independently validates and snapshots products.
Null means a manager-priced line, zero is a real zero. Totals and formatting use
BigInt integer arithmetic. Partial priced totals are not presented as complete.
`in_stock`, `low_stock`, `on_request` are orderable; `unavailable` is not.

## 6. Checkout mapping

The exact existing SubmitOrderDto is sent: customer type, either approved
organizationId or manual organization snapshot, contact, delivery, optional
comment, and product ID/quantity lines. No price, payment method, manager, status
or invoice facts are client inputs.

Default is organization; individual requires no organization. Manual fields are
name, 10/12-digit INN and optional 9-digit KPP. Advanced optional organization
fields remain deferred. Name/phone are required; email remains optional.
Existing backend phone forms are not narrowed to an eleven-digit Russian mask.
Delivery uses pickup/courier/transport_company. The actual normalization service
requires city for courier/transport_company and address for courier; the form
matches these rules. DTO length bounds are mirrored. Manager invoice preparation
is described without promising online acquiring.

## 7. Session behavior

Public catalog/product/cart/home/search do not create a WebSession. Checkout may
read available approved memberships without creating one. Only explicit submit
calls the shared `beginNewSession` primitive, then submits with credentials and
the browser's same-origin mutation behavior. No third session implementation.

Owner Orders reads never bootstrap identity. A missing/revoked session displays
that a new session cannot restore old Orders. New explicit checkout may create
a new identity; backend ownership prevents it reading previous customers' orders.
INN entry never authorizes organization access or automatically creates membership.
The unrelated Organizations page keeps its previous session boundary.

## 8. Order idempotency

First explicit submit captures a structured-cloned payload and crypto UUID in
memory. Retry reuses exact key and payload. Definite pre-domain rejection allows
corrected input to start a new attempt/key; an uncertain attempt freezes inputs.
The existing transaction/advisory lock, `(createdByUserId, idempotencyKey)` and
fingerprint comparison remain the only canonical deduplication mechanism.
Replay returns the existing snapshot even if current Catalog price has changed,
without another submitted OrderEvent or AuditEvent. Changed fingerprint returns
409; a distinct key is a distinct order. No schema or recovery endpoint was added.

## 9. Unknown outcome

Network/5xx/invalid-response uncertainty does not clear the cart or automatically
repeat a POST. UI offers owner Orders in another tab and explicit same-request
retry. Only confirmed response clears the cart and navigates to the server ID.
The in-memory attempt records the existing session expiry projection; retry first
reads it and refuses an observed replacement. Expiry is a fail-safe marker, not a
new authentication token. Cookie authentication remains authoritative; there is no
atomic browser-wide lock against another tab replacing identity between requests.

Attempt payload and File objects are not persisted. A before-unload warning is
shown during submit/uncertainty. Closing/reloading loses the exact retry payload;
the owner Orders list remains the recovery path, not a guessed duplicate submit.

## 10. Client Orders

Owner list is server-paginated (20/page) with URL page/status. Detail shows only
the existing safe client projection: immutable submitted lines, confirmed quote,
current invoice, proofs, payment, fulfillment, completion facts and customer events.
Draft staff quotes remain private. All eight canonical statuses are mapped.
Completed does not imply 1C/EDO exchange. Document downloads validate same-origin
owner-scoped paths, bounded IDs, attachment disposition and allowed content type.

Active detail uses a 30-second GET loop; no overlapping reads. It stops at
completed/cancelled, terminal 400/401/403/404, session loss and unmount. Route-keyed
state prevents old-order render; abort/request guards prevent obsolete reads.
Local selected File state survives refresh errors and polling.
Terminal access loss removes private detail and unmounts File input; preserving
a retry file is not allowed to keep an unauthorized document panel visible.

## 11. Payment proof

The existing `POST /api/client/orders/:id/payment-proofs` accepts one in-memory
PDF/JPEG/PNG/WebP up to 20 MiB plus the currently projected expectedVersion.
Backend file inspection, StoredFile ownership and transaction are unchanged.
Client checks MIME/extension/size for UX, never as security authority. Payment
remains waiting_payment until a manager explicitly confirms it.

409/uncertainty rereads current detail. A newly appearing document ID with the
selected file's SHA-256 proves it is already present; only then File is cleared.
If reread fails, File and disabled retry state remain. If successful reread has
no matching new document, a separate explicit acknowledgement enables upload.
No blind automatic repeat, base64/localStorage document or generic file URL.

## 12. Security

Existing owner userId, organization membership, Origin, intake eligibility,
idempotency, bounded Order IDs, expectedVersion and staff command permissions
are preserved. Only the public read-only bounded resolver changes backend behavior.
No Orders schema/role/permission/file domain changes. Unknown errors and upstream
HTML are mapped to safe typed UI messages. A read-error loading bug discovered in
the new hook was reproduced in a failing test and corrected before delivery.
The abort cleanup also guards a replaced request during React remount.

No production storage/database, real provider tokens, polling, outbound worker,
Telegram/MAX/1C/OFD/ATOL/EDO calls or production deployment was used. Browser
fixtures block non-local requests and assert zero fake-messenger sends.

## 13. Browser E2E

`scripts/client-store-browser-smoke.cjs` uses real Nest/PostgreSQL, built UI,
synthetic canonical fixtures and separate customer/sales browser contexts:

- Publication/search/category/product reload; current cart price and null/zero.
- Explicit checkout -> exact real Order -> Admin Orders review -> confirmed quote.
- Scoped invoice download with byte equality; proof visible to manager, not auto-paid.
- Lost proof response reconciliation; conflict plus failed reread preserves File.
- Manager payment -> fulfillment -> completion, reflected on customer detail.
- Lost committed checkout response -> exact UUID/payload replay -> one DB order.
- Disappearing product, session loss/new owner isolation, controlled stale response.
- Cross-tab storage, safe HTTP errors, real Catalog/Orders pagination and approved membership.
- 1440x1000, 1280x800, 768x1024, 390x844; no page overflow, mobile filter Escape/focus return.

Screenshots in `screenshots/2026-09-15-fe-store1/` contain only synthetic products,
organizations and customers. Existing registration/service/admin Orders/Catalog
browser gates remain enabled alongside the new workflow.

## 14. Verification

Local required-equivalent results:

| Gate | Result |
| --- | --- |
| Config / messenger isolation | passed |
| Unit | 403 tests / 43 suites |
| PostgreSQL integration | 484 tests / 27 suites, including 16 new store tests |
| E2E | 7 tests / 2 suites |
| Frontend contracts | 100 (71 existing + 29 store) |
| Existing browser workflows | 150: service admin/client 28/29, registration admin/client 27/23, admin Orders 17, admin Catalog 26 |
| Store browser workflow | 28 checks |
| Combined required browser checks | 178 |
| Nest/admin/client production builds | passed |
| Admin typecheck / client lint | passed |
| Offline bootstrap + health/UI smoke | passed |

New contracts include typed read errors, deterministic stale success/error and
before-effect route isolation. The optional `test:site` script now compares with
the actual bounded Catalog response instead of expecting 20 static demo products.
`FE_STORE1_EXTRA_SMOKE=true` runs that additional script against the isolated
browser fixture server; it is not counted again in the 178 required checks.

The first hosted run exposed a browser assertion race after successful replay:
the route changed before React's passive cart-persistence effect finished. The
browser gate now waits (with Playwright's bounded timeout) for the actual empty
stored cart before asserting it. The same-key/payload and one-Order assertions
remain unchanged; no application behavior was changed for this test correction.

Production bundle byte sizes, same `ci:build` command:

| Asset | Baseline | FE-STORE-1 | Delta |
| --- | ---: | ---: | ---: |
| Admin JS | 433348 | 433348 | 0 |
| Admin CSS | 53953 | 53953 | 0 |
| Client JS | 439112 | 429291 | -9821 |
| Client CSS | 83046 | 91185 | +8139 |

No migrations or dependencies added. Test schema: 11 applied, 0 pending, 0 drift.
Lint ratchet: unchanged 684 errors / 6 warnings / 63 files; client lint clean.
Quality, production builds, frontend contracts, PostgreSQL/security/e2e and offline
browser gates must be green on exact draft HEAD. GitGuardian must be checked on
that HEAD; neither draft readiness nor this document authorizes a merge.
Exact commit/run links are reported in the draft PR handoff rather than asserting
that a test against an earlier commit verifies future changes. Root lockfile is
unchanged from baseline; SHA-256
`E9BFAFF22F0DE711E8089F60C0FC1DEBF476423CEA3042A0C53B7EFBED5E27C4`.

## 15. Deferred

Product images; quantities/reservations/warehouse; acquiring/refunds/returns;
discounts/promocodes; delivery pricing; 1C/EDO/marketplace sync; cross-device account
and login; server cart; brand/arbitrary sorting; advanced manual organization
fields; persistent checkout recovery; browser-wide session locking; production rollout.
Unrelated Support/Knowledge/monitoring workspaces are not part of this package.
