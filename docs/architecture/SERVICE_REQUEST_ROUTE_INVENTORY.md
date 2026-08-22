# Service request route inventory

Current as of the pre-production baseline on 2026-08-22.

`ServiceRequestsController` is the only owner of authenticated customer HTTP
routes. `PublicServiceRequestsController` owns bearer-token status access.
`AdminController` owns staff operations. All three call the same public
`ServiceRequestsService`; no controller contains an alternate persistence path.

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
