# B1 Bot Fix Report

Baseline: `74109935c5ab114c724bbf006534e5770159f513`.

## Result

| Finding | Status | Root cause | B1 change | Regression coverage | Remaining risk |
|---|---|---|---|---|---|
| Telegram admin callbacks | fixed in B1 | legacy handlers trusted callback visibility and `users.isOperator` | every affected callback resolves an active messenger-bound `AdminUser` and checks existing RBAC | access matrix and direct Telegram handler tests | legacy `isAdmin`/`isOperator` columns still exist outside these actions |
| OFD button | fixed in B1 | Telegram emitted `wantToOfd`, but no handler existed; MAX had no matching entry | both platforms route `wantToOfd` into the existing operator-ticket workflow | keyboard/callback and handler tests | a dedicated OFD renewal workflow is still not implemented |
| MAX attachments | fixed in B1 for existing supported paths | ticket media persisted temporary provider URLs and operator media degraded to text | bounded download, content MIME detection, `StoredFile` persistence, URL removal, binary image/document forwarding | photo, document, invalid reference, download and size tests | operator audio/video forwarding is explicitly rejected because the current messenger port has no such operation |
| ATOL temporary files | fixed in B1 | generated PDF was copied into FileStorage while the source path remained; cancellation targeted the wrong directory | generated files are removed in `finally`; cancellation logically deletes the managed file | success, failure, repeat, traversal and cancellation tests | no global retention scheduler was added |
| Operator chat after restart | partially mitigated in B1 | `users.talkingTo` is durable while `OPERATOR` mode is in memory | every forward validates reciprocal targets, active ticket and current staff permission; explicit callback can safely reattach the same pair | active, missing, stale, closed and deactivated cases | mode is still not durable and must be selected again after restart |
| Repeated price confirmation | fixed in B1 locally | repeated confirmation recreated events and notifications | an already `invoice_required` request returns its current state | PostgreSQL characterization | no general update deduplication exists |

The stronger interpretation that a process restart by itself immediately sends
the next arbitrary message to an old target was **not reproduced**: in-memory
mode resets to IDLE. The confirmed defect was the stale durable relationship,
which blocked clean re-entry and was insufficiently revalidated if OPERATOR
mode later became active. B1 addresses that confirmed path.

## Telegram callback authorization

| Callback | Handler | Action | Permission | Previous check | B1 check |
|---|---|---|---|---|---|
| `actualRegs` | `handleActualRegs` | list active registrations | `registrations.read` | none | active bound staff plus permission |
| `openReg:{id}` | `onOpenReg` | read registration and PDF | `registrations.read` | none | permission plus current target lookup |
| `regDone:{id}` | `onRegDone` | complete registration | `registrations.update` | none | permission before mutation plus stale-target rejection |
| `actualTickets` | `handleActualTickets` | list open tickets | `tickets.read` | none | active bound staff plus permission |
| `openTicket:{id}` | `onOpenTicket` | read ticket | `tickets.read` | none | permission plus current target lookup |
| `connectTo:{chatId}` | `onConnectTo` | enter operator chat | `tickets.reply` | legacy `users.isOperator` | RBAC, open ticket, reciprocal/conflict validation |
| `disconnectFrom:{chatId}` | `onDisconnectFrom` | close operator chat | `tickets.close` | legacy `users.isOperator` | RBAC for staff, reciprocal pair and open ticket |

`operator` receives only its existing permissions. `engineer` retains only
`serviceRequests.read.assigned`; `sales_manager` receives no operator
permissions; `superadmin` retains all permissions. Denied and stale admin
callbacks create sanitized Audit Events without message text, file content,
tokens or provider URLs.

## MAX media contract

MAX image, video, audio and file attachments require both provider token and
download URL. The URL is used only for the bounded download and is removed
before domain persistence. Content length and streamed bytes are both checked.
`FilesService` then applies purpose-specific MIME and size policy and creates a
random object key. Provider ID may remain as non-secret platform metadata.

Customer ticket media supports the existing image, document, audio and video
policies. Registration and signed-consent uploads use their existing policies.
Operator forwarding sends images and documents through the existing binary
messenger methods. Unsupported operator audio/video is rejected before
download, persistence or delivery.

## ATOL lifecycle

The PDF generator still creates one temporary source file under `CONSENT_DIR`.
The service reads it into managed FileStorage, stores only
`generatedConsentFileId`, and removes the source in `finally` on success or
error. Cleanup is root-confined, repeatable and does not physically remove the
final StoredFile. Cancelling a generated draft marks that StoredFile deleted
before deleting the draft.

## Deferred

Confirmed and deferred: durable conversation state, incoming update
deduplication, per-conversation locking, universal callback deduplication,
outbox, retry/delivery status, webhook mode, metrics, global media migration,
Telegram provider-URL backfill and decomposition of the two update classes.

No migration, Redis, queue, scheduler, production polling, real messenger call
or production storage/database access was introduced in B1.
