# BKV1-2: KKT registration parity

Дата реализации: 2026-08-19. Базовый commit: `e7779f25c97ddcf811230634dd7fe9d7840b424c`.

## Утверждённое правило

> Фотографии ККТ, ФН и кода ОФД не блокируют первичную отправку анкеты. До начала работы инженера все применимые данные должны быть получены из доверенного источника и подтверждены оператором. При покупке ОФД у VITMA клиент не обязан предоставлять собственный код, но код должен быть привязан до готовности заявки.

## Старые потоки и расхождения

| Данные/действие       | Telegram                               | MAX                       | Web                      | Admin                                       | Backend source of truth                 |
| --------------------- | -------------------------------------- | ------------------------- | ------------------------ | ------------------------------------------- | --------------------------------------- |
| Создание анкеты       | Пошаговые `RegistrationField`          | Тот же набор полей        | Динамическая форма       | Просмотр                                    | `registration_requests`                 |
| Первичный submit      | Требовал общее фото                    | Требовал общее фото       | Фото не загружал         | Не создаёт                                  | `RegistrationsService.finishReg`        |
| Фото                  | Одно общее фото комплекта              | Одно общее фото комплекта | Не поддерживалось        | Только просмотр                             | legacy `equipmentPhotoFileId`           |
| ККТ/ФН/ОФД            | Не разделялись на проверяемые элементы | Аналогично                | Аналогично               | Значения из комплекта показывались отдельно | `EquipmentKit`, частично анкета         |
| PDF                   | Генерировался при submit               | Аналогично                | Генерировался при submit | Скачивание                                  | `pdfFileId`/`pdfPath`                   |
| Завершение оператором | Telegram callback `regDone`            | Web-admin                 | Web-admin                | `process`/status                            | `isProcessed` без server readiness gate |

Допустимая разница UX сохранена: боты ведут пошаговый диалог, web отправляет форму целиком. Нарушавшие правило различия устранены: фото теперь можно пропустить во всех каналах, а поздние данные проходят один checklist и один application service.

## Целевой контракт

`RegistrationRequestEntity` остаётся корнем агрегата. Параллельная `RegistrationV2` не создана. При создании или первом обращении идемпотентно появляются три специализированных требования:

- `kkt_serial`;
- `fiscal_drive_serial`;
- `ofd_code`.

Состояния: `missing`, `requested`, `provided`, `verified`, `not_required`.

Источники: `internal_registry`, `customer_input`, `customer_photo`, `sold_by_vitma`, `operator_input`, `external_system`, `legacy`.

Наличие значения само по себе не означает `verified`. Клиент может только предоставить значение или evidence. `verify` и `not_required` доступны через существующее permission `registrations.update`.

## Таблицы

### `registration_requirements`

Хранит каноническое значение отдельно от evidence, источник, состояние, даты запроса/предоставления/проверки, проверившего сотрудника, причину `not_required`, комментарий, metadata и optimistic `version`. Unique `(registrationId, kind)` исключает повторную инициализацию.

### `registration_evidence`

Связывает `StoredFile` с регистрацией и nullable requirement. Один `StoredFile` допускается связать с несколькими requirements; unique `(requirementId, storedFileId)` не дублирует одну связь. Legacy-фото переносится с `requirementId = NULL`, потому что его назначение доказать нельзя. Удаление логическое и аудируется.

### `registration_data_requests`

Хранит конкретный запрос оператора, канал, opaque UUID response token, delivery/activation/answer/close timestamps и обезличенную ошибку доставки. Partial unique index разрешает только один незакрытый запрос на requirement.

### Изменения `registration_requests`

Добавлены `ofdProvisionMode`, `readiness`, `readinessUpdatedAt`, `assignedEngineerId`, `handedOffAt`. Старые поля и file relations сохранены.

## ОФД и readiness

Режимы ОФД: `customer_has_code`, `purchase_from_vitma`, `clarification_required`, `not_applicable`.

- `clarification_required` всегда даёт `incomplete`.
- Любой `requested` даёт `awaiting_customer`.
- Любой `missing` даёт `incomplete`.
- Любой `provided` даёт `awaiting_verification`.
- `ready` возможен только при трёх `verified/not_required` и определённом OFD mode.
- `not_applicable` требует причины и AuditEvent.
- `purchase_from_vitma` не требует кода от клиента, но сам `ofd_code` должен быть внесён оператором/из комплекта и проверен.

Расчёт централизован в `RegistrationReadinessService`; UI не является защитой.

## Evidence и внутренний реестр

Клиент загружает JPEG, PNG, WebP или PDF до 15 MB через `FileStoragePort`. Имя очищается `FilesService`, MIME/содержимое проверяются существующей file policy. Provider URL и токены не сохраняются.

Свободный `EquipmentKit` связывается только по точному ID. Его непустые ККТ/ФН/ОФД копируются как `provided/internal_registry`, но не подтверждаются автоматически. Fuzzy matching отсутствует. Оператор может внести значение как `operator_input` или `sold_by_vitma`.

## Канальные потоки

### Web

Форма отправляется без обязательного фото. После submit отображается checklist. Владелец web session может позднее отправить текст или файл. Backend сверяет `platform + chatId`; Browser B получает 404. Client response не содержит internal comments, verifier internals, response token или локальные пути; OFD code маскируется.

### Telegram и MAX

На шаге общего фото принимается `пропустить`/`нет`/`skip`. Запрос оператора доставляет callback `regdata:<uuid>`, не содержащий ID регистрации или значение. После выбора контекст читается из PostgreSQL, поэтому переживает restart. Первый текст/файл закрывает активный response context; повторный callback безопасно отклоняется. Telegram и MAX используют один `RegistrationReadinessService`.

### Operator/admin

Оператор видит три элемента, источник, маскированный OFD code и evidence. Доступны запрос, ручной ввод, verify, revoke/re-request, not-required, OFD mode, точная привязка комплекта, evidence remove/link, draft/final PDF и handoff. Старый status endpoint больше не принимает `processed`; Telegram `regDone` также проходит readiness gate.

### Engineer

Роль engineer имеет только `registrations.read.assigned`. Список, карточка, PDF, старое фото и evidence фильтруются по `assignedEngineerId`. Изменяющие действия скрыты UI и запрещены backend permission guard.

## Handoff и PDF

Handoff выполняется под pessimistic lock. Backend возвращает список `kind/status`, если хотя бы один элемент не готов. Инженер проверяется как активный пользователь с ролью engineer. Повторный handoff возвращает существующий результат без второго эффекта.

PDF при первичном submit является draft: содержит явную отметку `ЧЕРНОВИК`, список неготовых элементов и текущие канонические значения. Final PDF разрешён только при `ready`, включает подтверждённые checklist values и повторно не генерируется, пока активен уже сохранённый final file.

## API/OpenAPI

Swagger автоматически включает DTO-validated routes:

- client: `GET /api/client/registrations/:id/checklist`;
- client: `POST /api/client/registrations/:id/requirements/:kind/value`;
- client: `POST /api/client/registrations/:id/requirements/:kind/evidence`;
- admin: `GET /admin/api/registrations/:id`;
- admin: `POST .../request-data`, `provide-value`, `verify`, `re-request`, `not-required`, `ofd-mode`, `handoff`, `final-pdf`;
- admin: evidence download/remove/link and exact EquipmentKit link.

Public и admin response различаются: client DTO ограничен безопасным checklist projection; admin detail содержит workflow metadata под RBAC.

## Concurrency и idempotency

- checklist: unique constraint + `ON CONFLICT DO NOTHING`;
- requirement mutations: transaction + row lock + optimistic version;
- open request: partial unique index;
- delivery failure: persisted state and explicit retry by repeated operator command;
- answered request больше не перехватывает обычные сообщения;
- evidence link: unique requirement/file, повторное удаление безопасно;
- failed/concurrent evidence mutation помечает новый StoredFile deleted;
- handoff: row lock and idempotent repeat;
- final PDF: existing final metadata guard.

Общая messenger update deduplication не добавлена. Одновременная повторная доставка одного provider media event может оставить два evidence-файла с одинаковым содержимым, но не может подтвердить или передать анкету. Это отдельный durable inbound-idempotency пакет.

## Audit и безопасность

Аудируются initialize, value/evidence, request/delivery, verify/revoke, not-required, internal registry, OFD mode, readiness, denied/allowed handoff, final PDF и permission denial существующим guard. Audit metadata не содержит каноническое значение, полный OFD code, message body, callback token, binary или provider URL. Delivery error хранится как общий безопасный текст.

OFD code не попадает в URL/callback/logs, маскируется в UI и client response. Encryption at rest для отдельных полей пока отсутствует; это production-hardening вопрос, не решаемый самодельным шифрованием.

## Migration/backfill

Forward migration `1787212800000-KktRegistrationReadiness` не меняет старые migrations и не удаляет legacy columns. Активные точные kit values становятся `provided/internal_registry`; пропуски становятся `missing`. Обработанные и остановленные historical rows не переоткрываются. Общее фото становится nullable legacy evidence без выдуманного item kind.

Подробности: [BKV1_2_BACKFILL_REPORT.md](BKV1_2_BACKFILL_REPORT.md).

## Проверки

Добавлены pure readiness tests, Telegram/MAX opaque callback tests, PostgreSQL vertical workflow, Browser A/B ownership, restart-safe DataRequest, concurrent handoff и pre-BKV1-2 migration fixture. Полный unit, integration, e2e, migration/schema, production builds, lint ratchet и offline smoke фиксируются в PR.

## Ограничения

- OCR/barcode recognition отсутствуют;
- реальные АТОЛ/ОФД/1С интеграции не вызываются;
- нет универсального checklist/form engine;
- нет outbox, очереди, Redis или scheduler;
- нет field-level encryption at rest;
- нет общей messenger update/media deduplication;
- полноценная инженерная task-система остаётся следующим отдельным доменным пакетом.
