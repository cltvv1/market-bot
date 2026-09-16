# SEC-R3B: ServiceRequest public access lifecycle

Date: 2026-09-16. Scope: SEC-005 and SEC-006 only. Draft implementation;
main is not remediated by this document alone. Separate merge approval is required.

## Baseline and current-source evidence

- Approved main: `5b69f5fdeae2a67feaa26ef5925bcc7b3e5097b5`, SEC-R3A merged as PR #36.
- [Baseline CI 35052336657](https://github.com/cltvv1/market-bot/actions/runs/35052336657) is green.
- Baseline: 429 unit / 44 suites, 549 integration / 28 suites, 7 e2e / 2 suites,
  100 frontend contracts, 178 browser checks, 11 migrations / 0 pending / 0 drift.
- Branch: `codex/sec-r3b-service-request-public-access`, isolated worktree.
- Implementation commit: `460283781824d2c1b69c3acb403c7e5fc73adcad`.

At that exact baseline, `ServiceRequestsService.submitWebDraft()` derived the
raw bearer from SHA-256 of `userId:requestId:idempotencyKey`, encoded base64url.
It returned `publicToken`, persisted its SHA-256 hash, and rewrote that hash on
same-key submission replay. The accepted weak key `00000000` reproduced implicit
issuance. Client-controlled idempotency entropy therefore influenced the access secret.

All four public controller routes accepted `:token` in their paths. The legacy
status adapter read `?token=`, and its API helper interpolated that token into
request URLs. `ApiErrorFilter` logged `request.originalUrl` and exception stacks
on 5xx. These are current-source findings, not assumed historical audit results.

Before remediation, the new submit/explicit-access integration assertions failed
(unexpected `publicToken`, missing owner access route). Both logger privacy cases
also failed with synthetic path/query/header secrets in captured logger output.

## Threat model and boundaries

A public link is a request-scoped bearer capability, not customer identity.
Anyone receiving it can read the existing customer-safe public projection and
exchange allowed ordinary messages/files for that request. The owner controls
issuance, replacement and revocation. The primary customer workflow remains the
original WebSession, with its existing exact-owner checks.

Possession cannot create a WebSession or unlock organizations, Orders,
Registrations, other requests, staff internals, Audit, invoice/payment-proof
surfaces or internal file metadata. Browser compromise/XSS and voluntary link
redistribution remain risks inherent to bearer access; CSP and identity/login
work are outside this package.

## Submit and random issuance

Submit no longer derives or returns a bearer. Its idempotency key remains only
a submission key. Same-key replay returns the same submitted request without a
second transition or a hash/version write, including after explicit issuance.
Existing events, notifications, Audit and owner lost-response reconciliation remain.

Explicit issue/rotate uses Node `randomBytes(32).toString('base64url')`: 256 bits,
43 canonical base64url characters. Only SHA-256 of the raw bearer is stored in
the existing `publicTokenHash` column. No new secret, table, encryption scheme,
dependency or identity mechanism is introduced. Raw bearer is returned once in
the successful issue/rotate response, never in subsequent reads or projections.

## Owner lifecycle API

| Method | Route | Result |
| --- | --- | --- |
| GET | `/api/client/service-requests/:id/public-access` | `{ enabled, version }` only |
| POST | `/api/client/service-requests/:id/public-access` | Issue or rotate; `{ enabled, version, token }` once |
| DELETE | `/api/client/service-requests/:id/public-access` | Revoke; `{ enabled, version }` |

All three require WebSessionGuard and exact `userId` ownership; foreign IDs are
404. Mutations also require WebMutationOriginGuard and bounded `expectedVersion`
(1..2147483647). Staff roles and organization membership do not substitute for
ownership. Drafts cannot be shared. Closed/cancelled public message restrictions
are preserved; access lifecycle does not change business status.

Mutations lock the PostgreSQL request row `FOR UPDATE`, compare the root version,
save once and audit inside the same transaction. One winner of concurrent
rotate/rotate, rotate/revoke or access/business mutation advances the version;
the stale participant gets 409. Already-disabled revoke is an explicit idempotent
no-op, without another version increment or Audit event.

Audit actions: `service_request.public_access.issue`, `.rotate`, `.revoke`.
They contain actor/target identifiers only, no raw bearer, hash, Authorization,
share URL or customer-visible business-history entry. Audit failure rolls back
the mutation. Generic legacy Audit atomicity is not changed.

## Public transport and authorization

| Method | Header-only route |
| --- | --- |
| GET | `/api/public/service-requests/status` |
| POST | `/api/public/service-requests/messages` |
| POST | `/api/public/service-requests/messages/attachments` |
| GET | `/api/public/service-requests/attachments/:attachmentId` |

One canonical guard accepts exactly one `Authorization: Bearer <value>` header.
Scheme is case-insensitive; value is exactly canonical base64url for 32 bytes.
Missing, empty, duplicate, comma-joined, Basic, overlong, embedded-space,
invalid-character, noncanonical, unknown and revoked values fail with the same
401 message, `Public access is unavailable`. There is no trimming or fallback
from query, path, body or cookie. Existing pre-auth rate limits remain; owner
lifecycle mutations additionally use the current bounded public-form limiter.

Removed contracts: `GET /:token`, `POST /:token/messages`,
`POST /:token/messages/attachments`, `GET /:token/attachments/:attachmentId`
under `/api/public/service-requests`. No compatibility route is retained.

The resolved principal carries request ID, customer ID and a request-local
capability hash used solely for race-sensitive rechecks. Raw bearer is not
passed through domain methods. Public reads/download opening acquire a shared
row lock; writes acquire the root write lock and recheck current capability.
Rotation/revocation serialize with those operations. A response already sent,
or file stream already authorized/opened before revocation, cannot be recalled;
new operations and operations losing the authorization race are rejected.

## Multipart and files

Order: canonical access guard -> current request/state upload guard -> Multer ->
locked capability recheck -> storage/domain write. Invalid/revoked bearer at
entry produces zero Multer calls, zero FileStorage writes and no domain mutation.
Revocation between preflight and the write lock also produces zero storage writes.

The existing size, purpose, MIME and filename policy is retained; SEC-007 content
hardening is explicitly not implemented here. Files remain bound to the exact
request. Public downloads require customer-visible attachments and exclude
payment proofs and foreign/internal files. No provider URL or bearer URL is used.

## Browser lifecycle

The owner detail's small "Доступ по ссылке" section reads safe state, explicitly
issues/rotates/revokes, and offers Copy. The generated raw link remains component
memory only. A possibly committed POST failure is never automatically retried:
the UI rereads safe state and asks for a separate explicit rotation when the
new secret was lost. The unknown previous secret then stops working.

Share format: `/site/service/status#access=<synthetic-placeholder>`.
Bootstrap runs before React/router rendering, validates the fragment and replaces
the current history entry with a clean URL before any public API request. Reload
uses only `sessionStorage['vitma-service-public-access-v1']`; restricted storage
falls back to memory. No localStorage, cookie, query authentication, token anchor,
download URL or duplicate storage key is introduced. Legacy query input is
scrubbed and rejected, not converted to access.

Public JSON/messages/uploads and authenticated file fetches use Authorization
with `credentials: omit`. File downloads use an ephemeral blob URL. A 401 clears
the session bearer and displays an invalid-link message. Browser regressions
cover actual Copy, independent contexts, URL/referrer absence, reload, Back/Forward,
storage, text/file exchange, rotation, revocation and lost-POST reconciliation.
Test screenshots contain only disabled/reconciliation states, never a raw link.

## Cache and logging

Owner issue/rotate: `Cache-Control: no-store`, `Pragma: no-cache`.
Public JSON/downloads: `Cache-Control: private, no-store`, `Pragma: no-cache`,
`Vary: Authorization` (preserving other Vary values). Downloads additionally use
`X-Content-Type-Options: nosniff` and safe `Content-Disposition: attachment`.

5xx logging now uses allowlisted HTTP method plus a bounded matched route
template and status. Unmatched/unsafe templates use a generic identity.
Runtime URL, query, base URL, headers, body, exception text/stack and untrusted
request ID are not logged by this filter. This intentionally trades arbitrary
exception-stack diagnostics for secret safety, without creating an observability
subsystem. Logger spies exercise matched and unmatched requests with synthetic
query/path/Authorization/Cookie secrets, including secrets in exception text.

## Migration and rollout

Append-only data migration:
`RevokeLegacyServiceRequestPublicAccess1789516800000`.

```sql
UPDATE "service_requests"
SET "publicTokenHash" = NULL
WHERE "publicTokenHash" IS NOT NULL;
```

Every existing legacy public capability is intentionally invalidated. Owner
data, status, version and WebSession access remain unchanged. No schema change
or historical migration edit. Down is intentionally a no-op: weak capabilities
cannot safely be restored. A deployment must apply the migration before enabling
new issuance; migration rollback does not restore old links. No production rollout
was performed in this package. Reverting the application to pre-SEC-R3B code
would reintroduce deterministic issuance (including on submit replay); it is
not a security-preserving rollback.

Current-chain and CO-3C rollback/reapply tests now include the twelfth migration;
the existing CO-3C preservation assertions are retained.

## Origin boundary and projection

Updated canonical mutation inventory: 110 total = 32 cookie-dependent + 3 public
non-cookie + 75 excluded staff/internal mutations. Both new owner commands are
guarded Category A entries. SEC-R3A regression includes them; issue/rotate/revoke
foreign-Origin tests also prove no DB or Audit change.

Public projection filtering is unchanged, including private/unknown answers,
staff internals and payment-proof exclusion. Existing tests now explicitly issue
a capability and send Authorization rather than relying on submission side effects.

## Verification

Local final implementation verification:

| Gate | Result |
| --- | --- |
| Unit | 448 passed / 46 suites |
| PostgreSQL integration | 584 passed / 29 suites |
| E2E | 7 passed / 2 suites |
| Frontend contracts | 106 passed |
| Browser workflows | 187 passed: 28 admin service, 38 client service, 27 admin registration, 23 client registration/operator, 17 admin Orders, 26 admin Catalog, 28 client Store |
| Builds | NestJS, admin and client production builds passed |
| Frontend quality | Client lint and admin TypeScript passed |
| Offline smoke | Nest bootstrap, health, React serving and browser flows passed |
| Migration chain | 12 applied / 0 pending; application and test schema drift zero |
| Lint ratchet | Unchanged: 684 errors / 6 warnings / 63 files |
| Dependencies | `package.json` and `package-lock.json` byte-identical to baseline |

New targeted evidence: 17 Authorization parser unit cases, two logger spy cases,
33 public-access PostgreSQL cases, six frontend contracts and the expanded public
browser lifecycle flow. Existing service/file/proof/origin/registration/commerce
assertions remain; old bearer issuance/URL expectations now assert the deliberately
changed contract. The real PostgreSQL race tests wait for observable lock contention,
not a timing-only delay, and assert one winner plus one 409. A paused upload test
revokes access between successful preflight and locked persistence.

The first whole integration run found only two migration-chain assumptions tied
to the old latest migration. Those tests were adapted without dropping their
schema/data preservation assertions; the subsequent full run is green.

Actual scripts: `ci:quality`, `ci:build`, `ci:database`, `ci:offline-smoke`,
`lint:site`, admin `tsc --noEmit`, all seven existing frontend contract runners,
all five additional browser smoke runners, application/test migration show and
schema log. The offline smoke child alone raises its synthetic per-loopback read
and form limits to accommodate multiple browser contexts; production defaults and
SEC-R1 rate-limit assertions are unchanged. All resources are isolated synthetic
databases and temporary FileStorage roots. Public-link screenshots were visually
checked at desktop/mobile widths and contain no bearer.

Hosted handoff gate: push and pull-request runs must be successful on the final
branch HEAD, with Quality, Production builds, frontend contract step,
PostgreSQL/tests/offline smoke and all five additional browser workflow steps.
GitGuardian must also pass on that exact HEAD. The draft PR's verification section
records final run IDs, exact SHA and GitGuardian check ID after those runs finish;
this document does not claim a run on its own as-yet-uncreated commit. No merge
or deployment is authorized by green CI.

## Deferred work and classification

SEC-004 remains resolved on merged main. SEC-005/006 are addressed only in this
SEC-R3B draft until separate merge approval. Historical August 25 and September 2
audits are untouched. PROJECT_STATUS and ROADMAP now mark SEC-R3A/PR #36 merged.

Deferred: SEC-007 legacy file content policy, closed-ticket staff reply,
last-superadmin race, generic Audit atomicity, MAX egress allowlist, CSP,
dependency advisories, request-ID policy, branch protection, reverse proxy/TLS,
backups, OPS, EM-0, Support/Knowledge UI, 1C, EDO, account/login and cross-device
identity merging. No production resources, live messenger/provider calls,
deployment or next package are part of this work.
