# Bot Delivery, Media and Operational Reliability Audit

## B1 status

MAX media defects are **fixed in B1** for customer paths and operator
image/document forwarding. ATOL request-local cleanup is fixed. Telegram
provider URL handling, durable delivery, retry and outbox remain deferred.

## Outgoing delivery

Interactive responses are sent directly from platform contexts. Cross-chat and
admin-triggered sends use:

```text
business service
  -> MessengerRouterService
  -> TelegramMessengerService or MaxMessengerService
  -> external API
```

There is no delivery record, provider message ID, retry counter, next-attempt
time, dead-letter state or operator-visible failure queue.

## Failure semantics

- Admin notifications catch each error, print it with `console.error` and let
  the business workflow succeed.
- Several client notifications occur after repository saves. A send failure can
  reject the operation while the database already contains the new status.
- Retrying the admin action may send the message/document again.
- Interactive replies have no common timeout/retry/error policy.
- Rate limits, timeouts, revoked chats, platform outages and partial
  upload/send failures have no explicit handling.

Accepted requests can survive messenger failure, but delivery loss is silent to
staff and cannot be repaired automatically.

## Media paths

### Registration and signed consent

1. A platform handler obtains a remote URL.
2. MAX checks declared length and streamed bytes before accepting the buffer;
   Telegram still uses its legacy download path.
3. `FilesService.saveBuffer()` checks purpose, size and MIME signature.
4. `LocalFileStorageProvider` writes a random object key and records SHA-256.
5. The domain row references `StoredFile`.

The policy is applied after the body is in memory. A large or slow response can
consume resources before the configured maximum is enforced.

### Ticket media

Telegram still stores platform file IDs and `getFileLink()` as `externalUrl`.
MAX now materializes supported ticket attachments into `StoredFile` and removes
the provider URL before persistence.

Consequences:

- remote links may expire or become inaccessible;
- retention and backup differ from registration/consent files;
- Telegram file links may contain the bot token and are persisted verbatim;
- customer uploader attribution is absent for generic ticket stored files;
- MAX operator images/documents are binary; unsupported operator audio/video is
  rejected before persistence or send.

### Confirmed FileStorage controls

- randomized object keys;
- path traversal and absolute-path rejection;
- bounded writes and temporary-file cleanup;
- SHA-256 metadata;
- purpose-specific size and MIME allowlists;
- magic-byte checks for common formats;
- authorized file endpoints covered by integration tests.

### FileStorage gaps

- caller-side full buffering precedes size enforcement;
- `FilePolicy.extensions` is defined but not enforced;
- legacy path columns coexist with `StoredFile`;
- no antivirus/quarantine stage;
- no retention cleanup for messenger attachments;
- global retention cleanup remains absent; ATOL request-local cleanup is fixed.

## Configuration and operations

- One `BOT_POLLING_ENABLED` flag controls both platforms and defaults on.
- Telegram token is mandatory even for MAX-only startup.
- Empty MAX token disables MAX.
- There are no platform-specific polling flags, webhook settings, request
  timeouts or retry settings.
- MAX receiving and delivery use separate SDK client instances.
- Logs lack consistent update ID, workflow ID, delivery attempt and provider
  error categories.
- No bot-specific health or delivery metric exists.

## Security and privacy

| Risk | Severity | Confidence |
|---|---|---|
| Legacy Telegram admin callbacks lack role checks | fixed in B1 | regression-tested |
| Telegram file URL may persist bot token in DB | high | storage path confirmed; URL shape is provider/library dependent |
| Full customer content has no explicit retention policy | medium | code-confirmed |
| Remote URLs are fetched without host/redirect/timeout policy | medium | code-confirmed |
| Remote media is buffered before size validation | medium | code-confirmed |
| Raw errors and weak structured context | low | code-confirmed |

Client service requests use platform/chat ownership checks. Admin binding codes
are platform-specific, expiring and single-use. These controls do not compensate
for missing authorization in legacy Telegram admin callbacks.

## Conclusion

Database acceptance is more reliable than message delivery, but the system
cannot prove delivery, retry failure or prevent duplicate sends. Production
operation needs durable delivery after state/idempotency contracts are defined.
