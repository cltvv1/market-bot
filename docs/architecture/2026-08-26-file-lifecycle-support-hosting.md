# File lifecycle and hosted Support delivery

## 1. Baseline and boundary

FS-1 / CH-R3 starts from `main` commit
`ef5b6ff77b8a7d93ab1037381cb4300dfa702fb0` after KB-1. It adds lifecycle
maintenance for the existing local `FileStoragePort` and hosted binary delivery
for `SupportResourceVersion`. It does not add frontend work, Orders, Cart, 1C,
S3, a CDN, Range requests, or antivirus infrastructure.

## 2. Existing storage properties retained

`LocalFileStorageProvider` remains the production adapter. The existing
streamed write, byte meter, SHA-256 calculation, temporary file, normal-failure
cleanup, atomic rename, streamed read, and root confinement are retained. The
new inventory operation returns only relative object keys, size, modification
time, and object/temporary kind. It visits regular files, sorts entries for a
deterministic report, and does not follow symbolic links.

## 3. File ownership inventory

Repository-wide inventory found no intentionally permanent active `StoredFile`
without a database FK owner. A short unreferenced window exists between a
successful storage write and the domain transaction; seven days is therefore a
conservative first-transition grace. Provider IDs in messenger DTOs and legacy
columns such as old `fileId` values are not `StoredFile` identities.

| Producer | Purpose | Owner FK | Attachment and logical deletion |
|---|---|---|---|
| Registration PDF generator | `generated-pdf` | `registration_requests.pdfFileId` | Attached after generation; failed attachment is logically deleted. |
| Registration customer evidence/photo | `registration-evidence` / `registration-photo` policy at ingress | `registration_evidence.storedFileId` | Attached after requirement checks; failed attachment is logically deleted. |
| Ticket customer/staff media | `ticket-image`, `ticket-document`, `ticket-audio`, `ticket-video` | `ticket_messages.storedFileId` | Attached in the ticket transaction; failed/no-op message is logically deleted. |
| Service invoice | `service-invoice` | `service_requests.invoiceStoredFileId` and attachment/message relations | Attached by the invoice workflow; failed attachment is logically deleted. |
| Customer payment proof | `payment-proof` | `service_requests.paymentProofFileId` and attachment/message relations | Attached by the service workflow; replaced/failed files are logically deleted. |
| Generated ATOL consent | `atol-consent` | `service_requests.generatedConsentFileId` and attachment/message relations | Attached after generation; cancellation/replacement can logically delete it. |
| Signed ATOL consent | `signed-document` | `service_requests.signedConsentFileId` and attachment/message relations | Attached after customer upload; failed attachment is logically deleted. |
| General service upload | `service-attachment` | `service_request_attachments.storedFileId` or `service_request_messages.storedFileId` | Attached after domain authorization; removal/failure logically deletes it. |
| Outbound document/image delivery | Existing source purpose | `outbound_deliveries.storedFileId` | Secondary durable delivery reference; it blocks physical purge while retained. |
| Hosted Support upload | `support-resource` | `support_resource_versions.storedFileId` | Created pending, then attached and activated transactionally; loser becomes rejected. |

Every current modeled `StoredFile` owner is protected by a PostgreSQL FK. The
catalog inspector discovers those FKs dynamically, including tickets,
registrations, service request fields/messages/attachments, outbound delivery,
and Support versions. A future domain that stores a file ID without an FK must
be treated as a lifecycle blocker until it adds a FK or trusted adapter.

## 4. Why Support upload bypasses Multer

Existing SEC-R1 multipart routes are bounded, small, memory-backed uploads and
remain unchanged. A Support binary may be 512 MiB, so its dedicated route does
not use `FileInterceptor`, Multer, multipart, `req.file.buffer`, or a whole-file
`Buffer`. The global JSON and URL-encoded parsers explicitly bypass only this
raw PUT path, leaving the request stream for the authenticated controller.

## 5. Raw upload contract and limits

```text
PUT /admin/api/support/resource-versions/:versionId/file
Cookie: existing admin session
Origin: configured same origin
Content-Type: detected canonical MIME, a known alias, or application/octet-stream
X-Vitma-Filename: URL-encoded UTF-8 basename
Content-Length: optional
Body: raw binary stream
```

The route requires an active admin session, same-origin mutation, and
`support.manage`. The stable-source rate-limit bucket permits 20 attempts per
600 seconds. Version existence, hosted mode, unpublished state, absence of an
existing attachment, and resource existence are checked before the stream is
read or storage is called.

`SUPPORT_FILE_MAX_BYTES` defaults to `536870912` (512 MiB) and validation caps
configuration at `1073741824` (1 GiB). An oversized declared `Content-Length`
returns 413 before body consumption. The storage byte meter remains
authoritative for missing or false lengths and removes its temporary file on a
normal over-limit or interrupted-stream failure. A reverse proxy must allow at
least the configured body limit plus transport overhead; Nest still enforces
the application limit.

The validator retains at most a 128 KiB prefix, replays that prefix, and streams
the remainder into `FileStoragePort.write`. It never concatenates the complete
file and does not recompute SHA-256 after the write.

## 6. Signature, extension, and MIME matrix

| Kind | Signature | Extensions | Canonical MIME |
|---|---|---|---|
| PDF | `%PDF-` | `.pdf` | `application/pdf` |
| ZIP | ZIP local/empty/spanned header | `.zip` | `application/zip` |
| Windows PE | `MZ`, bounded PE offset, `PE\0\0` | `.exe` | `application/vnd.microsoft.portable-executable` |
| MSI/CFBF | CFBF header | `.msi` | `application/x-msi` |
| 7z | 7z signature | `.7z` | `application/x-7z-compressed` |
| RAR | RAR4 or RAR5 signature | `.rar` | `application/vnd.rar` |
| CAB | `MSCF` | `.cab` | `application/vnd.ms-cab-compressed` |
| gzip/tgz | gzip signature | `.gz`, `.tgz`, `.tar.gz` | `application/gzip` |

Unknown bytes are rejected even if the caller declares an allowed MIME or
`application/octet-stream`. Detected content, explicit extension aliases, and
any declared MIME must agree. The filename is one URL decode of a bounded UTF-8
basename with no NUL, control character, slash, backslash, or traversal token.
It is display metadata only; the object key is a server UUID.

## 7. Resource type compatibility

| Resource type | Hosted kinds |
|---|---|
| `manual`, `quick_start`, `datasheet`, `certificate` | PDF only |
| `driver`, `utility`, `software`, `sdk` | ZIP, PE, MSI, 7z, RAR, CAB, gzip |
| `firmware` | ZIP, 7z, RAR, CAB, gzip |
| `other` | PDF and the supported package kinds |

Raw `.bin`, DMG, PKG, HTML, JavaScript, and SVG remain external-only or
unsupported. Correct format detection is not a malware verdict.

## 8. Pending to active attachment

The physical write completes first and creates a `StoredFile` row with status
`pending`. Metadata contains `purpose=support-resource`, resource ID, version
ID, resource type, and detected kind; `createdByStaffId` records provenance.

The short final transaction locks the version and pending file, reloads the
resource, rechecks hosted/unpublished/no-file state, staff provenance, metadata
binding, type compatibility, and physical existence, then assigns
`version.storedFileId` and changes the file to `active`. The same transaction
writes `support.version.file.attach` with resource/version/file IDs, SHA-256,
size, and kind. It stores no body, path, request headers, or filename.

Concurrent uploads do not hold a database lock during network transfer. Both
may write pending objects; exactly one transaction attaches. A loser receives
409 and is changed to `rejected` with a delayed `purgeAfter`. Existing attached
or published binaries are immutable through this API. A new binary requires a
new resource version; there is no silent replacement or generic file-ID setter.

## 9. Publication and public usability

An external version can publish only with a credential-free safe HTTPS URL. A
hosted version can publish only when its FK points to an active, physically
present file whose trusted metadata binds the same resource and version.

Publication intent and usability are separate. A hosted published version is
public-usable only while its file remains `active`; `missing`, `corrupt`,
`deleted`, `rejected`, or purged files are excluded. Public resource lists,
resource details, product Support pages, and Knowledge resource links all use
the usable-version rule. Detail projection additionally checks physical
presence. A resource with no usable published versions disappears publicly
without rewriting its publication intent.

## 10. Public download contract

```text
GET /api/support/resources/:resourceSlug/versions/:versionId/download
```

The domain context must match a published resource, a version owned by that
resource, a published hosted version, trusted active file metadata, and a
present physical object. Failure is a safe 404. There is deliberately no public
`/files/:id` endpoint, direct filesystem URL, or provider key.

Successful responses stream bytes and set exact `Content-Type` and
`Content-Length`, `Content-Disposition: attachment` with safe ASCII fallback
and RFC 5987 UTF-8 filename, `X-Content-Type-Options: nosniff`, a strong
SHA-256-derived `ETag`, and `Cache-Control: public, max-age=300,
must-revalidate`. The route uses the existing public rate limiter. It does not
implement Range/206 or inline PDF display. Unpublishing the version or resource
makes the same URL fail closed.

Public hosted metadata is limited to filename, canonical MIME, exact size,
SHA-256, and context-bound download URL. Admin metadata also exposes file ID,
status, and verification timestamps. Neither projection exposes object key,
provider, creator, metadata JSON, or filesystem path.

## 11. Lifecycle state and migration

Migration `1788009600000-HardenFileLifecycle` adds nullable `deletedAt`,
`missingAt`, `lastVerifiedAt`, `corruptAt`, `purgeAfter`, and `purgedAt`, adds
`corrupt` to the existing statuses, and creates index
`(status, purgeAfter)`. Existing object keys, hashes, active state, and physical
bytes are unchanged. Existing deleted/rejected rows receive a new 24-hour
safety window; existing missing rows receive a timestamp.

`logicalDelete` is idempotent: the first call records `deletedAt` and
`purgeAfter`; later calls do not move the retention deadline. It never removes
bytes inline with a domain transaction.

An active row without a physical object becomes `missing` with `missingAt` and
is not automatically reactivated. Explicit checksum mode compares physical
bytes with the expected stored SHA-256. A mismatch becomes `corrupt` with
`corruptAt`; a successful check sets `lastVerifiedAt`. Public GET does not hash
large files.

The storage inventory is an advisory point-in-time snapshot. A snapshot miss is
live-revalidated with `storage.exists` before it is reported. Apply mode then
locks the `StoredFile` row and repeats the physical absence check before the
`active -> missing` transition. This prevents a writer that stores bytes and
inserts its active row concurrently with reconciliation from being marked
missing by an older inventory snapshot.

## 12. Reconciliation classes and ordering

`FileLifecycleService` is the single dry-run/apply implementation used by CLI
and tests. It distinguishes:

- stale temporary files;
- physical objects with no DB row;
- stale pending unreferenced rows;
- old active unreferenced rows;
- terminal purge candidates;
- active rows with missing physical objects;
- checksum-corrupt active rows in explicit verification mode.

For tracked purge it locks and reloads the row, rechecks terminal state and
grace, dynamically rechecks all FK references, removes storage, then records
`purgedAt`. A reference blocks deletion even when status is terminal. Removal
failure is reported and never claims `purgedAt`; absence is an idempotent
successful remove. Active orphans use two phases: first logical delete and a
new purge window, then another run rechecks references before physical purge.

## 13. Generic FK reference inspector

`StoredFileReferenceInspector` reads only trusted PostgreSQL catalog
identifiers for foreign keys targeting `stored_files(id)`, quotes every
identifier, and checks references by parameterized file ID. No HTTP input can
select a table or column. New FK-backed owners automatically participate. The
current inventory has no modeled file owner without an FK.

Outbound delivery is intentionally a blocking reference. A separate outbound
retention policy must remove obsolete delivery rows before their source file
can be purged; FS-1 never overrides a live FK to reclaim bytes.

## 14. Grace values

| Setting | Default | Transition |
|---|---:|---|
| `FILE_LIFECYCLE_TEMP_GRACE_MS` | 1 hour | stale temporary removal |
| `FILE_LIFECYCLE_PENDING_GRACE_MS` | 1 hour | pending to rejected |
| `FILE_LIFECYCLE_ACTIVE_ORPHAN_GRACE_MS` | 7 days | active orphan to deleted |
| `FILE_LIFECYCLE_PURGE_GRACE_MS` | 24 hours | terminal physical purge |
| `FILE_LIFECYCLE_PHYSICAL_ORPHAN_GRACE_MS` | 24 hours | untracked object removal |

The standalone CLI receives environment values as strings, while the normal
Nest runtime receives values normalized by config validation. Lifecycle
durations are therefore normalized and validated again at the point of use so
both paths have identical positive-integer millisecond semantics. An explicitly
invalid value fails closed before reconciliation can mutate storage or rows.

Dry-run reports `staleTemps`, `physicalOrphans`, `pendingStale`,
`activeUnreferenced`, `missing`, `corrupt`, `purgeCandidates`, `purged`,
`blockedByReference`, and `errors` without changing DB or storage. Apply holds a
PostgreSQL advisory lock so only one destructive run is active.

## 15. Operational model

```text
npm run files:reconcile
npm run files:reconcile -- --verify-checksums
npm run files:reconcile -- --apply
npm run files:reconcile -- --apply --verify-checksums
```

Dry-run is the default and findings are not command failures. Unrecoverable
execution/storage errors return a non-zero exit. There is no in-process worker
and no destructive startup hook in FS-1. Production operations should schedule
the CLI externally, normally daily, review dry-run first, and enable full
checksum verification separately because it reads every selected byte.

## 16. Residual crash and race analysis

- Crash after rename but before the DB row leaves a physical orphan; the
  24-hour rule detects and removes it.
- Crash after a pending row but before attachment leaves stale pending; it
  becomes rejected after one hour and is purged after the next grace.
- Crash after a legacy active save but before owner attachment leaves an active
  orphan; seven days plus a second 24-hour window protect it.
- A new FK appearing between initial inventory and active-orphan transition is
  rechecked under row lock before destructive purge.
- A storage inventory failure aborts reconciliation mutations instead of
  treating every DB row as missing.
- A process crash after physical removal but before `purgedAt` is harmless:
  force-remove is idempotent and the next run can finalize metadata.

Local disk durability, backup/restore, capacity alerts, reverse-proxy bandwidth
controls, and process-level interruption after response headers remain
deployment concerns. The adapter does not claim distributed object-store
semantics.

## 17. Malware limitation and exclusions

FS-1 provides staff-only upload, known signature detection, extension/MIME
agreement, provenance, SHA-256 identity, attachment-only download, and
`nosniff`. A valid PE, MSI, or archive can still contain malware. Antivirus,
sandbox execution, code signing policy, S3, CDN, arbitrary firmware, browser
preview, Range, product images, frontend pages, SSR/SEO delivery, Orders, Cart,
checkout, 1C, email, and license warehouses remain explicitly outside FS-1.

## 18. Acceptance verdict

The implementation closes the CH-R3 lifecycle gap and KB-1 hosted-delivery
boundary: raw uploads stay streamed and capped, content is recognized from
bytes, trusted attachment has one winner, hosted publication fails closed,
downloads are domain-context authorized, and maintenance is conservative,
generic, two-phase, repeatable, and dry-run by default.
