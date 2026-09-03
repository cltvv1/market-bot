# FE-1A Interface architecture

Status: draft for visual approval, not production migration. Baseline:
`4de78fe5696d781341272328305041236ebece99` (PSR-1).
Baseline [CI 33614871297](https://github.com/cltvv1/market-bot/actions/runs/33614871297)
passed Quality, Production builds, and PostgreSQL/tests/offline smoke.

Read with [design foundation](2026-09-03-design-foundation.md) and
[reference review](2026-09-03-service-reference-slice.md).
PSR-1 grades and the canonical roadmap are unchanged by this dev-only work.

## Verified current state

- Admin: `admin-ui/src/App.tsx` contains the ten local-state horizontal tabs,
  authentication, notifications, list/detail selection, and most domain UI.
  There is no durable queue/detail URL model. ServiceRequest, Registration,
  Ticket, Opportunities, access review, Organizations, Kits, Integrations,
  Staff, and Audit are real; Catalog, Orders, Support, Knowledge workspaces are absent.
- Client: `client-ui/src/App.tsx` already uses BrowserRouter under `/site`.
  Service forms/status/files, registration/checklist, organization membership
  and access requests use real APIs. Catalog comes from `data/catalog.ts`.
  Cart uses localStorage and Checkout calls the local fake `orderService.create`
  in `services/client.ts`, not Orders API. No real Orders/Support/Knowledge screens.
- Backend: NestJS is authoritative for permissions, ownership, versioned
  forms, status transitions, assignments, money and documents. Read API
  availability does not imply a finished product or production readiness.

Inventory evidence: `docs/PROJECT_STATUS.md`, `docs/PROJECT_AUDIT.md`,
`docs/ROADMAP.md`, `docs/audits/2026-09-02-project-status-roadmap-rebaseline.md`;
admin App/api/types/format/main/styles/Vite config; client App/pages/components/
services/context/types/main/styles/Vite config; controllers and relevant services
under service-requests/admin/client/web-session/common/http/security/registrations/
tickets/organizations/assets/orders/catalog/support-knowledge.

## Target information architecture

Admin groups:

1. My work: permitted queues and assignments, not a new Task aggregate.
2. Requests: service requests, KKT registrations, operator conversations.
3. Sales: orders; quote, invoice, payment and fulfillment are stages of an Order.
4. Customers: organizations, representative access and KKT/FN/OFD/equipment.
5. Catalog and materials: products/categories, Support resources, Knowledge.
6. Integrations: signals, sync runs, exceptions/errors and exclusions.
7. Settings: employees, personal notifications and Audit Log.

Navigation uses `admin.permissions`, never role labels. Groups with no
permitted children disappear. Personal notification settings are authenticated
but have no extra permission requirement in the existing controller. Unbuilt
reference navigation entries are explicitly unavailable; they do not redirect
to fake screens. ServiceRequest, RegistrationRequest, Ticket, Order,
Organization and ServiceOpportunity remain separate entities.

Client public: Home, Catalog, Service, Support, Knowledge, About, Contacts.
Personal: Organizations/equipment, Service requests, Registrations,
Orders/documents, Operator contact. FE-1A implements only a reference service
entry page; it does not claim new login, cross-device access or merged bot history.

## Target admin route map

Statuses describe the current combined screen/API: READY, PARTIAL,
BACKEND_ONLY, MISSING. They are not new PSR-1 grades.
For all existing tabs, compatibility is **keep `/admin/` unchanged in FE-1A**.
FE-1B should introduce route adapters only for migrated domains; remove a tab
only after workflow tests pass. There are no existing deep links to redirect.

| Target route | Purpose / current tab and API | Permission (any when separated by OR) | Status | Migration / compatibility |
| --- | --- | --- | --- | --- |
| `/admin/work` | Personal workload; summary plus domain lists | Respective queue permissions | PARTIAL | Later read-model package; no new Task |
| `/admin/requests/service` | Queue; service, GET `/admin/api/service-requests` | `serviceRequests.read.all` OR `.read.assigned` | PARTIAL | FE-1B; keep old tab until verified |
| `/admin/requests/service/:id` | Detail; service, GET same API `/:id` | Same, server assignment check | PARTIAL | FE-1B; read-first then bounded commands |
| `/admin/requests/registrations` | Registration queue; registrations, GET `/admin/api/registrations` | `registrations.read` OR `.read.assigned` | PARTIAL | Subsequent admin slice; retain tab |
| `/admin/requests/registrations/:id` | Checklist/evidence/readiness; same API `/:id` | Same; `registrations.update` for changes | PARTIAL | Subsequent admin slice; retain tab |
| `/admin/requests/tickets` | Open/closed tickets; tickets, GET `/admin/api/tickets` | `tickets.read` | READY | Subsequent admin slice; retain tab |
| `/admin/requests/tickets/:id` | Conversation/history; ticket detail/messages API | `tickets.read`; reply/close separately | PARTIAL | Closed-ticket invariant package first for mutations |
| `/admin/sales/orders` | Queue; no screen, GET `/admin/api/orders` | `orders.read.all` | BACKEND_ONLY | Sales frontend package |
| `/admin/sales/orders/:id` | Quote/invoice/proof/fulfillment; same API `/:id` | Read; command-specific `orders.*` | BACKEND_ONLY | Sales frontend package, not ServiceRequest |
| `/admin/customers/organizations` | Organizations; organizations, GET `/admin/api/organizations` | `organizations.read` | PARTIAL | Later client registry slice |
| `/admin/customers/organizations/:id` | Organization context/assets/history | `organizations.read`, assets/context guards | PARTIAL | Verify composed read/ownership contract before screen |
| `/admin/customers/equipment` | KKT/FN/OFD and kits; equipment-kits and organization assets | `assets.read` | PARTIAL | Equipment slice; retain kits tab |
| `/admin/customers/access` | Membership approvals; organization-access APIs | `organizationAccess.read`, review separately | READY | Access slice; retain tab |
| `/admin/catalog/products` | Product/category management; `/admin/api/catalog/*` | `catalog.read`, manage separately | BACKEND_ONLY | Catalog frontend package |
| `/admin/catalog/support` | Resources/profiles/versions; `/admin/api/support/*` | `support.read`, manage separately | BACKEND_ONLY | Support frontend package |
| `/admin/catalog/knowledge` | Articles; `/admin/api/knowledge/articles` | `knowledge.read`, manage separately | BACKEND_ONLY | Knowledge frontend package |
| `/admin/integrations/signals` | Opportunities; opportunities API | `opportunities.read` | PARTIAL | Later integration UI; retain signals tab |
| `/admin/integrations/runs` | Bridge readiness/runs/errors | `integrations.read` | PARTIAL | Later integration UI; no EM-0 changes here |
| `/admin/integrations/exclusions` | Exclusions; current integrations tab | `integrations.read`, manage separately | READY | Same later slice; retain tab |
| `/admin/settings/staff` | Staff; `/admin/api/staff` | `staff.roles.manage` for list; per-command checks | READY | Settings slice; retain tab |
| `/admin/settings/notifications` | Own bindings/preferences; notification-bindings | Authenticated employee | READY | Settings slice; current menu retained |
| `/admin/settings/audit` | Security audit; current audit tab | `audit.read` | READY | Settings slice; retain tab |

## Screen/API matrix

Abbreviations: A=`/admin/api`, C=`/api/client`, P=public API. `No` backend
package means the basic slice can use existing contracts, not that all future UX
requirements are already covered. Availability refers to required fields/actions.

| Screen / user goal | Current route | Target route | Current API | Permission / ownership | Required fields | Availability | Missing fields/actions | Safe presentation derivation? | Backend package? | Stage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Service queue / choose work | `/admin/`, service | `/admin/requests/service` | A/service-requests | all or assigned | number/type/status/contact/staff/update | PARTIAL | total, search, server paging/priority/responsible | Filter authorized 100-row result only | B-R1 for scale | FE-1B |
| Service detail / understand next step | Same selected item | `/admin/requests/service/:id` | A/service-requests/:id + attachments | all or assigned | request, messages, attachments, events | PARTIAL | allowedActions/reasons, complete staff projection, file lifecycle | Labels/current file ID, not authorization | B-R1/B-C1 below | FE-1B |
| Registrations / prepare handoff | registrations tab | requests/registrations[/:id] | A/registrations, checklist/evidence/actions | all/assigned, update | form, requirements, readiness, PDF | PARTIAL | customer resume discovery | Status labels only | R-RESUME/SEC follow-up | After service |
| Tickets / reply and close | tickets tab | requests/tickets[/:id] | A/tickets, messages, file routes | tickets.read/reply/close | messages/files/delivery state | PARTIAL | authoritative closed reply rejection | Never infer permission from menu | SEC ticket invariant | After service |
| Opportunities / inspect signal | opportunities tab | integrations/signals | A/opportunities | opportunities.read/update | observations, sources, contacts, status | PARTIAL | stale lifecycle semantics | Existing labels only | EM track, separate | Later |
| Organizations / client context | organizations tab | customers/organizations[/:id] | A/organizations + customer-card/context | organizations.read | members/assets/history | PARTIAL | unified org read view | No cross-ID probing | B-R2 if composition needed | Later |
| Equipment / identify kit or KKT | equipment-kits | customers/equipment | A/equipment-kits; org assets | assets.read/update | serial/model/FN/OFD links | PARTIAL | full registry lifecycle UI | Existing fields only | Scope dependent | Later |
| Orders / execute sale | None | sales/orders[/:id] | A/orders + assign/review/quote/confirm/invoices/payment/fulfill/complete | orders.* per operation | version/quote/documents/status/facts | BACKEND_ONLY | Entire workspace | Money from server only | No for existing whole-order flow | Sales package |
| Catalog / publish products | None | catalog/products | A/catalog/categories, products | catalog.read/manage | publication/price/VAT/availability | BACKEND_ONLY | Entire workspace | Display only | No | Catalog package |
| Support / publish downloads | None | catalog/support | A/support/products/resources/versions | support.read/manage | versions/files/publication | BACKEND_ONLY | Entire workspace | Display only | No | Support package |
| Knowledge / edit articles | None | catalog/knowledge | A/knowledge/articles | knowledge.read/manage | slug/body/metadata/publication | BACKEND_ONLY | Editor and safe rendering | Not arbitrary HTML | No for existing content | Knowledge package |
| Integrations / inspect import | integrations | integrations/runs, exclusions | A/integrations/* | integrations.read/manage | run counts/errors/exclusions | PARTIAL | semantic freshness | No invented health status | EM track | Later |
| Staff / access management | staff | settings/staff | A/staff/* | staff.* | employee/roles/active/sessions | READY | New navigation only | Visibility, not authorization | Separate invariant hardening | Later |
| Audit / inspect changes | audit | settings/audit | A/audit-events | audit.read | actor/target/result/time | READY | New navigation only | Existing filters | No | Later |
| Client service / choose path | `/site/service` | Same after approval | Existing route links only | Public | supported journeys | AVAILABLE | Redesigned entry page | Yes, navigation | No | FE-1C |
| Service form / submit request | `/site/service/request` | Same | C/service-requests/types,drafts,submit | Cookie user | published fields/answers/version | PARTIAL | UI hardcodes three types | No new form state machine | Contract cleanup if generalizing | FE-1C |
| Service status / continue | `/site/service/status` | Same + later account route | C/service-requests, P/service-requests/:token | Owner or bearer | customer status/messages/files | PARTIAL | payment proof command, clearer waiting reasons | No payment truth from upload | P-PROOF; bearer security | FE-1C |
| Registration / submit and resume | `/site/cash-registration` | Same + later account registrations | C/registrations/form, :id/checklist, requirements | Cookie user / owner | registration ID/checklist/evidence | PARTIAL | no customer list/resume lookup | Cannot recover ID by guessing | R-RESUME | Later client slice |
| Organizations/equipment / access assets | `/site/organizations` | Later personal organizations[/:id] | C/organizations/access-requests; C/organizations/:id/assets | Approved membership | org/assets/history | PARTIAL | UI only lists orgs; combined history | No cross-org joins without access | B-R2 if aggregation needed | Later |
| Catalog/product / select equipment | `/site/catalog[/:slug]` | Same | P `/api/catalog/*` exists; UI static | Published public data | product/price/VAT/availability | BACKEND_ONLY | Real API wiring | No local authoritative price | No | Catalog package |
| Cart/checkout / place order | `/site/cart`, `/site/checkout` | Same | C/orders exists; UI fake | Cookie user; order owner | canonical IDs/submit key/price snapshots | BACKEND_ONLY | Real submit and validation | Cart preference only | No for existing order intake | Sales package |
| Customer orders / track sale | None | Later personal orders[/:id] | C/orders; proof and documents | Order owner | confirmed quote/docs/status | BACKEND_ONLY | Entire workspace | Server totals only | No for existing scope | Sales package |
| Customer support / download | None | `/site/support[/:slug]` | `/api/support/*` | Published public resources | profile/resource/version/download | BACKEND_ONLY | Entire public UI | Safe URLs/rendering only | No | Support package |
| Customer knowledge / find answer | None | `/site/knowledge[/:slug]` | `/api/knowledge/articles` | Published public articles | markdown/metadata | BACKEND_ONLY | Renderer/search surface | Sanitize, never trust raw HTML | No basic UI; SEO later | Knowledge package |
| Operator contact / ask question | Callback dialog, contacts | Later personal messages | C/tickets/open,active,messages,media | Cookie user / ticket owner | ticket/messages/files | PARTIAL | Dedicated client conversation | No merged channel promise | IDENTITY for cross-device | Later |

## URL state contract

Target queue keys: `status`, `priority`, `platform`, `responsible`, `page`,
`limit`; `search` and `sort` only after a bounded server-approved contract exists.
Reference uses `/admin/reference/service-requests` and `/:id`.
Status/platform go to the real API; priority/responsible narrow only the already
authorized result. Page/limit slice that result locally and never claim a server
total. UI explicitly says "up to 100 latest". No free-text search or sort control.
Default sort remains server `createdAt DESC`, not a fictitious `updatedAt` sort.

Filters survive reload. Detail tabs use `?tab=request|messages|documents|history`.
Queue context stays in router history state as a same-route-relative URL;
`selected` is a row ID for focus restoration, not a customer payload. The explicit
back link preserves filters/page/selected row and scrolls it into view. Browser
Back restores the original queue URL. No business objects or secrets in URL or
localStorage. Direct detail entry falls back to the default queue.

## Backend-gap review

| Gap / classification | Exact evidence | Impact / affected screen | Blocks next stage? | Bounded follow-up |
| --- | --- | --- | --- | --- |
| Web payment proof: BACKEND_COMMAND_GAP | `client-ui/src/services/client.ts` reply upload -> C/service-requests/:id/messages/attachments; `ServiceRequestsService.storeCustomerMessageAttachment` stores kind `message`, not `paymentProofFileId`; `transitionByStaff` rejects paid without that ID | Generic web upload cannot be confirmed as payment proof through current staff command | Not FE-1A; yes for end-to-end web payment | P-PROOF: explicit owner-bound versioned proof command reusing FileStorage |
| Bot payment proof: AVAILABLE | `ServiceRequestChannelWorkflowService.attachPaymentProof` sets ID, kind `payment_proof`, event `payment_proof_attached`; generic admin attachment download checks assignment | Existing MAX/TG proof is displayable with real metadata | No | Reuse, never import OrderDocument model |
| Registration reload: BACKEND_READ_GAP | `CashRegistrationPage` keeps `number` in component state; C exposes form/start/answer and :id/checklist, no list/detail discovery/resume endpoint | Customer cannot rediscover submitted registration after reload; checklist works with known owned ID | Not FE-1B service; blocks registration resume UX | R-RESUME: owner-scoped discovery/read projection; preserve readiness model |
| Cross-device identity: IDENTITY_GAP | `WebSessionService.create` issues random cookie and `web-UUID` user; current 30-day default; no verified customer login/channel merge | Do not promise another device or shared TG/MAX account | No for current-browser slices; yes for unified account | IDENTITY-1, separately designed verification/linking |
| My work summary: BACKEND_READ_GAP | `AdminService.getSummary` permission-filters 3 counts; service uses capped list, no order/attention/readiness aggregate; assigned engineer service query is server-scoped | Counts are not full workload, no "overdue" or SLA fields | No for service; yes for complete dashboard | B-R2 permission-scoped read projection, no Task table |
| Allowed actions: BACKEND_READ_GAP | `getAdminDetails` returns request/messages/events/attachments/deliveries, not allowedActions/reasons; AdminController transition maps target to permission; service locks and validates version/proof/state | Cannot name one guaranteed permitted next mutation from a status alone | No read-only blocker; resolve per-command UX before FE-1B writes | B-C1 bounded action/readiness projection or audited command-specific preflight |
| Staff names: BACKEND_READ_GAP | Admin service list/detail serialize scalar staff IDs without relations; engineers GET requires `staff.read`, full staff list requires `staff.roles.manage` | Own/authorized engineer names available; other names honestly remain IDs | Non-blocking read slice | B-R1 minimal identity projection, not relaxed staff permissions |
| Local filters/labels: DERIVABLE_PRESENTATION_ONLY | Server ServiceRequestListQueryDto only status/platform; listForAdmin take(100); local priority/responsible filter | Cannot claim full dataset pagination | Non-blocking reference; scale limitation for production | B-R1 validated pagination/filter/total/sort contract |
| Payment document lifecycle: BACKEND_READ_GAP | attachmentView has id/kind/file/createdAt; no lifecycle/downloadability/message ID/invoice issue date; request holds current file IDs | Current IDs can be matched, replaced files may be unavailable; uploaded date is not issue date | Non-blocking with truthful labels | B-R1 bounded file state projection |
| Unassigned detail error: BACKEND_READ_GAP | `AdminService.getServiceRequestDetailsForAdmin` throws `BadRequestException` (400), not 403/404, when assignment lookup fails | No request data leaks; generic connection wording would be misleading | Non-blocking: reference displays neutral unavailable state for 400/404 | Normalize error contract in B-R1; do not parse English error text or guess ownership |
| Reference next-action/payment display: DERIVABLE_PRESENTATION_ONLY | Current status + file ID + matching attachment/event | Show payment-stage evidence; never infer bank settlement or mutate locally | No | Keep approval disabled in FE-1A |
| Registration auth ordering and service bearer security: SECURITY_BLOCKER | `RegistrationReadinessService.clientDetails` lazy initialization before owner check; bearer lifecycle findings retained in PSR-1 | Broader production rollout remains constrained | Not isolated reference; production gates remain | Existing SEC follow-up, no backend fixes here |
| New queue, Redis, Task table, cross-domain state machine: NOT_REQUIRED | Existing domain APIs cover the reference read slice | Unnecessary infrastructure would expand scope | No | None |

## Migration decision

If approved, FE-1B migrates only admin shell and ServiceRequest production
queue/detail, adds real versioned commands with existing RBAC and browser workflow
tests, and removes reference duplication. It must explicitly resolve capped
queue/name/action/file gaps or document truthful bounded behavior. FE-1C follows
for client service. P-PROOF is required before claiming complete web payment.
Registration resume, cross-device identity, full customer registry, Catalog,
Orders, Support, Knowledge and EM remain separate packages.

If rejected, revise this draft reference branch only. No main routes or
canonical grades were replaced. FE-1B is not started.
