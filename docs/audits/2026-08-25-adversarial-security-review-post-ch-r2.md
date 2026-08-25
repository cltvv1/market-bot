# Adversarial security review after CH-R1 / CH-R2

Date: 2026-08-25
Baseline: `main` at `e07f475876d0f694a8a2da0d25a698e7501b51ac`
Review branch: `codex/adversarial-security-review-post-ch-r2`
Scope: audit only; no production code, migration, test, UI, configuration, or dependency changes

## 1. Executive summary

The review found no unauthenticated administrative action, remote code execution,
arbitrary local file read, broad cross-customer data access, registration readiness
bypass, or secret committed to the reviewed tree. CH-R1 and CH-R2 retain their
documented security properties: inbound commands fail closed and serialize per
dialog, while outbound delivery intents are durable, object-authorized, and do not
expose raw payloads through an API.

Three High findings require bounded remediation before new product implementation:

1. Pre-authentication rate limits can be bypassed by rotating an arbitrary Cookie
   header, while synchronous PBKDF2 work blocks the Node.js event loop.
2. Staff messenger notification subscriptions ignore RBAC and object assignment,
   allowing an active low-privilege employee to receive customer data and documents.
3. HTTP multipart uploads are buffered in memory without transport limits before
   authorization or purpose-specific validation, and the installed Multer version is
   affected by published denial-of-service advisories.

No finding requires replacing the current architecture. Each High finding can be
handled as a small, isolated security package. The verdict is **B - Limited security
remediation first**. Catalog + Orders architecture may be designed in parallel, but
feature implementation should not be merged until the three High findings are fixed
and covered by regression tests.

Finding counts:

| Severity | Count |
| --- | ---: |
| Blocker / Critical | 0 |
| High | 3 |
| Medium | 4 |
| Low | 6 |
| Informational | 3 |

## 2. Baseline

- `origin/main` was verified at
  `e07f475876d0f694a8a2da0d25a698e7501b51ac` before the review.
- PR #13, CH-R1 Durable inbound channel commands, was already merged.
- PR #14, CH-R2 Durable outbound delivery, was merged as the baseline commit.
- Baseline hosted run `32809675878` completed successfully for `Quality`,
  `Production builds`, and `PostgreSQL, tests, and offline smoke`.
- The review used a separate clean worktree and branch. The user's unrelated local
  `package-lock.json` modification in the primary worktree was not read as a change,
  staged, reset, stashed, or committed.
- Bot polling and the outbound delivery worker were disabled. Only fake messenger
  credentials, isolated databases, synthetic records, and isolated file storage were
  used. No provider or production resource was contacted.

## 3. Threat model

Actors considered:

- anonymous HTTP caller changing headers, cookies, paths, tokens, payload sizes, and
  request frequency;
- authenticated browser customer replacing organization, request, registration,
  ticket, attachment, and file identifiers;
- active employee with `operator`, `engineer`, `sales_manager`, `superadmin`, or a
  union of roles;
- deactivated or role-changed employee using an old browser session or messenger
  callback;
- Telegram/MAX customer replaying or forging callback data and numeric target IDs;
- messenger-bound employee attempting an action outside current permissions or on a
  stale target;
- untrusted file uploader controlling size, filename, declared MIME, and content;
- attacker with accidental access to a long-lived public status bearer;
- compromised or contract-violating external provider returning unexpected media
  URLs.

Out of scope were external infrastructure penetration, production credentials,
provider API calls, full database integrity analysis, CH-R3, Catalog + Orders, 1C,
and dependency upgrades.

## 4. Trust boundaries

| Boundary | Trusted input | Untrusted input | Enforcement reviewed |
| --- | --- | --- | --- |
| Browser -> public API | validated session cookie after DB lookup | headers, Origin, path IDs, DTOs, multipart | validation, ownership, rate limits, file policy |
| Browser -> admin API | active hashed server session and current DB roles | path IDs, DTOs, Origin, Cookie header | same-origin guard, RBAC, object assignment |
| Telegram/MAX -> channel handler | provider polling transport | chat text, callback payload, attachment metadata | durable identity, dialog lock, current user/staff authorization |
| Application -> PostgreSQL | entity and transaction contracts | identifiers derived from callers | parameterization, ownership predicates, row locks, constraints |
| Application -> FileStorage | generated object key and stored relation | content, filename, MIME | purpose policy, root containment, relation-scoped open |
| Application -> outbound queue | internal service call | recipient and payload assembled by workflows | no public enqueue API, source authorization on status reads |
| Integration bridge -> API | configured bridge key and provider adapter | provider rows and diagnostics | localhost/default boundary, DTO validation, secret sanitization |

## 5. Attack-surface inventory

| Surface | Representative routes/actions | Primary authorization | Result |
| --- | --- | --- | --- |
| Admin authentication | `/admin/api/login`, logout, current session | public login; hashed DB session afterward | SEC-001 and SEC-012; otherwise sound |
| Staff administration | staff create, roles, active, password, session revoke | explicit `staff.*` permissions | no direct RBAC bypass; SEC-009/011 hardening |
| Staff notifications | notification binding, settings, delivery fan-out | active admin session only | SEC-002 |
| Service requests, customer | drafts, submit, details, messages, attachments | web session plus `userId` ownership | no numeric IDOR; SEC-003/004/005/006/007 |
| Service requests, public | token status, messages, attachments | request-scoped bearer hash | no cross-object numeric IDOR; SEC-003/005/006/007 |
| Service requests, staff | list/details, transition, assign, invoice, payment, schedule | permission plus assigned-only projection for engineer | no confirmed bypass |
| Registrations, customer | checklist, requirement value/evidence | web identity and registration owner | SEC-008 side effect; no data disclosure |
| Registrations, staff | readiness, evidence, OFD mode, handoff, final PDF | registration permissions and engineer checks | no readiness/handoff bypass |
| Organizations/assets | membership request/review, assets by organization | web membership or admin permissions | no INN-based auto-membership or IDOR |
| Tickets | active ticket, messages, media, staff reply/close | owner chat identity or `tickets.*` permissions | SEC-003/007/010 |
| Stored files | relation-specific download routes | parent object authorization and visibility | no generic file-ID route or path read |
| Messenger callbacks | customer flows and staff actions | current chat/user link and current RBAC | no callback authorization bypass |
| CH-R1 inbound commands | provider update handling | platform/update identity and dialog lock | reviewed with no security finding |
| CH-R2 outbound delivery | internal enqueue, status projections | internal calls and parent object permissions | reviewed with no security finding |
| Integrations | internal import and admin sync | bridge key or `integrations.*` permissions | no caller-controlled arbitrary URL found |

Systematic ID substitution was traced through controllers and shared service methods.
Service requests use `userId` ownership; organization assets use membership;
registration and ticket reads resolve the caller identity; admin engineer views use
assigned-only permission paths; public request access resolves a hash of the bearer;
file downloads first resolve a permitted parent relation.

## 6. Authentication findings

### SEC-001 - Pre-auth rate-limit bypass combines with blocking password hashing

- **Severity:** High
- **Confidence:** confirmed
- **Affected:** `src/security/rate-limit.ts` (`RateLimitGuard.clientKey`),
  `src/admin/admin.controller.ts` (`POST /admin/api/login`),
  `src/admin/password.ts` (`verifyPasswordHash`, `pbkdf2Sync`)
- **Trust boundary:** anonymous HTTP caller -> authentication and public rate-limited
  endpoints
- **Exact behavior:** the limiter hashes the complete caller-controlled Cookie header
  into every bucket key before authentication. Rotating a meaningless cookie creates
  fresh buckets for the same source address. Every unknown login still performs
  310,000-iteration PBKDF2 synchronously on the application event loop. Entries also
  accumulate until periodic expiration pruning.
- **Attack scenario:** an unauthenticated caller rotates `Cookie: attacker=<nonce>` and
  submits concurrent login attempts. The configured 10/minute limit is bypassed while
  each request blocks the only Node.js event loop during PBKDF2. This enables online
  guessing and application-wide CPU denial of service.
- **Required capability:** network access to the public HTTP service; no account,
  session, or production data.
- **Impact:** availability loss across all NestJS endpoints and ineffective brute-force
  throttling.
- **Production data/access required:** no.
- **Reproducibility:** a synthetic guard run allowed 25/25 requests with rotating
  cookies; the same fixed cookie allowed 10 and limited 15. Six dummy password checks
  consumed approximately 255 ms synchronously on the review host.
- **Minimal remediation:** use a stable trusted pre-auth source key with an explicit
  proxy trust model; only incorporate a validated server session after authentication;
  use a bounded/shared limiter suitable for deployment topology; move password KDF
  work off the event loop or use an asynchronous KDF API. Keep constant-work handling
  for unknown users.
- **Required regression test:** rotating arbitrary cookies cannot increase the login
  allowance; fixed source limits hold across anonymous calls; concurrent invalid
  logins do not starve a health/read request; trusted proxy behavior is explicit.
- **Blocks product development?** yes.
- **Blocks production deployment?** yes.

Session controls otherwise passed review. Admin and customer tokens are generated
from 32 random bytes, only hashes are stored, logout/revocation is server-side,
expired/revoked sessions are rejected, admin role and active status are loaded for
each request, deactivation and password reset revoke sessions, and production admin
cookies are HttpOnly, Secure, SameSite=Strict with a 12-hour absolute expiry. Customer
sessions are HttpOnly, Secure in production, SameSite=Lax, host-only, random, hashed,
and have a 30-day absolute expiry. SEC-004 covers their missing mutation-origin
control.

## 7. Authorization / IDOR findings

### SEC-002 - Staff messenger notifications bypass RBAC and assignment

- **Severity:** High
- **Confidence:** confirmed
- **Affected:** `src/admin/admin-notifications.service.ts` (`getRecipients`, `notify`,
  `notifyDocument`), `src/admin/admin.controller.ts` notification binding routes,
  `src/admin/entities/admin-user.entity.ts` notification defaults,
  `src/admin/admin.permissions.ts`, registration/ticket/service notification callers
- **Trust boundary:** limited employee account -> customer and organization data sent
  to an employee-controlled Telegram/MAX chat
- **Exact behavior:** any active authenticated employee may bind a chat and enable all
  three subscription flags. Recipient selection filters only `isActive` and the flag;
  it does not require the corresponding current permission, role, or assignment.
  Notification bodies include customer request text and registration organization,
  address, contact, tax/bank fields; registration notifications can include the PDF.
- **Attack scenario:** a `sales_manager` with no application permissions, or an
  engineer limited to assigned objects, binds a messenger account and enables all
  flags. New records for all customers are then durably enqueued to that chat.
- **Required capability:** valid active employee session of any role and control of a
  Telegram or MAX chat; no access to the target object is required.
- **Impact:** cross-customer confidentiality breach and bypass of assigned-engineer
  boundaries; documents and personal/business data can leave the web RBAC perimeter.
- **Production data/access required:** a staff account and subsequent real customer
  notification are required for real-data impact; the bypass itself uses no production
  resource.
- **Reproducibility:** a repository-mock reproduction showed recipient criteria of
  only `{isActive: true, notifyRegistrations: true}` and enqueued one staff delivery
  for a permissionless active employee.
- **Minimal remediation:** map each notification kind to existing permissions; enforce
  current permission and assigned-object constraints both when settings change and at
  fan-out time; default subscriptions to the least privilege compatible with the
  role; immediately stop delivery after role removal/deactivation.
- **Required regression test:** deny sales manager; deny unassigned engineer global
  registration/service notifications; allow operator; allow assigned engineer only
  for the assigned object; allow superadmin; re-check after role removal and account
  deactivation; ensure no outbound row is created on denial.
- **Blocks product development?** yes.
- **Blocks production deployment?** yes.

### SEC-008 - Registration checklist initializes before owner authorization

- **Severity:** Low
- **Confidence:** confirmed
- **Affected:** `src/registrations/registration-readiness.service.ts`
  (`clientDetails`, `details`, `initializeIfMissing`, `recompute`),
  `GET /api/client/registrations/:id/checklist`
- **Trust boundary:** authenticated customer -> another customer's registration
- **Exact behavior:** `clientDetails` calls mutating `details(registrationId)` before
  `assertOwner`. For a legacy/incomplete target, `details` may insert requirement
  rows, write an audit event, and update readiness timestamps before the caller is
  rejected with 404.
- **Attack scenario:** a customer enumerates a valid foreign registration ID. No data
  is returned, but the caller can cause initialization and readiness churn on that
  foreign record and pollute audit history.
- **Required capability:** any valid customer web session and knowledge/guess of a
  registration ID.
- **Impact:** limited cross-customer integrity side effect and accountability noise;
  no confirmed confidentiality loss or handoff bypass.
- **Production data/access required:** a target registration missing checklist rows is
  required for visible impact.
- **Reproducibility:** confirmed by call-order and transaction tracing; not run against
  production data.
- **Minimal remediation:** load and authorize the registration before any lazy
  initialization, then initialize within the authorized flow.
- **Required regression test:** a foreign registration ID returns 404 and leaves
  requirements, readiness fields, timestamps, and audit events unchanged.
- **Blocks product development?** no.
- **Blocks production deployment?** yes, before customer data is accepted.

No horizontal read/write IDOR was confirmed for organization membership, service
request numeric IDs, ticket IDs, registration evidence, equipment assets, or stored
files. Admin service-request projections preserve the engineer assigned-only boundary;
operator and superadmin paths match the declared permission union. Messenger staff
callbacks resolve the linked employee and current permission at execution time, so an
old button does not preserve removed privileges.

## 8. Public token findings

### SEC-005 - Public request bearer strength depends on caller idempotency entropy

- **Severity:** Medium
- **Confidence:** probable
- **Affected:** `src/service-requests/service-requests.service.ts`
  (`derivePublicToken`, `submitWebDraft`), `SubmitServiceRequestDto`
- **Trust boundary:** authenticated customer submission -> long-lived public bearer
- **Exact behavior:** the bearer is deterministic SHA-256 of
  `userId:requestId:idempotencyKey` with no server secret or server randomness. The
  DTO accepts any matching 8-character value. The official UI uses
  `crypto.randomUUID()`, which makes its current tokens impractical to guess, but the
  API contract itself does not enforce this entropy.
- **Attack scenario:** a custom/older client uses a predictable key. An attacker who
  can estimate sequential user/request IDs and the weak key derives the bearer and
  accesses status, messages, customer-visible files, or posts a message.
- **Required capability:** ability to predict a victim client's idempotency key and
  estimate two numeric IDs; this is not practical against the official UUID client.
- **Impact:** request-scoped confidentiality and message/file integrity compromise.
- **Production data/access required:** a victim request created by a weak-key client.
- **Reproducibility:** identical synthetic inputs always produced the same 43-character
  bearer; changing only the weak idempotency key deterministically changed it.
- **Minimal remediation:** make the public bearer server-generated cryptographic
  randomness while preserving idempotent retry semantics, or use a server-secret HMAC
  with an explicit rotation plan. Do not use a client idempotency key as bearer entropy.
- **Required regression test:** weak/repeated client idempotency keys still produce an
  unguessable stable token for the same committed submission and distinct tokens for
  distinct requests; raw bearer is never persisted.
- **Blocks product development?** no.
- **Blocks production deployment?** yes.

### SEC-006 - Long-lived public bearer is exposed in browser and error-log locations

- **Severity:** Medium
- **Confidence:** confirmed
- **Affected:** `client-ui/src/services/client.ts`,
  `client-ui/src/pages/ServiceRequestPage.tsx`,
  `src/common/http/api-error.filter.ts`, public service-request routes
- **Trust boundary:** public bearer -> browser history/storage and application logs
- **Exact behavior:** the client stores the bearer in `localStorage` and places it in
  the status page query string. Public API routes also carry it in the path. On any
  5xx, the global filter logs `request.originalUrl`, which includes path/query bearers.
  Public status responses do not explicitly set a request-specific `Cache-Control:
  no-store` policy. Bearers have no rotation/revocation flow.
- **Attack scenario:** shared-browser history/profile access, a local malicious script,
  support screenshot, proxy/browser telemetry, or a triggered 5xx log reveals a
  bearer. It can then be replayed for the lifetime of the request.
- **Required capability:** access to the browser profile/history, relevant logs, or
  another bearer-bearing artifact; no numeric-ID bypass alone is sufficient.
- **Impact:** request-scoped customer data disclosure and ability to post customer-
  visible messages/attachments.
- **Production data/access required:** yes for real-data impact; synthetic review did
  not use a real bearer.
- **Reproducibility:** confirmed by source flow from submission response to
  `localStorage`, status URL, API path, and `originalUrl` error logging.
- **Minimal remediation:** keep bearers out of query strings and redacted from logs;
  prefer memory/session-scoped storage or a short exchange into the HttpOnly customer
  session; add `no-store` to bearer responses; add bounded revocation/rotation without
  forcing expiry if long-lived access is a business requirement.
- **Required regression test:** error logs redact path/query tokens; browser status
  navigation does not expose the token in URL/history; bearer responses are no-store;
  revocation invalidates subsequent reads and writes.
- **Blocks product development?** no.
- **Blocks production deployment?** yes.

The raw public bearer is hashed at rest and omitted from normal service-request views.
The token lookup is request-scoped and attachment access additionally checks the
request relation and customer visibility. Registration response UUIDs and V2 callback
versions were not found in generic logs, public projections, or audit metadata.

## 9. File security findings

### SEC-003 - Multipart bodies are unbounded before authorization and validation

- **Severity:** High
- **Confidence:** confirmed
- **Affected:** all `FileInterceptor('file')` routes in
  `src/service-requests/public-service-requests.controller.ts`,
  `src/service-requests/service-requests.controller.ts`,
  `src/client/client-api.controller.ts`, and `src/admin/admin.controller.ts`;
  `src/app.bootstrap.ts`; installed `multer@2.0.2`
- **Trust boundary:** anonymous/customer file upload -> application heap
- **Exact behavior:** memory-backed Multer buffers the complete multipart file before
  the controller/service can check public token, owner, purpose, MIME, or
  `FILE_POLICIES.maxBytes`. No interceptor `limits.fileSize` is configured. JSON and
  URL-encoded body limits do not cap multipart. The installed Multer version is below
  the fixed releases for multiple 2026 resource-exhaustion advisories.
- **Attack scenario:** an anonymous caller posts very large or many malformed multipart
  bodies to a public token attachment path. Even an invalid token is checked only
  after buffering, enabling heap exhaustion and process termination.
- **Required capability:** unauthenticated network access to a multipart route; no
  valid token or production data.
- **Impact:** remote denial of service and elevated memory/CPU consumption.
- **Production data/access required:** no.
- **Reproducibility:** a safe 24 MiB upload with a syntactically valid fake token was
  fully accepted by transport and returned application-level 404 in about 199 ms,
  rather than transport-level 413. Source review confirms no upper bound.
- **Minimal remediation:** upgrade Multer to a fixed release; configure route-level
  multipart limits at or below each purpose policy; reject/authorize before expensive
  processing where feasible; prefer bounded streaming or temporary storage; add a
  reverse-proxy cap as a second layer, not the only control.
- **Required regression test:** oversized, malformed, aborted, and concurrent uploads
  fail before full buffering on anonymous, customer, and admin routes; valid files at
  the boundary still pass; invalid token/owner does not retain a buffer or StoredFile.
- **Blocks product development?** yes.
- **Blocks production deployment?** yes.

### SEC-007 - Unknown file content falls back to caller-declared MIME

- **Severity:** Medium
- **Confidence:** confirmed
- **Affected:** `src/files/file-policies.ts` (`detectMime`, `assertFilePolicy`) and all
  customer/staff upload paths using `FilesService.saveBuffer`
- **Trust boundary:** untrusted uploader -> StoredFile and staff download
- **Exact behavior:** if signature detection returns `null`, an allowlisted
  caller-supplied MIME is accepted. The declared filename extension policy is not used
  in this decision. Arbitrary bytes can therefore be stored as `application/pdf` or
  `text/plain`; ZIP signature alone is accepted for ticket documents.
- **Attack scenario:** a customer uploads active/malicious content disguised with an
  allowed MIME/name. It is retained and presented to staff as a familiar document,
  relying on downstream browser/messenger behavior and the operator opening it.
- **Required capability:** access to any customer/public file upload path; a public
  request bearer is required for the public route.
- **Impact:** staff-targeted content smuggling/social engineering and unsafe file
  distribution; no server-side execution was demonstrated.
- **Production data/access required:** no for upload; a staff recipient is required for
  endpoint impact.
- **Reproducibility:** direct policy tests with unknown bytes and an allowlisted
  supplied MIME pass the current fallback path.
- **Minimal remediation:** reject unknown binary content for signature-based formats;
  validate text as text; reconcile safe extension, detected MIME, and declared MIME;
  treat archives as a separate explicitly justified purpose. Antivirus remains a
  separate future control.
- **Required regression test:** arbitrary bytes declared as PDF/image/text are denied;
  valid signatures and bounded plain text pass; misleading extensions and polyglot
  cases fail according to an explicit policy.
- **Blocks product development?** no.
- **Blocks production deployment?** yes.

No path traversal, arbitrary local file read, user-selected object key, generic
StoredFile download, deleted-file access, or direct StoredFile IDOR was confirmed.
Object keys are generated, storage paths are root-contained, original filenames are
metadata only, downloads resolve an authorized domain relation, and logical deletion
prevents normal opens. Customer visibility is filtered separately from staff files.

## 10. Messenger findings

### SEC-013 - MAX media download trusts provider-supplied URLs without an egress policy

- **Severity:** Low
- **Confidence:** probable
- **Affected:** `src/max/max-media.ts` (`extractMaxMedia`, `materializeMaxMedia`)
- **Trust boundary:** MAX provider response -> backend outbound HTTP fetch
- **Exact behavior:** the downloader fetches `payload.url` with default redirect
  behavior and no explicit HTTPS, hostname, redirect-target, or private-address check.
  Size is bounded during streaming and the URL is removed before persistence.
- **Attack scenario:** a compromised/contract-violating provider response, or a future
  adapter path that lets a messenger user influence `payload.url`, points the backend
  at localhost, a private service, or cloud metadata. Current polling makes direct
  ordinary-user control unconfirmed.
- **Required capability:** influence over provider payload URL or provider transport;
  normal message text/callback control was not shown to be sufficient.
- **Impact:** conditional SSRF and internal network probing.
- **Production data/access required:** no, but provider-path control is required.
- **Reproducibility:** source-confirmed URL trust; no request to an internal target was
  made during this review.
- **Minimal remediation:** enforce HTTPS and documented MAX media hosts, validate every
  redirect, reject loopback/link-local/private/reserved addresses after resolution,
  and keep streaming limits/timeouts.
- **Required regression test:** allow documented host; reject HTTP, localhost, private
  IP, DNS rebinding result, and redirect to a forbidden host.
- **Blocks product development?** no.
- **Blocks production deployment?** no unless deployment grants sensitive egress.

Telegram and MAX staff callbacks were traced through chat binding, current Employee
lookup, active status, current permission checks, target parsing, and object-level
service calls. Role removal/deactivation is evaluated when the callback executes.
Stale V2 callbacks and forged targets fail closed; operator chat requires reciprocal,
current context. Provider media URLs and tokens are removed before StoredFile metadata
is retained, and full token-bearing URLs are not intentionally logged.

## 11. CH-R1/CH-R2 security review

### CH-R1

- Unique `(platform, externalUpdateId)` identity is adequate for the current polling
  adapters; platform namespacing prevents cross-provider collision.
- Per-dialog advisory lock keys are derived in a dedicated namespace and do not expose
  arbitrary SQL lock identifiers to callers.
- A duplicate concurrent update executes the handler once. An interrupted existing
  `processing` command becomes terminal `failed` and is not replayed.
- Persisted `UserDialogState` is keyed to the concrete platform/chat identity; no
  cross-chat state takeover was found.
- V2 expected step/version data prevents old callbacks from advancing current state.
- Persisted inbound payload/views do not expose bot tokens or attachment bytes.

### CH-R2

- No controller exposes generic enqueue or recipient mutation. Recipient IDs and
  payloads are assembled by internal workflows.
- Dedupe keys are unique and intent collisions are checked; rows are claimed with
  `FOR UPDATE SKIP LOCKED` and recover after worker restart.
- Transaction-sensitive paths enqueue with the same EntityManager, including
  registration handoff/completion.
- Delivery status views are reached through an already-authorized ticket, service
  request, or registration; recipient values are masked, payload is not projected,
  and provider errors are sanitized.
- Stored documents use `storedFileId`; raw bytes and provider URLs are not persisted in
  delivery payload.
- At-least-once delivery can duplicate a provider side effect after an indeterminate
  post-send crash. This is known reliability behavior, not a privilege or data-boundary
  bypass, and is not classified as a security finding here.

CH-R1 and CH-R2 were not weakened or redesigned in this review. CH-R3 was not started.

## 12. Web security: CSRF/CORS/XSS/validation

### SEC-004 - Customer cookie mutations have no same-origin/CSRF control

- **Severity:** Medium
- **Confidence:** confirmed
- **Affected:** `src/web-session/web-session.controller.ts`,
  `src/web-session/web-session.guard.ts`, customer mutation controllers under
  `/api/client`; contrast `src/admin/admin-auth.guard.ts`
- **Trust boundary:** attacker-controlled same-site origin -> authenticated customer
  cookie session
- **Exact behavior:** customer mutation routes authenticate only the HttpOnly
  SameSite=Lax cookie and do not validate Origin/Referer or a CSRF token. URL-encoded
  parsing is enabled. SameSite is site-scoped, not origin-scoped, so another origin on
  the same host/site can submit a simple form with the cookie. Admin mutations have an
  explicit same-origin guard; customer mutations do not.
- **Attack scenario:** content controlled on another port or sibling origin of the
  deployed site submits a form to the API while the victim's 30-day customer session
  is active, changing customer identity data or invoking another form-compatible
  mutation. CORS does not stop a form submission.
- **Required capability:** control of a same-site origin (or equivalent deployment
  condition) and a victim with an active customer session.
- **Impact:** customer-scoped unauthorized state changes; organization/object ownership
  still limits cross-customer reach.
- **Production data/access required:** an active victim browser session; no server
  credentials.
- **Reproducibility:** a synthetic session cookie followed by URL-encoded
  `POST /api/client/users` with `Origin: http://localhost:9999` returned HTTP 201 and
  performed the mutation against the isolated database.
- **Minimal remediation:** apply a shared exact-origin check to all cookie-authenticated
  unsafe customer methods, or a synchronizer/double-submit CSRF control; reject missing
  Origin/Referer according to an explicit browser/API policy; keep SameSite as a second
  layer.
- **Required regression test:** same-origin customer mutation succeeds; different
  origin, same-site sibling origin, malformed origin, and missing origin are denied;
  non-browser adapter exceptions, if needed, require explicit non-cookie auth.
- **Blocks product development?** no.
- **Blocks production deployment?** yes.

Global validation uses transformation, whitelisting, and rejection of unknown fields.
Material DTOs bound text length, IDs, enums, and structured registration values. JSON
and URL-encoded bodies have explicit size caps. CORS uses an allowlist with credentials
and does not combine wildcard origins with credentials. Production Swagger routes are
guarded by an active admin session. Error responses omit stack traces.

No React raw HTML sink, `dangerouslySetInnerHTML`, unescaped generated HTML template,
or messenger HTML/Markdown injection path was found. User text and filenames are
rendered as React text or normal messenger text. Helmet supplies `nosniff`, although
SEC-016 records the disabled CSP as hardening debt.

## 13. Secrets/sensitive data

- Tracked-path pattern scanning found no real bot token, provider password, session
  bearer, authorization header, production database credential, dump, backup, or
  customer file in the review diff or current tracked tree.
- `.env.example` uses placeholders. Runtime secrets are loaded from environment.
- Admin, customer, and public request tokens are hashed before persistence.
- Audit metadata sanitization rejects known sensitive keys and does not intentionally
  retain message bodies, file bytes, cookies, or provider URLs.
- OFD activation code is masked in the customer registration checklist and was not
  found in a URL, callback, generic delivery status, client-visible error, or audit
  projection. Authorized staff registration details necessarily retain the business
  value.
- CH-R1 payloads and CH-R2 delivery status views do not expose messenger credentials.
  CH-R2 payload rows remain internal and are not returned by public/admin APIs.

GitGuardian's green baseline run was treated only as corroboration. No dedicated local
history scanner was installed, so this was a tracked-tree and code-flow review rather
than a full historical secret-forensics exercise.

## 14. SQL/SSRF

Raw SQL call sites use positional parameters. Dynamic ordering is selected from server
constants rather than caller-provided column fragments. Advisory-lock inputs are
hashed/namespaced before use. No SQL injection path was confirmed.

Integration coordinator URLs are configuration-owned rather than accepted from public
requests, and the internal import endpoint requires the bridge secret. Telegram media
URLs come from the Telegram SDK/provider response. No direct web-controlled arbitrary
URL fetch was found. SEC-013 documents the remaining conditional MAX provider URL
hardening gap.

## 15. Business workflow bypass

### SEC-010 - Staff can send ticket messages after the ticket is closed

- **Severity:** Low
- **Confidence:** confirmed
- **Affected:** `src/admin/admin.service.ts` (`sendTicketMessage`,
  `sendTicketMedia`, `replyToTicket`), staff ticket message/media routes
- **Trust boundary:** employee with ticket reply permission -> closed customer ticket
- **Exact behavior:** message/media methods lock and load a ticket but do not reject
  `isAnswered=true`; they persist and enqueue a customer delivery after closure.
- **Attack scenario:** an authorized operator selects a closed ticket by ID and sends
  another message or file, bypassing the UI/workflow expectation that closure ends the
  conversation.
- **Required capability:** active employee with `tickets.reply`; this does not grant a
  new customer's data to an otherwise unauthorized role.
- **Impact:** workflow integrity failure and unexpected customer contact after closure.
- **Production data/access required:** an existing closed ticket and authorized staff.
- **Reproducibility:** confirmed by locked mutation path; no `isAnswered` condition is
  evaluated before message save and outbound enqueue.
- **Minimal remediation:** reject or explicitly reopen under a permitted transition;
  check state inside the same lock/transaction used for message and enqueue.
- **Required regression test:** text/media to closed ticket creates no message, file,
  or outbound delivery; explicit reopen, if supported, is audited and then permits it.
- **Blocks product development?** no.
- **Blocks production deployment?** no, but fix before operational launch.

### SEC-011 - Last-superadmin invariant has a concurrent check/use race

- **Severity:** Low
- **Confidence:** confirmed
- **Affected:** `src/admin/admin-auth.service.ts` (`setRoles`, `setActive`,
  `activeSuperadminCount`)
- **Trust boundary:** concurrent superadmin mutations -> administrative availability
- **Exact behavior:** active-superadmin count is checked outside the later role/active
  mutation transaction and without locking the invariant. Concurrent changes to two
  superadmins can both observe a safe count and leave no active superadmin.
- **Attack scenario:** two authorized requests concurrently remove/deactivate the two
  remaining superadmins, locking staff out of privileged administration.
- **Required capability:** superadmin permission and carefully timed concurrent calls.
- **Impact:** administrative lockout/availability; no privilege gain or customer data
  disclosure.
- **Production data/access required:** at least two active superadmins.
- **Reproducibility:** confirmed by transaction boundary and check/use ordering; no
  destructive concurrent test was run.
- **Minimal remediation:** enforce the invariant under one transaction using an
  advisory/row lock, or a database-level design that serializes superadmin removal.
- **Required regression test:** concurrent role removal/deactivation leaves at least
  one active superadmin and returns a deterministic conflict for the loser.
- **Blocks product development?** no.
- **Blocks production deployment?** no, but fix before multiple administrators operate.

Registration handoff recomputes readiness under lock, denies incomplete checklists,
requires a current active engineer for assignment, and generates final PDF only on the
ready path. Alternative status update code refuses direct `processed` transition.
Organization access requires a pending request, staff review permission, transactional
membership creation, and duplicate protection; knowledge of INN only creates a request
and never membership. Service-request transitions use the state machine and permission
decorators; internal messages are omitted from customer/public projections. No direct
invoice/payment/assignment/readiness bypass was confirmed.

## 16. Audit/accountability

### SEC-009 - Several privileged mutations and their audit records are not atomic

- **Severity:** Low
- **Confidence:** confirmed
- **Affected:** multiple `src/admin/admin.controller.ts` staff, ticket, service,
  integration, and asset mutation handlers; corresponding service methods;
  `src/audit/audit.service.ts`
- **Trust boundary:** privileged domain mutation -> durable accountability record
- **Exact behavior:** many handlers commit a service mutation and then call
  `audit.record` using a separate repository operation. If audit persistence fails,
  the mutation remains committed while the request may return 500 without an audit
  event. Transaction-critical organization approval, registration handoff, and CH-R2
  enqueue paths already demonstrate the stronger same-manager pattern.
- **Attack scenario:** during a partial database/storage failure, a sensitive staff
  role/password/status action succeeds but its audit insert fails. A malicious staff
  member cannot normally force this condition directly, but incident reconstruction
  loses the expected record.
- **Required capability:** privileged mutation plus an audit-write failure condition.
- **Impact:** accountability gap and misleading API outcome, not direct authorization
  bypass.
- **Production data/access required:** a privileged production action for real impact.
- **Reproducibility:** confirmed by service/controller transaction tracing; failure was
  not injected across every mutation.
- **Minimal remediation:** move security-critical mutation and audit insert into one
  transaction/EntityManager; define explicit fail-closed/fail-open semantics for
  noncritical audit events.
- **Required regression test:** injected audit failure rolls back role, active-state,
  password, permissioned state-transition, and other selected critical mutations.
- **Blocks product development?** no.
- **Blocks production deployment?** no, but critical staff mutations should be fixed
  before production.

### SEC-012 - Caller-controlled non-UUID request ID breaks login auditing

- **Severity:** Low
- **Confidence:** confirmed
- **Affected:** `src/app.bootstrap.ts` request-ID middleware,
  `src/admin/admin.controller.ts` login audit calls,
  `src/audit/entities/audit-event.entity.ts`
- **Trust boundary:** anonymous HTTP header -> UUID audit column
- **Exact behavior:** middleware accepts any 1-100 character alphanumeric/`._-`
  `x-request-id`, but login passes the raw header to an AuditEvent UUID column rather
  than the normalized request property. A syntactically accepted non-UUID causes the
  audit insert to fail.
- **Attack scenario:** an anonymous caller sends a failed login with
  `x-request-id: attacker-controlled`, producing a 500 and database/log noise instead
  of a normal 401. On a valid login, session rows can be created before audit/cookie
  completion, creating misleading failure semantics.
- **Required capability:** anonymous access to login.
- **Impact:** low-grade error/log amplification and broken authentication audit
  semantics; no authentication bypass was found.
- **Production data/access required:** no.
- **Reproducibility:** isolated HTTP check returned 401 with a generated request ID and
  500 with the accepted non-UUID value; PostgreSQL reported invalid UUID input.
- **Minimal remediation:** always generate/normalize a UUID in middleware, use only
  `request.requestId` downstream, and never feed the raw header into typed storage.
- **Required regression test:** malformed/non-UUID header is replaced and failed/valid
  login returns the expected status while recording a valid UUID.
- **Blocks product development?** no.
- **Blocks production deployment?** no.

Audit actor identity is assembled by trusted guards/services; customer DTOs cannot set
`actorStaffId`. Metadata sanitization prevents common credential/message/file values
from entering events. Permission denials are audited without exposing internal details
to the caller.

## 17. Dependency observations

### SEC-014 - Runtime dependency advisory backlog beyond the reachable Multer issue

- **Severity:** Informational
- **Confidence:** confirmed inventory; reachability varies
- **Affected:** dependency graph represented by the unchanged `package-lock.json`
- **Trust boundary:** third-party runtime/tooling code -> application/runtime
- **Exact behavior:** `npm audit --omit=dev` reports 23 production advisories: 2 Low,
  8 Medium, and 13 High. Multer is reachable and included in SEC-003. Reviewed NestJS
  SSE, React Router RSC, and TypeORM MySQL-specific advisories do not match current
  application paths (no SSE, no React Server Components/actions, PostgreSQL rather
  than the affected MySQL query-builder path). Axios is transitive through the
  apparently unused GigaChat dependency and no public caller controls its destination.
- **Attack scenario:** no additional concrete exploit was established; future code or
  deployment changes can make currently dormant vulnerable paths reachable.
- **Required capability:** depends on the advisory; none confirmed beyond SEC-003.
- **Impact:** maintenance and latent supply-chain exposure.
- **Production data/access required:** no.
- **Reproducibility:** `npm audit --omit=dev --json`; manual reachability tracing.
- **Minimal remediation:** fix SEC-003 first, then perform a separate scoped dependency
  update/reachability package; remove truly unused direct dependencies under CH-006.
- **Required regression test:** package-specific tests for any upgraded reachable path;
  preserve lockfile reproducibility and CI.
- **Blocks product development?** no beyond SEC-003.
- **Blocks production deployment?** no as a blanket count; reachable advisories must be
  resolved or explicitly accepted.

The applicable Multer condition is documented by the official project advisories and
fixed-release changelog:

- <https://github.com/expressjs/multer/security/advisories/GHSA-v52c-386h-88mc>
- <https://github.com/expressjs/multer/blob/main/CHANGELOG.md>

For context, the reviewed NestJS advisory is SSE-specific, and the React Router issues
are RSC-specific:

- <https://github.com/nestjs/nest/security/advisories/GHSA-36xv-jgw5-4q75>
- <https://github.com/remix-run/react-router/security/advisories>

### SEC-015 - Browser policy hardening is incomplete, without a current injection sink

- **Severity:** Informational
- **Confidence:** confirmed
- **Affected:** `src/app.bootstrap.ts`
- **Trust boundary:** browser-rendered UI -> browser execution policy
- **Exact behavior:** Helmet is enabled but CSP is explicitly disabled. Production
  Swagger is authenticated, CORS is allowlisted, React rendering escapes text, and no
  current HTML injection sink was found, so this is not a demonstrated XSS.
- **Attack scenario:** a future injection bug would have no CSP containment layer.
- **Required capability:** a separate script/content injection vulnerability.
- **Impact:** reduced defense in depth only.
- **Production data/access required:** no.
- **Reproducibility:** configuration and sink search.
- **Minimal remediation:** introduce a tested CSP compatible with Vite assets and
  Swagger, preferably enforced before production.
- **Required regression test:** production response headers contain the expected CSP;
  admin/client builds and Swagger still load without inline-policy violations.
- **Blocks product development?** no.
- **Blocks production deployment?** no.

### SEC-016 - Development deployment and CI supply-chain assumptions need explicit limits

- **Severity:** Informational
- **Confidence:** confirmed
- **Affected:** development Docker Compose/environment examples and GitHub Actions
  workflow references
- **Trust boundary:** development/deployment configuration -> network and CI runner
- **Exact behavior:** the local PostgreSQL Compose setup publishes port 5432 and uses
  convenient defaults; it must not be treated as a production manifest. CI has
  read-only repository permissions and no `pull_request_target`, but actions are
  referenced by moving major tags rather than immutable commit SHAs. No dependency
  update automation was found.
- **Attack scenario:** reusing local defaults on an exposed host leaks a weakly
  configured database; a compromised upstream action tag could affect CI.
- **Required capability:** unsafe deployment reuse or upstream supply-chain compromise.
- **Impact:** configuration-dependent infrastructure/supply-chain risk.
- **Production data/access required:** only if development settings are reused.
- **Reproducibility:** configuration/workflow inspection.
- **Minimal remediation:** document Compose as local-only, bind development DB to
  localhost where practical, require production secrets/network policy, pin critical
  Actions by SHA, and add controlled dependency review automation.
- **Required regression test:** production configuration validation rejects defaults;
  CI policy check enforces approved action references.
- **Blocks product development?** no.
- **Blocks production deployment?** only if local defaults would be reused.

No package was upgraded and `package-lock.json` was not changed.

## 18. Findings by severity

| ID | Severity | Confidence | Summary | Product blocker | Production blocker |
| --- | --- | --- | --- | --- | --- |
| SEC-001 | High | confirmed | Cookie-rotatable limiter plus synchronous PBKDF2 DoS | yes | yes |
| SEC-002 | High | confirmed | Staff notification fan-out ignores RBAC/assignment | yes | yes |
| SEC-003 | High | confirmed | Unbounded multipart buffering and vulnerable Multer | yes | yes |
| SEC-004 | Medium | confirmed | No customer mutation Origin/CSRF control | no | yes |
| SEC-005 | Medium | probable | Public bearer entropy depends on client idempotency key | no | yes |
| SEC-006 | Medium | confirmed | Public bearer exposed in URL/storage/error logs | no | yes |
| SEC-007 | Medium | confirmed | Unknown file content trusts declared MIME | no | yes |
| SEC-008 | Low | confirmed | Registration checklist mutates before owner check | no | yes |
| SEC-009 | Low | confirmed | Critical mutation/audit write often non-atomic | no | no |
| SEC-010 | Low | confirmed | Staff can message a closed ticket | no | no |
| SEC-011 | Low | confirmed | Concurrent last-superadmin invariant race | no | no |
| SEC-012 | Low | confirmed | Non-UUID request header breaks login audit | no | no |
| SEC-013 | Low | probable | MAX media URL lacks explicit egress allowlist | no | conditional |
| SEC-014 | Info | confirmed | Dependency advisory backlog; reachability limited | no | scoped |
| SEC-015 | Info | confirmed | CSP disabled; no current injection sink | no | no |
| SEC-016 | Info | confirmed | Dev deployment and CI pinning assumptions | no | conditional |

## 19. Areas reviewed with no finding

- **Organization ownership:** INN knowledge creates a pending access request, not
  membership. Customer asset routes require membership; review uses RBAC, transactions,
  duplicate protection, and does not accept caller-supplied staff identity.
- **ServiceRequest IDOR:** customer numeric routes include current `userId`; public
  routes require the request bearer; admin engineer views remain assigned-only.
- **Registration readiness bypass:** handoff recomputes and locks readiness; incomplete
  requests and direct `processed` transitions are denied. SEC-008 is an initialization
  side effect, not a handoff/data-read bypass.
- **File IDOR:** no generic StoredFile route, arbitrary path input, deleted-file open,
  or cross-parent attachment lookup was found.
- **Admin RBAC:** substantial actions have explicit permissions; role union is a set
  union; engineer does not inherit operator; sales manager has no implicit operator
  rights; disabled/current-role state is checked per session request. SEC-002 is the
  separate notification side channel.
- **Admin CSRF:** unsafe authenticated admin methods require exact allowed/request
  Origin/Referer. SEC-004 applies to customer sessions only.
- **XSS:** no raw React HTML or messenger parse-mode sink was found.
- **Public tokens:** raw values are hashed at rest and request-scoped; no numeric-only
  public access. SEC-005/006 cover entropy and exposure lifecycle.
- **Telegram/MAX admin callbacks:** current linked employee, active state, permission,
  target, and stale context are revalidated at execution time.
- **OFD secret leakage:** activation code remains masked from customer/API/log/audit
  surfaces reviewed.
- **Outbound delivery visibility:** object permission precedes status projection;
  recipient is masked, last error sanitized, and raw payload omitted.
- **SQL injection:** parameterized raw SQL and fixed ordering paths; none confirmed.
- **Direct web SSRF:** no user-controlled fetch destination; SEC-013 is provider-bound.
- **Password storage:** salted 310,000-iteration PBKDF2, timing-safe comparison,
  constant-work unknown-user path, no plaintext/default bootstrap credentials.

## 20. Test/reproduction evidence

All local checks used isolated databases `vitma_security_audit_test` and
`vitma_security_audit_app`, an isolated temporary FileStorage root, fake Telegram
credentials, MAX disabled, polling disabled, and outbound worker disabled.

| Check | Result |
| --- | --- |
| `npm ci` | pass; lockfile unchanged |
| `npm run ci:quality` | pass; 21 suites / 98 unit tests; lint ratchet unchanged (817 legacy errors, 9 warnings, 74 files) |
| `npm run ci:build` | pass; NestJS, admin, and client production builds |
| `npm run ci:database` | pass after build; 80 integration and 7 e2e tests |
| `npm run ci:offline-smoke` | pass; server, admin/client routes, browser login/logout smoke |
| `npm run migration:show` | pass; all 3 migrations applied in isolated app DB |
| `npm run schema:log` | pass; schema up to date |
| `npm run migration:test:show` | pass; all 3 migrations applied in isolated test DB |
| `npm run schema:test:log` | pass; schema up to date |
| `npm audit --omit=dev --json` | 23 production advisories; reachability analyzed in SEC-003/014 |

The first database/e2e invocation in the fresh worktree was intentionally recorded:
integration passed, while five browser e2e checks failed because the clean worktree
did not yet contain `admin-ui/dist/index.html`. Running the production build and then
the same database command produced the full pass above. This is command ordering, not
an application security failure.

Adversarial evidence:

- rate limiter: rotating cookies 25 allowed / 0 limited; fixed cookie 10 allowed / 15
  limited;
- password path: six unknown-user PBKDF2 verifications took about 255 ms synchronously;
- multipart: 24 MiB reached application token lookup and returned 404, not 413;
- notifications: permissionless active employee matched recipient selection and
  produced a staff delivery intent;
- customer CSRF: cross-origin URL-encoded form with a valid isolated customer cookie
  returned 201;
- malformed request ID: normal failed login returned 401; accepted non-UUID request ID
  returned 500 with PostgreSQL UUID conversion failure;
- public token: same numeric IDs and weak idempotency key generated the same bearer;
- no exploit touched a real customer, bot, provider, storage root, or production DB.

## 21. Limitations

- Static code-flow review plus local synthetic tests, not external infrastructure
  penetration testing.
- No real Telegram, MAX, ATOL, Platforma OFD, cloud metadata, or production delivery
  call was made.
- No production proxy, TLS terminator, WAF, DNS, host, or egress policy was inspected.
- No full Git-history secret forensic tool was available locally; tracked files and
  reachable code/log paths were reviewed.
- Dependency advisories were triaged for current reachability, not resolved.
- Full database integrity, retention/reconciliation (CH-R3), Catalog + Orders, 1C,
  frontend redesign, and exhaustive test-gap analysis remain out of scope.
- Conditional findings explicitly state the extra attacker/deployment prerequisite.

## 22. Verdict

**B - Limited security remediation first.** There are no Blocker/Critical findings,
but SEC-001, SEC-002, and SEC-003 are practical High issues reachable without
production data (SEC-002 needs a low-privilege staff account for real-data impact).

- **Catalog + Orders architecture:** design work may proceed, but implementation should
  not be merged until the three High packages pass CI and adversarial regression tests.
- **Architectural change required:** no. Existing guards, permissions, FileStorage,
  transactions, and durable command/delivery primitives can be extended locally.
- **Blocks production:** SEC-001 through SEC-008 should be resolved before accepting
  real customer/staff traffic. SEC-003 includes the reachable dependency update.
- **May remain until production hardening:** SEC-009 through SEC-016, subject to the
  deployment conditions stated for SEC-013/016. SEC-010/011 should be fixed before the
  relevant operational workflows are used.

## 23. Recommended remediation sequence

1. **SEC-R1: HTTP resource protection.** Fix SEC-001 and SEC-003 together: trusted
   pre-auth identity/proxy rules, asynchronous password verification, bounded limiter,
   fixed Multer, and hard multipart caps. This package should be first because both
   issues permit unauthenticated availability attacks.
2. **SEC-R2: Notification authorization.** Fix SEC-002 with current permission and
   assigned-object filtering at subscription and fan-out time. Include role-removal,
   deactivation, and no-enqueue negative tests.
3. **SEC-R3: Customer browser and bearer perimeter.** Fix SEC-004, SEC-005, and SEC-006:
   exact-origin/CSRF control, server-generated public bearers, redacted URLs/logs,
   no-store, and revocation/rotation.
4. **SEC-R4: File content and registration ordering.** Fix SEC-007 and SEC-008 with
   strict content validation and owner-before-initialize semantics.
5. **SEC-R5: Accountability/workflow hardening.** Address SEC-009 through SEC-012 in a
   bounded package without redesigning CH-R1/CH-R2.
6. **Pre-production hardening backlog.** Resolve or formally accept SEC-013 through
   SEC-016 based on final egress, deployment, browser, and dependency topology.

Each package should be a separate implementation PR. CH-R3 and Catalog + Orders are
not part of this audit or remediation sequence unless separately authorized.
