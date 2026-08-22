# Historical Backup Restore Drill

This record describes the pre-rebaseline development drill from 2026-07-28. It
is retained for historical traceability only and is superseded by the current
baseline drill at
[`docs/backup/BACKUP_RESTORE_DRILL.md`](../../../backup/BACKUP_RESTORE_DRILL.md).

# Backup Restore Drill

Date: 2026-07-28.

- Source: `vitma_dev`, application stopped.
- Backup create: passed.
- Manifest and all DB/storage SHA-256 verification: passed.
- Restore target: temporary `vitma_restore_drill_1785205851609`.
- Storage target: separate directory under the Windows temp directory.
- Row counts, migration history, StoredFile/AuditEvent table presence and physical file count: passed.
- Temporary drill database and storage were removed after success.
- `vitma_dev` and current `storage/` were not overwritten.
- Offline restored application boot: passed on port 3010 with messenger polling disabled.
- `/health/live`: `ok`; `/health/ready`: database available, migrations current.
- Sample counts observed: registrations 2, service requests 9, StoredFile 8, admin users 1.

The script does not start real Telegram/MAX adapters. A separate offline application health boot is part of final regression.
