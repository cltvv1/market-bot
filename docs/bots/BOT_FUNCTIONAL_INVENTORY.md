# Bot Functional Inventory

B1 status: callback RBAC, OFD routing, managed MAX ticket media and ATOL cleanup
are fixed. Operator-chat recovery is fail-safe, not durable.

Status terms: **yes** is implemented, **partial** has a material platform or
recovery limitation, **no** is absent, and **exposed only** means a UI action
exists without a matching handler.

| # | Scenario and purpose | Entry / input | TG | MAX | Shared workflow / persistence | Result and recovery |
|---:|---|---|---|---|---|---|
| 1 | First contact and `/start` | command or `bot_started` | yes | yes | user upsert; `users` | user persists; mode resets |
| 2 | Main menu | callbacks | yes | partial | platform handler | MAX is flat; Telegram has a service submenu |
| 3 | Registration intro and consent | button/text consent | yes | yes | `ClientWorkflowService`; registrations | draft resumes only through re-entry |
| 4 | Registration answers | text/callback | yes | yes | workflow and `RegistrationsService` | step persists; arbitrary text after restart does not resume |
| 5 | Registration photo and PDF | image | yes | yes | registration, `StoredFile`, PDF service | photo/PDF; remote body is fully buffered |
| 6 | Firmware update | callback/text | yes | yes | simple `service_request` | draft can resume; duplicate start can race |
| 7 | Remote KKT work | callback/text | yes | yes | simple `service_request` | same limits as firmware |
| 8 | FN replacement | callbacks/text | yes | yes | `ServiceRequestsService` | price/invoice/events; in-memory request ID is lost |
| 9 | ATOL consent form | callback/text | yes | yes | ATOL `service_request` | generated PDF; answers persist |
| 10 | Signed ATOL return | image/document | yes | yes | ATOL request and `StoredFile` | completion depends on current mode |
| 11 | Cancel ATOL draft | callback | yes | yes | request and managed file | fixed in B1 |
| 12 | Ask operator | callback/first text | yes | yes | ticket workflow | persistent ticket/history; create can race |
| 13 | Continue open question | text | yes | yes | active ticket lookup | DB fallback works from IDLE |
| 14 | Customer attachment | media | yes | yes | ticket media and `StoredFile` | MAX fixed in B1; Telegram migration deferred |
| 15 | Operator connects | callback | yes | yes | users/tickets/RBAC | explicit re-selection safely restores a valid pair |
| 16 | Operator text chat | text | yes | yes | direct send and ticket message | transcript persists; restart breaks routing |
| 17 | Operator media | attachment | yes | partial | ticket metadata and `StoredFile` | MAX image/document fixed; audio/video explicit unsupported |
| 18 | Close operator chat | callback | yes | yes | ticket close and user reset | multi-row change is not transactional |
| 19 | Bind admin chat | `/admin CODE` | yes | yes | admin notification service | expiring, platform-specific, single-use |
| 20 | Marketplace links | callback | yes | no | Telegram presenter | external URL |
| 21 | OFD activation contact | service button | yes | yes | existing ticket workflow | fixed in B1; dedicated workflow deferred |
| 22 | Legacy in-bot admin actions | admin callbacks | yes | no | direct services plus RBAC | fixed in B1 |
| 23 | Admin client delivery | web admin action | yes | yes | service requests and messenger router | DB write precedes send; no retry/status |

## Statuses

- Registration: `new`, `in_work`, `processed`, plus legacy booleans.
- Ticket: open/closed is represented by `isAnswered`.
- Service request: `draft`, `price_confirmed`, `review_required`,
  `invoice_required`, `waiting_payment`, `paid`, `scheduled`, `completed`,
  `cancelled`.

## Unknown input and cancellation

- IDLE text normally receives a menu prompt, except when an active ticket is
  found and the message is appended.
- Media outside registration, ATOL, ticket or operator modes uses the active
  ticket fallback when possible; otherwise the platform shows a menu.
- Main-menu navigation resets only in-memory context and does not consistently
  cancel durable drafts.
- ATOL has explicit cancellation. Registration has refusal/stop UX. General
  service requests and tickets do not share one cancellation model.
- Stale callback handling varies. Client service-request ownership is checked;
legacy Telegram admin callbacks now re-check RBAC and current target state.

## Data ownership

Users are unique by `(platform, chatId)`. Telegram and MAX records for the same
person are not automatically linked. Platform-scoped lookups prevent ordinary
cross-channel ownership collisions but create independent histories until staff
links the domain data.

## Test references

Shared registration, ticket, simple service, FN and ATOL paths have PostgreSQL
characterization in `test/critical-workflows.integration-spec.ts`. Flow
definitions have limited unit characterization in
`src/service-requests/service-request.flows.spec.ts`. Focused direct Telegram
and MAX handler suites were added in B1; they do not cover either full handler.
