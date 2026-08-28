# CO-3A sales workspace core

## 1. Baseline

CO-3A starts from `origin/main` commit
`fe60c344476c6a796075e73d3d3b986c53452f50`, after CO-2 established the
durable order intake aggregate. The package is implemented in the isolated
`codex/co-3a-sales-workspace-core` worktree and does not change dependencies or
frontend packages.

## 2. CO-3A scope

This package adds the backend core for assigning an order to a sales manager,
starting review, maintaining one draft commercial quote, and confirming that
quote. It covers only `submitted -> in_review -> confirmed` and read models
needed by future staff and customer interfaces.

## 3. Original OrderLine vs OrderQuoteLine

`OrderLine` remains the immutable record of what the customer submitted.
`OrderQuoteLine` records what VITMA currently offers after sales review.
Changing quantity, composition, or price replaces quote lines and never edits
the original order lines.

## 4. Assignment model

`Order.assignedManagerId` identifies the employee accountable for current
commercial processing. Assignment and reassignment are allowed only while the
order is `submitted` or `in_review`. Reassignment preserves the current draft
quote, immediately removes the previous manager's editing authority, and is
recorded as a staff-only domain event and a transactional audit event. Staff
accounts have no hard-delete API; the assignment foreign key nevertheless uses
`ON DELETE RESTRICT` to preserve operational history.

## 5. Manager eligibility

The assignment target must exist, be active, and currently receive
`orders.review` through the existing role-permission union. Eligibility does
not depend on a hard-coded role name. A superadmin is eligible through the same
permission contract; inactive staff and staff without the permission are
rejected without changing the order.

## 6. State machine

CO-3A supports these commands:

- assignment: `submitted -> submitted` or `in_review -> in_review`;
- start review: `submitted -> in_review`;
- quote replacement: `in_review -> in_review`;
- confirmation: `in_review -> confirmed`.

The reserved later states remain in the schema, but this package exposes no
transition to payment, fulfillment, completion, or cancellation. Confirmed
orders cannot be reassigned, reopened, or edited by CO-3A APIs.

## 7. OrderQuote model

An order has at most one `OrderQuote`. The quote stores `status`, `revision`,
exact catalog and quoted subtotals, unresolved-price state, RUB currency, a
staff-only internal comment, creation/update/confirmation staff provenance,
confirmation time, and timestamps. `OrderQuoteLine` stores the product and
source-order-line links plus immutable product, VAT, quantity, and money
snapshots.

## 8. Draft and confirmed semantics

A draft can contain unresolved prices and is visible only to staff. A
confirmed quote must have at least one line, all quoted prices resolved, valid
recalculated totals, a confirming staff member, and a confirmation timestamp.
Application commands treat it as immutable, while database checks enforce the
confirmation shape.

## 9. Quote initialization

The first successful start-review command creates revision 1 from the original
order lines. Product snapshots, quantities, catalog prices, and VAT are copied
from those immutable lines. Known catalog prices become initial quoted prices;
price-on-request lines remain unresolved. Existing CO-2 orders receive no
synthetic quote or event during migration.

## 10. Full-replacement quote update

`PUT /admin/api/orders/:id/quote` accepts the complete desired line list. The
service validates every product, price, line total, and aggregate total before
deleting the old lines. A successful replacement increments quote revision and
order version once; any failure rolls back lines, totals, revision, version,
domain event, and audit event together.

## 11. Original-line snapshot reuse

If a quote product appeared in the submitted order, its quote snapshot is
built from the matching `OrderLine` even when the live catalog entry was later
changed, hidden, made inactive, or marked unavailable. The backend derives
`sourceOrderLineId`; the admin request cannot supply it.

## 12. Added-product eligibility

A product added by a manager must exist, be active, and not have
`availabilityStatus=unavailable`. Public product or category publication is
not required because the sales team may quote an active internal or on-request
item that is temporarily absent from the public catalog. Free-text quote lines
are not supported.

## 13. Exact money model

Money is stored as PostgreSQL `numeric(20,0)` minor-unit values and represented
as decimal strings through the API. All calculations use JavaScript `BigInt`.
The application limit is `99_999_999_999_999_999_999`; unit prices, line
totals, and aggregate subtotals are checked before persistence. Zero is valid;
negative, fractional, signed, and scientific notation are rejected.

## 14. Order.version vs Quote.revision

`Order.version` is aggregate-wide concurrency control and increases exactly
once for every successful non-noop command. `OrderQuote.revision` describes
content revisions and increases only after a successful full quote
replacement. Confirmation does not increment quote revision.

## 15. ExpectedVersion

All four mutation routes require a bounded positive `expectedVersion`. The
order row is locked with `pessimistic_write`, then its current version is
compared with the request. A mismatch returns a controlled conflict and creates
no mutation, event, or audit record. Same-manager assignment and repeated
start-review by the current manager are explicit no-ops, but still require the
current version.

## 16. Concurrency behavior

PostgreSQL row locks serialize competing commands. Two start-review commands
or two quote replacements using one version produce one winner and one
conflict. A quote update racing confirmation likewise allows exactly one
transaction to commit, so a confirmed quote cannot contain a partial line
replacement. No process-local mutex is used.

## 17. Command APIs

The staff API adds:

- `POST /admin/api/orders/:id/assign`;
- `POST /admin/api/orders/:id/start-review`;
- `PUT /admin/api/orders/:id/quote`;
- `POST /admin/api/orders/:id/confirm`.

There is no generic status mutation. `GET /admin/api/orders` also accepts
`scope=all|mine|unassigned`; existing pagination, status, and search behavior
is preserved.

## 18. Permission model

The existing permission registry gains `orders.assign`, `orders.review`,
`orders.quote`, and `orders.confirm`. `sales_manager` receives those permissions
and `orders.read.all`; superadmin receives them through the complete registry.
Operator and engineer roles receive none. Every request re-evaluates the
current active session and role union. Quote update and confirmation also
require `assignedManagerId` to equal the acting staff ID, including for a
superadmin.

## 19. Event visibility

`manager_assigned`, `manager_reassigned`, and `quote_updated` are staff-only.
`review_started` and `confirmed` are customer-visible. Client projections
filter staff events and never expose manager IDs, internal comments, or draft
quote data.

## 20. Audit model

The package writes `order.manager.assigned`, `order.manager.reassigned`,
`order.review.started`, `order.quote.updated`, and `order.confirmed`. Trusted
staff and session IDs come from `AdminPrincipal`, never the request body.
Metadata is compact and excludes contact data, addresses, line payloads, and
the internal comment. AuditEvent and domain changes share one transaction.

## 21. Client projection

Customer list and detail responses retain the original order snapshots. They
expose a confirmed quote only when both quote and order state permit it. The
confirmed projection contains revision, currency, exact total, and safe quote
line snapshots; it excludes source line IDs, catalog comparisons, staff
identity, and internal comments. Draft totals are never exposed.

## 22. Admin projection

Admin summaries include safe assignment identity and compact quote status,
revision, unresolved state, and totals. Admin detail includes the original
request, full staff-visible timeline, draft or confirmed quote lines, internal
comment, and safe creator/updater/confirmer identities. Idempotency keys,
fingerprints, password data, and sessions remain absent.

## 23. Migration and existing-data behavior

`AddOrderSalesWorkspaceCore1788182400000` is append-only after CO-2. It adds
nullable assignment and confirmation columns, quote tables, indexes, foreign
keys, checks, and the two assignment event types. Existing orders keep null
assignment fields, their version, status, lines, and events; no quote is
backfilled. `sourceOrderLineId` uses `ON DELETE RESTRICT` because submitted
order lines have no hard-delete API and remain the authoritative request
record.

## 24. Confirmed Quote as future 1C source

When a later isolated 1C integration creates a UT 11.5 customer order, its
commercial source will be the confirmed `OrderQuote` and `OrderQuoteLine`
snapshot, not the preliminary `OrderLine` request. CO-3A stores no 1C IDs and
makes no 1C calls.

## 25. Documents, payment, and deferred fulfillment

CO-3B now implements manual invoice revisions, customer payment proof,
manual full-payment confirmation, OrderDocument ownership, and context-bound
StoredFile downloads. Its contract is documented in
`2026-08-27-order-invoice-payment-workflow.md`. Outbound document delivery,
stock reservation, fulfillment, UPD, and later state transitions remain
deferred to separate packages.

## 26. Explicit exclusions

CO-3A adds no frontend changes, customer quote acceptance, Telegram/MAX/email
notification, OutboundDelivery intent, provider call, scheduler, dependency
change, file workflow, payment workflow, fulfillment workflow, or 1C adapter.

## 27. Acceptance verdict

The backend aggregate now separates the immutable customer request from the
mutable sales proposal, enforces accountable assignment and current RBAC,
uses exact money and transactional optimistic concurrency, and publishes only
the confirmed safe quote to the customer. The package is acceptable when its
clean migration, upgrade drill, schema-drift checks, full local suites, and
hosted CI all pass for the immutable PR head.
