# CH-R2 durable outbound delivery

## 1. Executive summary

CH-R2 adds a PostgreSQL-backed outbound delivery boundary to the existing
NestJS modular monolith. Business-significant Telegram and MAX messages are
now recorded before provider delivery, retried after transient failures and
recoverable after application restarts. The implementation uses the existing
`MessengerService`, `FilesService` and `StoredFile` abstractions and does not
introduce an external queue or another deployable service.

The guarantee is durable at-least-once intent, not exactly-once provider
delivery. A provider message can be duplicated if the provider accepts it and
the process fails before PostgreSQL records `sent`.

## 2. Baseline

- source `main`: `9e3cff7a2d76a4dbbb8e3458312fc27c9eac5f11`;
- implementation branch: `codex/ch-r2-durable-outbound-delivery`;
- previous migration: `AddDurableInboundCommands1787577304950`;
- CH-R1 inbound identities, advisory locks, fail-closed interrupted command
  handling, V2 callbacks and persisted dialog state are unchanged.

## 3. CH-002 problem statement

Before CH-R2, several paths committed a domain mutation and then called a
messenger provider. A provider failure could therefore leave a saved invoice,
message or state transition without a recoverable delivery. Other ticket paths
sent first and saved history afterwards, so a successful provider call followed
by a database failure could leave no local history. Staff fan-out used
best-effort error logging and had no durable per-recipient status.

## 4. Outbound call inventory

| Area | Classification | CH-R2 decision |
| --- | --- | --- |
| `MessengerRouterService`, Telegram/MAX messenger adapters | transport infrastructure | retained; called by the worker or immediate adapters |
| `OutboundDeliveryProcessor` `sendMessage`/`sendImage`/`sendDocument` | durable business delivery | new single provider boundary for migrated flows |
| `AdminNotificationsService` text/document fan-out | business-significant | converted to one durable row per staff member and platform |
| service request invoice, visit, staff reply and status messages | business-significant | converted with transactional enqueue |
| ticket operator text/media from admin UI and messenger operator mode | business-significant | converted with local history and intent in one transaction |
| customer ticket/service-request messages notifying staff | business-significant | converted with local history and staff intents in one transaction |
| registration completion text/PDF staff notification | business-significant | converted to `StoredFile`-backed durable fan-out in the completion transaction |
| registration readiness data request | existing specialized lifecycle | retained with `delivered`/`delivery_failed` and its existing retry semantics |
| Telegram/MAX form questions, menus, stale callback replies and acknowledgements | immediate conversational presentation | deliberately retained synchronously |
| operator connect/disconnect notices | immediate session presentation | deliberately retained synchronously |
| generated ATOL consent returned to the current inbound command | immediate document presentation | deliberately retained synchronously |
| admin-requested registration PDF display | immediate on-demand presentation | deliberately retained synchronously |
| tests and fake messenger calls | internal/test-only | no provider network access |

No unclassified direct business send remains in the mandatory CH-R2 paths.

## 5. Architecture decision

The package adds one infrastructure module:

```text
business transaction
  -> domain mutation / local message history
  -> OutboundDeliveriesService.enqueue(..., EntityManager)
  -> commit

OutboundDeliveryProcessor
  -> claim eligible PostgreSQL rows
  -> commit claim transaction
  -> call MessengerService outside the transaction
  -> persist sent or retry/failed state
```

Inbound and outbound persistence remain separate because their recovery
semantics differ. CH-R1 interrupted inbound commands fail closed; CH-R2 stale
outbound processing is retried while attempts remain.

## 6. Delivery entity and schema

Migration `AddDurableOutboundDeliveries1787664000000` creates
`outbound_deliveries` with:

- logical identity: `dedupeKey`;
- destination: `platform`, `recipientChatId`, `audience`;
- content identity: `kind`, compact JSON `payload`, optional `storedFileId`;
- source link: `sourceType`, `sourceId`;
- lifecycle: `status`, `attemptCount`, attempt/claim/send timestamps;
- claim ownership: `claimToken`;
- provider diagnostic: optional `providerMessageId`, sanitized `lastError`.

The table has a unique dedupe index, eligible-work and source indexes, status,
platform, kind, audience and file-kind checks, and a `RESTRICT` FK to
`stored_files`.

## 7. Status model

- `pending`: committed and eligible for its first attempt;
- `processing`: claimed by one worker;
- `retrying`: transient failure with a persisted future `nextAttemptAt`;
- `sent`: provider returned success and PostgreSQL recorded it;
- `failed`: automatic retry limit exhausted.

Rows are retained for diagnostics. CH-R2 does not add a retention worker or a
manual queue dashboard.

## 8. Dedupe semantics

`dedupeKey` identifies a logical delivery, for example:

- `service-request:<id>:invoice:<fileId>:customer`;
- `service-request-message:<messageId>:customer`;
- `ticket-message:<messageId>:customer`;
- `<business-key>:staff:<adminId>:<platform>`.

Enqueue uses `INSERT ... ON CONFLICT DO NOTHING`, then verifies that an existing
row has the same platform, recipient, kind, audience, source, file and normalized
payload. Reusing a key for a different intent fails instead of silently sending
the wrong content.

## 9. Transactional enqueue semantics

`enqueue` accepts an optional TypeORM `EntityManager`. Migrated service request,
ticket and registration operations save their domain/history rows and delivery
intents in the same PostgreSQL transaction. A forced enqueue failure rolls the
business mutation and intent back together. Provider calls never occur inside
these request transactions.

Files are materialized in `StoredFile` before document intent creation. File
creation failures and transaction failures use the existing logical-delete
cleanup where the affected flow already owns the new file.

## 10. Worker and claim semantics

The in-process worker polls in bounded batches. A short transaction selects
eligible rows with `FOR UPDATE SKIP LOCKED`, marks them `processing`, assigns a
UUID claim token and increments the attempt count. The transaction is released
before any network call. State updates require the same row, status and claim
token, so another worker cannot finalize a claim it does not own.

The default poll interval is five seconds and is startup-validated to the range
one to sixty seconds. The worker stops scheduling new runs and waits for its
active run during graceful application shutdown.

## 11. Retry policy

There are at most four provider attempts: the initial attempt and three retries.
Retry delays are 30 seconds, 2 minutes and 10 minutes. This is intentionally
small and bounded for customer documents and notifications. The row becomes
terminal `failed` after attempt four.

## 12. Crash and restart semantics

A `processing` claim older than five minutes is stale. If fewer than four
attempts have been recorded, a new worker reclaims it, increments the count and
retries. A stale claim already at the limit becomes `failed` without a fifth
provider call. The latest diagnostic states that the previous provider outcome
is indeterminate.

Pending, retrying and processing rows are PostgreSQL state and survive process
restart. No in-memory queue is authoritative.

## 13. Exactly-once limitation

Telegram and MAX sends used here do not expose a verified idempotency contract
that can close this window:

```text
provider accepts message
  -> process or sent-state write fails
  -> stale claim is retried
  -> provider may receive a duplicate
```

CH-R2 prefers possible duplication over permanently losing a business-critical
invoice or message. Single-worker claim prevents normal concurrent duplicate
sends, and enqueue dedupe prevents duplicate logical rows, but neither can turn
the provider operation into exactly-once delivery.

## 14. Converted flows

- invoice attachment and customer document delivery;
- scheduled visit notification;
- operator-to-customer service request text;
- paid, completed, closed and cancelled service request notifications;
- channel service request submission/price confirmation staff fan-out;
- web/public customer service request text and attachment staff fan-out;
- payment proof and signed ATOL consent staff fan-out;
- admin and messenger operator ticket text/media to the customer;
- customer ticket text/media notifications to staff;
- registration completion text and generated PDF notifications;
- all `AdminNotificationsService` fan-out recipients.

Staff recipients are independent rows. Failure for one platform or employee
does not change another recipient's state and a provider failure cannot roll
back the already committed domain operation.

## 15. Flows deliberately left synchronous

Current form prompts, menus, callback acknowledgements, stale-command replies,
operator session connect/disconnect notices, current-command ATOL PDF responses
and admin-requested PDF views remain presentation of an active interaction.
Moving them would change command UX without adding a durable business contract.

Registration readiness data requests retain their specialized lifecycle. They
already track open, delivered, delivery failure, answer and close state, and a
generic conversion would risk their response-token semantics. Registration
handoff completion fan-out uses durable rows, but its existing readiness
transition remains a separate transaction.

## 16. Admin failure visibility and RBAC

Authorized ticket details include a read-only delivery list. Service request
details include the same sanitized list and delivery status entries in the
existing event presentation. Operators see pending, processing, retrying, sent
or failed state, platform, audience, masked recipient, attempt count, timestamps
and sanitized latest error.

Payload text, full recipient IDs, file content and filesystem paths are not
returned by the delivery view. Existing ticket/service-request read permissions
remain the authorization boundary; no queue-wide endpoint or new permission was
added.

## 17. StoredFile handling

Document/image rows store only a `storedFileId` FK plus compact filename/caption
metadata. At send time the worker opens the file through `FilesService` and
passes the stream to the messenger adapter. Provider URLs, binary buffers,
authorization headers and bot tokens are not persisted. Provider errors have
URLs, bearer credentials and long token-like values redacted before storage.

Physical deletion, orphan reconciliation and retention are deferred to CH-R3.

## 18. Registration readiness compatibility

CH-R2 does not change response UUIDs, requirement state, active-request
constraints, delivered/delivery-failed state or retry behavior in
`RegistrationReadinessService`. Its existing integration tests remain part of
the required database suite.

## 19. Tests

PostgreSQL integration coverage proves:

- atomic commit and forced rollback;
- logical enqueue deduplication and conflicting-intent rejection;
- pending to sent transition and provider message ID capture;
- transient failure followed by success;
- terminal failure after four attempts;
- concurrent workers claim a row once;
- stale processing recovery and exhausted stale handling;
- a real post-send sent-state persistence failure and possible duplicate;
- StoredFile document opening without provider URL persistence;
- independent staff recipient rows;
- ticket history plus staff intent rollback/commit;
- service request staff history plus customer intent rollback/commit;
- token-bearing error redaction;
- invoice intent creation independent of provider availability.

Unit handler tests verify Telegram and MAX operator text/media use enqueue paths
and do not call provider copy/send APIs directly. Full CH-R1, readiness,
integration, security and offline suites remain required before merge.

## 20. Migration impact

The migration is additive and follows `AddDurableInboundCommands1787577304950`.
It does not edit either previous migration and does not use `synchronize`.
There is no destructive backfill. Existing `StoredFile` rows can be referenced
without changing storage providers.

## 21. Failure and recovery matrix

| Failure point | Durable result | Recovery |
| --- | --- | --- |
| domain transaction fails | neither mutation nor intent commits | caller retries business operation |
| provider unavailable | mutation committed; row becomes `retrying` | bounded automatic retry |
| provider keeps failing | row remains `failed` | operator can diagnose; manual requeue is deferred |
| process stops before claim | `pending` remains | next instance claims it |
| process stops during provider call | stale `processing` remains | retry under at-least-once policy |
| provider accepts, sent write fails | stale indeterminate row | retry may create a provider duplicate |
| two workers poll together | one claim owns each row | `SKIP LOCKED` prevents normal concurrent send |
| StoredFile cannot be opened | attempt fails with sanitized diagnostic | retry, then terminal failure |
| one staff recipient fails | only that recipient row retries/fails | other recipient rows proceed independently |

## 22. Remaining limitations

- exactly-once provider delivery is not available;
- only the latest sanitized error and aggregate attempt count are retained, not
  a separate row per attempt;
- there is no manual requeue action or queue dashboard;
- worker scheduling is a simple in-process poller, not an external scheduler;
- registration readiness remains a separate specialized delivery lifecycle;
- FileStorage retention and orphan reconciliation remain CH-R3 work.

## 23. Explicit exclusions

CH-R2 does not implement CH-R3, a security review, Catalog + Orders, frontend
redesign, handler decomposition, dependency/lint cleanup, SMS/email, an external
queue, microservices, new messenger SDKs or production/provider calls.

## 24. Acceptance verdict

The implementation meets the CH-R2 local acceptance contract: migrated domain
mutations and intents are atomic, provider work is asynchronous and durable,
retry is bounded and restart-safe, terminal failures are visible, normal
multi-worker claims are exclusive, StoredFile documents use durable references,
and CH-R1 persistence guarantees remain intact. Hosted CI remains the final PR
gate and is not replaced by local results.
