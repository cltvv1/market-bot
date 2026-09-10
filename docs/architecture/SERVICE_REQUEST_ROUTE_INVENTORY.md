# Service request route inventory

Updated for FE-1C after P-PROOF on 2026-09-10 (implementation branch; not merged).

`ServiceRequestsController` is the only owner of authenticated customer HTTP
routes. `PublicServiceRequestsController` owns bearer-token status access.
`AdminController` owns staff operations. Customer controllers continue to call
`ServiceRequestsService`. Staff reads/commands use bounded
`ServiceRequestAdminReadService` and `ServiceRequestAdminCommandsService` with the
same canonical aggregate/status rules, row locks, transactional Event/Audit and
current OutboundDelivery. Controllers do not implement a parallel state machine.

## Customer routes

| Method | URL | Purpose |
|---|---|---|
| `GET` | `/api/client/service-requests/types` | Active types and published form versions |
| `GET` | `/api/client/service-requests` | Requests owned by the web session |
| `POST` | `/api/client/service-requests/drafts` | Create or resume a server-side draft |
| `PATCH` | `/api/client/service-requests/drafts/:id` | Update structured answers with optimistic version |
| `POST` | `/api/client/service-requests/drafts/:id/submit` | Validate and idempotently submit |
| `POST` | `/api/client/service-requests/drafts/:id/attachments` | Add a validated draft attachment |
| `DELETE` | `/api/client/service-requests/drafts/:id/attachments/:attachmentId` | Remove a draft attachment |
| `GET` | `/api/client/service-requests/:id` | Read an owned request |
| `POST` | `/api/client/service-requests/:id/payment-proof` | Owner-session canonical proof upload/replacement; same-origin, required multipart `expectedVersion`, strict PDF/JPEG/PNG/WebP, 20 MiB |
| `GET` | `/api/client/service-requests/:id/payment-proof` | Owner-session download of the available current canonical proof only |
| `POST` | `/api/client/service-requests/:id/messages` | Add a customer message |
| `POST` | `/api/client/service-requests/:id/messages/attachments` | Add a message attachment |
| `GET` | `/api/client/service-requests/:id/attachments/:attachmentId` | Download an owned customer-visible attachment |

## FE-1C owner contract addendum

No new HTTP routes. Types now expose a safe published customer form projection;
list returns up to 50 minimal `{request}` summaries including pristine drafts.
GET detail authorizes the exact owner, then projects stage/version/answers/pinned
form/safe snapshots/messages/files/events and additive workflow capabilities in
one REPEATABLE READ snapshot. P-PROOF fields keep their accepted names/semantics.
Current invoice is selected by canonical pointer, not the newest attachment.

Draft creation returns `created` to distinguish resumed drafts. PATCH accepts
optional bounded contact/location/manual-organization/equipment snapshots with
answers and expectedVersion; linked IDs/type/form/user remain immutable. Row lock,
normalized context and transactional Event/Audit prevent lost/split updates;
equal input is a no-op. Customer mutations now require WebMutationOriginGuard;
upload owner/state/origin guards remain before Multer. Commands recheck ownership.
Owner reads/downloads are private/no-store and IDs bounded. No bearer relaxation.

## Public-token routes

| Method | URL | Purpose |
|---|---|---|
| `GET` | `/api/public/service-requests/:token` | Customer-safe status |
| `POST` | `/api/public/service-requests/:token/messages` | Customer reply |
| `POST` | `/api/public/service-requests/:token/messages/attachments` | Customer attachment |
| `GET` | `/api/public/service-requests/:token/attachments/:attachmentId` | Customer-visible download |

The display request number is not accepted as a token. There is no public-token
payment-proof endpoint. Public detail excludes proof attachments, document metadata
and owner workflow. Both public and authenticated generic attachment downloads deny
`payment_proof`; only the dedicated authenticated owner route serves the current proof.

P-PROOF owner upload requires `waiting_payment` and an existing invoice pointer.
Session, mutation origin and owner/state preflight run before Multer. A versioned,
row-locked command atomically activates the pending file, replaces the proof
attachment and canonical pointer, and records Event/Audit/activity/staff delivery
intent. Upload never marks the request paid; staff verification remains mandatory.

## Admin routes

| Method | URL |
|---|---|
| `GET` | `/admin/api/service-requests` |
| `GET` | `/admin/api/service-requests/types` |
| `GET` | `/admin/api/service-requests/:id` |
| `POST` | `/admin/api/service-requests/manual` |
| `POST` | `/admin/api/service-requests/:id/messages` |
| `POST` | `/admin/api/service-requests/:id/transition` |
| `POST` | `/admin/api/service-requests/:id/assign-engineer` |
| `POST` | `/admin/api/service-requests/:id/invoice-file` |
| `GET` | `/admin/api/service-requests/:id/invoice` |
| `GET` | `/admin/api/service-requests/:id/signed-consent` |
| `GET` | `/admin/api/service-requests/:id/payment-proof` |
| `GET` | `/admin/api/service-requests/:id/attachments/:attachmentId` |
| `POST` | `/admin/api/service-requests/:id/schedule` |
| `POST` | `/admin/api/service-requests/:id/operator-state` |

List query: `status=active|all|<canonical>`, `platform`, `priority`,
`scope=all|mine|unassigned`, `responsibleStaffId`, `page`, `limit` (default 25,
max 100). Response is `{items,page,limit,total,hasNext}`, with createdAt/id DESC
ordering and forced assigned scope where appropriate. Detail projects safe staff,
documents, events and authoritative workflow actions; foreign assigned-only IDs
return the same 404 as nonexistent IDs. Types returns active code/title only.

Transition, assignment, operator-state, schedule/reschedule and invoice multipart
commands require `expectedVersion` (integer 1..2147483647). Missing input is 400,
stale input 409. Messages remain append-only with a locked state check. Invoice
and schedule have dedicated handlers; generic transitions cannot bypass them.

Owned admin SPA routes are `/admin`, `/admin/work`, `/admin/requests/service`,
`/admin/requests/service/:id`, `/admin/requests/registrations`, `/admin/requests/tickets`,
`/admin/customers/access`, `/admin/customers/organizations`, `/admin/customers/equipment`,
`/admin/integrations/signals`, `/admin/integrations/runs`, `/admin/settings/staff`,
`/admin/settings/notifications`, `/admin/settings/audit`. No broad SPA catch-all
shadows API/assets/files. See the FE-1B production migration report for full contracts.

## Removed pre-production routes

The following routes had only discarded development consumers and intentionally
return normal `404`; no alias or redirect exists.

| Method | Removed URL | Current replacement |
|---|---|---|
| `POST` | `/api/client/service-requests/start` | `POST .../drafts` |
| `POST` | `/api/client/service-requests/:id/answers` | `PATCH .../drafts/:id` |
| `POST` | `/api/client/service-requests/:id/confirm-price` | `POST .../drafts/:id/submit` |
| `POST` | `/admin/api/service-requests/:id/invoice` | `POST .../invoice-file` |
| `POST` | `/admin/api/service-requests/:id/payment-received` | `POST .../transition` with `paid` |
| `POST` | `/admin/api/service-requests/:id/complete` | `POST .../transition` with `completed` |
| `POST` | `/admin/api/service-requests/:id/cancel` | `POST .../transition` with `cancelled` |

`test/service-request-routes.integration-spec.ts` discovers Nest controller
metadata, rejects duplicate `method + path` ownership and asserts that every
removed contract above is absent.
