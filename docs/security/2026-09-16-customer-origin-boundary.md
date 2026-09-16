# SEC-R3A: customer web mutation origin boundary

## Baseline and method

Audited baseline: `2e1981bff6efd06f11d229707e828c5ef68e801a` (FE-STORE-1,
PR #35 merged; main CI 34952087372). Inventory recorded before application edits.
This is a new current-source assessment, not a rewrite of the September 2 audit.
Implementation and tests live in `codex/sec-r3a-customer-origin-boundary`; this
package requires draft review and is not itself merged or deployed.

All Nest controller mutation metadata was enumerated, including POST/PUT/PATCH/
DELETE (the regression also detects ALL). There are **108** mutations: **33**
customer/public routes (**30 A**, **1 B**, **2 C**) and **75 D** exclusions.
Of the 30 cookie routes, **18 already had** the canonical origin guard and **12
did not**. No equivalent origin check exists in those twelve controller/service
paths. SameSite=Lax and CORS response handling do not replace this boundary.

## Authoritative customer inventory

Category A uses the customer cookie for identity/ownership; domain writes are
possible. All have WebSessionGuard except session creation, which resolves the
cookie directly. Only session create/revoke sets/clears identity cookies. All
other A routes read cookies but do not set/replace/revoke them. `Guard` is the
baseline WebMutationOriginGuard, not the post-fix result. No alternative origin
mechanism is used. `File` includes generated documents as well as uploads.

| Controller.handler | Method and route | Domain effect | File | Guard |
| --- | --- | --- | --- | --- |
| WebSessionController.createOrRestore | POST /api/client/session | New user/session if absent, preserve active identity | no | missing |
| WebSessionController.revoke | POST /api/client/session/revoke | Revoke session, clear cookie | no | missing |
| ClientApiController.upsertUser | POST /api/client/users | Update own contact | no | missing |
| ClientApiController.startRegistration | POST /api/client/registrations/start | Compatibility draft start/resume | no | present |
| ClientApiController.submitRegistrationAnswer | POST /api/client/registrations/answer | Compatibility answer/submit | possible generated PDF | present |
| ClientApiController.submitRegistrationForm | POST /api/client/registrations/form | Compatibility save/submit | possible generated PDF | present |
| ClientApiController.provideRegistrationValue | POST /api/client/registrations/:id/requirements/:kind/value | Checklist answer | no | present |
| ClientApiController.provideRegistrationEvidence | POST /api/client/registrations/:id/requirements/:kind/evidence | Evidence association | multipart | present |
| ClientApiController.openTicket | POST /api/client/tickets/open | Open/resume ticket | no | missing |
| ClientApiController.submitTicketMessage | POST /api/client/tickets/messages | Ticket/message/activity | no | missing |
| ClientApiController.submitTicketMessageAlias | POST /api/client/tickets/:id/messages | Owned ticket message | no | missing |
| ClientApiController.submitTicketMedia | POST /api/client/tickets/media | Ticket/media/activity | multipart | missing |
| OrganizationsController.linkByInn | POST /api/client/organizations/link-by-inn | Pending access request, no automatic membership | no | missing |
| OrganizationsController.cancelAccessRequest | POST /api/client/organizations/access-requests/:id/cancel | Cancel own request | no | missing |
| AssetsController.upsertCashRegister | POST /api/client/organizations/:organizationId/assets/cash-registers | Authorized organization's KKT | no | missing |
| AssetsController.upsertFiscalDrive | POST /api/client/organizations/:organizationId/assets/fiscal-drives | Authorized organization's FN | no | missing |
| AssetsController.upsertOfdSubscription | POST /api/client/organizations/:organizationId/assets/ofd-subscriptions | Authorized organization's OFD | no | missing |
| RegistrationClientController.create | POST /api/client/registrations/drafts | Draft start/resume | no | present |
| RegistrationClientController.save | PATCH /api/client/registrations/:id/draft | Versioned draft | no | present |
| RegistrationClientController.submit | POST /api/client/registrations/:id/submit | Versioned submission | possible generated PDF | present |
| ServiceRequestsController.createDraft | POST /api/client/service-requests/drafts | Draft start/resume | no | present |
| ServiceRequestsController.updateDraft | PATCH /api/client/service-requests/drafts/:id | Versioned draft | no | present |
| ServiceRequestsController.submitDraft | POST /api/client/service-requests/drafts/:id/submit | Idempotent submission | scenario-dependent generated file | present |
| ServiceRequestsController.addAttachment | POST /api/client/service-requests/drafts/:id/attachments | Draft attachment | multipart | present |
| ServiceRequestsController.removeAttachment | DELETE /api/client/service-requests/drafts/:id/attachments/:attachmentId | Remove draft attachment | logical removal | present |
| ServiceRequestsController.uploadPaymentProof | POST /api/client/service-requests/:id/payment-proof | Versioned canonical proof | multipart | present |
| ServiceRequestsController.addMessage | POST /api/client/service-requests/:id/messages | Customer message | no | present |
| ServiceRequestsController.addMessageAttachment | POST /api/client/service-requests/:id/messages/attachments | Customer attachment | multipart | present |
| ClientOrdersController.submit | POST /api/client/orders | Idempotent canonical Order | no | present |
| ClientOrdersController.uploadPaymentProof | POST /api/client/orders/:id/payment-proofs | Versioned payment proof, not payment confirmation | multipart | present |

## Exemptions and exclusions

| Category | Controller.handler and route | Cookie / identity effects | Domain/storage effects | Origin policy |
| --- | --- | --- | --- | --- |
| B | PublicCatalogController.resolve: POST /api/catalog/products/resolve | None | Read-only bounded public projection, rate-limit memory only | Intentionally exempt; no session/origin guard |
| C | PublicServiceRequestsController.addMessage: POST /api/public/service-requests/:token/messages | None | Bearer-owned customer message | Explicit bearer only; SEC-R3B |
| C | PublicServiceRequestsController.addMessageAttachment: POST /api/public/service-requests/:token/messages/attachments | None | Bearer-owned file/attachment | Explicit bearer + upload preflight; SEC-R3B/SEC-007 |

Category D is explicitly excluded by authentication mechanism, not path alone:
AdminController (35), AdminCatalogController (8), AdminOrdersController (8),
AdminKnowledgeController (4), AdminSupportController (14),
AdminIntegrationsController (5): all use staff AdminSessionGuard/permissions, not
customer identity. IntegrationsController (1: POST /internal/integrations/import)
uses IntegrationBridgeGuard. Total 75. App, Site, Health, PublicSupport and
PublicKnowledge controllers have no mutations. No additional customer equipment,
chat, provider callback or legacy ClientController mutation was found.

## Demonstrated guard parsing defect

The initial production-policy unit regression has 26 cases, **10 failing before
the fix**. `new URL(source).origin` accepted non-Origin URLs (path/query/fragment,
credentials, trailing slash), array coercion and duplicate fields; an empty
Origin downgraded to Referer. Exact foreign hosts, deceptive host suffixes,
scheme/port mismatch and missing both headers already failed correctly.
These malformed-header cases are parser hardening evidence, not a claim that a
browser can forge its Origin header to impersonate an allowed origin.

## Changes and intentional policy

Only the twelve missing routes gained the existing WebMutationOriginGuard.
The eighteen already-protected route declarations, upload preflight guards,
versions, idempotency and authorization policies are unchanged. Telegram/MAX
and internal service calls do not acquire an HTTP Origin requirement.

- Allow an exact HTTP(S) serialized Origin matching the request origin or an
  explicitly configured CORS_ORIGINS entry. Production has no implicit local
  development allowlist. Scheme and nondefault port matter; no substring match.
- Reject foreign/deceptive hosts, malformed/non-Origin URLs, opaque `null`,
  empty fields, arrays, duplicate fields and userinfo. Origin must be canonical;
  a URL path, query, fragment or trailing slash is not an Origin header.
- If Origin is absent, retain the existing same-origin Referer fallback (normal
  paths/query are allowed). Missing both fails. An invalid/present Origin cannot
  fall back to a valid Referer. Only the selected source is authoritative.
- No new proxy-header trust: the guard uses Express request.protocol and Host
  plus configured origins, never raw forwarded headers as another allowlist.
  Existing TRUST_PROXY influences Express protocol resolution; deployment must
  constrain trusted proxies/Host/CORS configuration. OPS topology is not fixed here.
- Session creation/revocation checks origin before resolving identity. Explicit
  valid creation preserves an active cookie; revoke then create yields a distinct
  identity with no access to the old owner's data. GET does not create identity.
- Nest guards run before interceptors. All six cookie multipart routes reject
  before their actual Multer interceptor instances and FileStoragePort.write.
  Existing ownership/state/ID/version upload checks remain intact.

Class-level WebSessionGuard still precedes method guards on the established
domain controllers. Its existing throttled lastUsedAt bookkeeping can update
session activity; it cannot create/revoke identity or write domain/event/audit/
file/outbound state. The full-database no-change assertions use fresh sessions
to avoid confusing that auth bookkeeping with a business mutation.

## Regression evidence

The initial baseline integration run had **27 failures / 38 passes**: missing
guard declarations and accepted foreign-origin mutations, plus the invalid
Origin/Referer downgrade. Tests were added before the application fixes.

- 26 guard unit cases use production origin policy, including spoofed forwarded
  headers and malformed/duplicate values.
- 65 PostgreSQL integration cases enumerate live registered Nest metadata and
  compare exact controller/handler/method/path and guard class identity to a
  maintained inventory. New public mutation routes and lost guards fail the
  gate. Internal/admin exclusions also require their actual auth guard.
- Every newly fixed route rejects foreign, missing and malformed Origin with a
  valid customer cookie. A hash of all application tables stays identical
  (including events, Audit, StoredFile and outbound intent); storage/messenger
  spies stay unused. Valid same-origin equivalents preserve existing responses.
- Six multipart cases spy on real interceptor instances and the storage port.
  A malformed multipart body still gets an origin rejection, with zero parser
  invocations, zero storage writes and no database changes.
- Session lifecycle, owner GET no-auto-create and public Catalog resolve with/
  without ambient cookies and Origin have dedicated behavior checks.

Metadata detects declaration/category changes, not arbitrary new cookie reads
hidden in service code. The read-only B exemption also has database/storage/
cookie behavior checks; changing an exempt implementation still requires review.
Bearer-only C semantics were inspected without redesigning their security.

Existing Order/Store integration and Admin Orders API-request fixtures now send
Origin for explicit session creation; browser requests supply it naturally. The
existing rate-limit fixture likewise sends a legitimate origin. Headers are added
only to positive session setup, not globally to agents, preserving negative
authorization/origin cases. No assertions or browser check counts were removed.
No snapshots contain real user data or raw session tokens.

## Verification and outcome

Local unit: **429 / 44 suites**, including the 26 new cases. Frontend contracts:
**100**, unchanged. Production server/admin/client builds pass. Lint ratchet:
unchanged **684 errors / 6 warnings / 63 files**, no new violations.

Full PostgreSQL/browser and hosted exact-head verification are still pending.
No completion claim until those gates have finished.

## Deferred

SEC-R3B bearer lifecycle (SEC-005/006), SEC-007 legacy file policy, closed-ticket
staff invariant, last-superadmin concurrency, Audit atomicity, MAX egress
allowlist, CSP, dependency advisories, OPS production topology, EM-0 equipment
monitoring, 1C and EDO. No schema/dependency/frontend changes are required here.
