# CO-2 order intake foundation

## Decision status

CO-2 establishes the first durable order-request aggregate in the shared
NestJS/PostgreSQL backend. It is an intake and read foundation, not an
accounting, payment, warehouse, invoice, or complete sales workflow.

The implementation starts from `origin/main` commit
`2bd72c200c5bb1cbc7259c705e734cef4f59253b`. The existing React client remains
on its mock/localStorage order adapter in this package. No Telegram, MAX, 1C,
payment, email, or other provider call is made when an order is submitted.

## Package boundary

Implemented:

- authenticated customer order submission;
- authenticated customer list and detail reads, restricted to the owner;
- read-only staff list and detail APIs;
- immutable product, organization, contact, delivery, VAT, and catalog-price
  snapshots;
- an initial customer-visible `submitted` event;
- a compact AuditEvent in the same database transaction;
- sequential and concurrent idempotency;
- exact minor-unit arithmetic;
- append-only TypeORM migration and schema constraints.

Explicitly deferred:

- switching the client React checkout from its mock adapter;
- staff assignment, comments, status mutations, quotes, invoices, files, and
  payment confirmation;
- notifications and outbound delivery commands;
- cart persistence in PostgreSQL;
- stock reservation or inventory accounting;
- online acquiring;
- automatic 1C integration;
- hard deletion or editing of submitted order snapshots.

## Domain model

```mermaid
erDiagram
    User ||--o{ Order : creates
    Organization o|--o{ Order : linked_snapshot_source
    Order ||--|{ OrderLine : contains
    CatalogProduct ||--o{ OrderLine : snapshot_source
    Order ||--|{ OrderEvent : records
    User o|--o{ OrderEvent : customer_actor
    AdminUser o|--o{ OrderEvent : staff_actor
    CustomerWebSession o|--o{ AuditEvent : customer_session

    Order {
        int id PK
        int createdByUserId FK
        uuid idempotencyKey
        char submissionFingerprint
        varchar status
        int version
        varchar customerType
        int organizationId FK_nullable
        numeric catalogPricedSubtotalMinor
        boolean hasUnpricedItems
        char currency
    }
    OrderLine {
        int id PK
        int orderId FK
        int productId FK
        int position
        varchar skuSnapshot
        varchar slugSnapshot
        varchar nameSnapshot
        numeric catalogUnitPriceMinor
        smallint vatRateSnapshot
        int quantity
        numeric catalogLineTotalMinor
    }
    OrderEvent {
        int id PK
        int orderId FK
        varchar type
        varchar fromStatus
        varchar toStatus
        varchar actorType
        int actorUserId FK_nullable
        int actorStaffId FK_nullable
        varchar visibility
        jsonb metadata
    }
```

### Order

`Order` is the aggregate root. `createdByUserId` is the authenticated backend
identity and the ownership boundary. The public order number is derived from
the immutable integer primary key as `VM-00000001`; it is presentation data and
is not a second mutable identity column.

The database reserves these workflow states:

- `submitted`;
- `in_review`;
- `confirmed`;
- `waiting_payment`;
- `paid`;
- `fulfilled`;
- `completed`;
- `cancelled`.

CO-2 creates only `submitted`. It deliberately exposes no status mutation
endpoint. `version` is a TypeORM version column reserved for optimistic
concurrency when command handlers are added later.

### OrderLine

The client supplies only `productId` and `quantity`. Product name, SKU, slug,
brand, VAT, and catalog price are read by the backend and copied to the line.
Later catalog edits therefore do not rewrite a submitted order.

One product may appear only once in an order. Position is retained separately
for deterministic presentation. Product deletion is restricted while a line
references it; the snapshot still protects the commercial history from normal
catalog edits.

### OrderEvent and AuditEvent

Every successful submission creates one customer-visible `submitted`
`OrderEvent`. Event types for later workflow packages are reserved, but CO-2
does not manufacture future events or transitions.

The same transaction writes `order.submitted` to the existing audit log. Audit
metadata is intentionally compact: order number, customer type, linked
organization ID when present, line count, and whether an unpriced line exists.
It excludes contact details, comments, item descriptions, the idempotency key,
and the submission fingerprint.

The pre-existing `AuditEvent.actorSessionId` points to an admin session and
cannot hold a customer web-session ID. Migration
`1788096000000-AddOrderIntakeFoundation` therefore adds the separate nullable
`actorWebSessionId -> customer_web_sessions.id` relation and an explicit
`AuditInput.actorWebSessionId`. Existing staff callers continue to use
`actorSessionId`; order intake records the customer session separately.

## Customer and organization rules

Two customer shapes are accepted:

1. `individual`: organization fields and `organizationId` are forbidden.
2. `organization`: exactly one organization source is required.

An organization order can reference an existing `organizationId` only when the
authenticated user has an active `OrganizationMember` relation. The backend
reads canonical organization fields through that relation and snapshots them.
An inaccessible ID is reported as not found, avoiding organization discovery.

Alternatively, the request may contain a bounded manual organization snapshot.
This supports first contact without silently creating an Organization or
membership. Manual organization data remains part of that order only.

Both variants persist the submitted legal/contact context. Later edits to a
linked Organization do not mutate old orders.

## Delivery and contact snapshots

Contact name and phone are required; email is optional and normalized to
lowercase. Phone input is reduced to a bounded international digits form.

Delivery types are:

- `pickup`: city and address optional;
- `courier`: city and address required;
- `transport_company`: city required, address optional.

The database repeats essential customer, identifier, contact, and delivery
shape checks so invalid rows cannot bypass the HTTP DTO contract.

## Catalog eligibility and money

All requested products are fetched in one bounded query with their category.
Submission is rejected when an ID is missing, a product is inactive or
unpublished, its category is unpublished, or availability is `unavailable`.
The accepted presentation availability states are `in_stock`, `low_stock`, and
`on_request`. CO-2 does not reserve stock.

Prices are catalog snapshots, not final accounting totals. Money is stored as
`numeric(20,0)` minor units and serialized as decimal strings. Arithmetic uses
JavaScript `BigInt`; floating-point multiplication is not used.

When every line has a price, `catalogTotalMinor` equals the exact priced
subtotal. When at least one product is price-on-request, that line has null unit
and line totals, `hasUnpricedItems` is true, the priced subtotal still describes
known lines, and `catalogTotalMinor` is null. Currency is fixed to `RUB`.

## Idempotency and transaction contract

`POST /api/client/orders` requires an `Idempotency-Key` header containing a
UUID. The unique database key is `(createdByUserId, idempotencyKey)`, so two
customers may independently use the same UUID.

The server builds a SHA-256 fingerprint from normalized customer-controlled
input. Item order is canonicalized by `productId`. The fingerprint does not
include current catalog fields or prices and is never returned by an API.

For one customer/key pair, PostgreSQL `pg_advisory_xact_lock` serializes
concurrent submissions before the existing-row lookup. Outcomes are:

- first valid request creates the complete aggregate;
- replay with the same normalized input returns the existing aggregate and
  creates no duplicate lines, events, or audit rows;
- replay with changed input returns `409 Conflict`;
- a different customer can reuse the UUID;
- a failed transaction leaves no partial order, lines, event, or audit row.

Organization authorization, catalog validation, aggregate inserts, the first
domain event, and AuditEvent all run in one transaction.

## HTTP API

### Customer API

All routes require the existing customer web session:

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/client/orders` | Submit an order request |
| `GET` | `/api/client/orders` | List the current customer's orders |
| `GET` | `/api/client/orders/:id` | Read one owned order |

List query parameters are `page`, `limit` (maximum 100), and optional `status`.
External PostgreSQL integer identities are bounded at the HTTP boundary to
`1..2,147,483,647`, including product IDs, linked organization IDs, and both
client/admin order path parameters. Invalid and out-of-range path IDs are
rejected before an order query. `page` has a separate hard maximum of `100,000`,
keeping offset arithmetic safe and preventing meaningless unbounded offsets.
Cross-customer detail access returns the same `404` shape as a missing order.

Submission also requires a same-origin or explicitly configured browser origin
and uses the existing rate-limit guard with a dedicated `10 requests / 600
seconds` bucket. Sensitive reads use the existing bounded read bucket.

Representative submission shape:

```json
{
  "customerType": "organization",
  "organizationId": 42,
  "contact": {
    "name": "Иван Петров",
    "phone": "+7 999 123-45-67",
    "email": "buyer@example.ru"
  },
  "delivery": {
    "type": "transport_company",
    "city": "Красноярск",
    "comment": "Согласовать терминал"
  },
  "comment": "Нужен счет на организацию",
  "items": [
    { "productId": 10, "quantity": 2 }
  ]
}
```

### Staff API

Staff routes use the existing admin session and permission guards:

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/admin/api/orders` | Bounded cross-customer order list |
| `GET` | `/admin/api/orders/:id` | Complete order snapshot and event history |

Both require `orders.read.all`. The permission is granted to
`sales_manager`; `superadmin` inherits the full permission set. Operator and
engineer roles do not receive it. CO-2 adds no staff mutation route.

The admin list supports status and parameterized search by formatted order
number, organization INN/name, contact phone, or contact email. Wildcard input
is escaped before `ILIKE` matching.

## Validation and error semantics

- malformed DTOs, duplicate product IDs, invalid delivery shape, and missing or
  malformed idempotency keys return `400`;
- inaccessible organizations and non-owned/missing orders return `404`;
- unavailable catalog state, conflicting idempotency replay, invalid linked
  organization data, or a database constraint conflict return `409`;
- unauthenticated sessions return the existing authentication response;
- disallowed/missing mutation origins return `403`;
- rate-limit exhaustion returns `429`.

DTO fields, arrays, free text, quantities, and pagination are bounded. The
global whitelist/transform validation remains the outer HTTP boundary.

A linked canonical Organization is normalized and validated against the
immutable Order snapshot contract before aggregate insertion: required trimmed
name up to 300 characters, normalized 10/12-digit INN, optional exact KPP/OGRN,
addresses up to 500 characters, and tax system up to 100 characters. Unsupported
live data fails with a safe `409` and no partial aggregate; it is never silently
truncated and the Organization itself is not changed. Existing idempotent replay
loads the saved order before consulting mutable live organization data.

PostgreSQL `22001` and `22003` are mapped to the same controlled persistence
conflict as a defensive fallback. Normal control flow rejects unrepresentable
IDs and snapshot values before SQL execution.

## Migration

`1788096000000-AddOrderIntakeFoundation` is appended after
`1788009600000-HardenFileLifecycle`. It creates:

- `orders`;
- `order_lines`;
- `order_events`;
- indexes, unique constraints, checks, and foreign keys for the aggregate;
- `audit_events.actorWebSessionId`, its index, and its foreign key.

The migration contains no seed data, environment-specific values, external
calls, drops, or renames. Its `down` path removes only CO-2-owned constraints,
indexes, tables, and the added audit column. Persistent environments must apply
it with the repository migration command; `synchronize` remains disabled.

## Verification contract

Unit characterization covers normalization, stable/changed fingerprints,
exact BigInt multiplication and subtotal calculation, unpriced lines, public
number formatting, customer shapes, and delivery rules.

PostgreSQL integration coverage includes:

- migration tables, foreign keys, checks, and migration-history update;
- linked and manual organization orders plus individual orders;
- ownership isolation and cross-user IDOR behavior;
- product publication/category/availability validation and payload tampering;
- exact and nullable money snapshots;
- snapshot immutability after catalog changes;
- sequential and concurrent idempotent replay;
- changed-payload conflict and same-key use by different users;
- bounded customer pagination and status filter;
- read-only staff API, RBAC, and parameterized search;
- transactional rollback of all domain/audit writes;
- authentication, origin, idempotency-header, and rate-limit boundaries.

The integration suite uses the isolated `vitma_co2_test` database, fake bot
configuration, disabled polling, and disabled outbound worker. It performs no
real Telegram, MAX, 1C, payment, email, or other provider call.

## Upgrade and rollback posture

The intended deployment path is append-only migration from the current main
schema. Existing catalog, customer, organization, session, file, registration,
service-request, support, and knowledge rows must remain unchanged. Verification
must cover both a clean database and a database created by the previous main
migration chain before CO-2 is merged.

The local pre-merge drill used no development or production database. A
temporary database was built from the seven migrations at the baseline SHA and
populated with the repository's synthetic backup-drill fixture. Before and
after applying CO-2, all 51 pre-existing application tables contained 17 rows
and produced the same canonical row signature:
`3c80953f6f17324f97af49b443f4023bb8cc4686a5ef95f6740f5c54a3f7c2c7`.
After the upgrade, migration history contained eight entries ending with
`AddOrderIntakeFoundation1788096000000`; the three new order tables were empty.
The temporary database, storage, and detached baseline worktree were removed.

A separate clean-database check applied all eight migrations, repeated
`migration:run` with no pending work, showed all eight entries as applied, and
reported no TypeORM schema synchronization queries.

Rollback is schema-only and destructive for orders created after deployment.
Therefore `migration:revert` is suitable for disposable verification databases,
not as an automatic production rollback after accepting real orders. A
production rollback decision must first preserve new order rows.

## Next safe packages

1. Connect the existing client checkout adapter to the authenticated API and
   handle idempotency/replay without changing this backend contract.
2. Add staff assignment and explicit state-transition commands with optimistic
   version checks, OrderEvents, and transactional AuditEvents.
3. Add invoice/document attachment through the existing StoredFile lifecycle
   and durable outbound delivery commands.
4. Add customer-visible order updates and notifications.
5. Design a separate, isolated 1C adapter after the manual workflow is proven.

None of those capabilities is implied to be complete by CO-2.
