# BKV1-1: Canonical service requests

## Result

BKV1-1 expands the existing `service_requests` table. It does not introduce a parallel V2 aggregate. Web, Telegram, MAX, staff-created and integration-created requests keep one identifier, one status model and the existing invoice/payment/visit/ATOL fields.

## Old model

The old aggregate stored a service type snapshot, messenger identity, a current bot step, JSON answers and operational fields. It had no stable request number, source, form version, customer-facing status, contact/organization/location/equipment snapshots, generic attachments, customer messages, public access token or optimistic version.

`new-requests-system` was inspected read-only. It predates the current ServiceRequest implementation and only differs in old application/Telegram files. No commit or code was copied from it.

## Target model

`ServiceRequestEntity` now adds:

- `requestNumber`, `source`, `formVersionId` and `version`;
- structured `answers` plus contact, organization, location and equipment snapshots;
- optional confirmed `organizationId` and `cashRegisterId` relations;
- internal `status` and stable `customerStatus`;
- staff relation and lifecycle timestamps;
- hashed public token and submit idempotency key.

The existing `userId`, bot platform/chat identity, pricing, invoice, payment proof, visit, assignee and consent fields remain in place.

## Forms and versions

`service_form_definitions` associates one definition and its supported channels with a service type. `service_form_versions` stores an integer version, immutable JSON schema, handler key, optional creator and publication state. There can be only one published version per definition.

Published schema, version, definition, handler, creator and publication timestamp cannot be edited by a database trigger. The server validates schemas before draft creation/update and publication. Publishing retires the previous version transactionally; existing requests keep their original `formVersionId`.

Supported schema controls are text, textarea, phone, email, number, boolean, date, select, multiselect, address, organization, equipment, file instruction and display. Conditional fields use equality against another answer.

`ServiceFormService` rejects unknown fields, wrong primitive types, invalid options, invalid phone/email/date values and missing required values at submit. Draft validation is partial. Values remain structured JSON and are not flattened into a message.

## Statuses

Internal transitions are defined in `service-request-status.ts`. Repeating the current target is locally idempotent; invalid jumps fail before mutation.

| Internal | Customer |
| --- | --- |
| draft, submitted, review_required | received |
| clarification_required | clarification_required |
| price_confirmed, invoice_required, paid, in_progress | accepted |
| waiting_payment | waiting_for_customer |
| scheduled | scheduled |
| completed | completed |
| closed | closed |
| cancelled | cancelled |

Legacy bot methods preserve their previous transition behavior and synchronize the customer status through the same mapping.

## Public web flow

The session-owned API supports:

- creating and updating drafts;
- uploading and deleting draft attachments;
- idempotent submit with optimistic version checking;
- listing and reading only the current customer's requests;
- adding customer messages and post-submit attachments.

Submit returns a high-entropy bearer token. Only its SHA-256 hash is stored. The same submit idempotency key deterministically returns the same token without creating another request or history item. A request number is a display identifier and is never accepted as public authorization. Concurrent create calls for one web customer/service type resume one draft.

The public token API returns only customer-visible request fields, messages and attachment metadata. Internal messages and operator-only fields are excluded.

## Bot compatibility

Telegram and MAX continue to call the existing step-based methods. New bot requests receive a canonical number, source, form version, contact snapshot and customer status. FN replacement pricing/confirmation, invoice delivery, payment proof, visit scheduling and ATOL consent remain unchanged. Stored invoice, proof and consent files are also linked into the generic attachment table.

## Admin flow and permissions

Existing `serviceRequests.*` permissions remain authoritative. Operators can create `admin` or `phone` requests, add customer messages/internal notes and use the existing invoice/payment/visit/close actions. Engineers still read only requests assigned to their staff ID. Manual creation records the authenticated staff ID; the client does not choose a curator.

The React admin card shows canonical request numbers, snapshots, structured fields, generic attachments and customer/internal messages. The service list includes a compact manual/phone form.

## Attachments

`service_request_attachments` links a request and `StoredFile` with a semantic kind and visibility. Customer web uploads use random storage object keys and the `service-attachment` policy: at most five files, 20 MiB each, JPEG/PNG/WebP/PDF/text only. MIME signatures are checked where supported; customer filenames never become object keys.

## Messages and history

`service_request_messages` stores author type, staff/customer IDs, visibility, optional text/file and timestamp. Web uses ordinary HTTP refresh. Customer-visible staff messages are sent through the existing messenger adapter for Telegram/MAX requests; internal notes are never delivered.

## Migration and concurrency

Migration `1787126400000-CanonicalServiceRequests` creates the new tables and columns, backfills request numbers/source/status/form version/snapshots and existing file links, then installs form immutability and legacy-number triggers. The migration is transactional and leaves old columns intact.

The migration drill corrected two pre-merge mappings: unsupported legacy platforms now become `source=legacy` without a fabricated typed contact channel, and ATOL consent receives its five-field legacy form plus `atol_consent` handler. See [BKV1_1_MIGRATION_DRILL.md](./BKV1_1_MIGRATION_DRILL.md).

Draft writes require `expectedVersion`; an already-applied retry is accepted without another mutation. Submit, staff transitions and attachment upload/remove checks lock the request row. Submit uses a per-customer idempotency key. This is local request idempotency, not a general update deduplication or outbox.

## OpenAPI

Canonical DTOs expose explicit Swagger properties and validation limits. Client/public operations are described in OpenAPI; admin and web-session cookie schemes are distinct. Admin routes remain under the existing authenticated admin tag and guards.

## Verification

- unit tests cover form validation, conditional fields, status mapping/transitions and file policy;
- integration tests cover form publication, ownership isolation, token access, number denial, structured validation, optimistic conflicts, idempotent submit, attachment storage, admin RBAC and message visibility;
- existing integration characterization covers Telegram/MAX-adjacent service methods, FN, invoice/payment/visit, ATOL and integration conversion;
- 20 unit suites / 86 tests, 7 integration suites / 49 tests and 2 e2e suites / 7 tests pass;
- migrations run from empty PostgreSQL, repeat with no pending work, and `schema:log` is empty;
- admin/client/server production builds and offline browser/health smoke pass.
- a restored real pre-migration copy preserved all 13 requests, 61 events and 12 StoredFile records;
- a 16-request synthetic pre-migration fixture covers every required legacy category, unknown source/status and malformed accepted answers;
- both legacy-field fingerprints matched before/after, migration rerun was empty and source DB/storage hashes remained unchanged.

## Remaining limits

- no realtime transport, outbox, queue, webhook or generic messenger framework;
- no form-builder UI; published schemas are currently bootstrapped by backend code;
- the client keeps the established four-step presentation while backend schema is authoritative;
- no antivirus or object storage provider was added;
- no global deduplication or durable bot conversation engine was added.
