# Telegram and MAX Bot Audit Summary

Audit baseline: `d27b2ca6928b3903b6ed306bf3d8f83089fb6a7b`.

## B1 status

Callback authorization, OFD routing, MAX attachments and ATOL cleanup are fixed
in B1. Operator-chat restart behavior is fail-safe but remains non-durable.
General deduplication, outbox/retry and handler decomposition remain confirmed
and deferred. See `B1_FIX_REPORT.md`.

## A. Ready today

**Telegram:** start/menu, KKT registration with photo/PDF, two simple service
requests, FN replacement, ATOL consent and signed document, operator questions,
text chat, media handling, admin notification binding and marketplace links.

**MAX:** the same core registration, service-request, ATOL and operator-question
business paths, plus admin notification binding.

**Shared layer:** user upsert, registration/ticket/service orchestration,
PostgreSQL entities, service transitions and operator-side delivery.

**FileStorage:** managed registration, generated PDF, invoice and consent files
with random object keys, MIME/size policies and checksums.

**Audit/security foundation:** admin/API actions have RBAC and audit coverage;
bot-originated domain actions use existing activity/service event records.

**CI/offline safety:** fake Telegram token, MAX disabled, polling disabled,
isolated test DB/storage and an explicit guard.

## B. Partially ready

- Business logic is shared, but both large update classes duplicate routing,
  presentation, callback parsing and state transitions.
- Draft data survives restart, while conversation mode and exact prompt do not.
- Tickets persist, but operator live-chat forwarding cannot recover cleanly.
- Files are managed for registration/consent, while ticket attachments often
  remain provider URLs.
- Accepted work survives many send failures, but delivery is not recorded or
  retried.
- Core workflows exist on both platforms, but media and navigation differ.

## C. Not implemented

- durable incoming update deduplication;
- per-conversation concurrency control;
- transparent workflow recovery;
- outbox, retries and delivery status;
- webhook mode;
- bot delivery/queue health and metrics;
- working OFD activation;
- automatic Telegram/MAX channel linkage to one customer.

These are absent capabilities, not regressions.

## D. Confirmed defects

| Severity | Finding |
|---|---|
| High | Telegram legacy admin callback authorization: fixed in B1. |
| High | Repeated/parallel events can duplicate workflows or advance answers twice. |
| High | Durable operator mode remains deferred; wrong-target forwarding is partially mitigated in B1. |
| Medium | OFD dead callback: fixed in B1 through the existing operator-ticket flow. |
| Medium | MAX operator image/document forwarding: fixed in B1. |
| Medium | MAX remote media is bounded in B1; Telegram equivalent is deferred. |
| Medium | ATOL generated/cancelled file cleanup: fixed in B1. |
| Medium | Outgoing delivery has no durable result, retry or visible failure state. |

## E. Risk register

**Production reliability:** silent notification loss, no retry, direct platform
calls, one polling switch and a second MAX SDK client.

**Data integrity:** no event dedupe, active-workflow uniqueness, lock or
optimistic version; operator connection changes are not atomic.

**Security/privacy:** missing callback authorization; provider media URLs and
complete customer content are retained; Telegram file URLs may expose a token.

**User experience:** restart can reset the conversation, stale actions vary,
OFD is a dead button and MAX operator media is degraded.

**Maintainability:** `telegram.update.ts` is 740 lines and `max.update.ts` is 730
lines, with repeated menus, messages and workflow branching.

**Observability:** no delivery status, retry history, platform health metric or
structured provider error taxonomy.

## F. Telegram/MAX parity

The inventory contains 23 capabilities: 16 parity, 4 partial parity, 2
Telegram-only, 0 MAX-only, 0 unknown and 1 not implemented. See
`TELEGRAM_MAX_PARITY_MATRIX.md`.

## G. Test coverage

PostgreSQL integration tests characterize registration, ticket, simple-request,
FN and ATOL happy paths. File policy/storage and CI isolation have direct tests.
Focused Telegram/MAX handler suites now cover corrected branches. Broad
restart, concurrency, delivery and duplicate behavior remains untested.

## H. Production readiness

| Area | Assessment |
|---|---|
| Existing scenario correctness | controlled pilot only after high defects are fixed |
| Restart recovery | insufficient for unattended operation |
| Duplicate safety | insufficient |
| Outgoing delivery | insufficient for guaranteed notifications |
| Security | blocked by legacy Telegram callback authorization |
| Observability | insufficient for supportable production |
| Operational readiness | CI-safe/buildable; runtime needs state/delivery hardening |

## Recommended packages

### B1 - Existing-scenario defects (small)

Fix only proven defects: Telegram callback authorization, OFD action decision,
MAX media behavior and managed-file cleanup. Exclude architecture refactoring.
Done when each defect has a regression test.

### B2 - State and duplicate safety (medium)

Add durable conversation state, platform event keys, stale callback rules and
per-conversation serialization/versioning. Exclude delivery retries. Depends on
B1 characterization. Done when restart, duplicate and parallel tests pass.

### B3 - Reliable outgoing delivery (medium)

Add transactional outbox/delivery attempts, backoff, terminal failure and
operator visibility. Exclude scheduled marketing. Depends on B2. Done when
accepted work is delivered once logically or remains visibly retryable.

### B4 - Telegram/MAX parity (small to medium)

Close approved media/navigation gaps using one capability contract. Exclude
identical presentation. Depends on B1 and preferably B2. Done when tests
document every intentional difference.

### B5 - Handler decomposition (large)

Extract normalized routing, presenters and action builders after
characterization. Exclude new business features. Depends on stable B1-B4
contracts. Done when update classes are thin and behavior is unchanged.

Recommended next package: **B1**, then **B2**, **B3**, **B4** and **B5**.
