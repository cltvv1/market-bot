# Bot State, Recovery and Idempotency Audit

## B1 mitigation

Status: **partially mitigated in B1**. Durable state was not added. Forwarding
now requires a reciprocal `talkingTo` pair, an open ticket and active staff
with `tickets.reply`. Missing or stale context fails closed and requires
explicit client selection. Repeated price confirmation is locally idempotent
once status is `invoice_required`.

## State inventory

| State | Storage | Restart | Notes |
|---|---|---:|---|
| Current mode | per-module in-memory `Map` | lost | Telegram and MAX have separate instances |
| Active service request ID | in-memory context | lost | request remains in PostgreSQL |
| Operator forwarding mode | in-memory context | lost | conflicts with persistent `users.talkingTo` |
| Registration answers/step | PostgreSQL | kept | resume requires re-entering registration |
| Service answers/step/status | PostgreSQL | kept | resume requires matching menu path |
| ATOL answers/files | PostgreSQL/FileStorage | kept | request-local cleanup fixed in B1 |
| Ticket/messages | PostgreSQL | kept | IDLE customer fallback can resume |
| Operator relationship | `users.talkingTo` | kept | forwarding does not resume |
| Admin binding | PostgreSQL | kept | bind code is single-use/expiring |

## Recovery by scenario

**Recovers through explicit re-entry**

- unfinished registration;
- simple service-request draft;
- ATOL consent draft;
- persisted ticket history;
- active customer ticket when the customer sends another message.

**Does not transparently recover**

- the exact prompt a user was answering;
- `REGISTER`, `SERVICE_REQUEST`, `ATOL_CONSENT` or `OPERATOR` mode;
- the selected service request ID;
- a partially handled incoming update;
- an outgoing send that failed after a database commit.

After restart, arbitrary text is interpreted under IDLE rules. Persisted
`talkingTo` values can remain even though neither party is in `OPERATOR` mode.

## Concurrency

No per-user lock, database advisory lock, optimistic version or serial queue was
found. Important read-then-create/read-then-update paths are exposed to races:

- find unfinished registration, then create;
- find active ticket, then create;
- find latest service draft, then create;
- read current step, assign an answer, advance and save;
- set or clear `talkingTo` on two user rows.

Likely effects are duplicate drafts/tickets, lost answers, skipped/repeated
steps and one-sided operator connections.

## Duplicate and idempotency safety

No incoming Telegram update ID, MAX event ID, callback ID or business
idempotency key is persisted. There are no unique active-workflow constraints.

| Repeated operation | Current protection | Result |
|---|---|---|
| `/start` | unique user `(platform, chatId)` | upsert is effectively repeatable |
| registration start | read-before-create | race can create duplicates |
| ticket start | active-ticket lookup | race can create duplicates |
| service/ATOL start | latest-draft lookup | race can create duplicates |
| field answer | current step | duplicate may fill the next field |
| service callback answer | owner check | transition/event may repeat |
| price confirmation | owner and current-status check | repeated confirmed state has no second effect |
| admin status action | varying status checks | commit may precede failed/repeated send |
| outgoing notification | none | no durable retry or dedupe |

The system is **not duplicate-safe** for at-least-once platform delivery or
user double-clicks.

## Recommended recovery contract

A future package should persist a channel conversation containing workflow type,
subject ID, expected step and version. Each incoming event should be processed
with a unique platform event key and per-conversation lock/version. Operator
connection state should have one durable source of truth. This audit did not
implement these recommendations.
