# Current project audit

Current as of the pre-production rebaseline on 2026-08-22. Historical audits
describe earlier development states and are not runtime specifications.

## Architecture

VITMA MARKET is one NestJS modular monolith with one PostgreSQL database and
two React applications. Telegram and MAX are transport adapters; both call the
same application services used by web/admin workflows. TypeORM runs with
`synchronize: false`.

```text
client-ui ---- HTTP/web session ----+
admin-ui ----- HTTP/staff session ---+--> NestJS --> PostgreSQL
Telegram ----- messenger adapter ---+       |
MAX ---------- messenger adapter ---+       +--> FileStoragePort
```

## Current domain paths

- organization access: pending request, staff approval, representative membership;
- service requests: one aggregate, versioned forms, structured answers, files,
  messages, public token and centralized transitions;
- KKT registration: one registration aggregate plus requirements, evidence and
  persistent data requests;
- files: only `StoredFile` references and domain-authorized streams;
- staff access: server-side sessions and multi-role RBAC;
- customer web access: server-side HttpOnly session;
- audit, health, integration observations and coordinated backup/restore.

## Frontends

- `client-ui`: React/TypeScript/Vite customer site;
- `admin-ui`: React/TypeScript/Vite staff workspace;
- Nest can serve production builds only when `SERVE_BUILT_UI=true`;
- no static HTML implementation or fallback mode remains.

The catalog/cart/checkout demo still uses frontend data and `localStorage`.
This is an explicit future Catalog + Orders scope, not an alternate backend
contract.

## Persistence baseline

- migration: `InitialPreproductionBaseline1787388476982`;
- 38 TypeORM entity tables plus `typeorm_migrations`;
- no development-data conversion step;
- no old route aliases, path columns or dual-write;
- service forms bootstrap as published version 1 on an empty database.

Detailed schema: [`database/SCHEMA_BASELINE_REPORT.md`](database/SCHEMA_BASELINE_REPORT.md).
Decision record: [`architecture/preproduction-baseline.md`](architecture/preproduction-baseline.md).
Verification evidence: [`audits/2026-08-22-preproduction-legacy-purge.md`](audits/2026-08-22-preproduction-legacy-purge.md).

## Known product gaps

- no PostgreSQL catalog/orders workflow;
- no customer phone OTP/profile merge;
- equipment model is KKT-oriented and not yet a general equipment registry;
- no durable outbox/retry/deduplication for messenger delivery;
- production retention, deployment and second backup destination are undecided;
- ATOL/OFD bridges remain controlled integrations, not authoritative accounting.

The next code-health audit must run from the merge commit of this rebaseline;
findings from an older schema or route set are no longer valid.
