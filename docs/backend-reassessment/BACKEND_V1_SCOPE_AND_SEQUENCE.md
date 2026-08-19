# Backend v1 scope and sequence

## Definition of done

Backend v1 for the client site is a stable modular-monolith contract for service requests, KKT registration, organization/equipment context, catalog and order-request. Every public mutation has server-derived identity, validation, ownership, idempotent or guarded transition behavior, persisted history and tested admin visibility. Client-safe DTOs/statuses and OpenAPI describe that contract.

Backend v1 does not mean production operations are finished. Public pilot additionally requires durable delivery, deployment, monitoring, backup/restore and retention.

## A. Required before full site rework

| Capability | Value / dependency | Size / risk | Acceptance |
|---|---|---|---|
| Canonical service request | real service pages; builds on existing entity/workflow | L / high migration risk | structured versioned answers, general attachments, org/location/equipment links, internal/customer status, history and admin card work end-to-end |
| KKT registration parity | one promise across web/bots | M / medium | identical required schema/photo/submit/resume/cancel/PDF across three channels |
| Safe organization context | prevents exposing company data | M / high business-policy risk | claim creates pending/restricted access until approved or verified; ownership negative tests pass |
| Minimal location/equipment linkage | service request identifies where/what to service | M / medium | FK-backed location/equipment selection and snapshots visible to operator |
| Real catalog | removes mock product contracts | L / medium | admin can publish product; public list/detail comes from PostgreSQL |
| Minimal order-request | checkout becomes a real operation | L / high | snapshot items/contact, idempotent submit, status history and manager queue |
| Stable API/OpenAPI | lets React redesign proceed without entity leakage | M / medium | response DTOs, enums/errors, generated OpenAPI and contract/integration tests |

## B. Can proceed in parallel with frontend

| Capability | Why here | Size | Acceptance |
|---|---|---|---|
| Additional service types | does not alter core contract after BKV1-1 | S/M | new type uses supported form schema and all channels intentionally expose it |
| Admin ergonomics | consumer of stable APIs | M | queues/cards use new DTOs without changing invariants |
| Equipment enrichment | optional value beyond request linkage | M | provenance and fields have explicit ownership |
| Bot text/menu refinement | presentation layer | S | callback compatibility and handler tests remain green |
| Catalog content/images | data population | M | published content passes validation and file policy |

## C. Required before public pilot

| Capability | Dependency | Size / risk | Acceptance |
|---|---|---|---|
| Outbox/delivery status/retry | stable domain events | L / high | required messages survive restart and expose failed delivery operations |
| Production deployment/security verification | finalized topology | M / high | TLS/proxy/CORS/cookies/secrets/CSP decision tested in deployment |
| External backup and restore | final DB/FileStorage layout | M / high | scheduled DB+files backup and clean-host restore drill pass |
| Retention/storage monitoring | final document policy | M / medium | deleted/orphan/temp files expire safely; capacity alerts exist |
| Minimum observability | stable workflows | M / medium | correlation, readiness, polling/sync/delivery/error metrics and alerts |
| Concurrency hardening | final transitions | M / high | duplicate submit and stale operator actions are rejected/replayed safely |

## D. Defer after first product

Direct 1C API, exact warehouse stock, automatic accounting documents, SMS OTP, complete channel merge, reminders, S3, universal form builder, broad non-KKT equipment and advanced analytics. They do not need to shape the first client contract if extension points and snapshots are preserved.

## Vertical packages

### BKV1-0 — Organization access approval (implemented)

- **Result:** knowledge of INN creates a pending request, not active owner membership.
- **Review:** operator/superadmin manually approve or reject; approval creates `representative` atomically.
- **Safety:** session ownership, RBAC negatives, partial unique pending constraint and concurrent submit/approve tests.
- **Limits:** existing memberships are preserved; no legal identity proof, invitations, channel merge or detailed ACL.
- **Details:** `docs/backend-v1/BKV1_0_ORGANIZATION_ACCESS.md`.

### BKV1-1 — Canonical service requests

- **Goal/result:** one real web/bot/admin request contract, including structured answers, attachments, customer status and history.
- **Modules:** service requests, client workflow, files, organizations/assets, admin, Telegram/MAX.
- **Schema/API:** additive form version, links, attachments/status projection; versioned DTOs; backfill existing answers/statuses.
- **Tests:** web/Telegram/MAX characterization, ownership/IDOR, file policy, duplicate submit, transition race, admin/customer views.
- **Risk/size:** L; existing giant service and legacy ATOL subtype. Preserve current callbacks and file columns during migration.
- **Acceptance:** one type submitted in all channels yields equivalent persisted request and operator card. No new catalog/order work.

### BKV1-2 — Registration parity

- **Goal/result:** same required KKT registration in web, Telegram and MAX.
- **Modules:** registrations, client workflow, files/PDF, admin, bot adapters.
- **Schema/API:** versioned definition/state normalization, additive migration/backfill, multipart photo endpoint.
- **Tests:** required photo, resume/cancel, duplicate submit, PDF, ownership, admin download across channels.
- **Risk/size:** M; historical flags/paths. Keep legacy reads until migrated.
- **Acceptance:** equivalent inputs produce equivalent records/files/statuses. No migration into ServiceRequest.

### BKV1-3 — Customer organization, location and equipment context

- **Goal/result:** client can safely select an approved organization, location and KKT for a request.
- **Modules:** users/web session, organizations, assets, admin, integration mappings.
- **Schema/API:** pending/verified claim, Location, FK/backfill, explicit membership capabilities.
- **Tests:** foreign INN/ID denial, approval, membership roles, equipment isolation, provider/manual precedence.
- **Risk/size:** L; business verification policy is required first.
- **Acceptance:** knowing an INN or numeric ID never grants access; request links are FK-valid.

### BKV1-4 — Catalog and order-request

- **Goal/result:** published product to persisted checkout and manager queue.
- **Modules:** new catalog/orders boundaries, files, admin, web session, audit/notifications.
- **Schema/API:** product/publication/price/availability; order/item snapshots, history, assignment, document links and idempotency key.
- **Tests:** publication visibility, immutable snapshots, duplicate checkout, ownership/token, admin queue/documents.
- **Risk/size:** XL; entirely missing domain. Start with manual admin data, no direct 1C.
- **Acceptance:** refresh/retry cannot lose or duplicate an order and manager sees the exact submitted snapshot.

### BKV1-5 — Stable contracts and Backend v1 verification

- **Goal/result:** frontend can redesign against frozen v1 endpoints.
- **Modules:** controllers/DTO/OpenAPI, error handling, CI, all consumers.
- **Schema/API:** no new business model except fixes exposed by verification; compatibility window for legacy routes.
- **Tests:** OpenAPI diff/contract, full vertical integration, security negative, migrations twice, builds/offline smoke.
- **Risk/size:** M; hidden direct entity dependencies.
- **Acceptance:** documented DTOs cover all A capabilities and React/bots/admin pass against them.

### BKV1-6 — Public pilot reliability

- **Goal/result:** operationally supportable deployment.
- **Modules:** notifications, audit/operations, health, backup, storage, deployment.
- **Schema/API:** outbox/delivery records and operational endpoints only as needed.
- **Tests:** crash/retry/idempotency, restore drill, readiness degradation, delivery failure, retention.
- **Risk/size:** L; operational topology must be known.
- **Acceptance:** required state and documents survive failures; failures are visible and recoverable. This package may run partly in parallel after BKV1-1 events stabilize.

## Dependency order

`BKV1-0 -> BKV1-1 -> BKV1-2 -> BKV1-3 -> BKV1-4 -> BKV1-5`, with the organization approval foundation already complete. BKV1-3 still adds location/equipment context and explicit capabilities. BKV1-6 begins once event/transition contracts stabilize and completes before pilot.

## Readiness checklist

- No frontend production success is local-only.
- Every customer resource is session/channel owned and organization claims are verified.
- Service request and registration parity tests cover web/Telegram/MAX.
- Catalog/order are PostgreSQL-backed with snapshots and idempotency.
- DTO/OpenAPI/error/status contracts are explicit and tested.
- Migrations/backfill are repeatable and schema log is clean.
- Admin queues consume the same aggregates.
- Before pilot: delivery retry, backup/restore, retention, readiness and alerts are proven.

## BKV1-1 implementation note

BKV1-1 теперь реализует canonical ServiceRequest поверх существующего агрегата, не создавая параллельной V2-модели. Общими стали form version, structured answers, request number, source, customer status, snapshots, attachments, messages и guarded transitions. Старые bot callbacks и предметные поля invoice/payment/visit/ATOL сохранены. Следующая пачка должна опираться на этот контракт и не возвращать channel-specific заявки.

Pre-merge migration drill завершён с verdict `PASS`: 13 реальных legacy-заявок и 16 synthetic cases сохранили инварианты, FileStorage и runtime/admin/bot/web compatibility проверены на временных копиях. После зелёного CI и merge BKV1-1 последовательность может переходить к BKV1-2; детали: [`../backend-v1/BKV1_1_MIGRATION_DRILL.md`](../backend-v1/BKV1_1_MIGRATION_DRILL.md).
