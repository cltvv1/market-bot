# Backup Format

Commands:

```powershell
npm run backup:create
npm run backup:verify -- --backup C:\path\to\backup-set
npm run backup:restore -- --backup C:\path\to\backup-set --target-db vitma_restore --target-storage C:\temp\vitma-storage
npm run backup:drill
```

A backup set contains:

- `database.dump`: PostgreSQL custom-format dump;
- `storage.tar.gz`: physical storage snapshot;
- `manifest.json`: format/application version, timestamp, offline consistency model, migrations, tables, row counts, StoredFile count, archive checksums and every storage file checksum.

Create refuses to run while port 3000 listens and requires explicit offline confirmation. This is a coordinated offline snapshot for one application instance, not an atomic online backup.

Verify changes nothing. Restore requires a separate absent database and separate empty storage. Existing resources need an explicit `--force`; the development DB/storage are rejected as normal targets.

Successful create and restore operations append system events to the audit log only after their filesystem/database work has completed.

Retention is not automated. Before production, agree on retention days/count, encrypted external copy, encryption at rest and schedule.
