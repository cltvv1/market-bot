# API, workflow and channel audit

## API surface

- Client: `/api/client/session`, users, registration fields/start/answer/form, tickets/messages/media/files, service request types/list/start/answer/confirm, organizations and assets.
- Admin: `/admin/api/*` for auth/staff/RBAC/audit, queues, registrations, tickets, service requests, files, organizations/assets/kits and integration operations.
- Internal integration: `POST /internal/integrations/import`, protected by shared-key guard.
- Runtime: `/health/live`, `/health/ready`, `/api/docs` when enabled.

`PARTIAL`: DTO validation and global error shape exist. Swagger has tags but no `ApiProperty`, operation/response schemas or explicit cookie models; generated OpenAPI is not yet a stable frontend contract.

## Auth, ownership and permissions

- Web client controllers derive identity from server-side web session; client-supplied chat/platform is ignored (`TEST_CONFIRMED`).
- Service request ownership checks platform/chatId and optional organization membership.
- Ticket history/file endpoints explicitly assert ticket owner; admin downloads require permissions (`TEST_CONFIRMED`).
- Organization assets require active membership, but membership itself can be self-created by INN (`INCONSISTENT`).
- Admin mutations have same-origin guard and permission checks. Telegram/MAX administrative callbacks use existing AdminUser RBAC after B1.

## Vertical flows

### KKT registration

```text
Telegram/MAX -> update handler -> ClientWorkflowService
  -> RegistrationsService -> registration_requests + StoredFile/PDF
  -> AdminNotificationsService -> messenger admins
  -> admin registration card/download

Web -> ClientApiController /registrations/form -> ClientWorkflowService
  -> RegistrationsService.fillRegistration (photo skipped)
  -> same PDF/admin path
```

Success point: record marked filled and PDF metadata saved. Break: completion, event and notification are not one transaction; web required-field contract differs from bots. No client endpoint lists registrations/status/documents.

### Simple/FN service request

```text
Web/Telegram/MAX -> controller/update -> ServiceRequestsService
  -> service_requests + JSONB answers
  -> service_request_events + customer_activities
  -> admin queue/card
  -> invoice/payment proof/visit -> MessengerRouter
```

The same entity is used across channels (`CODE_CONFIRMED`). Bots request one answer per step. Current React page maps its form into sequential answers supported by only existing flows; arbitrary rich web structure cannot be persisted against a versioned schema. Specialized files are supported, general request attachments are not.

State can be saved while admin/client notification fails. Repeated untouched draft is locally reused; general HTTP idempotency and guarded transitions are absent.

### Ticket/chat

```text
Web/Telegram/MAX -> ClientWorkflowService -> TicketsService
  -> tickets + ticket_messages + StoredFile
  -> admin notification/queue
Admin or messenger operator -> reply -> TicketMessage -> MessengerRouter
```

History survives restart. Messenger active pairing uses persisted reciprocal `UserEntity.talkingTo` plus active ticket and current staff permission checks, so stale/wrong target fails safe after B1. Web polls active ticket messages. There is no delivery status/retry and no link to a service request/order.

### Organization/equipment

```text
Web session -> link-by-inn -> Organization upsert + active owner membership
  -> asset endpoints -> KKT/FN/OFD rows
Admin/integrations -> separate admin/import paths -> same organizations/assets
```

Break: claim verification is absent. Integration matching can enrich core records, but customer-written and provider-written precedence is only service logic, not a general provenance model.

### ATOL/OFD shadow sync

```text
external/manual scheduler -> local Playwright bridge
  -> normalized batch -> internal import guard -> IntegrationsService transaction
  -> mappings/core assets/observations/opportunities -> admin queue
  -> explicit operator conversion -> ServiceRequest
```

`TEST_CONFIRMED`: normalized imports, cross-provider merge, exclusions, reopen/resolve, sanitized errors and one-time conversion. `UNKNOWN`: live provider compatibility on 2026-08-18, because external cabinets were intentionally not called. “Shadow” suppresses customer actions but still mutates local organizations/equipment; it is not dry-run.

### Catalog and checkout

```text
Client React -> static TypeScript catalog -> localStorage cart/checkout
```

This flow stops before HTTP/PostgreSQL/admin. UI success must not be presented as a backend order.

## Channel parity

| Use case | Web | Telegram | MAX | Finding |
|---|---|---|---|---|
| Web/session identity | anonymous cookie | channel ID | channel ID | intentionally different, no linking |
| KKT registration | bulk form, no photo | step + photo | step + photo | `INCONSISTENT` |
| Simple/FN request | real API, sequential values | step callbacks/text | step callbacks/text | `PARTIAL` parity; no form version |
| Payment proof | client UI path not exposed as general workflow | file/image | file/image | `INCONSISTENT` |
| Ticket text/media/history | supported | supported | supported | `PARTIAL`; delivery semantics differ |
| Operator mode | admin UI | messenger RBAC + pairing | messenger RBAC + pairing | supported, no delivery ledger |
| Customer status/documents | limited list/status | pushed messages/files | pushed messages/files | `INCONSISTENT` |

## Contract readiness

Before frontend redesign freezes page contracts:

1. Publish explicit response DTOs and status enums for service requests, registrations, catalog and orders.
2. Add OpenAPI properties/operations/errors and contract tests; do not expose entities directly as the stable API.
3. Define idempotency and optimistic transition behavior for create/submit/confirm actions.
4. Keep current bot callbacks through compatibility tests while routing all channels through the same application commands.
5. Distinguish customer-safe status/messages from internal workflow and comments.
