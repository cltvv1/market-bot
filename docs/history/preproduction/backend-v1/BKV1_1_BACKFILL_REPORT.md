# BKV1-1 backfill report

## Verdict

The 2026-08-19 migration drill passed. Full evidence and safety controls are in [BKV1_1_MIGRATION_DRILL.md](./BKV1_1_MIGRATION_DRILL.md).

## Real legacy data

The selected local pre-migration development copy contained 13 requests, 61 events and 12 StoredFile records. It covered MAX/web, four service types, answers, invoice/payment relations, cancelled rows and ATOL-related requests.

The real legacy invariant fingerprint matched before and after migration. All 13 IDs, service/user links, statuses, priorities, answer hashes, price/file relations, comments and timestamps were preserved. The migration created 13 unique request numbers, four form definitions/versions and two generic attachment links. All 12 referenced StoredFile records resolved from the isolated storage copy and matched size/checksum metadata.

The real source did not contain Telegram, drafts, confirmed price, paid, visits, engineer assignments or completed requests. No such rows were invented.

## Synthetic fixture

An isolated pre-BKV1-1 worktree and database supplied 16 synthetic requests covering all required categories: simple/FN/ATOL, draft, confirmed price, invoice, payment, visit, engineer, completed, cancelled, events, files, Telegram, MAX, unknown source/status and malformed accepted JSON.

The synthetic legacy fingerprint also matched before and after migration. It produced 16 unique request numbers, three form definitions/versions and six expected generic attachment links. Repeating migration execution created no duplicate versions, numbers, attachments, messages or events.

## Mapping

- existing request number: deterministic `SR-` plus zero-padded legacy ID;
- source: `web`, `telegram` or `max` only when proven by the old platform; unsupported values become `legacy`;
- contact: known channels preserve platform/chat identity; unsupported platforms do not become a typed channel;
- form: FN, simple and ATOL consent receive matching immutable legacy schemas;
- customer status: derived centrally while the legacy internal status remains unchanged;
- lifecycle timestamps: derived from legacy `updatedAt` only when status proves the milestone;
- public token: no token or hash is invented for an old request.

Existing invoice, payment-proof, generated-consent and signed-consent StoredFile relations are copied into `service_request_attachments`. Original columns remain for compatibility.

## Ambiguous and unverified cases

No real unmatched service type, orphan file, missing physical file, duplicate number, unknown source/status or invalid-answer row was observed.

Synthetic unknown source/status and malformed-answer rows were preserved with safe fallback and remain visible to an operator. A future unmatched service type would retain its row and receive no form version, requiring manual review. The drill did not use production/historical databases and does not claim their counts or condition.

## Repeatable verification

```sql
SELECT count(*) FROM service_requests WHERE "requestNumber" IS NULL;
SELECT "requestNumber", count(*) FROM service_requests GROUP BY 1 HAVING count(*) > 1;
SELECT count(*) FROM service_requests WHERE "formVersionId" IS NULL;
SELECT "source", count(*) FROM service_requests GROUP BY 1 ORDER BY 1;
SELECT "status", "customerStatus", count(*) FROM service_requests GROUP BY 1, 2 ORDER BY 1, 2;
SELECT kind, count(*) FROM service_request_attachments GROUP BY kind ORDER BY kind;
```

The automated regression fixture now constructs a pre-BKV1-1 database from the first six migrations, applies the canonical migration and checks preservation, safe fallback, ATOL mapping, attachments and repeat execution without using any local user database.
