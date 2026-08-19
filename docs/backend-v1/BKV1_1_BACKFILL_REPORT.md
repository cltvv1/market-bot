# BKV1-1 backfill report

## Scope

The migration was exercised from a clean PostgreSQL test database. Production and historical databases were not connected, so the production legacy-row count is intentionally not recorded here.

Before deployment, record the read-only count with:

```sql
SELECT count(*) AS legacy_requests FROM service_requests;
```

## Mapping

- request number: `SR-` plus the legacy numeric ID for existing rows;
- source: `web`, `telegram` or `max` from `platform`; unknown values become `legacy`;
- form version: the published legacy version for the row's `serviceTypeId`;
- customer status: mapped centrally from the internal status;
- contact snapshot: existing user name plus platform/chat identity when available;
- submitted/completed/closed/cancelled timestamps: derived from legacy `updatedAt` where the status proves the lifecycle point.

## Preserved fields

All existing answer JSON, current step, type snapshots, user/organization links, chat identity, price, invoice references, payment proof, consent files, visit fields, comments, assignees, priority and original timestamps are preserved.

Existing `invoiceStoredFileId`, `paymentProofFileId`, `generatedConsentFileId` and `signedConsentFileId` values are copied to `service_request_attachments`; the original columns remain for compatibility.

## Ambiguity and unsupported values

- a legacy row without a matching service type receives a request number/source but no form version;
- a missing user yields contact name `Клиент` and preserves messenger identity;
- unknown legacy platform values map to source `legacy`;
- unknown internal statuses map to customer status `received`;
- no answer values are rewritten or discarded.

## Missing files

The migration links only existing `StoredFile` foreign keys. It does not inspect legacy filesystem paths or invent missing file records. Existing FileStorage backfill/runbooks remain authoritative for those paths.

## Repeatable verification

```sql
SELECT count(*) FROM service_requests WHERE "requestNumber" IS NULL;
SELECT "requestNumber", count(*) FROM service_requests GROUP BY 1 HAVING count(*) > 1;
SELECT count(*) FROM service_requests WHERE "formVersionId" IS NULL;
SELECT "source", count(*) FROM service_requests GROUP BY 1 ORDER BY 1;
SELECT "status", "customerStatus", count(*) FROM service_requests GROUP BY 1, 2 ORDER BY 1, 2;
SELECT kind, count(*) FROM service_request_attachments GROUP BY kind ORDER BY kind;
```

Expected invariant: no null/duplicate request numbers. Null form versions must be reviewed as unmatched service types, not silently rewritten.

Automated verification runs all seven migrations against `learn_bot_bkv11_test`, repeats migration execution, executes integration tests, and confirms `schema:log` has no pending synchronization SQL. No production or historical database was opened, so no legacy count or ambiguous-row total was invented.
