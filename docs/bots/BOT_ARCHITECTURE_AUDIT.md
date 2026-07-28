# Bot Architecture Audit

Audit baseline: `main` at `d27b2ca6928b3903b6ed306bf3d8f83089fb6a7b`.

This document describes the implementation as it exists. It is not a target
design and no production behavior was changed during the audit.

## Runtime topology

```text
Telegram update                         MAX event
  -> nestjs-telegraf decorators           -> @maxhub Bot handlers
  -> TelegramUpdate                       -> MaxUpdate
           \                              /
            -> ClientWorkflowService
            -> RegistrationsService / TicketsService / ServiceRequestsService
            -> TypeORM repositories
            -> PostgreSQL
            -> direct context reply or MessengerRouterService
            -> Telegram/MAX API
```

There is no normalized incoming event model. Both update classes extract their
own identities, callback payloads, text and media, then call a partially shared
application layer.

## Telegram path

1. `src/app.module.ts` configures `TelegrafModule` with `BOT_TOKEN`.
2. `src/telegram/telegram.module.ts` registers `TelegramUpdate`, four legacy
   text handlers and a module-local `UserContextService`.
3. `src/telegram/telegram.update.ts` receives `/start`, callback queries and
   messages through `@Start`, `@Action` and `@On`.
4. It calls `ClientWorkflowService` for registration, simple requests, ATOL
   consent and tickets. FN replacement and some legacy admin/operator paths call
   domain services directly.
5. Most interactive replies use `ctx.reply`/`ctx.editMessageText`. Cross-chat
   delivery uses either `ctx.telegram` or `MessengerRouterService`.
6. Telegraf polling is disabled when `BOT_POLLING_ENABLED=false`.

The 740-line update class still owns presentation, keyboard decisions, media
extraction, mode routing, callback parsing and parts of business orchestration.

## MAX path

1. `src/max/max.module.ts` registers `MaxUpdate` and a separate module-local
   `UserContextService`.
2. `MaxUpdate.onModuleInit()` checks `BOT_POLLING_ENABLED`, reads
   `MAX_BOT_TOKEN`, creates an `@maxhub/max-bot-api` `Bot`, registers handlers
   and starts polling.
3. `bot_started`, `/start`, actions and `message_created` are routed inside
   `src/max/max.update.ts`.
4. The same shared workflow/domain services are called, but input extraction,
   menus, callback parsing and response presentation are independently
   implemented.
5. `onModuleDestroy()` stops the receiving bot.

`MaxMessengerService` creates another MAX `Bot` instance for outgoing messages
and uploads. Its lifecycle is separate from the polling client.

## Shared application and domain code

| Concern | Main implementation |
|---|---|
| Channel identity and orchestration | `src/client/client-workflow.service.ts` |
| User/channel records | `src/users/users.service.ts` |
| Registration answers, photo and PDF | `src/registrations/registrations.service.ts` |
| Questions and chat history | `src/tickets/tickets.service.ts` |
| Service request flows and operator transitions | `src/service-requests/service-requests.service.ts` |
| ATOL consent workflow | `ServiceRequestsService` plus `ClientWorkflowService` |
| File metadata and policy | `src/files/files.service.ts`, `src/files/file-policies.ts` |
| Local object storage | `src/files/local-file-storage.provider.ts` |
| Admin recipient selection | `src/admin/admin-notifications.service.ts` |
| Outgoing platform selection | `src/messenger/messenger-router.service.ts` |

The shared layer is real but incomplete. Platform handlers still decide when a
workflow begins and ends, which state to retain, which message to show, how to
download media and whether to call a shared service or a repository-facing
service directly.

## State and persistence boundaries

- `UserContextService` is an in-process `Map`, keyed by `platform:chatId`.
- Telegram and MAX receive different service instances because each module
  provides the service locally.
- Registration drafts, service request drafts, tickets, ticket messages and
  ATOL answers are stored in PostgreSQL.
- Operator connection data is also stored in `users.talkingTo`, while the mode
  that activates forwarding is only in memory.
- There is no update inbox, platform update ID, workflow lock, optimistic
  version or idempotency key.

## Outgoing delivery

`MessengerRouterService` selects `TelegramMessengerService` or
`MaxMessengerService`. A missing platform defaults to Telegram. Business writes
and external sends are not coupled by a transaction or durable outbox. Admin
notification errors are caught and printed; client delivery errors generally
propagate after the database change has already committed.

## Dependency direction

The Nest module graph inspected in this audit contains no proven circular
module dependency. The main undesirable directions are:

- platform handlers call both `ClientWorkflowService` and lower-level domain
  services;
- shared workflows accept platform-specific media metadata and channel IDs;
- business services initiate external delivery directly;
- presentation and workflow transition decisions remain in both update files.

## Startup, shutdown and CI isolation

- `BOT_TOKEN` is mandatory even when only MAX or offline operation is desired.
- `BOT_POLLING_ENABLED` controls both platforms and defaults to `true`.
- `MAX_BOT_TOKEN` is optional; an empty value disables MAX.
- No webhook mode exists.
- MAX polling has explicit shutdown. Telegram lifecycle is delegated to
  `nestjs-telegraf`.
- `.github/workflows/ci.yml` sets a fake Telegram token, empty MAX token and
  polling off.
- `scripts/ci-guard.mjs` rejects non-test mode, enabled polling, a non-empty MAX
  token, a non-`ci-` Telegram token, unsafe test database naming/hosts and
  repository-local test storage.

## File map for IDE study

- `src/app.module.ts`, `src/app.config.ts`
- `src/telegram/telegram.module.ts`, `src/telegram/telegram.update.ts`
- `src/telegram/handlers/**`, `src/telegram/keyboards/**`
- `src/max/max.module.ts`, `src/max/max.update.ts`
- `src/userContext/user-context.service.ts`
- `src/client/client-workflow.service.ts`
- `src/messenger/**`
- `src/registrations/**`, `src/tickets/**`, `src/service-requests/**`
- `src/admin/admin-notifications.service.ts`
- `src/files/**`

## Decomposition map

After characterization coverage exists, the large handlers can be separated
into a small platform adapter, normalized event router, workflow application
service, message presenter, action/keyboard builder and delivery port. The
current `ClientWorkflowService` and messenger interface are useful starting
points. Small platform-specific extraction functions and genuinely different
UX should remain platform-specific.
