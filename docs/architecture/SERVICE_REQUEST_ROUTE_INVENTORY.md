# Service request route inventory

## Duplicate public routes before E0-14

Each row below was registered twice with the same URL, guard, rate limit, DTO,
and service call.

| Method | URL | Handler 1 | Handler 2 |
|---|---|---|---|
| GET | `/api/client/service-requests/types` | `ServiceRequestsController.getTypes` | `ClientApiController.getServiceTypes` |
| GET | `/api/client/service-requests` | `ServiceRequestsController.getClientRequests` | `ClientApiController.getServiceRequests` |
| POST | `/api/client/service-requests/start` | `ServiceRequestsController.start` | `ClientApiController.startServiceRequest` |
| POST | `/api/client/service-requests/:id/answers` | `ServiceRequestsController.answer` | `ClientApiController.submitServiceRequestAnswer` |
| POST | `/api/client/service-requests/:id/confirm-price` | `ServiceRequestsController.confirmPrice` | `ClientApiController.confirmServiceRequestPrice` |

## Canonical public routes after E0-14

`ServiceRequestsController` is the canonical HTTP owner because its controller
prefix, tag, guard, DTO mapping, and dependency are all specific to this domain.
`ClientApiController` remains the owner of client registration, ticket, and
client-profile routes. `ServiceRequestsService` remains shared application
logic; no business behavior moved into a controller.

| Method | URL | Canonical handler | Authentication | Rate bucket |
|---|---|---|---|---|
| GET | `/api/client/service-requests/types` | `getTypes` | web session | `public-read` |
| GET | `/api/client/service-requests` | `getClientRequests` | web session | `public-sensitive-read` |
| POST | `/api/client/service-requests/start` | `start` | web session | `public-form` |
| POST | `/api/client/service-requests/:id/answers` | `answer` | web session | `public-form` |
| POST | `/api/client/service-requests/:id/confirm-price` | `confirmPrice` | web session | `public-form` |

## Admin routes

These routes have a distinct `/admin/api` prefix and RBAC permissions, so they
were never duplicates of the public client routes.

| Method | URL |
|---|---|
| GET | `/admin/api/service-requests` |
| GET | `/admin/api/service-requests/:id` |
| POST | `/admin/api/service-requests/:id/assign-engineer` |
| POST | `/admin/api/service-requests/:id/invoice` |
| POST | `/admin/api/service-requests/:id/invoice-file` |
| GET | `/admin/api/service-requests/:id/invoice` |
| GET | `/admin/api/service-requests/:id/signed-consent` |
| POST | `/admin/api/service-requests/:id/payment-received` |
| POST | `/admin/api/service-requests/:id/schedule` |
| POST | `/admin/api/service-requests/:id/complete` |
| POST | `/admin/api/service-requests/:id/cancel` |
| POST | `/admin/api/service-requests/:id/operator-state` |

`test/service-request-routes.integration-spec.ts` discovers registered
controllers from Nest `ModulesContainer`, combines controller and method
metadata, and rejects repeated service-request `method + path` pairs. It also
asserts that all five public contracts are owned by
`ServiceRequestsController`.
