# Roadmap

This roadmap starts from the clean pre-production baseline. It uses dependency
order and relative complexity, not calendar estimates.

## Foundation status

| Package | Status | Result |
|---|---|---|
| Stage 0 security/operations | Complete | migrations, sessions, RBAC, validation, FileStorage, audit, CI, backup |
| B1 Telegram/MAX stabilization | Complete | current flows share application services; no external calls in tests |
| BKV1-0 organization access | Complete | pending request and staff-approved representative membership |
| BKV1-1 service requests | Complete | canonical aggregate, forms, drafts, files, messages and status token |
| BKV1-2 KKT readiness | Complete | checklist, evidence, data requests, verification and backend gates |
| Pre-production rebaseline | In review | one initial migration and removal of discarded development contracts |

## Recommended sequence

### R0. Restart code-health audit

**Priority:** P0. **Complexity:** M.

Re-run dead-code, dependency, duplication and boundary analysis after this
branch is merged. Do not reuse findings based on removed migrations/routes.

**Done when:** audit reports reference the new main SHA and propose only small,
tested cleanup packages.

### R1. Catalog and order-request vertical

**Priority:** P1. **Complexity:** XL.

Admin creates/publishes products; customer browses PostgreSQL catalog, submits
an order-request; sales manager receives it, uploads an invoice and records the
status/history. Accounting and stock remain in 1C.

**Not included:** acquiring, warehouse accounting or automatic 1C sync.

### R2. Complete customer service-request experience

**Priority:** P1. **Complexity:** L.

Polish real web forms/status/messages around the existing backend, add approved
service schemas and close remaining frontend mock/status assumptions.

### R3. Bot extensibility and delivery reliability

**Priority:** P1. **Complexity:** L/XL by package.

Use versioned form definitions across web/Telegram/MAX, then add durable
conversation state, inbound deduplication and outbox/retry in separate packages.

### R4. Unified customer profile

**Priority:** P1. **Complexity:** XL.

Phone-based profile, verified channel linking, controlled duplicate merge,
organization representatives and authenticated history. SMS is not a blocker
until a provider is selected.

### R5. General equipment registry

**Priority:** P1. **Complexity:** XL.

Locations, general equipment, specialized KKT/FN/OFD/license data, linked
requests, documents and maintenance history.

### R6. Notifications and renewals

**Priority:** P1. **Complexity:** XL.

Durable scheduled notifications for FN/OFD expiration through Telegram, MAX
and email, with delivery history, idempotency and operator fallback tasks.

### R7. Controlled integrations

**Priority:** P2. **Complexity:** XL.

CSV/XLSX exchange with 1C first; verified ATOL/OFD adapters only after API,
contract and data-processing rights are confirmed.

### R8. Rule-based equipment selector

**Priority:** P2. **Complexity:** L.

Editable deterministic questions/rules, explainable recommendations and handoff
to cart or sales manager. No AI/ML component.
