# Project status

Last scoped checkpoint: 2026-09-17 (SEC-007 buffered upload content policy, draft branch). Full-system audit: 2026-09-02.

Canonical merged main baseline: `53f0933fb46d89309b616a7595e701def6100a8e` (SEC-R3B, PR #37 merged).

Baseline CI: [run 35064353685](https://github.com/cltvv1/market-bot/actions/runs/35064353685), successful. SEC-R3A/SEC-R3B are merged: SEC-004/005/006 are resolved in their documented application HTTP scope. See the [origin audit](security/2026-09-16-customer-origin-boundary.md) and [public-access evidence](security/2026-09-16-service-request-public-access.md). SEC-007 is fixed in the separate draft branch `codex/sec-007-file-content-policy` in the [verified buffered-upload scope](security/2026-09-17-legacy-upload-content-policy.md); not yet closed on main. No deployment or full-system/provider reassessment is implied.

Detailed evidence: [2026-09-02 project status and roadmap rebaseline](audits/2026-09-02-project-status-roadmap-rebaseline.md).

## What VITMA MARKET is

Frontend checkpoint: FE-1B, P-PROOF, FE-1C, FE-REG-1 and FE-REG-2 are merged.
Staff service requests and KKT registration use the production admin shell;
customers can use their service and registration/resume workflows. FE-REG-1
also fixed owner authorization before lazy checklist initialization.
FE-ORD-1 staff Orders workspace is merged as PR #33. FE-CAT-1 staff Catalog is
merged as PR #34. FE-STORE-1 is merged as PR #35: real customer Catalog/cart/checkout
and owner Orders are in main. The commercial vertical slice is not deployed.
See [Store scope and verification](frontend/2026-09-15-client-store-order-intake.md).
See the [Catalog scope and verification](frontend/2026-09-15-admin-catalog-workspace.md),
[Orders scope and verification](frontend/2026-09-15-admin-orders-workspace.md)
and [Registration admin evidence](frontend/2026-09-10-admin-registration-workspace.md).

VITMA MARKET is a pre-production modular monolith for customer service, KKT registration, operator conversations, equipment data, a product catalog, support content, sales orders, and read-only equipment observations. One NestJS application and one PostgreSQL database serve the client React application, the staff React application, Telegram, and MAX.

Support and Knowledge remain mostly backend-only. Service, registration, staff Orders and Catalog have merged production-oriented workflows. FE-STORE-1 has replaced demonstration commerce with real public Catalog and owner Orders in main.

## Architecture summary

```text
client-ui ------ cookie HTTP API ------+
admin-ui ------- staff HTTP API -------+--> NestJS modular monolith --> PostgreSQL
Telegram ------- channel adapter ------+              |
MAX ------------ channel adapter ------+              +--> FileStoragePort
ATOL/Platforma - read-only bridge ------+
                                                    +--> durable outbound worker
```

- TypeORM uses `synchronize: false` and `migrationsRun: false`.
- Main has 12 append-only migrations, 57 application entities/tables, and 12 foreign-key ownership surfaces for `stored_files`. The twelfth migration revokes legacy public links without schema changes. SEC-007 adds no migration.
- CH-R1 persists inbound command identity and dialog state. Interrupted commands fail closed.
- CH-R2 persists business-significant outbound delivery intent with bounded retry and current staff reauthorization.
- FileStorage is local behind a port, with lifecycle reconciliation and context-bound downloads.
- ATOL Connect and Platforma OFD are observational, read-only provider sources. They are not accounting authorities.

## Capability summary

Evidence labels used below: `CODE`, `TEST`, `MIGRATION`, `HOSTED_CI`, `MOCK`, and `DEFERRED`.

| Capability | Current evidence | Status | Main gap |
| --- | --- | --- | --- |
| Staff authentication and RBAC | `CODE`, `TEST`, `MIGRATION` | READY | Last-superadmin concurrency and some audit atomicity remain |
| Anonymous customer web sessions | `CODE`, `TEST`, `MIGRATION` | READY | No verified cross-channel customer login or merge |
| Organizations and representative access | `CODE`, `TEST`, `MIGRATION` | READY | Contact/profile unification is incomplete |
| KKT/FN/OFD assets and equipment kits | `CODE`, `TEST`, `MIGRATION` | PARTIAL | Not a general equipment-health registry |
| Service requests | `CODE`, `TEST`, `MIGRATION` | PARTIAL | Backend is broad; customer UX and bearer security need work |
| KKT registration readiness | `CODE`, `TEST`, `MIGRATION`, `HOSTED_CI` | MERGED_SCOPE | FE-REG-1 staff workspace and FE-REG-2 customer registration/resume; no public deployment implied |
| Tickets and operator chat | `CODE`, `TEST`, `MIGRATION` | PARTIAL | Closed-ticket reply guard remains |
| Telegram and MAX customer flows | `CODE`, `TEST` | PARTIAL | Large duplicated handlers and small parity differences |
| Durable inbound commands | `CODE`, `TEST`, `MIGRATION` | READY | Failed-command operator replay remains manual |
| Durable outbound delivery | `CODE`, `TEST`, `MIGRATION` | READY | At-least-once provider duplicate window; Orders do not enqueue |
| Audit Log | `CODE`, `TEST`, `MIGRATION` | PARTIAL | Older mutations do not always share the business transaction |
| File lifecycle and hosted delivery | `CODE`, `TEST`, `MIGRATION` | READY | Production schedule, capacity, antivirus, and remote storage are deferred |
| Catalog metadata and publication | `CODE`, `TEST`, `MIGRATION`, `HOSTED_CI` | MERGED_SCOPE | FE-CAT-1 staff workspace and FE-STORE-1 real public storefront/bounded cart resolver merged; no stock synchronization or deployment |
| Support and Knowledge backend | `CODE`, `TEST`, `MIGRATION` | BACKEND_ONLY | No client or admin product screens, SSR, sitemap, or SEO rendering |
| Order intake and full-order sales workflow | `CODE`, `TEST`, `MIGRATION`, `HOSTED_CI` | MERGED_SCOPE | FE-ORD-1 staff workspace and FE-STORE-1 canonical checkout/owner documents/status merged; no acquiring, 1C, EDO or deployment |
| ATOL/Platforma observations and opportunities | `CODE`, `TEST`, `MIGRATION` | PARTIAL | Private provider contracts, manual scheduling, and stale-data semantics |
| Renewals and proactive notifications | Existing CH-R2 delivery only | DEFERRED | No deadline scheduler, consent eligibility, escalation, or fallback task |
| 1C UT 11.5 exchange | `DEFERRED` | DEFERRED | Contract, mapping, reconciliation, and ownership not designed |
| EDO | `DEFERRED` | DEFERRED | No provider or document exchange contract |
| Production deployment | `HOSTED_CI` only | BLOCKED | Security, frontend activation, observability, backup policy, and deployment topology |

## Current end-to-end flows

The following flows have real backend persistence and at least one usable channel or staff path:

1. A customer starts a web session, requests access by INN, and an authorized operator approves or rejects the representative relationship.
2. A customer submits a versioned service request through web, Telegram, or MAX; staff can message, assign, invoice, confirm payment, schedule, and complete it.
3. A customer fills a KKT registration form and provides KKT/FN/OFD evidence; staff verifies requirements, assigns an engineer, generates the final PDF, and performs the readiness-gated handoff.
4. A customer opens a ticket and exchanges text/media with an operator through web or a messenger.
5. Business-significant service, ticket, and registration messages are committed as CH-R2 delivery rows and sent by the bounded worker.
6. Staff can run read-only ATOL Connect or Platforma OFD imports, inspect observations, manage service opportunities, and convert an opportunity to a ServiceRequest.
7. Customers use the real public Catalog, hydrated cart and canonical idempotent checkout. Staff assigns a manager, builds/confirms a quote, issues an invoice, confirms payment, and records fulfillment/completion; customers see owner Orders, quote, invoice, payment proof and timeline through real APIs.

## Backend-only capabilities

- Product Support profiles, versioned external/hosted resources, and Knowledge articles.
- Context-bound hosted Support downloads up to the configured limit.

## Mock or missing UI

- FE-STORE-1 removed the static Catalog source and fake local order generator from main.
- Cart persistence is IDs/quantities only, with current server hydration and explicit unavailable entries.
- Checkout calls canonical idempotent Order intake; client owner list/detail, quote, invoice, proof and timeline use real APIs.
- There are no client Support Center or Knowledge routes.
- Admin Support and Knowledge workspaces are still absent. Orders and Catalog management are merged.
- Service, Registration, Orders and Catalog retain their contract/browser gates; FE-STORE-1 adds the customer commerce vertical slice gate. Content screens remain deferred.

## Read-only integrations

The two current bridges use Playwright browser sessions to call provider-internal read endpoints, normalize batches, and post them to the authenticated internal import API:

- `atol_connect`: previous-day SmartRadar events plus customer/contact detail.
- `platforma_ofd`: organization, KKT, FN, OFD subscription, contact, and monitoring-badge snapshots.

Runs, mappings, exclusions, errors, observations, and opportunities are persisted. The bridges bind to loopback by default and require the shared bridge key. There is no in-application schedule; execution is manual or requires an external scheduler. Provider-cabinet writes are prohibited by product design.

## Known production blockers

1. SEC-R3A/SEC-R3B (PR #36/#37) resolved SEC-004/005/006 in scope: 32 guarded cookie mutations, 35 customer/public and 110 total mutations, explicit random capability issuance, rotation/revocation and header/browser/log/cache controls. SEC-007 closes permissive legacy buffered-file fallback only in its draft branch, pending separate merge approval. Existing files are not revalidated; antivirus remains deferred.
2. FE-REG-1 fixed registration owner-before-lazy-read ordering. The historical closed-ticket and last-superadmin findings require their own follow-up; FE-ORD-1 does not claim to resolve them.
3. MAX media download has no explicit provider-host egress allowlist.
4. Client and staff Support/Knowledge UI is absent. Customer commerce, staff Catalog and Orders are merged, with no production deployment implied.
5. `/health/ready` checks only the original baseline migration rather than proving the full current migration chain.
6. Deployment, reverse proxy, TLS, centralized rate limiting, capacity monitoring, backup retention/encryption/off-host copy, and production restore rehearsal are not finalized.
7. The September 2 audit recorded 22 production advisories; that is historical evidence, not a fresh dependency assessment. Reachability, upgrades and CSP require a separate bounded package.
8. ATOL/Platforma rely on undocumented provider interfaces and have incomplete stale-observation/contact semantics.

## Current roadmap

1. Review the `SEC-007` draft and its format/compatibility evidence. No merge, deployment, OPS-1A or next feature follows automatically.
2. `EM-0`: later rebaseline Equipment Monitoring contracts and stale-data lifecycle, audit/design-first. Not started by SEC-R3B.
3. `EM-1`: normalize equipment health, issue severity, recommendation, and resolution.
4. `EM-2`: unify contact sources, freshness, confidence, verification, deduplication, consent, and do-not-contact state.
5. `NR-1`: schedule FN/OFD/ITS renewals with eligibility, CH-R2 delivery, dedupe, and operator fallback.
6. `FE-1` still needs client/staff Support and Knowledge UI; Catalog and Orders are already connected to real APIs.
7. `FE-2` redesigns the complete customer information architecture only after the real data flows are active.
8. `INT-1` designs 1C UT 11.5 exchange after the manual order workflow and identifiers are stable. EDO follows a separately approved provider contract.

## Explicitly deferred

- online acquiring;
- warehouse accounting inside VITMA;
- partial fulfillment, returns, and refunds;
- provider-cabinet write automation;
- OFD.ru integration;
- automatic scraping of Rusprofile;
- AI recommendations without deterministic rules and reviewable evidence;
- microservices, Redis, or an external queue without a demonstrated need.

This document is a current navigation source, not a replacement for package decision records. Historical documents remain valid only for their stated baseline and date.
