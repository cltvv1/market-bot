# SEC-R1 HTTP resource protection

## 1. Baseline

SEC-R1 branches directly from `origin/main` commit
`4bc2542a7eb13ffc4caf699826955df93ee9ef1e`, the merge commit for PR #15.
The historical adversarial review remains unchanged. Work was performed in the clean
`C:\CODING\learn-bot-security` worktree; the user's modified
`C:\CODING\learn-bot\package-lock.json` was not read into, copied to, staged, or
changed by this package.

## 2. Scope

This package addresses only SEC-001 (pre-authentication rate-limit bypass and
synchronous PBKDF2 denial of service) and SEC-003 (unbounded multipart buffering and
the reachable vulnerable Multer version). It adds no migration and changes no CH-R1,
CH-R2, service-request, registration, organization, StoredFile, RBAC, or messenger
semantics outside the necessary upload pre-authorization checks.

## 3. SEC-001 original exploit

The old limiter keyed each bucket by `request.ip` plus a hash of the complete raw
Cookie header. An anonymous caller could rotate a meaningless cookie and receive a new
bucket on every request. Unknown logins intentionally performed constant PBKDF2 work,
but did so through `pbkdf2Sync` with 310,000 iterations on the Node.js event loop.
Together these behaviors bypassed the 10/minute login limit and enabled CPU-driven
application-wide denial of service.

## 4. New rate-limit identity model

Anonymous and pre-authentication buckets now use only Express-resolved `request.ip`,
falling back to the socket remote address. Raw Cookie, request IDs, and raw forwarded
headers do not participate in the key. All existing route bucket names, limits,
windows, headers, and generic 429 response semantics remain in place.

## 5. Proxy trust model

`TRUST_PROXY` is now a Joi-validated integer from 0 through 3 and defaults to 0. The
bootstrap always applies that value to Express. Direct deployments therefore ignore
forwarded addresses. A deployment behind a known reverse proxy must explicitly set
the number of trusted hops, normally `1` for one VPS proxy. Arbitrary strings,
`true`, `all`, and unbounded proxy chains are rejected at startup. No raw
`X-Forwarded-For` parsing was added.

## 6. Rate-limit storage lifecycle/bounds

The limiter remains intentionally process-local for the current single-instance
modular monolith. Expired entries are pruned every 100 accepted requests and again
before a capacity rejection. `RATE_LIMIT_MAX_ENTRIES` is Joi-bounded from 100 through
100,000 and defaults to 10,000. If all entries are live at capacity, allocation of a
new bucket fails closed with 429 instead of evicting an active bucket. The Map cannot
grow past the configured cap. This is not a distributed/global rate limiter.

## 7. Password KDF change

Password creation and verification use promisified `node:crypto.pbkdf2` instead of
`pbkdf2Sync`. The format remains
`pbkdf2$310000$<base64url salt>$<base64url 32-byte hash>`, with SHA-256, random
16-byte salts for new hashes, and `timingSafeEqual`. Login, staff creation, password
reset, and the admin-create script now await the helper. Existing hashes require no
migration.

## 8. Constant-work authentication semantics

An unknown login still derives a 310,000-iteration key against a fixed non-credential
dummy hash and returns the same invalid-credentials result as a wrong password for an
existing user. The dummy value does not encode a real or default password. Malformed
stored hashes still fail closed. `pbkdf2Sync` is absent from `src` and the login path;
the only repository occurrence is the isolated offline-smoke fixture, which generates
test data outside an HTTP process.

## 9. SEC-001 regression evidence

- Ten unknown-user login attempts from one source are allowed and the eleventh is
  rate-limited even when every request rotates an arbitrary Cookie.
- Guard tests prove a fixed source receives one bucket and raw forwarded-header
  rotation cannot change it.
- Bootstrap tests prove forwarded addresses are ignored at `TRUST_PROXY=0` and used
  only at explicit one-hop configuration.
- Configuration tests reject non-numeric and more-than-three-hop proxy policies.
- Password tests cover valid, invalid, unknown-user, legacy-format, and event-loop
  responsiveness without millisecond timing assertions.
- A capacity test proves the in-memory Map fails closed at its configured bound.

## 10. Multer dependency resolution before/after

Before SEC-R1, `@nestjs/platform-express@11.1.8` resolved reachable
`multer@2.0.2`. A narrow npm override now pins only Multer to stable `2.2.0`; NestJS
and other dependency groups were not upgraded. `npm ls multer` resolves exactly one
runtime instance: `@nestjs/platform-express -> multer@2.2.0 overridden`.

## 11. Multipart route inventory

| Surface                  | Route                                                            | Purpose(s)                        | Pre-parser check                                                    |
| ------------------------ | ---------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------- |
| Customer registration    | `POST /api/client/registrations/:id/requirements/:kind/evidence` | `registration-evidence`           | web session, registration owner                                     |
| Customer ticket          | `POST /api/client/tickets/media`                                 | ticket image/document/audio/video | web session; active ticket is selected after parsed optional fields |
| Admin invoice            | `POST /admin/api/service-requests/:id/invoice-file`              | `service-invoice`                 | admin session, same origin, `serviceRequests.invoice`               |
| Admin ticket             | `POST /admin/api/tickets/:id/media`                              | ticket image/document/audio/video | admin session, same origin, `tickets.reply`                         |
| Public request           | `POST /api/public/service-requests/:token/messages/attachments`  | `service-attachment`              | token syntax, hash lookup, request status                           |
| Customer draft           | `POST /api/client/service-requests/drafts/:id/attachments`       | `service-attachment`              | web session, owner, draft status                                    |
| Customer request message | `POST /api/client/service-requests/:id/messages/attachments`     | `service-attachment`              | web session, owner, message-accepting status                        |

Repository-wide searches found no reachable `FilesInterceptor`, `AnyFilesInterceptor`,
or `MulterModule` configuration in addition to these seven `FileInterceptor` routes.

## 12. Purpose to transport limit mapping

| Purpose or route family                        | Transport `fileSize` |
| ---------------------------------------------- | -------------------: |
| `registration-evidence`                        |               15 MiB |
| `service-invoice`                              |               15 MiB |
| `service-attachment`                           |               20 MiB |
| HTTP ticket media (image/document/audio/video) |               12 MiB |

The helper reads `FILE_POLICIES`; no second size table was introduced. A route that
accepts several eventual ticket purposes uses the strictest applicable policy
(12 MiB), because Multer must choose a cap before MIME/content validation. Messenger
provider ingestion is unchanged. `FilesService` continues to enforce purpose, size,
content signature, MIME, and safe object-key rules as the second layer.

## 13. Authorization-before-parser analysis

Nest guards execute before interceptors. Public request token and current status are
now checked by `PublicServiceRequestUploadGuard`; rejected streams are placed in
discard mode and never enter Multer or `FilesService`. Customer service-request URL
targets are checked for owner/status by method guards after the existing web-session
guard. Registration evidence checks session and owner before checklist initialization
or parsing. Admin class guards already check active session, same origin, and route
permission before the interceptor. Customer ticket target selection depends on the
active session and optional parsed fields, so only authentication can safely precede
the parser there. Authoritative service checks remain and are repeated after parsing.

## 14. Multipart structural limits

Every route accepts exactly one file. No-field routes use `fields=0`; admin ticket
media permits one text field; customer ticket media permits `text`, `name`, and
`organizationId` (three fields). `fieldSize=64 KiB`, `fieldNameSize=64`,
`fieldNestingDepth=0`, and `headerPairs=50`. `parts` is set to the allowed file and
field count plus one Busboy sentinel slot: 2 for file-only, 3 for admin ticket, and 5
for customer ticket. Busboy raises the limit event when its counter reaches the value,
so the sentinel permits exactly the declared contract while the next part is rejected.

## 15. Oversized/malformed request behavior

Files above the route policy stop in Multer and return controlled 413 with no
StoredFile or domain attachment. Additional files, fields, parts, and bracket nesting
return controlled 400. Multer 2.2's new nesting error is normalized by the global API
filter without a stack, path, token, or credentials. Truncated multipart returns 400;
the process remains healthy. Invalid public tokens return 404 before parsing. A
production reverse proxy should additionally enforce a general request/multipart body
cap; that second layer does not replace these application limits.

## 16. SEC-003 regression evidence

The focused integration suite covers: invalid bearer plus a streaming body larger than
policy (404 before the generator emits the allowed limit), valid bearer above policy
(413), a valid PDF 1 KiB below the 20 MiB boundary, two files, extra fields/parts,
deep bracket nesting, malformed/incomplete multipart followed by health check, foreign
customer ownership, and a sales-manager attempt at an invoice upload. Every denied
case asserts that StoredFile and service-request attachment counts do not change.
Unit tests bind helper output directly to `FILE_POLICIES` and its strictest dynamic
route policy.

## 17. npm audit Multer status

Baseline `npm audit --omit=dev` reported 23 runtime advisories (2 Low, 8 Moderate,
13 High), including the reachable Multer findings. After the override it reports 22
(2 Low, 8 Moderate, 12 High) and no `multer` vulnerability entry. SEC-R1 does not
claim that the unrelated dependency backlog is resolved.

## 18. Known remaining limitations

- Rate limits are process-local and reset on restart; multi-instance/global limiting
  would require separate architecture and is not claimed.
- The bounded Map fails closed for new sources while full of live buckets.
- HTTP ticket uploads use the strictest 12 MiB shared cap; splitting media endpoints or
  adding a bounded streaming discriminator is deferred.
- Memory-backed multipart remains, but authorization, policy-derived byte caps, and
  structural caps now bound it.
- A reverse-proxy body cap remains a deployment requirement.
- The 22 unrelated runtime advisories remain subject to SEC-014 reachability work.

## 19. Explicit out-of-scope findings

SEC-002 and SEC-004 through SEC-016 were not remediated. In particular this package
does not change notification RBAC, customer CSRF, bearer entropy/URL lifecycle,
general MIME policy, registration owner-before-initialize behavior outside upload
pre-authorization, audit atomicity, closed ticket messaging, last-superadmin races,
request IDs, MAX SSRF controls, general dependencies, CSP, or deployment CI. SEC-R2,
CH-R3, Catalog + Orders, Redis, queues, WAF, and reverse-proxy infrastructure were not
started.

## 20. Acceptance verdict

SEC-001 and SEC-003 pass the complete local acceptance set: stable pre-auth identity,
explicit proxy trust, bounded/pruned storage, asynchronous constant-work PBKDF2,
Multer 2.2.0, complete route-level policy-derived limits, pre-parser authorization
where path data permits it, controlled multipart failures, no denied-upload mutation,
and focused regression coverage. Results are 25/109 unit suites/tests, 10/88
integration suites/tests, and 2/7 e2e suites/tests. Production builds, offline smoke,
all three migration checks, zero schema drift, config isolation, and the unchanged lint
ratchet pass. Hosted CI for the immutable final PR HEAD is the remaining external
acceptance gate and is recorded in the PR checks rather than this source snapshot.
