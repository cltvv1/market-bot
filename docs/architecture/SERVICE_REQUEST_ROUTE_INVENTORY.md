# Service request route inventory

Updated for the FE-1B draft branch on 2026-09-03.

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
| `POST` | `/api/client/service-requests/:id/messages` | Add a customer message |
| `POST` | `/api/client/service-requests/:id/messages/attachments` | Add a message attachment |
| `GET` | `/api/client/service-requests/:id/attachments/:attachmentId` | Download an owned customer-visible attachment |

## Public-token routes

| Method | URL | Purpose |
|---|---|---|
| `GET` | `/api/public/service-requests/:token` | Customer-safe status |
| `POST` | `/api/public/service-requests/:token/messages` | Customer reply |
| `POST` | `/api/public/service-requests/:token/messages/attachments` | Customer attachment |
| `GET` | `/api/public/service-requests/:token/attachments/:attachmentId` | Customer-visible download |

The display request number is not accepted as a token.

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
