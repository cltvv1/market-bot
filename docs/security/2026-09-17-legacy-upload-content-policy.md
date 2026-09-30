# SEC-007: legacy buffered upload content policy

Date: 2026-09-17. Status: fixed in draft branch in the verified scope below;
NOT closed on main, NOT deployed. Branch: `codex/sec-007-file-content-policy`.
Baseline: `53f0933fb46d89309b616a7595e701def6100a8e`, PR #37 merged;
[baseline CI 35064353685](https://github.com/cltvv1/market-bot/actions/runs/35064353685).
SEC-004/005/006 are merged in their separately documented HTTP scope. No new migration.

## Reproduction and boundary

On baseline, unknown bytes `[0,1,2,3,4,5]` plus an allowlisted MIME/name passed
legacy `detected ?? suppliedMime` policies. Eleven regression cases failed on
baseline: nine legacy purposes and active/pending `FilesService` write paths.
They pass with independent detection. No allowlisted sender MIME can authorize
unrecognized bytes. Missing/generic MIME is absence of information, not evidence.

Every buffered write awaits validation before `FileStoragePort.write`, repository
create/save, or active/pending StoredFile creation. Rejected service attachments,
ticket media and registration evidence leave storage writes, StoredFile rows,
attachments/messages/evidence and success outbound intents unchanged. Current
state/version also remains unchanged in the targeted service/registration tests.
Existing owner/RBAC/assignment, Origin, Authorization-only public access and
locked rotate/revoke rechecks are preserved, as are lifecycle and payment semantics.

## Upload inventory

MiB = 1048576 bytes. All buffer policies now require verified canonical MIME plus
a matching extension. HTTP name is mandatory; safe basename is stored, never
used as object key. Specific contradictory MIME or extension is rejected.

Access legend:
- **W**: customer session and Origin guard before Multer; target owner/state
  upload preflight where the route has a target; locked domain recheck retained.
- **P**: Authorization bearer and upload preflight before Multer; locked current
  token/version/revocation check before storage/attachment.
- **A**: staff session, Origin and current RBAC before interceptor; domain
  assignment/state/precondition checks retained. Order routes have upload preflight.
- **B**: Telegram/MAX normalized actor and current channel context/target check;
  no HTTP multipart. Materialization is fake-only in tests.
- **G**: internal generator, serverGeneratedOnly plus content check.
- **S**: staff Support permission/preflight and separate bounded streaming parser.

| Purpose / group | Routes and internal callers; channel/access | Formats / MiB | MIME/name source and missing values | Persistence / retrieval |
| --- | --- | --- | --- | --- |
| registration-photo / legacy | Policy retained; no current direct write caller; current bot photo goes through registration-evidence | JPEG/PNG/WebP / 12 | Buffer rule, HTTP name required; B may generate missing name from bytes | Buffered validation first; contextual registration download |
| registration-evidence / legacy | `POST /api/client/registrations/:id/requirements/:kind/evidence`; RegistrationReadiness.provideFile, Registrations.submitPhoto; W/B | PDF/JPEG/PNG/WebP / 15 | Multipart MIME/name or normalized provider data; canonical MIME, B absent-name fallback from bytes | StoredFile before evidence transaction; owner/staff context-bound evidence download |
| ticket-image / legacy | `POST /api/client/tickets/media`, `/admin/api/tickets/:id/media`; Tickets.saveTicketMedia/addMediaMessage/enqueueOperatorMedia and legacy Admin media reply; W/A/B | JPEG/PNG/WebP/GIF / 12 | Multipart/provider MIME/name; absent generic MIME allowed only after detection | Before message/notification; owner/staff ticket-message file route |
| ticket-document / legacy | Same Ticket callers/routes; W/A/B | PDF/UTF-8 TXT/ZIP / 20 | Explicit text/ZIP rules; .pdf/.txt/.zip; no extension inference from sender MIME | Same Ticket linkage/download |
| ticket-audio / legacy | Same Ticket callers/routes, including voice; W/A/B | MPEG Layer III/Ogg/M4A/WebM / 30 | .mp3/.ogg/.m4a/.webm, parser-derived audio classification | Same Ticket linkage/download |
| ticket-video / legacy | Same Ticket callers/routes, including video_note; W/A/B | MP4/WebM/QuickTime / 80 | .mp4/.webm/.mov, parser-derived video classification | Same Ticket linkage/download |
| service-invoice / legacy | `POST /admin/api/service-requests/:id/invoice-file`; ServiceRequestAdminCommands.uploadInvoice; A | PDF / 15 | Staff multipart; name/MIME/content agree | Validated pending file, transactional invoice activation/link; owner/staff invoice download, never public proof |
| signed-document / legacy | ServiceRequestChannelWorkflow.attachAtolConsentSignedFile; B | PDF/JPEG/PNG/WebP / 20 | Provider name or detected technical name; downstream derived declarations cannot bypass independent validation | Before signed-attachment/domain submission; staff signed consent download |
| service-attachment / legacy | `POST /api/client/service-requests/drafts/:id/attachments`, `/api/client/service-requests/:id/messages/attachments`, `/api/public/service-requests/messages/attachments`; ServiceRequests.addWebAttachment/addCustomerMessageAttachment/addPublicMessageAttachment; W/P | PDF/JPEG/PNG/WebP/UTF-8 TXT / 20 | Multipart name required; sender MIME cross-checked | Before attachment/message; contextual owner/public attachment download (public excludes proof) |
| order-invoice / already strict | `POST /admin/api/orders/:id/invoices`; Orders invoice upload; A | PDF / 15 | Existing strict name/MIME rule retained; stronger structural detection | Pending -> transactional OrderDocument activation; assigned staff/owner download |
| order-payment-proof / already strict | `POST /api/client/orders/:id/payment-proofs`; Orders proof upload; W | PDF/JPEG/PNG/WebP / 20 | Same strict content/name contract | Pending -> OrderDocument; owner/staff download; no automatic payment |
| payment-proof / already strict | `POST /api/client/service-requests/:id/payment-proof`; ServiceRequestPaymentProof shared web/TG/MAX; W/B | PDF/JPEG/PNG/WebP / 20 | HTTP name required; missing B name generated from verified bytes; no conflicting rename | Pending -> locked canonical pointer/attachment/event/intent; owner GET proof, never public |
| atol-consent / generated | ServiceRequestChannelWorkflow generation; G | PDF / 15 | Internal generated buffer/name/MIME; serverGenerated required | Verified buffer then StoredFile; contextual channel document send |
| generated-pdf / generated | Registrations completion/generation, RegistrationClientCommands.submit; G | PDF / 15 | Internal generated buffer/name/MIME; serverGenerated required | Verified buffer then StoredFile; registration PDF staff/owner routes |
| support-resource / separate streaming | `PUT /admin/api/support/resource-versions/:versionId/file` -> Files.saveSupportStream -> validateSupportFile; S | Existing PDF/ZIP/EXE/MSI/7z/RAR/CAB/gzip allowlist / 512 | Existing manifest/name/MIME and prefix rules unchanged | Bounded prefix and streaming write; pending/activation/lifecycle; contextual Support download |

Buffer methods explicitly reject support-resource; it is never routed through
full-buffer detection. No public standalone generic file upload was introduced.
Download authorization and existing attachment/private-cache/nosniff headers are
unchanged. TXT is downloaded as text/plain, not rendered as HTML or executed.

## Format rules and compatibility

- PDF: header/version, object presence, terminal startxref/EOF and in-bounds
  classic xref or xref-stream target. Not a PDF interpreter or active-content sanitizer.
- JPEG: image-size SOF dimensions, scan marker/data and terminal EOI. PNG:
  dimensions/IHDR, bounded chunks/CRC, IDAT, complete IEND. WebP: dimensions,
  RIFF length, bounded chunks and image payload. GIF: dimensions, image descriptor
  and terminal trailer. These are minimal structural checks, not complete decoding.
- TXT: fatal UTF-8 decoding, optional BOM, Russian text/newlines/tabs supported;
  rejects empty/BOM-only, NUL, other C0 controls, DEL/C1 and invalid byte sequences.
  No keyword blacklist; CP1251 is not inferred. Current callers do not require it.
- ZIP: yauzl central/local directory offsets and compressed ranges, maximum
  10000 entries, safe names; no decompression or extraction. Encrypted payloads
  are not inspected; container recognition does not attest inner file safety,
  CRC/decompressed content, compression ratio or malware absence.
- Audio/video: pinned music-metadata reads stream/track metadata independent of
  declarations. MP3 with/without ID3, Ogg Opus/Vorbis/Speex, M4A, WebM and modern
  ftyp MP4/QuickTime are classified by actual tracks. MP4 top-level lengths and
  moov/mdat are checked. Ambiguous, unsupported, malformed/header-only inputs fail
  closed. Legacy MOV without ftyp is not inferred by extension. Metadata checks
  are not complete stream decoding. Legal zero ID3v2.4 padding warnings are
  specifically tolerated; parse errors/truncation warnings otherwise reject.
- Media metadata runs in a terminated worker with a 5-second timeout, 96 MiB JS
  heap and 2 MiB stack cap. Buffers still obey existing 30/80 MiB upload limits;
  worker copies are bounded by those limits. Token read/peek byte ranges are
  checked before tokenizer allocation. The pinned EBML iterator's binary reader
  receives the same guard inside that disposable worker (not process-wide),
  because it allocates before consulting the tokenizer. Invalid ID3, nested MP4
  and EBML lengths cannot request out-of-file native buffers. JS heap limits alone
  would not cover these allocations. No uploaded executable is launched.
- MIME aliases are explicit: image/jpg, image/pjpeg; audio/mp3, audio/x-m4a;
  application/ogg; application/x-zip-compressed. Parameters are permitted only
  for text/plain with UTF-8 charset. Missing/blank and application/octet-stream
  are transport absence; other contradictory specific declarations reject.
- TG/MAX adapters generate missing names from recognized content only and
  validate declared MIME before downstream registration/signed-file helpers.
  A supplied wrong extension is retained and rejected, never silently repaired.
  Provider URLs/tokens are not added to metadata/logs. MAX response MIME is also
  checked; generic binary transport remains supported.

Previously accepted fake prefixes/unknown binaries or incorrectly named files
now fail. Allowed business formats and per-purpose sizes are not expanded or
silently removed. Client accept contracts already match these formats; no
production UI changes were necessary. Existing fake positive test bytes were
replaced by complete synthetic fixtures, keeping business/security assertions.

## Dependencies

Added pinned `image-size@2.0.4`, `music-metadata@11.15.0`, `strtok3@10.3.5`, `yauzl@3.4.0`,
and development `@types/yauzl@3.4.0`, because the existing detector could not
independently validate container tracks/ZIP boundaries/image dimensions.
The direct tokenizer dependency supports pre-allocation byte-range checks.
The EBML guard deliberately uses pinned parser internals; any future parser
upgrade must review that integration and retain corrupted-length regressions.
Transitive lock changes are limited to this installation; no audit-fix or
unrelated upgrade. Libraries: [image-size](https://github.com/image-size/image-size),
[music-metadata](https://github.com/Borewit/music-metadata), [yauzl](https://github.com/thejoshwolfe/yauzl).
Fixtures are generated synthetic data; no runtime converter dependency.

## Verification

Local results (exact final-head hosted evidence is recorded in the PR/handoff):

| Gate | Result |
| --- | --- |
| Baseline red reproduction | 11 failures before the fix; all green after |
| Unit / suites | 503 / 48 |
| PostgreSQL integration / suites | 592 / 29 |
| E2E / suites | 7 / 2 |
| Frontend contracts | 106 |
| Browser checks | 188: service admin 28, service client 38, registration admin 27, client registration/operator 24, Orders 17, Catalog 26, Store 28 |
| Application and test DB | 12 migrations, 0 pending, 0 drift each |
| Config / lint ratchet | Passed; unchanged 684 errors / 6 warnings / 63 files |
| Production builds / offline bootstrap | Passed |
| Client lint / admin TypeScript | Passed |

The first local Catalog browser run timed out waiting for its existing category
button; a complete repeat passed without Catalog changes. Existing Support and
same-origin integration positives initially used invalid fake PDF data; replacing
only those fixtures restored the full integration pass without relaxing assertions.
Final metadata range guards were additionally checked by the 40-case content
matrix, full unit suite and builds. Hosted CI must pass on the published final HEAD,
including the complete database/browser rerun; no previous-SHA result substitutes.

Required gates: ci:quality/build/database/offline-smoke, frontend contracts,
seven browser groups, client lint/admin TypeScript, application/test migration
and schema checks. Added regressions cover purpose/content matrices, aliases,
unknown/mismatched bytes, text, ZIP, media, missing names, size bounds, write
spies, HTTP/domain effects and channel adapters. Browser registration upload
rejects false PDF without losing input, then accepts a real PDF and downloads it.
No test uses real provider APIs; worker and download inputs are synthetic.

## Remaining limitations

This is not antivirus, full decoding, an archive extraction service, a delivery
redesign, new egress policy, old-file cleanup or production reassessment. Existing
files are not scanned, deleted or reclassified. Last-superadmin concurrency,
closed-ticket rules, audit atomicity, request-ID policy, provider egress,
dependency/CSP review and OPS-1A remain separate. Original checkout, its lock,
Git state and user processes remain untouched. Only isolated databases, temporary
storage and fake adapters are used. PR remains draft; no merge or deployment.
