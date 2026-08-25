# SEC-R2 Staff notification authorization

Date: 2026-08-25
Baseline: `main` at `0fe9c78d7b47355016d767a4a749281efdaf31cb`
Branch: `codex/sec-r2-notification-authorization`
Scope: SEC-002 only

## 1. Baseline

SEC-R2 branches directly from the merge commit for PR #16. Work used the clean
`C:\CODING\learn-bot-security-r2` worktree and an isolated
`vitma_sec_r2_notification_test` PostgreSQL database. Bot polling and the outbound
worker bootstrap were disabled; messenger sends were mocked. The user's modified
`C:\CODING\learn-bot\package-lock.json` was not staged, reset, stashed, copied, or
changed.

## 2. SEC-002 exploit before the fix

`AdminNotificationsService.getRecipients()` previously selected active employees by
the three preference booleans alone. Any active employee could bind Telegram or MAX,
enable a category, and receive global customer text or documents without the matching
permission. This bypassed both the permissionless `sales_manager` role and the
assigned-only boundaries of an `engineer`.

## 3. Notification caller inventory

Repository-wide source searches found one business-significant staff fan-out
boundary: `AdminNotificationsService.notify()` and `notifyDocument()`. The callers
are:

| Domain           | Events                                                                        | Canonical source           |
| ---------------- | ----------------------------------------------------------------------------- | -------------------------- |
| Registrations    | initial completion, PDF, readiness handoff/completion                         | `registration_requests.id` |
| Tickets          | first/customer text and media notice                                          | `tickets.id`               |
| Service requests | submission, customer text, attachment, payment proof, workflow/status notices | `service_requests.id`      |

No application source directly enqueues `audience = staff` outside
`AdminNotificationsService`. Customer delivery paths remain separate and unchanged.

## 4. Permission mapping by kind

The existing `admin.permissions.ts` model is authoritative and multi-role employees
receive its existing permission union.

| Kind             | Global permission          | Assigned permission             | Assignment field     |
| ---------------- | -------------------------- | ------------------------------- | -------------------- |
| Registrations    | `registrations.read`       | `registrations.read.assigned`   | `assignedEngineerId` |
| Tickets          | `tickets.read`             | none                            | none                 |
| Service requests | `serviceRequests.read.all` | `serviceRequests.read.assigned` | `assignedEngineerId` |

No role name is used as the authorization decision. In the current permission map,
operators and superadmins can receive global categories, engineers can receive only
their assigned registrations and service requests, and sales managers receive none
of these categories.

## 5. Preference versus authorization

`notifyRegistrations`, `notifyTickets`, and `notifyServiceRequests` express interest
only. `AdminService.updateNotificationSettings()` loads current role assignments and
rejects a `false -> true` transition when the account has neither the full nor the
assigned permission. Existing unauthorized `true` values do not grant visibility,
and the employee may still turn them off even when the UI submits all three booleans.

## 6. Least-privilege defaults

Entity and PostgreSQL defaults changed from `true` to `false` for all three
preferences. New staff accounts are not subscribed automatically. The append-only
migration changes defaults only and contains no data update, so every existing
explicit preference value is preserved.

## 7. Enqueue-time authorization

`StaffNotificationAuthorizationService` loads the canonical source object, active
employees, current role assignments, and current preferences from PostgreSQL.
`AdminNotificationsService` enqueues only the resulting authorized recipients. It
does not accept caller-supplied permissions, roles, assignments, or recipient IDs.
Text and document fan-out use the same decision.

## 8. Assignment rules

An assigned-only permission is accepted only when the source object's current
`assignedEngineerId` equals the employee ID. An unassigned object has no engineer
recipient. Ticket fan-out requires `tickets.read`; SEC-R2 does not introduce an
assigned-ticket permission.

## 9. Transaction consistency

When a caller supplies `context.manager`, both source lookup, employee/role lookup,
and outbound insertion use that same `EntityManager`. Assignment changes made in a
domain transaction are therefore visible to recipient selection. A transaction
rollback removes both the assignment change and its outbound intent.

## 10. CH-R2 enqueue-to-send revocation window

Enqueue authorization alone is insufficient because CH-R2 delivers asynchronously.
An employee can be disabled, lose a role, lose an assignment or preference, or bind a
different chat after commit. SEC-R2 closes this interval with a second authorization
decision in `OutboundDeliveryProcessor` immediately before the provider side effect.

## 11. Send-time authorization design

For every staff row the processor reloads the source, employee, current roles,
preference, object visibility, and platform-specific chat binding. A revoked decision
causes zero provider calls and moves the row to terminal `failed` with the sanitized
diagnostic `Staff notification authorization revoked`. It is not treated as a
transient provider error and is not retried. Authorization infrastructure failures
retain CH-R2's bounded retry behavior rather than being mistaken for a policy denial.

## 12. Staff identity in outbound deliveries

The append-only migration adds nullable `recipientStaffId`, an indexed foreign key to
`admin_users` with `ON DELETE SET NULL`. New staff rows require a positive trusted
staff ID; customer rows require null. Dedupe intent comparison includes this field, so
one dedupe key cannot silently redirect a notification to another employee. Existing
admin delivery projections remain masked and do not expose the new identity.

## 13. Existing pending-row compatibility

Legacy staff rows have no trustworthy staff identity. The migration does not infer an
ID from a chat ID or dedupe-key string. Such rows remain schema-valid but fail closed
at send time before any provider call. Existing customer rows remain valid with a null
staff identity.

## 14. Messenger binding revalidation

Telegram delivery requires the current `telegramChatId` to equal the queued address;
MAX delivery requires the current `maxChatId`. Unbinding or rebinding therefore makes
an old queued row terminal without sending it to the former address.

## 15. Role, active state, assignment, and preference changes

- Disabled or deleted employees do not receive queued notifications.
- Removed permissions make queued rows terminal without a provider call.
- Reassignment blocks the previous assigned-only engineer for registrations and
  service requests.
- Disabling a category blocks already queued rows of that category.
- A still-active, subscribed, bound, and object-authorized employee follows the normal
  CH-R2 send and sent-state path.

## 16. Residual provider race

Authorization is rechecked immediately before the external side effect. If access is
revoked concurrently after that check while the provider request has already begun,
the application cannot transactionally recall the external message. SEC-R2 does not
claim atomic authorization across an external provider call or exactly-once delivery.

## 17. Regression tests

The focused PostgreSQL suite covers entity/DB defaults, preservation of explicit
preferences, sales-manager denial for each category, engineer assigned-category
settings, operator/superadmin settings, legacy preference disable, registration and
service global/assigned/unassigned fan-out, ticket permission fan-out, Telegram/MAX
bindings, document parity, transaction-local assignment, rollback, employee
deactivation, role removal, both reassignment types, preference disable, chat
rebinding, legacy staff rows, authorized send, and staff-ID dedupe conflicts.

The existing CH-R2 tests continue to cover customer sends, StoredFile documents,
bounded retries, stale claims, concurrency, durable intent, rollback, diagnostics,
and at-least-once provider semantics.

## 18. Migration and schema impact

Migration `AuthorizeStaffNotifications1787750400000`:

- changes three `admin_users` column defaults to false without rewriting rows;
- adds nullable `outbound_deliveries.recipientStaffId`;
- adds its admin-user foreign key and lookup index;
- prevents customer rows from carrying a staff identity;
- leaves legacy staff rows nullable for deterministic fail-closed handling.

Migration apply/repeat checks and empty TypeORM schema drift are part of the required
verification gate.

## 19. Explicit exclusions

SEC-004 through SEC-016 were not remediated. SEC-R2 does not change roles or their
permissions, does not add ticket assignment, and does not start CH-R3, Catalog +
Orders, 1C, frontend redesign, dependency cleanup, or a new notification framework.
The historical adversarial audit is unchanged.

## 20. Acceptance verdict

SEC-002 is closed when local and hosted verification remain green: a preference no
longer grants access; current PostgreSQL permissions and canonical assignments govern
fan-out; queued staff rows are reauthorized immediately before send; revoked and
legacy rows fail terminally with no provider call; and authorized customer/staff
delivery retains CH-R2 semantics.
