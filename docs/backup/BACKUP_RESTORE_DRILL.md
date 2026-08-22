# Current Backup Restore Drill

**Date:** 2026-08-22

This is the current pre-production baseline drill. The historical
2026-07-28 development-data drill is archived at
[`docs/history/preproduction/backup/BACKUP_RESTORE_DRILL_2026-07-28.md`](../history/preproduction/backup/BACKUP_RESTORE_DRILL_2026-07-28.md)
and must not be used as the current baseline count.

## Isolated baseline

- Database: disposable `vitma_backup_validation_test` PostgreSQL database.
- Storage and backup roots: separate temporary directories outside the
  repository.
- Migration: exactly one applied migration,
  `InitialPreproductionBaseline1787388476982`.
- Synthetic current records: one registration with checklist evidence and PDF,
  one service request, one ticket media message, one staff user with role, and
  three `StoredFile` records.
- Production PostgreSQL, production storage, and real Telegram/MAX polling were
  not used.

## Procedure and results

1. A clean isolated database was migrated and seeded with the synthetic current
   records above.
2. `backup:create` completed successfully.
3. The backup manifest and PostgreSQL/storage SHA-256 checksums were verified.
4. The backup was restored into a different temporary database and empty
   temporary storage root.
5. All 39 tables, including `typeorm_migrations`, had matching row counts after
   restore. The three physical `StoredFile` objects had matching SHA-256 hashes.
6. Domain-integrity checks passed for the registration/evidence/PDF, service
   request, ticket attachment, and staff-role links.
7. The restored Nest application booted with messenger polling disabled.
   `/health/live` returned `ok` and `/health/ready` reported database available
   with migrations current.
8. The temporary drill databases, storage roots, and backup root were removed
   after the successful check.

**Verdict:** passed. The drill validates the clean current baseline and its
coordinated backup/restore tooling; it did not access a production resource.
