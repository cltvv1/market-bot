# Current project audit

The canonical current-state summary is
[PROJECT_STATUS.md](PROJECT_STATUS.md). Full repository, runtime, UI, security,
and roadmap evidence is in the
[2026-09-02 project status rebaseline](audits/2026-09-02-project-status-roadmap-rebaseline.md).

This page is a navigation aid. Historical audits and package reports remain
valid only for their stated date and baseline.

## Audited baseline

- `main`: `b9b3ed63d2ee26216b8e5f03ce85dd2d54141cde`;
- merge: PR #24, CO-3C Fulfillment and completion workflow;
- hosted CI: [run 33605998052](https://github.com/cltvv1/market-bot/actions/runs/33605998052), green;
- schema: 11 append-only migrations, 57 application tables/entities, zero
  generated drift in isolated application and test databases;
- application: 30 NestJS modules, 20 controllers, and 189 decorated HTTP
  handlers.

## Current architecture

VITMA MARKET is one NestJS modular monolith and one PostgreSQL database serving
two React applications plus Telegram and MAX adapters. TypeORM runs with
`synchronize: false` and migrations are explicit. Local file storage is behind
`FileStoragePort`; CH-R1 and CH-R2 persist inbound commands, dialog state, and
business-significant outbound delivery.

The core service, registration, ticket, organization-access, Catalog,
Support/Knowledge, and whole-order sales domains are persisted and tested.
ATOL Connect and Platforma OFD are read-only observational sources.

## Product boundary

The backend is ahead of the product UI:

- service requests, KKT registration, organization access, tickets, and
  integration opportunities have usable channel or staff paths;
- Catalog, Support/Knowledge, and Orders have real backend APIs but no complete
  client/staff UI;
- the visible client catalog/cart/checkout still uses hardcoded data,
  `localStorage`, and a fake order submission;
- there is no 1C or EDO integration;
- the system is development-ready and suitable for controlled pre-production
  verification, but is not production-deployed or production-ready.

## Next work

The next bounded package is EM-0, an audit/design-first rebaseline of equipment
monitoring, provider identity, freshness, stale/resolved behavior, and
Observation/Opportunity lifecycle. FE-1 and focused security/operations
hardening should proceed in parallel. See [ROADMAP.md](ROADMAP.md) for dependency
order.

The open PR #12 code-health audit is based on an older pre-CH-R1/CH-R2 baseline
and is superseded. It should be closed without merge after this rebaseline is
accepted.
