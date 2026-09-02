# Roadmap

This roadmap reflects `main` at
`b9b3ed63d2ee26216b8e5f03ce85dd2d54141cde` after CO-3C. It is ordered by
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
| SEC-R1 | HTTP file/resource authorization and strict new-domain file delivery |
| SEC-R2 | Current-role and assignment authorization for staff notifications |
| CO-1 | PostgreSQL Catalog metadata, publication/search, admin API, RBAC, and audit |
| KB-1 | Product Support, versioned resources, Knowledge metadata, publication, and APIs |
| FS-1 | File lifecycle reconciliation plus hosted Support upload/download |
| CO-2 | Authenticated, idempotent Order intake with immutable submitted lines |
| CO-3A | Sales assignment, review, mutable quote, and confirmation |
| CO-3B | Invoice revisions, payment proof, and manual payment confirmation |
| CO-3C | Whole-order fulfillment, realization facts, final documents, and completion |

Completion here means the bounded package contract passed its tests. It does not
mean every capability has a product UI or that the system is production-ready.

## Current next track

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

Connect the existing client Catalog, Support, and Orders APIs and add staff
workspaces for Catalog, Support/Knowledge, and Orders. Remove hardcoded catalog
data, fake checkout, and `localStorage` business truth. This can start alongside
EM-0; it should not wait for the whole monitoring track.

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
