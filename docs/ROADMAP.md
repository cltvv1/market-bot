# Roadmap

This roadmap reflects `main` at
`54112d9dfeb48f47300d124593e158c0219f7caa` after FE-CAT-1, with a scoped
2026-09-15 frontend checkpoint. FE-STORE-1 is a separate draft review package. It is ordered by
dependency and evidence, not by calendar promises. Current capability status is
kept in [PROJECT_STATUS.md](PROJECT_STATUS.md); detailed evidence is in the
[2026-09-02 rebaseline](audits/2026-09-02-project-status-roadmap-rebaseline.md).

## Completed foundations

| Package | Result |
| --- | --- |
| Pre-production rebaseline | Clean baseline, append-only migrations, `synchronize: false`, CI and isolated database verification |
| BKV1 organization/service/registration | Representative access, canonical ServiceRequests, versioned forms, files/messages, and KKT readiness |
| CH-R1 | Durable inbound identity, dialog serialization/state, duplicate handling, and fail-closed interruption recovery |
| CH-R2 | Durable outbound intents, bounded retry, stale-claim recovery, dedupe keys, files, and current staff reauthorization |
| SEC-R1 | Stable pre-auth rate limiting, asynchronous PBKDF2, bounded/fixed Multer, and pre-parser resource authorization |
| SEC-R2 | Current-role and assignment authorization for staff notifications |
| CO-1 | PostgreSQL Catalog metadata, publication/search, admin API, RBAC, and audit |
| KB-1 | Product Support, versioned resources, Knowledge metadata, publication, and APIs |
| FS-1 | File lifecycle reconciliation plus hosted Support upload/download |
| CO-2 | Authenticated, idempotent Order intake with immutable submitted lines |
| CO-3A | Sales assignment, review, mutable quote, and confirmation |
| CO-3B | Invoice revisions, payment proof, and manual payment confirmation |
| CO-3C | Whole-order fulfillment, realization facts, final-document handoff facts, and completion |
| FE-1A / FE-1B | Approved interface foundation, production admin shell and ServiceRequest workspace |
| P-PROOF / FE-1C | Canonical web payment proof and production customer ServiceRequest workflow |
| FE-REG-1 | Merged staff KKT Registration workspace and owner-before-lazy-read correction |
| FE-REG-2 | Merged customer KKT registration, resume and field-compatibility follow-up |
| FE-ORD-1 | Merged staff Orders queue, quote, payment, fulfillment and completion workspace |
| FE-CAT-1 | Merged production staff Catalog categories/products and publication workspace; PR #34, main CI 34941653068 |

Completion here means the bounded package contract passed its tests. It does not
mean every capability has a product UI or that the system is production-ready.

## Current next track

Frontend implementation checkpoint, 2026-09-15: FE-REG-1 and FE-REG-2 are merged;
customer registration/resume is no longer deferred. FE-ORD-1 connects existing
Orders commands to the staff shell with a real queue, detail tabs, contextual
assignees, server action projection and explicit stale-form reconciliation.
FE-ORD-1 is merged as PR #33; main CI 34932993321 passed. No deployment is implied.
FE-CAT-1 is merged, reusing CO-1 with scoped snapshot preconditions and publication
readiness. FE-STORE-1 connects public Catalog, ID/quantity-only cart, canonical
checkout and owner Orders in a separate draft package, not merged or deployed.
See [FE-STORE-1 report](frontend/2026-09-15-client-store-order-intake.md).
See [FE-ORD-1 report](frontend/2026-09-15-admin-orders-workspace.md) and
[FE-CAT-1 report](frontend/2026-09-15-admin-catalog-workspace.md).

### EM-0 Equipment Monitoring rebaseline

Audit and design the current ATOL Connect and Platforma OFD data flow before
adding more automation:

- verify provider contracts and fail-closed schema handling with sanitized
  fixtures;
- define canonical organization/KKT/FN/OFD identity mapping;
- define snapshot, incremental, missing, stale, resolved, reopened, and excluded
  semantics;
- define Observation to ServiceOpportunity lifecycle and manual recovery;
- define external scheduling, run limits, retry, and transaction boundaries;
- decide whether current entities are sufficient for EM-1.

Implementation is allowed only for a narrowly demonstrated blocker. Provider
access remains read-only. EM-0 does not include outreach, OFD.ru, AI
recommendations, or provider-cabinet writes.

### EM-1 Equipment health and recommendations

After EM-0, map provider observations to deterministic normalized issues,
severity/priority, recommended action, and resolution/reopen lifecycle. Keep
recommendations explainable and reviewable by staff.

### EM-2 Contact resolution and enrichment

Unify manual, customer, provider, and later 1C contact candidates. Model source,
freshness, confidence, candidate/verified/rejected/obsolete state, person/role,
deduplication, preferred contact, consent, and do-not-contact. This package is a
dependency of proactive customer notifications.

### NR-1 Notifications and renewals

Create FN/OFD/ITS deadline rules and staff alerts, then send only to eligible
customers. Reuse CH-R2 for durable delivery and add event-level dedupe, delivery
history, quiet hours/escalation, and an operator fallback task. A recorded
business event and an actually delivered message remain separate facts.

## Parallel tracks

### FE-1 Frontend activation and real API switch

FE-ORD-1 and FE-CAT-1 supply merged staff Orders and Catalog workspaces.
FE-STORE-1 removes static Catalog facts and fake checkout in its draft review,
connecting publication -> customer Order -> manager workflow -> customer documents
and status. Cart storage contains IDs/quantities only. Remaining work includes
review of this bounded package, client Support/Knowledge and their staff workspaces.
This is separate from monitoring and does not imply stock, 1C, EDO or deployment.

### SEC-R3 Production security hardening

Prioritize same-origin protection for all customer cookie mutations,
ServiceRequest bearer entropy/exposure/revocation, strict legacy file-content
authorization, registration authorization before lazy initialization, closed
ticket replies, last-superadmin concurrency, request-ID validation, MAX media
egress policy, CSP, and reachable dependency advisories. Split implementation
into reviewable packages rather than one broad security rewrite.

### OPS-1 Production operations

Make readiness prove the full migration chain; define reverse proxy/TLS,
deployment topology, process supervision, centralized rate limits, file
capacity/lifecycle execution, backup retention/encryption/off-host copy,
restore rehearsal, and operational monitoring.

### Unified customer and contact profile

Use EM-2 evidence to converge customer identities, organization memberships,
channel links, contacts, assets, requests, and orders without automatic unsafe
profile merging.

### FE-2 Full UX redesign

After FE-1 exposes real data flows, redesign the customer information
architecture around store, service, Support/Knowledge, organizations/assets,
orders, registrations, and operator contact. Do not redesign around current
mock behavior.

## Later integrations

### INT-1 1C UT 11.5 exchange design

Begin only after the manual Order workflow and canonical identifiers are proven
through real UI use. Define:

- Catalog and stock import ownership;
- confirmed Quote to 1C customer order;
- invoice and realization linkage;
- idempotency, reconciliation, failures, and operator recovery.

VITMA must not accidentally treat an unreviewed import as authoritative.

### EDO

Choose a provider and document identity/ownership contract after INT-1.
Electronic document exchange is not part of current runtime.

### Catalog and stock synchronization

Belongs to INT-1 or a package derived from it. Until then, Catalog publication
is managed in VITMA and provider observations remain non-accounting data.

## Explicitly deferred

- online acquiring;
- warehouse accounting inside VITMA;
- partial fulfillment;
- returns and refunds;
- provider-cabinet write automation;
- OFD.ru integration;
- Playwright scraping of Rusprofile as a default contact source;
- AI recommendations without deterministic rules and reviewable evidence;
- microservices, Redis, or an external queue without measured need.

## Dependency order

```text
EM-0 -> EM-1 -> EM-2 -> NR-1
  |
  +---- FE-1 (parallel) -> FE-2
  +---- SEC-R3 / OPS-1 (parallel)

proven manual Orders + real UI -> INT-1 -> EDO
```

The next bounded package is EM-0. It should finish with a reviewed
state-transition/data-flow contract, stale-resolution matrix, operational
schedule/recovery contract, and a justified minimum schema decision for EM-1.
