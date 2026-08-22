# Code-health audit after pre-production legacy purge

**Дата аудита:** 2026-08-22
**Исходная baseline:** `335d5aa9035daabc78967f1ec16c710292dcf93c` (`main`, merge commit PR #11)
**Ветка аудита:** `codex/code-health-audit-post-purge`
**Статус:** документационный аудит; прикладной код, данные БД и runtime storage не изменялись.

## 1. Executive summary

После PR #11 проект представляет собой работающий модульный монолит NestJS с одной
чистой TypeORM baseline migration (`InitialPreproductionBaseline1787388476982`),
двумя React-приложениями и общими канальными адаптерами Telegram/MAX. Локальная
baseline-проверка, миграции, unit/integration/e2e-наборы, production builds и
offline smoke прошли на изолированных audit DB/storage.

Консолидация после purge не создала второй модели заявок: `ServiceRequestEntity`
является каноническим aggregate для web, Telegram, MAX, ручной работы в админке и
интеграционных возможностей. Web workflow уже применяет транзакции, advisory locks,
pessimistic locks, optimistic version checks и submit idempotency. Organization
access и KKT readiness также имеют целевые блокировки и проверяемые ограничения.

Однако в канальных сценариях остаются два high reliability/correctness риска:

1. Входящие bot callbacks не привязаны к версии/шагу и не обрабатываются как
   durable, последовательно сериализованные команды. Повтор старой кнопки может
   записать ответ в следующий шаг; параллельные delivery могут создавать дубликаты
   или терять обновление.
2. Исходящая доставка клиенту и сотрудникам не имеет общего durable delivery
   record/outbox/retry contract. В разных путях provider call расположен либо до,
   либо после DB write, поэтому повтор или ошибка может дать потерянное уведомление,
   сообщение без истории либо дубликат.

Это не требует смены архитектуры, микросервисов или возврата legacy. Рекомендуемый
verdict -- **B**: до adversarial security review нужен ограниченный code-health
remediation package для входящих и исходящих messenger side effects. Catalog + Orders
не заблокирован архитектурно, но будущие счета, документы и уведомления заказа
должны использовать исправленные delivery/file lifecycle границы.

**Finding count:** blocker **0**, high **2**, medium **2**, low **1**,
informational **1**.

## 2. Scope, exclusions and sources

### Scope

- Актуальный `main` на указанной baseline и diff/история PR #11.
- NestJS modules, controllers, application services, entities, migration baseline,
  bootstrap, tests, scripts, CI-oriented commands и UI serving.
- Canonical service requests, organization access, KKT readiness, Tickets,
  FileStorage, Telegram/MAX adapters, `client-ui` и `admin-ui` с точки зрения
  code health и testability.
- Активная документация вне `docs/history/preproduction/`.

### Exclusions

Не проводились adversarial security review, database-integrity audit, полный
test-gap audit, Catalog + Orders architecture audit, рефакторинг, изменение
API/схемы/моделей, внешние вызовы Telegram/MAX/АТОЛ/ОФД и работа с production
ресурсами. Production deployment, DB и storage по baseline не существуют.

### Sources reviewed

1. Актуальный код, entities и `src/database/migrations/1787388476982-InitialPreproductionBaseline.ts`.
2. Текущие unit, integration, e2e и offline smoke tests.
3. `package.json`, CI/test scripts, config guards и database tooling.
4. Активные `docs/`, Git history/PR #11 и hosted CI main.
5. Исторические pre-production reports только как контекст; их findings не были
   перенесены без повторного доказательства на этой baseline.

## 3. Baseline and command results

### Git baseline

- `git status` / `git status --short`: рабочее дерево было чистым до создания
  настоящего отчёта.
- `git fetch --prune origin`, `git branch --show-current`, `git rev-parse HEAD`,
  `git rev-parse origin/main`, `git log --oneline --decorate --graph -40`,
  `git branch -vv` и проверка PR подтвердили `main == origin/main ==`
  `335d5aa9035daabc78967f1ec16c710292dcf93c`.
- PR #11 был merged, его merge commit был зелёным в hosted CI. Новая audit branch
  создана только после этой проверки.

### Local reproducible checks

Во всех DB-проверках использовались только отдельные audit databases
`vitma_code_health_audit_app` и `vitma_code_health_audit_test`, временный storage
root в `%TEMP%`, `BOT_POLLING_ENABLED=false`, пустой MAX token и fake local token.
Реальные messenger/provider API не вызывались.

| Command | Result | Evidence |
| --- | --- | --- |
| `npm ci` | Passed | Lockfile-resolved dependency tree, including `@maxhub/max-bot-api@0.2.5`. |
| `npm run migration:run` | Passed | Fresh audit application DB applied exactly `InitialPreproductionBaseline1787388476982`. |
| `npm run migration:show` / `npm run schema:log` | Passed | One applied migration; schema log reports `Your schema is up to date`. |
| `npm run migration:test:show` / `npm run schema:test:log` | Passed | Isolated test DB has the same one-migration history and no pending schema SQL. |
| `npm run ci:quality` | Passed | Config guard, lint ratchet and unit tests passed; unit result: 20 suites, 93 tests. |
| `npm run ci:database` | Passed | Test DB reset/migrations/repeat/schema drift checks, then 8 integration suites/56 tests and 2 e2e suites/7 tests. |
| `npm run ci:build` | Passed | `admin-ui` Vite build, `client-ui` TypeScript/Vite build and Nest build passed. |
| `npm run ci:offline-smoke` | Passed | `/site`, nested site route, admin login/logout, offline Nest bootstrap and health/UI smoke passed. |

`lint:baseline` intentionally ratchets rather than fixes inherited debt; it passed
with the current recorded baseline of **932 errors and 10 warnings in 81 files**.
This audit introduced no new lint debt.

## 4. Module and dependency map

```text
main.ts
  -> AppModule (Config, TypeORM with synchronize:false, ValidationPipe/UI/bootstrap)
      -> Users / Organizations / CustomerActivity
      -> Registrations + RegistrationReadiness + PDF
      -> ServiceRequests + ServiceForm + Tickets
      -> Files (StoredFile + FileStoragePort)
      -> Admin + WebSession + Audit
      -> Telegram / MAX adapters
           -> MessengerRouter -> platform-specific messenger services
           -> ClientWorkflow / canonical ServiceRequests facades
      -> Client / Site / Assets / UiServing
           -> built client-ui and admin-ui bundles
      -> Integrations bridges, Health, backup scripts
```

### Actual responsibilities

| Area | Main entry/owner | Consumers | State |
| --- | --- | --- | --- |
| Bootstrap/config | `src/main.ts`, `src/app.module.ts` | all server modules | active |
| Canonical service requests | `ServiceRequestsService`, `ServiceRequestChannelWorkflowService`, `ServiceFormService` | web API, admin, bots, integrations | active; channel facade remains compatibility-oriented |
| Registrations/readiness | `RegistrationsService`, `RegistrationReadinessService` | web, admin, Telegram, MAX, PDF | active |
| Organization access | `OrganizationAccessService` | web/client and admin review | active |
| Dialog/tickets | `ClientWorkflowService`, `TicketsService` | Telegram, MAX, admin | active |
| Files | `FilesService`, `FileStoragePort`, `StoredFileEntity` | tickets, requests, registrations, PDFs | active |
| Messenger adapters | `telegram.update.ts`, `max.update.ts`, router/services | client and staff notifications | active |
| React applications | `client-ui`, `admin-ui`, `UiServingService` | browser users | active |
| Integration bridges | `src/integrations`, scripts | future/import flows | active but not exercised against external providers |
| Migration/test/backup tooling | `src/database`, `scripts/` | local/CI operations | active |

### Dependency and boundary observations

- No NestJS module cycle and no `forwardRef` were found. Static import analysis found
  one two-file TypeORM relation cycle:
  `admin-user.entity.ts -> admin-user-role.entity.ts -> admin-user.entity.ts`.
  It is the expected bidirectional `OneToMany`/`ManyToOne` entity relation, not a
  module cycle and not a current blocker.
- No controller directly injects a TypeORM repository. Controllers route through
  application services.
- No dynamic imports were found in the source scan that would invalidate the
  static dependency conclusion.
- `ServiceRequestsService` contains canonical web workflows and delegates channel
  operations to `ServiceRequestChannelWorkflowService`. The delegate methods are
  active consumers of a compatibility-facing API, but they do not create a second
  ServiceRequest model or duplicated write implementation. Removing the facade now
  would be unsafe without a deliberate consumer-contract migration.
- Telegram and MAX preserve platform presentation/SDK differences, but both still
  combine menu routing, registration, tickets, simple requests, FN replacement,
  ATOL consent and operator-dialog orchestration. This is architectural friction,
  not an independently proven functional defect.

## 5. Findings by severity

### High

#### CH-001 -- Channel callbacks are not version-bound or durably serialized

- **Category:** confirmed correctness defect and inbound reliability risk.
- **Severity / confidence:** high / confirmed.
- **Files and symbols:**
  - `src/service-requests/service-request-channel-workflow.service.ts`:
    `start` (224), `startAtolConsent` (300), `getLatestDraftForClient` (506),
    `answer` (632).
  - `src/telegram/telegram.update.ts`: `onServiceRequestButtonAnswer` (698),
    `replyServiceRequestStep` (1064).
  - `src/max/max.update.ts`: callback handler (184),
    `replyServiceRequestStep` (737).
- **Observable behavior:** inline callback data is
  `serviceRequestAnswer:<requestId>:<value>`. It carries neither the expected
  `currentStep`, nor entity version, nor a one-time command nonce. `answer()` loads
  the current aggregate, takes its *current* step, writes the supplied value, then
  increments `currentStep` and calls a plain repository `save`.
- **Exact evidence:** in the FN replacement flow, the `15`/`36` buttons are shown
  for `fiscalDriveTerm`, followed by free-text `contactForCall`. After selecting
  `15`, a delayed duplicate tap of the same original callback is accepted as the
  now-current contact value (`"15"`) and increments the flow. The code has no
  lock or expected-version predicate in the channel `answer()` path. `start()` and
  `startAtolConsent()` also implement read-existing-then-insert without a
  transaction/advisory lock/partial uniqueness constraint for an active channel
  draft.
- **Realistic failure scenario:** messenger delivery is retried, the user taps an
  old keyboard, or two bot workers receive concurrent updates. The request can
  contain a wrong contact/skip a step, two active drafts can be created, or
  concurrent read-modify-write operations can overwrite each other. The web API
  already guards comparable operations with locks/version/idempotency; this gap is
  limited to the channel path and related registration/ticket draft patterns.
- **Impact / affected flows:** Telegram/MAX simple service requests, FN replacement,
  ATOL consent draft creation; the same process has analogous check-then-write
  risks for registration/ticket dialog starts. It can corrupt the canonical
  request's structured answers and create operationally confusing duplicates.
- **Production data/access required:** no. It is reproducible on an isolated test
  DB with fake adapters and concurrent promises/callback replay.
- **Minimal remediation direction:** make bot input a durable, idempotent command
  boundary. Scope each callback to expected step/version or a server-side nonce;
  serialize/lock each dialog command; add the minimal DB invariant for one active
  draft where the business rule requires it; preserve existing flow semantics.
- **Required tests:** fake-adapter replay of an old `15/36` callback; parallel
  starts; parallel answers; duplicate provider update delivery; restart/resume
  behavior; a regression test proving web locking stays intact.
- **Blocks adversarial security review:** yes. This is not an access-control
  vulnerability by itself, but it makes the canonical customer workflow
  materially nondeterministic and should be corrected before reviewing a stable
  security target.
- **Catalog + Orders effect:** not an architectural blocker, but the same channel
  command boundary must be reused before bot-based order confirmation is added.

#### CH-002 -- Messenger delivery has no durable recovery contract

- **Category:** reliability and recovery risk.
- **Severity / confidence:** high / confirmed.
- **Files and symbols:**
  - `src/service-requests/service-request-channel-workflow.service.ts`:
    `attachInvoice` (734), `notifyClientAboutInvoice` (1029).
  - `src/service-requests/service-requests.service.ts`: `addStaffMessage` (757),
    `transitionByStaff` (786).
  - `src/admin/admin.service.ts`: `sendTicketMessage` (701), `sendTicketMedia` (730).
  - `src/admin/admin-notifications.service.ts`: `notifyDocument` (60), `safeSend` (95).
- **Observable behavior:** no common persistent delivery attempt/status/outbox
  exists for client or staff messages. `attachInvoice()` saves `waiting_payment`
  and then sends the invoice; a provider error leaves the request changed but the
  client unnotified. `sendTicketMessage()` sends through the provider before
  persisting history; a DB failure after a successful send leaves the client-visible
  message without local history. Notification helper failures are logged and
  swallowed, without retry state.
- **Exact evidence:** the paths above use direct `messengerService.send*` calls in
  different orders relative to `Repository.save`; none records a delivery key,
  provider result, failure or retry schedule. `RegistrationReadinessService`
  provides a partial counterexample: its data request tracks delivery
  `delivered`/`delivery_failed` and can retry, but this behavior is not shared by
  other communication flows.
- **Realistic failure scenario:** Telegram/MAX times out after a DB commit, or a
  database write fails after the provider accepts a request. An operator retries
  manually: the customer can receive a duplicate, miss an invoice, or see a
  message absent from the ticket/request history.
- **Impact / affected flows:** service-request invoice, status transitions and
  staff messages; ticket text/media; staff notifications. This can delay payment,
  produce an incomplete operator record and obscure recovery work.
- **Production data/access required:** no. Fake messenger and forced repository
  failures on an isolated DB are sufficient.
- **Minimal remediation direction:** introduce a small transactional outbox or
  durable delivery-attempt model inside the existing monolith. Persist the intended
  command with the domain transition, send from a retryable worker, and expose a
  stable result/failure state. Do not turn this into a new service or change
  provider SDKs.
- **Required tests:** provider failure after commit; provider success followed by
  DB failure; retry/no duplicate guarantee using idempotency keys where available;
  message-history consistency; registration data-request behavior remains
  compatible; worker recovery after restart.
- **Blocks adversarial security review:** yes. It is a correctness/recovery issue,
  not an incidental security defect, but it should be resolved to make message and
  document side effects auditable during the review.
- **Catalog + Orders effect:** yes. Orders will need invoice/document delivery and
  manager/customer notifications; they should build on this contract rather than
  duplicate the unsafe ordering.

### Medium

#### CH-003 -- Active dialog mode is process-local and disappears on restart

- **Category:** reliability and recovery risk.
- **Severity / confidence:** medium / confirmed.
- **Files and symbols:** `src/userContext/user-context.service.ts`,
  `UserContextService.contexts`; Telegram/MAX handlers that branch on this mode.
- **Observable behavior / exact evidence:** the complete context store is a private
  in-memory `Map<string, UserContext>`. It is provided in the bot modules, not
  persisted with the existing `ServiceRequest`, `RegistrationRequest` or `Ticket`
  records. A new Nest process starts with an empty map.
- **Realistic failure scenario:** after a deployment/crash/restart, the user's
  persisted draft still exists, but the next ordinary message is interpreted in
  `IDLE` mode until the user explicitly restarts/resumes through a menu. In a
  multi-instance deployment the same user may reach a different empty map.
- **Impact / affected flows:** multi-step registration, service request, ticket and
  ATOL-consent dialog entry points. Data normally survives; smooth continuation
  does not.
- **Production data/access required:** no; construct a fresh context service around
  an existing aggregate in a test.
- **Minimal remediation direction:** persist only the minimal active-dialog command
  state or deterministically derive it from the active aggregate, with an explicit
  recovery/resume route. Keep ephemeral presentation state ephemeral.
- **Required tests:** process-restart simulation for each dialog kind and a
  multi-instance-safe resume test with fake adapters.
- **Blocks adversarial security review:** no by itself.
- **Catalog + Orders effect:** no direct blocker, but future conversational order
  flows should not add another in-memory state machine.

#### CH-004 -- File lifecycle has orphan and retention gaps

- **Category:** reliability/recovery and maintainability debt.
- **Severity / confidence:** medium / confirmed.
- **Files and symbols:**
  - `src/files/files.service.ts`: `saveBuffer` (29), `logicalDelete` (107).
  - `src/tickets/tickets.service.ts`: `addMediaMessage` (171).
  - `src/admin/admin.service.ts`: `sendTicketMedia` (730).
  - `src/service-requests/service-requests.service.ts` and
    `src/registrations/registration-readiness.service.ts`: relation-failure
    compensations.
- **Observable behavior / exact evidence:** `FilesService.saveBuffer()` correctly
  removes the physical object when metadata insertion fails, and web service
  attachments/readiness evidence compensate some relation failures. In contrast,
  `TicketsService.addMediaMessage()` writes `StoredFile` then saves the message with
  no compensation; `sendTicketMedia()` writes the file before provider delivery and
  message persistence. A subsequent failure leaves active unreferenced metadata and
  content. `logicalDelete()` only sets `status = 'deleted'`; no physical deletion,
  retention worker or reconciliation sweep exists.
- **Realistic failure scenario:** a provider/database outage after upload leaves a
  ticket-media object with no usable message. Repeated retries accumulate orphans;
  logically deleted documents remain physically stored indefinitely and enter
  backups.
- **Impact / affected flows:** ticket media now; future invoices, order documents
  and product images if they reuse the same path. `FilesService.open()` prevents
  serving non-active content, so this finding does not claim a demonstrated public
  disclosure.
- **Production data/access required:** no. Fault injection around message save/send
  and a temporary storage root reproduce it.
- **Minimal remediation direction:** add a minimal reconciliation and retention
  policy around the existing `StoredFile`/FileStoragePort boundary, and use a
  compensating helper for write-then-relate flows. Do not introduce distributed
  transactions or a new storage provider in this package.
- **Required tests:** forced relation/provider failures; idempotent orphan scan;
  missing-file transition; safe physical deletion after retention; no deletion of
  referenced/PDF/evidence files.
- **Blocks adversarial security review:** no by itself; it should be addressed
  before file-heavy Catalog + Orders workflows.
- **Catalog + Orders effect:** yes for invoice/order files and product media volume.

### Low

#### CH-005 -- Active documentation still describes the already-merged purge as pending

- **Category:** cleanup/documentation drift.
- **Severity / confidence:** low / confirmed.
- **Files and symbols:** `docs/architecture/preproduction-baseline.md` (around 102)
  and `docs/ROADMAP.md` (around 15).
- **Observable behavior / exact evidence:** the architecture note still says the
  purge is a reviewable feature branch/draft PR; the roadmap labels pre-production
  rebaseline `In review`. PR #11 is merged into the audited `main` baseline.
- **Realistic failure scenario / impact:** a future contributor follows stale
  status and treats the old migration/purge decision as undecided. It does not
  change runtime behavior.
- **Affected flows:** contributor onboarding and release planning only.
- **Production data/access required:** no.
- **Minimal remediation direction:** one small docs-only update of current status,
  baseline SHA and the next approved package; leave historical documents intact.
- **Required tests:** link/path check and a manual cross-check against `main`/PR #11.
- **Blocks adversarial security review / Catalog + Orders:** no / no.

### Informational

#### CH-006 -- Five direct dependencies have no in-repository consumer

- **Category:** maintainability/dependency hygiene.
- **Severity / confidence:** informational / probable.
- **Files and symbols:** `package.json` dependencies
  `@heyputer/puter.js`, `gigachat`, `openai`, `pdfkit`, `telegraf-session-local`.
- **Exact evidence:** repository-wide static search outside `node_modules` found no
  source, test, script or configuration import/reference for these package names;
  the only matches were dependency declarations. `pdfmake`, in contrast, has an
  active consumer in `src/pdf/pdf.service.ts`.
- **Realistic failure scenario / impact:** unnecessary install surface, lockfile
  churn and possible advisories; no runtime failure was observed and dynamic
  external use has not been claimed.
- **Production data/access required:** no.
- **Minimal remediation direction:** a separate small dependency hygiene change
  only after a final static search, clean install, build and full test suite. Do
  not remove packages automatically based on this audit.
- **Required tests:** `npm ci`, `ci:quality`, `ci:database`, `ci:build` and offline
  smoke after each deliberately removed declaration.
- **Blocks adversarial security review / Catalog + Orders:** no / no.

## 6. Classification of results

### Confirmed correctness defects

- **CH-001:** stale channel callback can advance/write the wrong current step; the
  same command paths lack durable concurrency control for incoming duplicate work.

### Reliability and recovery risks

- **CH-001:** duplicate/reordered inbound bot work can create duplicate drafts or
  lose updates.
- **CH-002:** no common durable outgoing delivery/retry contract.
- **CH-003:** active dialog context is lost on process restart.
- **CH-004:** orphaned file/content and unbounded logically deleted content.

### Architectural friction (not standalone mandatory findings)

- `telegram.update.ts` (43.6 KiB) and `max.update.ts` (46.6 KiB) own several
  independent conversational domains. There is no proven Telegram/MAX behavioral
  divergence after the current tests; extraction should be incremental and follow
  characterization tests, not a rewrite.
- `ServiceRequestsService` (46.4 KiB) and
  `ServiceRequestChannelWorkflowService` (39.5 KiB) form a deliberate canonical
  core plus active channel facade. The facade should remain until a consumer
  migration plan exists; it is not dead code.
- Large but not independently defective UI/service files include
  `admin-ui/src/App.tsx` (105.5 KiB),
  `client-ui/src/pages/ServiceRequestPage.tsx` (36.9 KiB),
  `RegistrationReadinessService` (42.1 KiB) and `IntegrationsService` (40.4 KiB).
  Their size alone is not a refactoring trigger.

### Maintainability debt

- **CH-006:** probable unused direct dependencies.
- Existing lint ratchet debt remains at 932 errors/10 warnings, but the ratchet
  passes and this audit added none.
- The MAX adapter still contains broad `any` usage; it is a known typing/maintenance
  debt, not evidence of a new current correctness defect.

### Testability problems

Current tests are strong for web ServiceRequest locking/idempotency, organization
access races and registration readiness locking. They do **not** cover the exact
channel callback replay/concurrent command cases in CH-001, provider failure/order
cases in CH-002, restart recovery in CH-003, or ticket media orphan recovery in
CH-004. These are targeted characterization tests required by the proposed packages,
not a request for a full coverage project.

### Documentation drift

- **CH-005** is the only confirmed active-document drift found in scope.

### Incidental security observations

No obvious critical security issue was identified within this code-health-only
scope. This is **not** a security approval: the planned adversarial review remains
necessary once CH-001 and CH-002 provide a stable, auditable side-effect boundary.

## 7. Status of previously known debt

| Topic | Status | Current evidence and conclusion |
| --- | --- | --- |
| Large Telegram handler | still present | 43.6 KiB; multiple dialog responsibilities remain, with partial text-handler extraction. |
| Large MAX handler | still present | 46.6 KiB; multiple responsibilities and broad SDK-facing `any` remain. |
| Durable deduplication | still present | Web submit is guarded; incoming Telegram/MAX commands lack a durable provider-event key. |
| Outbox/retry | partially resolved | Registration data requests track a limited delivery result/retry path; general client/staff delivery does not. |
| Delivery status | partially resolved | `registration_data_requests` records delivered/failed state; message/invoice/ticket paths do not share it. |
| Process-local idempotency | still present | No durable update identity or cross-process command serialization. |
| Persisted workflow state | partially resolved | Domain aggregates persist; `UserContextService` mode is an in-memory map. |
| Stale callbacks | still present | `serviceRequestAnswer:<id>:<value>` has no expected step/version/nonce. |
| Sequential per-dialog processing | still present | No queue or DB serialization around channel start/answer paths. |
| Provider URLs/identifiers | resolved | Ticket media requires a materialized buffer and persists `StoredFile`, not transient provider URLs. |
| FileStorage retention/lifecycle | still present | Logical delete has no retention/physical cleanup or reconciliation process. |
| DB/FileStorage consistency | partially resolved | `saveBuffer` and selected request/readiness relations compensate failures; ticket/admin media paths do not. |
| Lint ratchet debt | still present | Baseline is 932 errors/10 warnings; ratchet passes without new debt. |
| Mock catalog/localStorage checkout | still present | Intentional frontend demo until the Catalog + Orders package, not legacy code. |
| Duplicate ServiceRequest facade | partially resolved | One canonical entity/core exists; active delegation facade remains for channel consumers and is not safe to remove now. |
| Legacy UI | resolved | UI serving targets built React admin/site bundles; no active legacy HTML fallback was found. |
| Compatibility migrations/backfills | obsolete | PR #11 reset the pre-production baseline; no active compatibility migration/backfill path remains. |

## 8. Areas reviewed with no new finding

- **Canonical ServiceRequest model:** one current aggregate supports web, bots,
  admin and integrations; no parallel `ServiceRequestV2` or old pre-production
  entity path was found.
- **Web request correctness:** web draft/update/submit paths use transactions,
  advisory/pessimistic locking, expected version and submit idempotency; current
  integration tests pass.
- **Organization access:** pending request -> reviewed membership rule is guarded by
  advisory/pessimistic locks and a pending unique partial index. No path granting
  automatic active membership was found; concurrency integration tests pass.
- **KKT readiness:** requirement/evidence/data request relations use FK-backed
  entities; writes use locks; handoff and final PDF recheck readiness; OFD code is
  masked and response callbacks use UUID context. No runtime auto-verification
  regression was found.
- **Baseline/migrations:** `synchronize:false`, clean migration run/repeat/show/log
  all pass. No legacy migration compatibility behavior was found.
- **Controller/repository boundary:** no direct controller repository injection was
  found in the scan.
- **Module cycles:** no Nest module cycle/`forwardRef`; only the expected TypeORM
  entity relation cycle described above.
- **UI serving/contracts:** production builds and offline browser/admin smoke pass;
  no route depending on removed legacy UI was found.
- **Polling/offline isolation:** CI guard/offline checks passed with polling disabled
  and fake/empty provider configuration.

## 9. Limitations

- This report is based on static code review and isolated local tests, not real
  provider behavior or production traffic.
- No historical data migration drill was appropriate: the stated baseline has no
  production deployment/data and pre-production legacy has been intentionally purged.
- The audit did not attempt hostile authorization testing, full schema/data
  integrity analysis, load testing, exhaustive API contract testing or external
  integration testing.
- Absence of a finding is not proof that a path is defect-free; it means no
  code-backed issue was established within this bounded audit.

## 10. Verdict

### **B -- first complete a limited code-health remediation package**

- **Can adversarial security review start now?** No. First close CH-001 and CH-002
  with the listed regression/failure tests so that client commands and provider side
  effects are stable and auditable.
- **Is there a data loss/inconsistency risk?** Yes. CH-001 can corrupt or duplicate
  workflow state; CH-002 can lose delivery/history consistency; CH-004 can leave
  file/storage orphans. No critical access-control issue was established here.
- **Does anything block future Catalog + Orders?** No architecture blocker. Before
  order invoices/documents and bot order confirmations are built, use the resolved
  command/delivery/file boundaries from the remediation sequence.
- **Is an immediate architecture change required?** No. Keep the modular NestJS
  monolith, PostgreSQL and existing adapters; no microservices or wholesale rewrite.
- **Mandatory before security review:** CH-001 and CH-002.
- **Recommended but non-blocking:** CH-003 and CH-004; CH-005/CH-006 are hygiene.
- **Old debts no longer applicable:** active legacy UI and compatibility
  migrations/backfills; a second ServiceRequest model was not found.

## 11. Recommended remediation sequence

### Package CH-R1 -- Durable inbound channel commands

- **Goal:** eliminate CH-001 and make active dialog resumption from CH-003
  deterministic.
- **Included findings:** CH-001, CH-003.
- **Work:** command idempotency keyed to provider update where available; callback
  expected-step/version or server nonce; per-dialog serialization/transactional
  handling; minimal persisted or derivable active-dialog recovery state; DB
  uniqueness only where the active-draft business invariant requires it.
- **Explicitly excluded:** outbox/retry, UI redesign, universal BPM engine, new
  messenger SDKs and changes to business statuses.
- **Acceptance criteria:** repeated stale button cannot change a later step;
  concurrent starts create the intended single active draft; concurrent answers do
  not skip/overwrite data; restart resumes the exact workflow; existing Telegram,
  MAX and web flows remain compatible.
- **Required tests:** fake-provider replay, concurrent update, stale callback,
  restart/multi-instance resume and migration constraint tests.
- **Migration impact:** likely additive index/table(s) for durable ingress/dialog
  state; design must be reviewed against the clean baseline before implementation.
- **Rollback:** additive state can be retained; stop consuming new command records
  only after ensuring pending commands remain replay-safe.
- **Required order:** first.

### Package CH-R2 -- Durable outbound delivery

- **Goal:** resolve CH-002 with one reliable delivery contract for client and staff
  messenger actions.
- **Included findings:** CH-002.
- **Work:** transactional outbox or durable delivery-attempt records inside the
  current monolith, retryable worker, idempotency/delivery state and conversion of
  invoice/status/ticket/admin-notification paths.
- **Explicitly excluded:** SMS/email providers, external queues/microservices,
  customer-facing chat redesign and unrelated refactoring.
- **Acceptance criteria:** domain transition and intended delivery are atomically
  recorded; transient provider failure retries safely; provider success plus DB
  failure cannot silently erase history; operators can see failed delivery state.
- **Required tests:** fake provider timeout/success, forced DB failure, restart
  recovery, duplicate-attempt suppression and compatibility with readiness data
  requests.
- **Migration impact:** additive outbox/delivery tables and indexes.
- **Rollback:** retain pending/sent records; disable worker only with an explicit
  recovery procedure so delivery intent is not discarded.
- **Required order:** after CH-R1; it may share test fakes but not implementation.

### Package CH-R3 -- FileStorage recovery and retention

- **Goal:** resolve CH-004 before file-heavy order/catalog use.
- **Included findings:** CH-004.
- **Work:** central compensating helper for write-then-relate flows, auditable
  orphan reconciliation, retention policy and safe physical deletion through the
  existing FileStoragePort.
- **Explicitly excluded:** cloud migration, virus scanning rollout, catalogue image
  features and a distributed transaction.
- **Acceptance criteria:** faulted ticket/admin media writes do not leave active
  unreachable files; reconciliation is idempotent; referenced files survive;
  deleted files are removed only after a documented retention period.
- **Required tests:** injected repository/provider failures, reconciliation/retention
  integration tests and missing-object behavior.
- **Migration impact:** possibly none; add metadata/state only if the agreed
  retention design needs it.
- **Rollback:** reconciliation must be dry-run/auditable first; never delete a
  referenced object during rollback.
- **Required order:** after CH-R2 or in parallel only if its files/tables do not
  overlap; complete before order documents/product-media volume is introduced.

Small documentation correction for CH-005 and deliberate removal of CH-006
dependencies can be separate non-blocking hygiene PRs. They are intentionally not
mixed into the three reliability packages.

## 12. Audit integrity declaration

- Only this new audit report is permitted to be committed from this task.
- No files in `src/`, `client-ui/`, `admin-ui/`, `migrations/`, `test/`, `scripts/`,
  CI configuration, package files or environment files were changed.
- No development/production DB, runtime storage, dump, backup or external provider
  data was modified. Temporary audit DB/storage resources were isolated from the
  application resources.
- This report does not merge or start a remediation package.
