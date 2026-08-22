# Pre-production baseline decision

**Decision date:** 2026-08-22
**Source main SHA:** `8f137b6790989c9a8de1d814846863ef9a72da4a`

## Decision

VITMA MARKET had never been deployed to production when this decision was
approved. No production PostgreSQL database or production file storage existed,
and development requests, registrations, identifiers, documents and form
versions had no preservation requirement.

The project therefore starts from the current canonical model rather than
carrying development-only conversion/fallback behavior. Git history remains
unchanged and is the historical record of earlier states.

## Canonical baseline

- one NestJS modular monolith and one PostgreSQL database;
- React `client-ui` and React `admin-ui` only;
- Telegram and MAX as adapters of common application services;
- staff sessions and multi-role `admin_user_roles`;
- customer HttpOnly web sessions;
- pending organization access requests and approved representative membership;
- one `ServiceRequest` aggregate with versioned forms, structured answers,
  files, messages, public token and centralized transitions;
- one `RegistrationRequestEntity` plus requirements, evidence and data requests;
- `StoredFile`/`FileStoragePort` as the only file persistence path;
- Audit Log, validation, security perimeter, health and coordinated backup.

The frontend catalog/cart/checkout demo is retained pending the separate
Catalog + Orders domain package. It does not define database contracts.

## Migration strategy

`src/database/migrations` contains one migration:

```text
InitialPreproductionBaseline1787388476982
```

It creates only the current entity schema. It has no environment data, old-ID
mapping or conversion statements. `synchronize` remains disabled in every
environment.

Existing pre-rebaseline development databases are not upgraded in place. They
are disposable and must be recreated. Future production migrations are
append-only from this baseline and require normal expand/migrate/contract
discipline when valuable data exists.

## Empty-environment startup

```powershell
npm ci
docker compose up -d postgres
npm run migration:run
$env:BOT_POLLING_ENABLED = "false"
$env:MAX_BOT_TOKEN = ""
npm run start
```

Expected bootstrap:

1. database contains exactly one migration history row;
2. current registration field dictionary is seeded;
3. active service types are seeded;
4. each active service type has one published form version `1`;
5. `/health/live` returns `ok`;
6. `/health/ready` reports database available and migrations current.

## Safe local reset

Use only after proving that the configured resources are local
development/test resources and after creating a temporary verified backup
outside the repository.

1. Stop Nest/Vite processes and disable messenger polling.
2. Confirm `DB_HOST`, container, database names and storage roots.
3. Dump the configured development DB and archive storage.
4. Record file size/SHA-256 manifest.
5. Restore into a separate temporary DB/storage and compare row/file counts.
6. Drop and recreate only the confirmed development and `*_test` databases.
7. Empty only confirmed local `storage/` and `backups/` roots.
8. Apply `migration:run`, then verify repeat run, `migration:show` and
   `schema:log`.
9. Start offline and check bootstrap/health.
10. Delete the temporary insurance backup only after all local and hosted CI
    checks pass; otherwise retain it and report its absolute path.

Never apply this reset procedure to a production or unclassified resource.

## Compatibility policy

Discarded pre-BKV1 development routes, fields, form versions and file paths are
not supported. Removed HTTP routes return normal `404`; there are no aliases,
redirects, dual-writes or fallback readers. Current runtime readiness and
manual verification rules remain mandatory.

## Git history

No history rewrite, force push or destructive change to `main` is part of this
decision. The purge is an ordinary reviewable feature branch and draft PR.
