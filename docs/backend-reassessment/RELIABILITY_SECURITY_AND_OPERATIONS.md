# Reliability, security and operations

## Reliability and consistency

| Finding | Evidence | Impact | Gate | Direction |
|---|---|---|---|---|
| Domain workflows are mostly multi-save without transaction | `RegistrationsService`, `ServiceRequestsService`, `TicketsService` | state/event/activity/file/delivery may diverge | Backend v1 for core persistence | transaction around local state; external delivery after commit |
| No outbox or delivery ledger | messenger/admin notification calls | saved state may not be delivered; no retry/status | public pilot | transactional outbox + bounded retry/idempotent dispatcher |
| No general idempotency key | public create/answer routes | duplicate requests under retry/double click | Backend v1 for order/request create | per-command key + unique constraint/result replay |
| No optimistic version/conditional transitions | mutable registration/request/ticket rows | lost update and stale admin action | Backend v1 for key transitions | version/expected status update |
| Active ticket/draft uniqueness is service-only | query then insert | concurrent duplicate rows possible | public pilot | partial unique/index or transactional lock where justified |
| Integration batch dedupe partly JSONB/service logic | `IntegrationsService.importBatch` | concurrent same sync/batch race remains | production integration | stable unique batch identity/locking |
| Logical file delete leaves bytes | `FilesService.logicalDelete` | retention and disk growth | public pilot | retention purge with reference checks |

`TEST_CONFIRMED`: admin staff creation/role changes use transactions; integration entity application per batch uses a transaction; ATOL temp cleanup works on success/error. These do not make all end-to-end operations atomic.

## Delivery behavior

- Telegram/MAX adapters are behind `MessengerService`, but domain code often sends immediately after DB save.
- Web delivery is effectively polling/read-after-write, not a pushed notification.
- Admin notifications are preference-based best effort; no per-recipient status.
- Failure logging exists in selected paths, but there is no durable retry, dead letter or operations queue.
- Operator chat pairing is persisted and reciprocally checked. Missing/stale context, deactivated staff and closed ticket fail safe (`TEST_CONFIRMED`).

Outbox is not required before contract-first frontend work, but it is required before public pilot for invoice/status/admin notifications that must not be silently lost.

## Security

### Confirmed controls

- `TEST_CONFIRMED`: no fallback admin credentials, strong password hashing, session expiry/revocation/deactivation, last-superadmin protection and multi-role permissions.
- `TEST_CONFIRMED`: same-origin rejection for admin mutations; production CORS allowlist cannot silently become wildcard.
- `TEST_CONFIRMED`: anonymous web sessions are isolated and body-selected identity is ignored.
- `TEST_CONFIRMED`: ticket file owner/staff permissions and negative RBAC checks.
- `TEST_CONFIRMED`: file signatures, size limits, random object keys, basename sanitation and path traversal prevention.
- Audit metadata redacts secret-like keys and buffers; API errors use a stable redacted shape.

### Risks by gate

**Blocks Backend v1**

- Organization IDOR by business design: `link-by-inn` grants active owner access with no authority proof. Membership checks cannot compensate for unsafe claim creation.
- Stable public ownership must remain session-bound; no endpoint may accept platform/chatId/userId as authority.
- New order/request/document endpoints need explicit ownership and unguessable access semantics.

**Blocks public pilot**

- Define CSRF policy for client mutations. `SameSite=Lax` plus CORS is useful but no explicit Origin/CSRF check mirrors admin protection.
- Production secrets/TLS/reverse proxy/CORS/cookie settings require deployment verification.
- Add durable delivery, external backup including files, restore drill, retention and minimum monitoring.
- Decide malware scanning requirement for customer documents.

**Production hardening**

- In-memory rate limits are per process and unbounded except periodic cleanup; distributed deployment changes behavior.
- CSP is disabled.
- File authorization is repeated in domain controllers rather than enforced through a single file-access policy boundary.
- Audit coverage is security/admin-focused; many customer and operator business mutations do not emit AuditEvent.
- Provider bridges store browser profiles/credentials outside Nest; permissions, rotation and log redaction remain operational controls.

## Integrations and jobs

- No Nest scheduler, Redis or queue. Bridge sync is manual/external-scheduler driven.
- Bridges bind to loopback by default and use a shared key to internal import. Browser automation and private provider APIs are inherently brittle.
- Integration runs/errors/checkpoints and opportunities provide a good operational record.
- `shadow` imports core data and observations but suppresses customer-facing automation. Documentation and UI must call it “shadow apply”, not dry-run.
- `UNKNOWN`: live ATOL/OFD selectors/contracts and legal access. No external calls were made in this audit.
- 1C adapter, catalog import and order export are `MISSING` and not required for first Backend v1 if manual catalog administration is accepted.

## Observability

Present: request IDs, Nest logs, AuditEvent, integration run/error records, `/health/live`, DB/migration readiness and admin bridge health.

Missing for public pilot: structured correlation across request/domain event/delivery; current bot polling state; storage writability/capacity; latest migration readiness; delivery backlog/failures; minimal request/error/duration metrics and alert thresholds.

`/health/ready` currently checks only DB plus one older migration name. It can report ready after a newer required migration is missing.

## Test and CI inventory

| Layer | Result 2026-08-18 | Coverage note |
|---|---|---|
| Config + lint ratchet | passed | existing debt 2043 errors/13 warnings; no regression |
| Unit/handler | 18 suites, 71 tests passed | good B1/file/security branches; many giant-service branches untested |
| PostgreSQL migrations | passed twice, all 5 shown | schema log clean |
| Integration | 4 suites, 30 tests passed | core workflows, security, integrations and route uniqueness |
| E2E | 2 suites, 6 tests passed | HTTP/UI serving and backup archive verification; not full product journeys |
| Production builds | admin/client/server passed | client bundle warning >500 kB, unrelated to backend gate |
| Offline smoke | passed | Nest bootstrap, live/ready, React routes, admin login/logout |

Important gaps: no integrated organization claim negative policy because policy does not exist; no web registration photo parity; no catalog/order tests; no concurrency/idempotency tests; no delivery retry tests; limited domain audit assertions; no live provider tests by design.

All runs used an isolated PostgreSQL 16 on localhost, temporary storage and polling disabled. No production resources or real Telegram/MAX/ATOL/OFD calls were used.

## BKV1-1 reliability delta

Пакет добавляет optimistic draft updates, row locking для submit/attachment limit, per-customer submit idempotency и hashed public access tokens. FileStorage остаётся единственным источником содержимого вложений, пользовательские filenames не становятся object keys. Это не решает durable messenger delivery, глобальную update deduplication, antivirus, retention scheduler или multi-replica realtime. Миграция и backfill проверяются только на disposable test DB; production/historical resources не подключались.
