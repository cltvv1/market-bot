# Project status and roadmap rebaseline

Date: 2026-09-02

Baseline: `main` at `b9b3ed63d2ee26216b8e5f03ce85dd2d54141cde`

Scope: repository-wide audit and documentation only

## 1. Executive verdict

VITMA MARKET now has a broad, migration-backed application core. Organization access, canonical ServiceRequests, KKT registration readiness, operator tickets, durable inbound commands, durable outbound delivery, catalog metadata, Support/Knowledge metadata, hosted file delivery, and the complete whole-order sales state machine all exist in the shared NestJS/PostgreSQL backend.

The project is not a complete production product yet. Backend delivery has moved much faster than the two React applications. The visible client catalog, cart, and checkout still use hardcoded data and localStorage, while no Catalog, Support, Knowledge, or Orders staff workspace exists. Equipment observations can already become service opportunities and ServiceRequests, but provider synchronization relies on private read interfaces, manual/external scheduling, and incomplete stale/contact semantics.

The earlier three High security findings are resolved. Four Medium findings remain present or only partially remediated, along with bounded Low/Informational hardening work. Operational foundations are credible for development and pre-production verification, but production deployment topology, complete migration readiness, storage/backup operations, security closure, and external integration contracts are not finished.

Grades:

| Dimension | Grade | Reason |
| --- | --- | --- |
| Backend domain completeness | B | Major service, registration, channel, content, catalog, and whole-order domains exist; generalized equipment intelligence, contacts, renewals, 1C, and EDO remain |
| Frontend product completeness | D | Service/registration/organization flows are real, but commerce is mock and large backend domains have no UI |
| Security perimeter | C | The three former High findings are closed; four Medium and several Low/Info findings still affect production surfaces |
| Operational readiness | C | CI, migrations, health, backup tooling, offline smoke, and file reconciliation exist; production topology and policies do not |
| External integration readiness | C | Two read-only bridges and import/run models exist, but provider contracts are private and scheduling/stale semantics are incomplete |
| Overall production readiness | D | The system is a strong pre-production backend, not a deployable complete customer/staff product |

Recommended next package: `EM-0 Equipment Monitoring rebaseline`, audit/design-first. It should define provider contracts, stale observation rules, equipment identity, opportunity lifecycle, and production scheduling boundaries before new monitoring logic is added.

## 2. Baseline and methodology

The audit started from the exact remote baseline:

- `origin/main`: `b9b3ed63d2ee26216b8e5f03ce85dd2d54141cde`;
- commit subject: `Merge pull request #24 from cltvv1/codex/co-3c-fulfillment-completion-workflow`;
- parents: `c1c424f4d70dcde6b4601ee4b01592f87aaee0d6` and `791729c36bf6107581cbc65734115d13aa52d1bc`;
- baseline push CI: [run 33605998052](https://github.com/cltvv1/market-bot/actions/runs/33605998052), successful for all three repository jobs.

Work was performed in a dedicated clean worktree on branch `codex/psr-1-project-status-roadmap-rebaseline`. The primary worktree and its user-modified `package-lock.json` were not changed.

Evidence labels:

| Label | Meaning |
| --- | --- |
| `CODE` | Current runtime source implements the capability |
| `TEST` | Current automated test exercises the capability |
| `MIGRATION` | Current append-only schema persists/enforces it |
| `HOSTED_CI` | GitHub Actions passed on the exact baseline/final commit |
| `DOCUMENTED_ONLY` | A document describes it but runtime evidence is absent |
| `MOCK` | UI or adapter simulates success without canonical persistence |
| `DEFERRED` | Explicitly outside current implementation |
| `STALE` | Active-looking documentation no longer matches current code |

Capability statuses are `READY`, `PARTIAL`, `BACKEND_ONLY`, `UI_ONLY_MOCK`, `DEFERRED`, `STALE`, `OBSOLETE`, `BLOCKED`, and `NOT_VERIFIED`.

The review used static source inventory, current migrations, PostgreSQL catalog queries, tests, builds, offline bootstrap/browser smoke, current package audit output, Git history, hosted CI metadata, and open PR metadata. It made no Telegram, MAX, ATOL, Platforma OFD, 1C, EDO, production database, or production storage call.

## 3. Repository and module inventory

### 3.1 Application shape

- 30 Nest module files, including the root module;
- 20 controller files;
- 189 decorated HTTP handlers;
- 57 TypeORM entity files;
- 11 migration files;
- 32 unit spec files;
- 20 PostgreSQL integration spec files;
- 2 e2e spec files;
- two React/Vite applications;
- two messenger channel adapters;
- two provider bridge scripts;
- one in-process background worker, `OutboundDeliveryProcessor`.

Source size at the baseline:

| Area | TypeScript files | Physical lines |
| --- | ---: | ---: |
| `src` | 268 | 41,539 |
| `admin-ui/src` | 5 | 2,611 |
| `client-ui/src` | 33 | 6,706 |
| `test` | 24 | 13,021 |

### 3.2 Module inventory

| Group | Modules |
| --- | --- |
| Root/config/database | `AppModule`, `DatabaseSeedModule` |
| Identity/access | `AdminModule`, `WebSessionModule`, `UsersModule`, `UserContextModule`, `OrganizationsModule` |
| Customer work | `ClientModule`, `ServiceRequestsModule`, `RegistrationsModule`, `TicketsModule`, `AssetsModule`, `CustomerActivityModule` |
| Commerce/content | `CatalogModule`, `SupportKnowledgeModule`, `OrdersModule` |
| Channels/reliability | `TelegramModule`, `MaxModule`, `MessengerModule`, `MaxMessengerModule`, `InboundCommandsModule`, `OutboundDeliveriesModule`, `AdminNotificationsModule` |
| Platform/operations | `FilesModule`, `AuditModule`, `HealthModule`, `PdfModule`, `IntegrationsModule`, `SiteModule`, `UiServingModule` |

`AppModule` imports every current domain. TypeORM explicitly sets `synchronize: false` and `migrationsRun: false`.

### 3.3 HTTP route inventory

| Surface | Controller handlers |
| --- | ---: |
| Main admin controller | 67 |
| Admin Catalog | 11 |
| Admin Integrations/Opportunities | 11 |
| Admin Orders | 11 |
| Admin Support | 17 |
| Admin Knowledge | 6 |
| Client workflow API | 15 |
| Client organization assets | 4 |
| Client organizations/access | 5 |
| Client ServiceRequests | 11 |
| Client Orders | 5 |
| Customer web sessions | 3 |
| Public Catalog | 3 |
| Public ServiceRequests | 4 |
| Public Support | 5 |
| Public Knowledge | 2 |
| Health | 2 |
| Internal integration import | 1 |
| Application/static UI handlers | 6 |
| **Total** | **189** |

The total counts decorated handlers, including static UI fallbacks. It is not a claim that every route is a separate business capability.

### 3.4 Channel, worker, CLI, and documentation inventory

- Telegram registers 24 decorator handlers: 1 start, 22 callback actions, and 1 message handler.
- MAX registers 20 SDK handlers: bot start, command dispatch, 16 callback actions, and message handling. `/start` and `/menu` are registered through the MAX SDK command API.
- The only periodic in-process worker is CH-R2 outbound delivery. It is feature-gated and disabled in CI. There is no renewals scheduler or integration scheduler.
- Bootstrap hooks seed current service forms and validate the first admin bootstrap state; they are not background jobs.
- Operational CLI families cover migrations/schema checks, isolated test DB management, admin creation, backup/create/verify/restore/drill, file reconciliation, bridge startup, integration synchronization, build/test, and offline smoke.
- Before PSR-1, `docs` contained 31 active files outside history, including 10 architecture records and 6 audit reports, plus 47 historical files.
- The only open PR was draft PR [#12 Code-health audit after pre-production legacy purge](https://github.com/cltvv1/market-bot/pull/12).

## 4. Migration and data-model inventory

### 4.1 Migration chain

The repository and both isolated `migration:show` commands confirmed 11 applied migrations:

1. `InitialPreproductionBaseline1787388476982`
2. `AddDurableInboundCommands1787577304950`
3. `AddDurableOutboundDeliveries1787664000000`
4. `AuthorizeStaffNotifications1787750400000`
5. `AddCatalogFoundation1787836800000`
6. `AddSupportKnowledgeFoundation1787923200000`
7. `HardenFileLifecycle1788009600000`
8. `AddOrderIntakeFoundation1788096000000`
9. `AddOrderSalesWorkspaceCore1788182400000`
10. `AddOrderInvoicePaymentWorkflow1788268800000`
11. `AddOrderFulfillmentCompletionWorkflow1788355200000`

Repeated migration execution had no pending work. `schema:log` and `schema:test:log` emitted no synchronization queries.

### 4.2 Database inventory

The migrated PostgreSQL schema contains 58 public base tables: 57 application tables plus `typeorm_migrations`. This matches the 57 entity files. PostgreSQL reports 91 foreign keys.

Major table groups:

| Group | Tables |
| --- | --- |
| Staff/customer identity | `admin_users`, `admin_user_roles`, `admin_sessions`, `users`, `user_channels`, `user_dialog_states`, `customer_web_sessions` |
| Organizations/assets | `organizations`, `organization_members`, `organization_access_requests`, `cash_registers`, `fiscal_drives`, `ofd_subscriptions`, `equipment_kits` |
| Service/registration/tickets | 7 ServiceRequest tables, 5 registration tables, 2 ticket tables, `customer_activities` |
| Reliability/files/audit | `inbound_commands`, `outbound_deliveries`, `stored_files`, `audit_events` |
| Catalog/content | 3 Catalog tables and 7 Support/Knowledge tables |
| Orders | `orders`, `order_lines`, `order_events`, `order_quotes`, `order_quote_lines`, `order_documents` |
| Integrations/intelligence | `integration_runs`, `integration_errors`, `integration_exclusions`, `external_mappings`, `external_observations`, `organization_contacts`, `service_opportunities`, `opportunity_observations` |

There is no production data migration in PSR-1. The clean pre-production baseline remains the first migration; later packages correctly append migrations instead of rewriting it.

## 5. Capability matrix

| Domain | Business capability | Persistence | Public/client API | Admin API | Telegram | MAX | Client UI | Admin UI | Tests | Operational dependency | Status | Main gap | Recommended next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Admin auth/RBAC | Staff password login, sessions, role union, current reauthorization | Admin/user/role/session tables | N/A | Login/logout/me/staff/session controls | Current callback authorization | Current callback authorization | N/A | Login and staff management | Unit + integration + e2e | PostgreSQL, secure cookies | READY | Last-superadmin race; some non-atomic audit writes | Security hardening package |
| Customer web sessions | Anonymous durable browser identity | `customer_web_sessions` + User/channel | Create/read/revoke | Read through customer card | N/A | N/A | Automatically created | Visible indirectly | Integration + e2e | PostgreSQL, cookie policy | READY | No verified login/linking | Unified identity track |
| Users/customer identity | Shared User plus channel identities | User, UserChannel | Session-scoped use | Customer card/search | Upsert channel | Upsert channel | Partial profile context | Customer card | Integration/characterization | PostgreSQL | PARTIAL | No verified merge/preferred identity | Identity design after EM-2 |
| Organizations/access | Requested representative access and membership | Organization, request, membership | Own list/request/cancel | Queue, approve/reject, organization reads | Indirect via customer | Indirect via customer | Real organizations page | Real access/org tabs | Integration | PostgreSQL | READY | Broader CRM/contact model | EM-2 |
| Assets/equipment | KKT, FN, OFD, kits | Four asset tables | Member-scoped asset routes | Asset/kit routes | Registration/service snapshots | Same | Organization assets partial | Kits and organization card | Integration | PostgreSQL | PARTIAL | No normalized equipment health/location/history | EM-0 then EM-1 |
| Service requests | Forms, drafts, answers, files, conversation, staff lifecycle | Seven tables + StoredFile | Session and bearer APIs | Full workflow routes | Real flows | Real flows | Real request/status UI | Real service workspace | Unit + integration | PostgreSQL, storage, CH-R2 | PARTIAL | UX polish and bearer/origin security | Security package plus FE-1/FE-2 |
| Registration readiness | KKT/FN/OFD evidence and gated handoff | Five tables + StoredFile | Form/checklist/value/evidence | Verify/request/OFD mode/kit/PDF/handoff | Real | Real | Real registration page | Real registration workspace | Unit + integration | PostgreSQL, storage, PDF, CH-R2 | PARTIAL | SEC-008 owner-before-init issue | Narrow security fix |
| Tickets/operator chat | Customer/operator text and media | Ticket/message + StoredFile | Active/history/send/media | Read/reply/media/close | Real | Real | Callback/ticket paths, no dedicated full inbox | Real ticket workspace | Unit + integration | PostgreSQL, storage, CH-R2 | PARTIAL | Closed ticket accepts staff sends | Narrow invariant fix |
| Telegram | Customer flows and staff chat callbacks | Shared domains + CH-R1 state | N/A | N/A | Native | N/A | N/A | Notifications link to chat | Handler tests | Telegram provider when enabled | PARTIAL | 1,565-line handler; Telegram-only admin lists/credits | Decompose after product priority |
| MAX | Customer flows, staff connect, bot commands | Shared domains + CH-R1 state | N/A | N/A | N/A | Native | N/A | Notifications link to chat | Handler/media tests | MAX provider and CA trust when enabled | PARTIAL | 1,558-line handler; no Telegram admin-list parity/credits | Decompose after product priority |
| CH-R1 inbound | Provider update dedupe, dialog lock, persisted state | InboundCommand, UserDialogState | N/A | Diagnostic only through DB/logs | Used | Used | N/A | N/A | Unit + integration | PostgreSQL advisory locks | READY | Failed command manual replay; provider ID limits | Later operator diagnostics |
| CH-R2 outbound | Durable intent, retry, stale claims, dedupe | OutboundDelivery | Parent projections only | Parent delivery views | Adapter target | Adapter target | Status via parent domain | Service/ticket delivery visibility | Unit + integration | PostgreSQL, worker, messenger | READY | At-least-once duplicate window; no Orders intents | Add per-domain only when UX exists |
| Audit Log | Security/business event history | AuditEvent | No public log | Superadmin read | Callback denials where designed | Same | N/A | Real audit tab | Unit + integration | PostgreSQL | PARTIAL | Older mutations do not always share the business transaction | Incremental transaction fixes |
| FileStorage/lifecycle | Protected storage, verification, cleanup | StoredFile + 12 owner FK surfaces | Context-bound domain downloads | Context-bound domain/admin downloads | File ingestion/delivery | File ingestion/delivery | Existing service/registration downloads | Existing service/registration downloads | Unit + integration | Local volume, external CLI schedule | READY | Capacity, AV, remote provider, retention operation | Production operations package |
| Catalog | Categories/products/aliases/prices/VAT/publication | Three tables | Search/filter/list/detail | CRUD/publish | None | None | Hardcoded demo, not API | Missing | Unit + integration | PostgreSQL | BACKEND_ONLY | No real client/admin UI; no stock source | FE-1, later INT-1 |
| Support Center | Product profiles and versioned resources | Four core/junction tables | Product/resource APIs | CRUD/publish/version APIs | None | None | Missing | Missing | Integration | PostgreSQL | BACKEND_ONLY | No product screens | FE-1 |
| Knowledge base | Versionless Markdown articles and links | Three core/junction tables | Article list/detail | CRUD/publish | None | None | Missing | Missing | Integration | PostgreSQL | BACKEND_ONLY | No renderer/SEO/sitemap | FE-1 then FE-2 |
| Hosted Support downloads | Strict large upload and public stream | StoredFile + version FK | Context-bound download | Raw streamed upload | None | None | Missing links/pages | Missing upload UI | Unit + integration | Storage volume, reconcile CLI | BACKEND_ONLY | No UI; no AV/Range/CDN | FE-1 and production ops |
| Orders intake | Authenticated idempotent immutable order snapshot | Order/line/event | Submit/list/detail | Read/list | None | None | Fake checkout | Missing | Unit + integration | PostgreSQL | BACKEND_ONLY | Checkout does not call backend | FE-1 |
| Sales assignment/quotes | Assignment, review, quote, confirmation | Order/quote/quote-line/event | Confirmed quote read | Full command API | None | None | Missing | Missing | Unit + integration | PostgreSQL | BACKEND_ONLY | No sales workspace | FE-1 admin |
| Invoice/payment | Invoice revisions, proof, manual confirmation | OrderDocument + order facts/events | Proof upload/invoice download | Invoice/payment commands/download | None | None | Missing | Missing | Unit + integration | PostgreSQL, storage | BACKEND_ONLY | No UI and no customer notification | FE-1; later CH-R2 intents |
| Fulfillment/completion | Whole-order fulfillment and realization facts | Order fields/events | Timeline read through detail | Fulfill/complete | None | None | Missing timeline | Missing commands | Unit + integration | PostgreSQL | BACKEND_ONLY | No UI; no partial fulfillment/cancel | FE-1; keep deferrals |
| Integrations | Controlled provider imports and run diagnostics | Runs/errors/mappings/exclusions | None | Run/error/exclusion/bridge routes | None | None | None | Real integration tab | Integration | Browser sidecars, bridge key | PARTIAL | Private APIs and external/manual scheduling | EM-0 |
| External observations | Imported equipment/provider signals | ExternalObservation | None | Through opportunity detail | None | None | None | Signals view | Integration | Provider bridges | PARTIAL | Weak stale/resolution semantics | EM-0/EM-1 |
| Service opportunities | Dedupe, assignment, callback, conversion | Opportunity + observation links | None | Read/update/convert | Notification not dedicated | Same | None | Real Signals tab | Integration | PostgreSQL | PARTIAL | Recommendation/contact/resolution model incomplete | EM-1 |
| Notifications/renewals | Current event notifications | OutboundDelivery | Parent-domain status | Preference/binding and parent views | Delivery target | Delivery target | No settings | Staff settings | Integration | CH-R2 worker | PARTIAL | No scheduled renewals, consent, quiet hours, fallback | EM-2 then NR-1 |
| Client React app | Customer site/service/registration/org access | Browser only plus real APIs | Mixed | N/A | N/A | N/A | Real service parts, mock commerce | N/A | Offline/browser smoke | Vite or built UI | PARTIAL | No real commerce/support/order account | FE-1 |
| Admin React app | Operator workspace | Server APIs | N/A | Real adapters | N/A | N/A | N/A | Service/registration/ticket/org/integration/staff/audit | Offline/browser smoke | Vite or built UI | PARTIAL | No Catalog/Support/Knowledge/Orders | FE-1 |
| 1C | Catalog/stock/order/accounting exchange | None | None | None | None | None | None | None | None | Contract/provider access | DEFERRED | No mapping/reconciliation design | INT-1 after manual flow |
| EDO | Electronic document exchange | None | None | None | None | None | None | None | None | Provider/legal contract | DEFERRED | Provider and ownership undecided | After INT-1 design |
| Deployment/operations | Build, migrate, health, backup, smoke | Migration/audit/backup manifests | Health | Health/admin diagnostics | Disabled in CI | Disabled in CI | Build passes | Build passes | Hosted + local CI | Reverse proxy, TLS, volumes, scheduler | BLOCKED | No production topology/policies or production rehearsal | Dedicated production-readiness track |

## 6. Customer journeys

### 6.1 Usable now

1. The web app creates/restores an HttpOnly customer session and uses the server identity for subsequent requests.
2. A customer can request organization access by INN, inspect/cancel own requests, and see memberships after staff review.
3. Web, Telegram, and MAX create canonical ServiceRequests. Web uses server drafts, structured answers, attachments, version checks, and idempotent submit.
4. Customers can inspect ServiceRequest state and conversation through session ownership or the request bearer. Service and ticket attachments are domain-authorized.
5. KKT registration captures form fields and KKT/FN/OFD requirements/evidence. Staff verification gates engineer handoff and final PDF use.
6. Ticket text/media can be exchanged with an operator. CH-R2 persists business-significant delivery intent.

### 6.2 Not usable as a real product

The customer cannot place a canonical order through the visible checkout, list prior orders, inspect the confirmed quote, download an invoice through a screen, upload payment proof through a screen, or view fulfillment/completion history. Support and Knowledge have no client routes. Cross-channel identity is not verified or merged.

## 7. Staff journeys

The current admin UI supports login, notifications/bindings, registration queues and readiness actions, ServiceRequest queues and workflow actions, ticket conversation, organization access review, organization/customer cards, equipment kits, integration runs/exclusions, service opportunities, staff administration, and Audit Log.

The backend additionally supports Catalog CRUD/publication, Support profile/resource/version administration, Knowledge administration, hosted Support upload, and the complete Orders workflow. None of those four domains has a staff screen. Their backend status must not be presented as operator-ready.

## 8. Channel parity and reliability

Telegram and MAX share the same Users, Registration, Ticket, ServiceRequest, FileStorage, CH-R1, and CH-R2 services. Both provide start/main menu, KKT registration, operator question, OFD question, simple service request, FN replacement, ATOL consent, versioned form answers/confirmation, registration data-request response, operator connect/disconnect, and message/media handling.

Known differences:

- Telegram exposes messenger-side lists/details/completion actions for registrations and tickets; MAX does not.
- Telegram exposes marketplace credits; MAX does not.
- MAX registers `/start` and `/menu` commands through `setMyCommands`.
- Provider identity construction differs by provider payload, but both feed CH-R1.

CH-R1 evidence:

- unique `(platform, externalUpdateId)` identity;
- statuses `processing`, `processed`, and `failed`;
- PostgreSQL advisory lock per platform/dialog;
- exact duplicates return no-op;
- an existing indeterminate `processing` row becomes terminal `failed` after lock recovery and is never replayed automatically;
- V2 ServiceRequest callbacks validate request, expected step, and expected version;
- UserDialogState persists mode, target, and request context across restart.

Residual CH-R1 limitations are manual handling of terminal failures, very large channel handlers, and reliance on provider-specific update identifiers.

CH-R2 evidence:

- statuses `pending`, `processing`, `retrying`, `sent`, and `failed`;
- unique logical dedupe key and conflicting-intent rejection;
- domain mutation/history plus delivery intent in one transaction for migrated service, registration, and ticket flows;
- `FOR UPDATE SKIP LOCKED` claims;
- four total attempts with bounded delays;
- stale claim recovery after five minutes;
- StoredFile-based document/image delivery;
- enqueue-time and send-time staff RBAC/assignment/binding reauthorization;
- sanitized diagnostics and parent-domain delivery projections.

CH-R2 is at-least-once. A provider can accept a message before the sent-state write fails, causing a later duplicate. Orders currently create domain events and files but no CH-R2 intents; this is an explicit deferred integration, not a defect in the Order state machine.

## 9. Catalog, Support, and Knowledge

Catalog persists Category, Product, and ProductAlias. It supports normalized SKU/aliases, VAT basis points, exact minor-unit prices, availability, publication, bounded public search/filter/pagination, admin CRUD/publication, RBAC, transactional AuditEvent writes, and external identity fields reserved for future synchronization.

Support persists ProductSupportProfile, SupportResource, SupportResourceVersion, and product/resource junctions. Distribution is either safe external HTTPS or hosted StoredFile, never both. A partial unique index enforces one current version per scope. Resource/version publication and public usability are distinct so an unavailable hosted file fails closed.

Knowledge persists Markdown articles and product/resource junctions. Admin and public APIs enforce explicit publication. The backend returns Markdown and metadata; it does not sanitize/render HTML.

Frontend truth:

- Catalog/product pages import `client-ui/src/data/catalog.ts`.
- There is no client Support or Knowledge route.
- There is no admin Catalog, Support, or Knowledge tab.
- There is no SSR/SSG, sitemap, canonical/redirect history, schema.org output, or reviewed Markdown renderer.

Therefore the three backend foundations are real, while the product and SEO experience is not.

## 10. Order workflow

### 10.1 Aggregate boundaries

`OrderLine` is the immutable customer submission snapshot. `OrderQuoteLine` is the mutable draft commercial offer; after confirmation it is immutable. Quote edits never rewrite submitted lines.

Money is represented as decimal minor-unit strings in HTTP/persistence and calculated with `BigInt`. Floating-point totals are not used.

### 10.2 Transition map

| Transition/command | Route | Permission/owner | Assignment | Version + lock | Main persisted facts | OrderEvent / AuditEvent | Customer visible | External side effect | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| create `submitted` | `POST /api/client/orders` | WebSession owner | N/A | UUID idempotency + advisory lock + transaction | Immutable customer/org/contact/delivery/product/price snapshots | `submitted` / `order.submitted` in transaction | Yes | None | Unit + integration |
| assign/reassign | `POST /admin/api/orders/:id/assign` | `orders.assign` | Eligible target by phase permissions | `expectedVersion` + row lock | manager and assignedAt | manager event / transactional audit | Staff-only event | None | Unit + integration |
| `submitted -> in_review` | `POST .../:id/start-review` | `orders.review` | Actor is current manager or claims unassigned order | Version + row lock | Draft quote revision 1, manager, status | `review_started` / audit | Yes | None | Unit + integration |
| update quote | `PUT .../:id/quote` | `orders.quote` | Current manager | Version + row/quote locks | Replaced quote lines, revision, exact totals | `quote_updated` / audit | Staff event only | None | Unit + integration |
| `in_review -> confirmed` | `POST .../:id/confirm` | `orders.confirm` | Current manager | Version + row/quote locks | Confirmed immutable quote and timestamp | `confirmed` / audit | Yes | None | Unit + integration |
| `confirmed -> waiting_payment` | `POST .../:id/invoices` | `orders.invoice` | Current manager | Version + row/file locks | Active invoice revision, quote/amount snapshot; prior invoice superseded | `invoice_issued/replaced` / audit | Yes | StoredFile write only | Unit + integration |
| payment proof | `POST /api/client/orders/:id/payment-proofs` | Owning WebSession | N/A | Version + row/file locks | Active proof revision; status unchanged | `payment_proof_received` / audit | Yes | StoredFile write only | Unit + integration |
| `waiting_payment -> paid` | `POST .../:id/confirm-payment` | `orders.payment` | Current manager | Version + row lock | Absolute received/confirmed times, source, actor, comment | `payment_confirmed` / audit | Yes | None | Unit + integration |
| `paid -> fulfilled` | `POST .../:id/fulfill` | `orders.fulfill` | Current phase manager | Version + row lock | Whole-order method, recipient/carrier/tracking, time | `fulfilled` / audit | Yes | None | Unit + integration |
| `fulfilled -> completed` | `POST .../:id/complete` | `orders.complete` | Current phase manager | Version + row lock | Realization number/date and final-document delivery facts | `completed` / audit | Yes | None | Unit + integration |

Confirmed quote visibility begins at `confirmed` and continues through completion. Customer document reads require ownership, customer visibility, active document status, and trusted StoredFile metadata binding.

Invoice replacement retains every revision and exactly one active invoice. A payment proof is customer evidence, not payment truth; only the authorized staff confirmation transitions to `paid`. Fulfillment is deliberately whole-order. Completion records realization and final-document delivery facts rather than pretending that a stored payment proof or invoice is accounting truth.

The CO-2 idempotency key remains valid after later state transitions. Same normalized input returns the existing order without a second aggregate/event/audit write; changed input conflicts. `cancelled` is reserved by the schema and event enum but has no command route.

### 10.3 Order UI status

| Screen/capability | Client | Admin |
| --- | --- | --- |
| Catalog source | MOCK: hardcoded TypeScript | MISSING |
| Cart | MOCK: localStorage | N/A |
| Checkout | MOCK: fake local number | N/A |
| Idempotency-Key | MISSING | N/A |
| Order list/detail | MISSING | MISSING |
| New/unassigned/mine queues | N/A | MISSING |
| Assignment and quote editor | N/A | MISSING |
| Confirmed quote | MISSING | MISSING |
| Invoice upload/download/history | MISSING | MISSING |
| Payment-proof upload/review | MISSING | MISSING |
| Payment confirmation | N/A | MISSING |
| Fulfillment/completion | MISSING timeline | MISSING commands |

## 11. File lifecycle

`LocalFileStorageProvider` streams writes through a byte meter and SHA-256 hash into a temporary object, then atomically renames it. Server-generated UUID object keys, path resolution checks, root confinement, and symlink-avoiding inventory prevent caller filenames from becoming filesystem paths.

The lifecycle recognizes `pending`, `active`, `missing`, `corrupt`, `deleted`, and `rejected`. The dry-run-by-default `files:reconcile` CLI covers stale temporary files, untracked physical objects, stale pending rows, active unreferenced rows, missing files, optional checksum corruption, and delayed purge. Apply mode uses an advisory lock. Active orphan deletion is two-phase, missing detection is live-rechecked under row lock, references block purge, and deletion is idempotent.

The exact current FK ownership count is 12:

1. `order_documents.storedFileId`
2. `outbound_deliveries.storedFileId`
3. `registration_evidence.storedFileId`
4. `registration_requests.pdfFileId`
5. `service_request_attachments.storedFileId`
6. `service_request_messages.storedFileId`
7. `service_requests.generatedConsentFileId`
8. `service_requests.invoiceStoredFileId`
9. `service_requests.paymentProofFileId`
10. `service_requests.signedConsentFileId`
11. `support_resource_versions.storedFileId`
12. `ticket_messages.storedFileId`

Support upload bypasses memory-backed Multer and streams up to the configured 512 MiB default. It validates content signatures, extension, MIME, resource-type compatibility, pending ownership, one-winner attachment, publication readiness, and public context before download. Public download is attachment-only with content length, nosniff, ETag, and bounded cache revalidation.

Production limitations: local-volume durability/capacity, external reconcile schedule, backup retention/encryption/off-host copy, antivirus/sandbox policy for valid executables/archives, reverse-proxy upload limits, Range/CDN needs, and outbound-row retention must still be decided.

## 12. Integrations and equipment monitoring

### 12.1 Current model

Current integration entities are IntegrationRun, IntegrationError, IntegrationExclusion, ExternalMapping, OrganizationContact, ExternalObservation, ServiceOpportunity, and OpportunityObservation. Imports can create/update canonical Organizations, CashRegisters, FiscalDrives, and OFD subscriptions.

Both current provider bridges are read-only toward the provider:

| Provider | Mechanism | Imported data | Execution | Main risks |
| --- | --- | --- | --- | --- |
| `atol_connect` | Playwright persistent browser session plus SmartRadar internal read API | Previous-day events, client details, contacts, observations | Manual admin command or CLI/external scheduler | Private contract, daily-window assumptions, schema/login drift |
| `platforma_ofd` | Playwright session plus monitoring badge/internal read API | Organizations, KKT, FN, OFD, contacts, monitoring observations | Manual admin command or CLI/external scheduler | Private contract, snapshot completeness, stale badge semantics |

The sidecars bind loopback by default, require `INTEGRATION_BRIDGE_KEY`, sanitize URLs in returned errors, and post bounded normalized batches. `syncId` plus batch index prevents repeat application of the same batch. Provider/external IDs and mapping uniqueness protect canonical identity.

There is no in-application schedule. ATOL's previous-day cursor and Platforma snapshots are not a general incremental reconciliation protocol. Missing provider records are not reliably converted into canonical inactive/resolved state, and provider contract drift causes a controlled failed/partial run rather than an automatic adaptation.

Product invariant: ATOL Connect/SmartRadar and Platforma OFD are observational sources only. VITMA must not write to provider cabinets. OFD.ru is not in the active roadmap.

### 12.2 Customer Intelligence gap

The current path is:

```text
provider row -> ExternalObservation -> deduplicated ServiceOpportunity
             -> operator state/callback -> ServiceRequest
```

The target path needs explicit, deterministic semantics:

```text
equipment state -> normalized issue -> severity/priority -> recommendation
-> eligible verified contact -> opportunity -> ServiceRequest or Order -> resolution
```

Existing Observation and Opportunity entities should be extended or composed before inventing another aggregate. Missing pieces are normalized issue taxonomy, equipment-health state, freshness/stale/resolved rules, recommendation provenance, resolution linkage, and rules for when repeated provider signals reopen or remain suppressed.

### 12.3 Contact-resolution gap

`organization_contacts` currently stores phone/email, raw and normalized values, provider source, external ID, free-form quality, active flag, and `lastSeenAt`. Its source check allows only `atol_connect` and `platforma_ofd`.

Missing are manual, customer-submitted, and 1C-derived source records; explicit `firstSeenAt`; candidate/verified/rejected/obsolete state; person name/role; confidence; preferred contact; cross-source deduplication; operator verification; consent; and do-not-contact. These are prerequisites for proactive customer notifications.

Rusprofile must be considered only through an official export/API/feed or written permission. Playwright scraping is not the default plan.

### 12.4 Notifications and renewals

ServiceRequest, registration, and ticket business notifications use CH-R2 and retain per-delivery status/history. Staff authorization is checked at enqueue and immediately before send. Immediate menus/form prompts remain synchronous by design.

Orders have domain events but no outbound intents. There is no scheduled FN/OFD/ITS deadline service, customer opt-in/contact eligibility, quiet-hours policy, escalation, or operator fallback task. A domain event means a fact was recorded; only an OutboundDelivery `sent` state means the application recorded provider acceptance, and even that remains at-least-once.

## 13. Frontend and admin UI gap

### 13.1 Client React application

Routes exist for home, search, solutions, catalog, product, cart, checkout, service, ServiceRequest creation/status, KKT registration, organizations, informational pages, and not-found.

Real API use:

- anonymous WebSession;
- ServiceRequest types/drafts/answers/files/submit/list/detail/messages;
- KKT registration form/checklist/value/evidence;
- organization access/membership;
- callback/ticket path by default.

Mock/local truth:

- catalog and product data come from a 679-line static module;
- cart is localStorage and joins against that static module;
- checkout waits locally, generates a `VM-*` number, and writes `vitma_order_*` to localStorage;
- `VITE_USE_REAL_SERVICE_API=false` can restore a local ServiceRequest fallback;
- the public ServiceRequest token is persisted in localStorage and appended to a query string.

Missing: order account screens, Support/Knowledge, a unified customer profile, verified channel linking, real catalog media, and frontend-level regression tests beyond smoke.

### 13.2 Admin React application

The admin is a single 2,233-line `App.tsx` with real API adapters. Its ten tabs are Registrations, Service requests, Tickets, Opportunities, Organization access, Organizations, Equipment kits, Integrations, Staff, and Audit Log.

Hidden backend capabilities: all Catalog, Support, Knowledge, hosted-file, and Orders operations. There are no order queues, quote editor, invoice/payment workspace, fulfillment/completion controls, or document history.

The current production build succeeds but warns about large chunks: approximately 520 KiB minified admin JavaScript and 733 KiB minified client JavaScript. This is performance and maintainability debt, not a failed build.

## 14. Security finding reconciliation

| ID | Old severity | Old behavior | Current status | Evidence | Current affected surfaces | Production impact | Recommended package |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-001 | High | Cookie-rotatable pre-auth limit and synchronous PBKDF2 | resolved | SEC-R1 code/tests; request IP key, bounded map, async constant-work PBKDF2 | None identified | Closed for current single-process design; distributed limiter remains deployment work | None; deployment topology later |
| SEC-002 | High | Staff notification preferences bypassed RBAC/assignment | resolved | SEC-R2 code/tests/migration; enqueue/send reauthorization | None identified | Closed except unavoidable provider-call revocation race | None |
| SEC-003 | High | Unbounded/vulnerable Multer before policy validation | resolved | Multer 2.2 override, policy-derived transport/structure limits, preflight guards, integration tests | Current seven memory-backed multipart routes are bounded | Closed for current HTTP routes; proxy cap still required | Production proxy package |
| SEC-004 | Medium | Customer cookie mutations lacked Origin/CSRF check | partially_resolved | WebMutationOriginGuard exists only on Order submit/proof upload | Session, registration, organization, asset, ServiceRequest, and ticket mutations | Cross-site mutation risk where SameSite/browser conditions permit | SEC-R3 browser mutation protection |
| SEC-005 | Medium | Public request bearer entropy depends on client idempotency key | still_present | `derivePublicToken(userId, requestId, idempotencyKey)` | Public ServiceRequest status/message/file bearer | Guessability depends on caller key entropy; no independent random secret | SEC-R3 ServiceRequest bearer lifecycle |
| SEC-006 | Medium | Long-lived bearer appears in URL/storage/error logs | still_present | Token path routes, query-string link, localStorage, 500 logger uses `originalUrl` | Public ServiceRequest status/messages/attachments | Token leakage through history, logs, extensions, local browser access | SEC-R3 ServiceRequest bearer lifecycle |
| SEC-007 | Medium | Unknown content could fall back to declared MIME | partially_resolved | Support and Order policies are strict; older general purposes retain non-strict fallback | Legacy ticket/service/registration purposes | Polyglot/unknown content can enter trusted storage under declared allowed type | SEC-R4 file policy tightening |
| SEC-008 | Low | Checklist initialization occurred before owner check | still_present | `clientDetails -> details -> initializeIfMissing -> assertOwner` | GET customer registration checklist | Unauthorized caller can cause target-side rows/audit/readiness mutation, without disclosure | SEC-R4 registration authorization |
| SEC-009 | Low | Privileged mutation and AuditEvent often non-atomic | partially_resolved | Orders/Catalog/Support/Knowledge and key registration paths transact; older admin/integration wrappers audit afterward | Older staff, ticket, some registration/integration/admin actions | Mutation may commit without matching audit or vice versa | Incremental transactional audit package |
| SEC-010 | Low | Staff can send after ticket is closed | still_present | Send text/media locks ticket but does not reject `isAnswered=true` | Admin and messenger operator ticket sends | Confusing/unauthorized post-close communication | SEC-R4 ticket invariant |
| SEC-011 | Low | Last-superadmin check/use race | still_present | Count is performed before/without serialized invariant | Staff role/deactivation commands | Concurrent requests can remove the last active superadmin | SEC-R4 staff invariant |
| SEC-012 | Low | Non-UUID caller request ID can break login audit | still_present | Bootstrap accepts broad token; login forwards raw header into UUID AuditEvent | Admin login failure/success audit | Audit write failure or lost login record for crafted header | SEC-R4 request identity |
| SEC-013 | Low | MAX media URL lacks egress allowlist | still_present | Provider URL is fetched after shape/size controls without scheme/host allowlist | MAX inbound media materialization | Conditional SSRF if provider payload/trust is compromised | SEC-R4 MAX egress policy |
| SEC-014 | Informational | Runtime advisory backlog | partially_resolved | Multer finding removed; current `npm audit --omit=dev` is 22: 12 High, 8 Moderate, 2 Low | Nest/HTTP, Joi, TypeORM, React Router and transitive packages require scoped reachability review | Unknown until advisory-by-advisory validation; upgrade drift risk | DEP-1 bounded dependency review |
| SEC-015 | Informational | CSP disabled | still_present | `helmet({ contentSecurityPolicy: false })` | Both browser applications | Reduces defense in depth; no injection sink reproduced here | Production browser hardening |
| SEC-016 | Informational | Deployment/CI assumptions not pinned | still_present | Compose publishes PostgreSQL; Actions use major tags; topology undocumented | Deployment and CI supply chain | Conditional exposure/mutable action risk | OPS-1 deployment baseline |

Reconciliation totals:

- resolved: 3;
- partially resolved: 4;
- still present: 9;
- obsolete: 0;
- not reverified: 0.

The old severity distribution is retained only as historical priority evidence. This audit did not invent new severity labels or reproduce a new Critical/High issue. The remaining four Medium findings are production blockers until accepted or remediated.

## 15. Code-health findings

### 15.1 Current findings

| Finding | Evidence | Risk | Suggested package |
| --- | --- | --- | --- |
| Oversized domain/channel files | OrdersService 2,424 lines; admin App 2,233; Telegram 1,565; MAX 1,558; SupportService 1,543; ServiceRequestsService 1,422; channel workflow 1,364; AdminController 1,295 | Review cost and cross-feature regression risk | Small domain-by-domain extraction after active product work |
| Telegram/MAX orchestration duplication | Parallel callbacks, presentation, media, and state branches | Parity drift | Shared narrow use-case helpers, not a global messenger framework |
| Process-local rate limiter | Bounded/fail-closed Map | Resets on restart and is per instance | OPS package only if multi-instance |
| Potential bounded N+1/read amplification | Service type form lookup per type; hosted-version physical check per version | Latency grows with content count | Measure, then batch only proven hot paths |
| Sequential integration imports | Per-record upserts inside bounded batches | Large provider snapshots can hold transactions and run slowly | EM-0 benchmark/contract limits |
| Inconsistent customer mutation guards | Only Order mutations use WebMutationOriginGuard | Security and maintenance inconsistency | SEC-R3 |
| Inconsistent audit transaction boundaries | New domains transact; older controllers call audit after service mutation | Incomplete audit trail on crash | Incremental SEC/quality package |
| Readiness migration check is stale | `/health/ready` checks only the original baseline migration name | Pending later migrations can still report `migrations: current` | OPS-1 |
| Lint debt | Ratchet passes with 788 errors and 9 warnings across 68 files | Refactors remain noisy; broad lint fix is risky | Bounded lint packages |
| Production advisories | 22 production advisories | Unknown reachable risk and upgrade pressure | DEP-1 |
| Likely unused production dependencies | No source import found for `@heyputer/puter.js`, `gigachat`, `openai`, or `telegraf-session-local` | Install/attack surface and lock churn | Confirm runtime/build use, then remove separately |
| Frontend bundle/monolith | Large Vite chunks; admin is one component file | Slow iteration and eventual loading cost | FE-1 module boundaries/code splitting |
| Limited UI regression coverage | Browser smoke checks boot/login/logout, not domain workflows | Real API wiring can regress silently | FE-1 Playwright workflows |

No `TODO`/`FIXME`/`HACK` marker was found in current source. No confirmed stale runtime route was identified; legacy callback rejection and the ticket message alias are intentional compatibility paths. Dead-code candidates above require a dedicated package before deletion.

### 15.2 Superseded old code-health audit

Draft PR #12 was based on `335d5aa9035daabc78967f1ec16c710292dcf93c`. Its major CH-R1/CH-R2 recommendations are now implemented, and its schema/module counts predate Catalog, Support/Knowledge, FS-1, and Orders. Merging that report would restore stale current-state guidance. Recommendation: close PR #12 without merge after PSR-1 is accepted. PSR-1 does not close it or delete its branch.

## 16. Documentation drift

| Document | Drift at baseline | PSR-1 action |
| --- | --- | --- |
| `docs/ROADMAP.md` | Rebaseline in review; CH-R1/CH-R2 and Catalog/Orders still future | Fully replaced |
| `docs/PROJECT_AUDIT.md` | One migration, 38 entities, no Catalog/Orders/outbox | Reduced to current navigation summary |
| `README.md` | Says one migration and future Catalog + Orders backend | Corrected current operational facts and linked status |
| `docs/TARGET_ARCHITECTURE.md` | Current-state notes date from July and call outbox/Catalog/Orders future | Left as target architecture; consumers must use PROJECT_STATUS for current state |
| `docs/backup/BACKUP_RESTORE_DRILL.md` | Calls the one-migration/39-table August drill current | Preserved as dated evidence; a new production-style drill is required |
| `docs/database/SCHEMA_BASELINE_REPORT.md` | Describes the initial baseline, not current append-only schema | Preserved as baseline decision evidence |
| Architecture package records | Correct for their stated package baseline, some early text says later package deferred | Preserved; later records supersede package-local deferrals |
| Historical audits under `docs/history` | Historical by design | Untouched |

Active current-state claims should link to `docs/PROJECT_STATUS.md`. Package architecture records and dated audits are evidence snapshots, not mutable specifications.

## 17. Open and stale pull requests

| PR | State | Baseline/head | Assessment | Action |
| --- | --- | --- | --- | --- |
| [#12 Code-health audit after pre-production legacy purge](https://github.com/cltvv1/market-bot/pull/12) | Open draft, mergeable, old CI green | baseline `335d5aa...`; head `f16ce4db...` | Superseded by CH-R1/CH-R2 and all later packages | Close without merge after PSR-1 acceptance; preserve branch |

No other open PR existed at audit start.

## 18. Production-readiness gaps

### Development-ready

- deterministic dependency install and production builds;
- isolated migration/test DB tooling;
- fake-provider guards and offline bootstrap;
- real service/registration/ticket/manual order backend development;
- local protected FileStorage and reconciliation;
- browser smoke for both built applications.

### Pre-production-ready with constraints

- append-only migrations and zero schema drift;
- staff/customer sessions and current-role RBAC;
- versioned service and registration flows;
- durable channel command/delivery foundations;
- catalog/content/order backend APIs;
- coordinated offline backup tooling;
- read-only provider pilot imports using controlled credentials.

### Not production-deployed or production-ready

- no verified production host, reverse proxy, TLS, domain, secrets, process supervision, monitoring, or alerting baseline;
- readiness does not prove all current migrations;
- no accepted backup retention/encryption/off-host copy/restore SLA;
- four Medium and several Low/Info security findings remain;
- critical product UI is missing or mock;
- no production provider contract/SLA for ATOL/Platforma private APIs;
- no 1C or EDO contract;
- no proactive-contact consent/eligibility model;
- no production load/capacity evidence for PostgreSQL, local files, bridges, or outbound worker.

## 19. Roadmap options

Option A, frontend first, would expose the already-built Catalog/Support/Orders backend quickly, but it would leave monitoring/contact decisions undefined and broaden use of customer mutations before SEC-R3.

Option B, Equipment Monitoring first, establishes the next business differentiator and the contact/renewal dependency chain. It risks leaving the large backend/UI mismatch visible longer.

Option C, production hardening first, closes security and operations debt but delays user value and does not answer provider-data lifecycle questions.

Recommended approach: EM-0 first as a short audit/design package, while FE-1 and SEC/OPS packages proceed as bounded parallel tracks. EM-1 then defines deterministic issues/recommendations; EM-2 resolves contact eligibility; NR-1 depends on both. INT-1 remains later because 1C identifiers and ownership should align with the proven manual order workflow and real UI.

## 20. Recommended sequence

1. `EM-0 Equipment Monitoring rebaseline`: provider/data contract, identity, freshness, stale/resolved behavior, opportunity lifecycle, scheduling, and run limits.
2. Parallel `SEC-R3`: same-origin customer mutations and ServiceRequest bearer lifecycle. Parallel `OPS-1`: full migration readiness, reverse proxy, storage/backup schedule, deployment controls.
3. Parallel `FE-1`: connect client Catalog/Support/Orders and add the missing staff workspaces using existing contracts.
4. `EM-1`: normalized equipment issue, severity, recommendation, and resolution.
5. `EM-2`: source-aware contact candidate/verification/confidence/consent/do-not-contact and dedupe.
6. `NR-1`: FN/OFD/ITS deadlines, employee alert, eligible customer delivery, dedupe, delivery history, quiet hours/escalation, and operator fallback.
7. `FE-2`: unified customer information architecture and full UX redesign after real APIs are active.
8. `INT-1`: 1C UT 11.5 Catalog/stock import, confirmed Quote to customer order, invoice/realization linkage, and reconciliation.
9. EDO provider design after INT-1 establishes document identities and accounting ownership.

Equipment Monitoring remains the next track. Frontend activation is parallel and should not wait for all monitoring implementation. 1C is later and must not become the current system of record accidentally through an unreviewed import.

## 21. Next package definition

### EM-0 Equipment Monitoring rebaseline

Scope should be audit/design-first, with implementation only for a narrowly proven blocker:

- capture exact ATOL/Platforma request/response contracts without credentials or customer payloads;
- define supported provider versions and fail-closed schema checks;
- map provider IDs to canonical Organization/KKT/FN/OFD identities;
- define snapshot, incremental, missing, stale, resolved, reopened, and excluded semantics;
- decide whether existing Observation/Opportunity fields suffice;
- specify batch/run limits, transaction duration, retry/manual recovery, and external scheduling;
- define contact provenance boundaries without implementing proactive outreach;
- add synthetic contract fixtures and tests if current evidence can safely encode them;
- preserve provider read-only behavior.

Acceptance: a reviewed state-transition/data-flow document, a deterministic stale/resolution matrix, an explicit operational schedule/recovery contract, and a decision about the minimum EM-1 schema change. No provider write, no OFD.ru, no notifications, no AI recommendation, and no production account call.

## 22. Verification evidence

Environment:

- disposable PostgreSQL 16 container on local port 55435;
- application DB `vitma_psr1_application`;
- test DB `vitma_psr1_audit_test`;
- temporary FileStorage root outside the repository;
- `NODE_ENV=test`;
- fake Telegram token;
- `BOT_POLLING_ENABLED=false`;
- empty MAX token;
- `OUTBOUND_DELIVERY_WORKER_ENABLED=false`.

Results:

| Check | Result |
| --- | --- |
| `npm ci` | Passed; lockfile unchanged |
| `npm run ci:quality` | Passed: 32 suites, 224 unit tests |
| Lint ratchet | Passed: no added debt; baseline remains 788 errors, 9 warnings, 68 files |
| `npm run ci:database` | Passed after required builds: 20 suites, 196 integration tests; 2 suites, 7 e2e tests |
| `npm run ci:build` | Passed for admin UI, client UI, and NestJS |
| `npm run ci:offline-smoke` | Passed for Nest bootstrap, health/UI, nested client route, admin login/logout |
| Application `migration:show` | 11/11 applied |
| Test `migration:test:show` | 11/11 applied |
| Repeated migrations | No pending migration |
| `schema:log` and `schema:test:log` | Empty; zero schema drift |
| PostgreSQL catalog | 58 public tables: 57 application + migration history; 91 FKs |
| StoredFile ownership | 12 FK surfaces |
| `npm audit --omit=dev` | 22: 12 High, 8 Moderate, 2 Low, 0 Critical |
| Baseline hosted CI | Run 33605998052 passed all repository jobs |

The first local `ci:database` attempt before building failed only because the clean worktree had no `admin-ui/dist`. Running the repository-required build and then the full database command passed. This ordering dependency is recorded, not hidden.

## 23. Limitations

- Static route/handler counts describe the audited commit, not runtime traffic or product usage.
- No production/customer data or provider account was used, so provider schema and authentication behavior were not revalidated live.
- Dependency advisories were inventoried but not exploited or fixed; reachability remains a separate package.
- Potential N+1/import performance findings are source-based and require measurements before optimization.
- This audit did not load-test, penetration-test external infrastructure, or validate legal/commercial provider data rights.
- Dated package records were not rewritten. Their local deferrals may be superseded by later commits.
- Grades are reasoned categories, not percentages or service-level guarantees.

## 24. Final verdict

VITMA MARKET has crossed from an experimental bot project into a credible pre-production modular backend. Its strongest parts are canonical service/registration persistence, channel reliability, file ownership/lifecycle, explicit RBAC, and a carefully constrained whole-order sales model. Its weakest part is no longer the backend state machine: it is the distance between that backend and the actual customer/staff product, followed by contact/monitoring semantics and production hardening.

Proceed with EM-0 as the next bounded package. Run FE-1 and SEC/OPS hardening in parallel. Do not call the system production-ready, do not automate writes into provider cabinets, and do not start 1C/EDO until real UI use and canonical identifiers prove the manual workflow.
