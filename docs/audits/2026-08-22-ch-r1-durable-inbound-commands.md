# CH-R1 durable inbound channel commands

## 1. Executive summary

CH-R1 adds a small durable inbound-command boundary for the existing Telegram
and MAX adapters. It makes a provider update idempotent, serializes mutable
dialog commands, rejects stale service-request callbacks, and persists the
minimum dialog context needed after a process restart.

The package deliberately keeps the NestJS modular monolith, PostgreSQL and the
existing bot/application services. It does not introduce an outbox, a queue, a
new messenger framework, FileStorage changes, Catalog + Orders work, frontend
work, or business-status changes.

## 2. Baseline

- source `main`: `335d5aa9035daabc78967f1ec16c710292dcf93c`;
- implementation branch: `codex/ch-r1-durable-inbound-commands`;
- baseline migration before this package:
  `InitialPreproductionBaseline1787388476982`;
- the change is additive and does not modify the initial pre-production
  baseline.

## 3. Problem statement

Before CH-R1, an incoming Telegram/MAX callback contained only a request ID
and value. It was not bound to the expected workflow step or aggregate version.
The same provider update could be delivered twice, independent updates for the
same dialog could run in parallel, and the in-memory dialog context was lost on
a process restart. In particular, an old "FN 36 months" button could be
interpreted as an answer to a later step.

## 4. Architecture decision

The new `InboundCommandsService` is messenger infrastructure rather than a new
business domain. Every covered state-changing inbound event reaches it before
the existing handler:

```text
provider update
  -> durable command identity and per-dialog PostgreSQL advisory lock
  -> create/get InboundCommand
  -> duplicate/failed decision
  -> existing workflow handler
  -> processed/failed command record
```

The lock is keyed by `platform + chatId`; different dialogs remain concurrent.
The command row is created or recovered before a handler runs. A duplicate with
status `processed` never runs the handler again. A persisted `failed` command is
not retried automatically. A command left in `processing` by a disappeared
worker can be claimed after its PostgreSQL session lock is released.

Provider identities are intentionally small:

- Telegram: `update.update_id`;
- MAX callbacks: `callback.callback_id`;
- MAX messages: `message.body.mid`;
- MAX `bot_started`: provider update timestamp combined with the chat ID.

The adapters fail closed when a MAX event does not provide one of these durable
identities. No full provider update payload is retained.

## 5. Added entities and tables

Migration `AddDurableInboundCommands1787577304950` creates:

| Object               | Purpose                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `inbound_commands`   | Provider-level idempotency, compact diagnostic payload, processing result and error state. |
| `user_dialog_states` | Persisted minimal recovery context: mode, operator peer and active service-request ID.     |

`inbound_commands` has a unique index on `(platform, externalUpdateId)`, a
nullable `userId` FK to `users`, status check constraint, and indexes for dialog
and status inspection. `user_dialog_states` has a unique index on
`(platform, chatId)`.

The same migration adds DB guarantees for real one-active-draft rules:

- one channel `draft` per `(platform, chatId, serviceTypeCode)` for Telegram/MAX
  service requests;
- one registration `draft` per `(platform, chatId)`;
- one unanswered ticket per `(platform, userChatId)`.

It is additive only. It does not change `RegistrationRequest` or
`ServiceRequest` to a parallel V2 model and does not change existing statuses.

## 6. Changed flows

Covered Telegram and MAX state-changing flows include:

- bot start and command/menu entry points that reset or start a workflow;
- KKT registration start, field/media answer, stop and data-request activation;
- service-request start, answer and price confirmation;
- FN replacement and ATOL consent start/cancel/answer paths;
- ticket opening, question/media messages, operator connection and disconnect;
- ordinary inbound messages routed by persisted dialog mode.

Telegram list/open/menu callbacks are also persisted through the same boundary,
so the adapter does not have a separate non-durable callback path. The primary
mutable bot handlers, including client/operator messages, are serialized per
dialog.

`RegistrationsService`, `ServiceRequestChannelWorkflowService`, and
`TicketsService` now add narrow PostgreSQL transaction/row locks where races
previously existed. Starts reuse an existing active draft; answers use a
pessimistic row lock and, for version-bound service-request callbacks, an
expected step/version comparison.

## 7. Callback protection

New service-request callbacks use a compact V2 protocol:

```text
sra2:<requestId>:<expectedStep>:<expectedVersion>:<encodedValue>
src2:<requestId>:<expectedStep>:<expectedVersion>
```

The bot generates V2 callbacks only. The workflow validates the expected step
and TypeORM version while holding the request row lock. A stale button causes no
data mutation and returns:

```text
Эта кнопка больше не актуальна, выберите актуальный вариант.
```

The older `serviceRequestAnswer:*` and `serviceRequestConfirm:*` callbacks are
kept only as a safe-reject compatibility handler. They cannot write new values.
Callback builders reject malformed data and Telegram callback payloads longer
than the platform limit.

## 8. Idempotency and concurrency guarantees

| Scenario                                  | CH-R1 behaviour                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| Same provider update delivered twice      | One `InboundCommand` is processed; the second delivery is a no-op.                  |
| Two commands in one dialog                | Per-dialog advisory lock gives deterministic serialization.                         |
| Two starts of the same channel draft      | Transaction advisory lock plus partial unique index reuses one draft.               |
| Two version-bound answers                 | One row-locked update succeeds; the other is stale and does not increment the step. |
| Old service-request callback              | Safe rejection, no workflow mutation.                                               |
| Process restart after setting dialog mode | A fresh `UserContextService` reads the persisted dialog state.                      |

The database invariants protect direct concurrent calls as well as the normal
adapter path. The inbound boundary remains the primary protection for message
ordering and provider-level delivery duplicates.

## 9. UserContext handling

`UserContextService` no longer uses a process-local `Map`. It persists only the
state that routes the next message: `mode`, `talkingTo`, and
`serviceRequestId`. It is not a BPM engine and does not duplicate business
aggregate data. Existing registration/service request/ticket records remain the
source of workflow truth.

## 10. Tests added

The package adds characterization coverage for:

- V2 callback construction/parsing and malformed data rejection;
- Telegram stale callback safe rejection;
- exact duplicate provider update execution once;
- concurrent service-request answers and replay rejection;
- concurrent service-request, registration and ticket draft creation;
- duplicate registration answer handling;
- persisted dialog-context recovery with a fresh service instance.

Unit tests use fake messenger adapters and make no Telegram, MAX, ATOL or OFD
calls. The concurrency and persistence tests are placed in the existing
PostgreSQL integration suite.

## 11. Migration impact and local verification

The migration is append-only and can be applied after the reviewed initial
baseline. It creates unique partial indexes, so a database that already
contains duplicate active channel drafts must be inspected and cleaned by an
explicit data decision before applying it. The current project baseline is
pre-production and clean by design.

Local verification completed for this branch:

- `npm run build` passed: admin UI, client UI and Nest backend;
- `npm test -- --runInBand` passed: 21 suites, 97 tests;
- `npm run lint:baseline` passed with no new lint debt;
- isolated `npm run config:check` passed with polling disabled and fake tokens;
- Prettier check for changed TypeScript files passed;
- `git diff --check` passed.

The normal local environment has no `TEST_DB_NAME`, and Docker Desktop's Linux
engine is unavailable. The integration suite was retried with a fresh isolated
test-DB name and temporary storage; it stopped at `ECONNREFUSED` for
`localhost:5432`, before creating or changing that test database. Migration
run, schema-drift, e2e and offline-smoke verification must be performed by
isolated PostgreSQL CI or a configured local test DB; this report does not claim
those checks passed locally.

## 12. Risks and limitations

1. CH-R1 intentionally has no transactional outbox. A domain mutation can
   commit before outbound presentation fails; the command can then be marked
   failed even though its domain result exists. Delivery retry/reconciliation is
   CH-R2 scope.
2. Failed inbound commands have no operator retry UI yet. They are retained for
   diagnostics and are not automatically replayed.
3. Provider-level deduplication cannot merge two distinct free-text messages
   that have different provider IDs but identical content. It serializes them;
   semantic deduplication would change business behaviour and is not in scope.
4. The MAX `bot_started` identity depends on the provider timestamp because the
   event has no message ID. It is durable for one provider event but should be
   revalidated against the production MAX payload contract before high-volume
   rollout.
5. This package does not alter media storage or outbound delivery. Existing
   FileStorage and messenger presentation behaviour stays intact.

## 13. Explicit exclusions

- CH-R2 outbox/retry and all outgoing-delivery changes;
- FileStorage changes;
- Catalog + Orders;
- frontend work;
- new business statuses or a replacement registration/service-request model;
- provider API calls and production DB/storage use.

## 14. Follow-up

After the draft PR's isolated PostgreSQL CI is green, the next related package
can address CH-R2 delivery/outbox semantics separately. It should build on the
persisted command state but must not weaken the unique provider-update boundary
introduced here.
