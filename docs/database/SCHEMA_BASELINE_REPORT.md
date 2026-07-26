# Снимок фактической схемы PostgreSQL

Дата снимка: 2026-07-26  
Источник: локальная тестовая PostgreSQL 16, база `db`, схема `public`  
Ветка: `codex/max-migration`, исходный коммит: `1213418`

## Назначение

Этот документ фиксирует состояние базы до внедрения TypeORM migrations. База содержит только тестовые данные, поэтому она сохранена для страховки и анализа, но не является эталоном целевой схемы.

Перед анализом созданы:

- custom-format dump `backups/preflight-20260726_184939/db-20260726_184939.dump`;
- архив `backups/preflight-20260726_184939/storage.zip`;
- manifest `backups/preflight-20260726_184939/storage-manifest.json`;
- результат restore drill `backups/preflight-20260726_184939/db-restore-comparison.json`.

Dump восстановлен в отдельную временную БД. В исходной и восстановленной БД обнаружено по 20 таблиц; количество строк совпало во всех таблицах. Временная БД после проверки удалена.

## Таблицы и количество строк

| Таблица | Строк | Представлена TypeORM entity |
|---|---:|---|
| `admin_sessions` | 1 | да |
| `admin_users` | 1 | да |
| `bid_fields` | 2 | нет |
| `bids` | 14 | нет |
| `cash_registers` | 0 | да |
| `customer_activities` | 37 | да |
| `equipment_kits` | 0 | да |
| `fiscal_drives` | 0 | да |
| `ofd_subscriptions` | 0 | да |
| `organization_members` | 1 | да |
| `organizations` | 1 | да |
| `registration_fields` | 19 | да |
| `registration_requests` | 4 | да |
| `service_request_events` | 25 | да |
| `service_requests` | 3 | да |
| `service_types` | 4 | да |
| `ticket_messages` | 30 | да |
| `tickets` | 30 | да |
| `user_channels` | 11 | да |
| `users` | 17 | да |

Всего: 20 таблиц, 200 строк.

## Колонки

Обозначения: `NN` — `NOT NULL`, `NULL` — nullable. Указаны фактические PostgreSQL-типы и дефолты.

### Пользователи и сотрудники

- `users`: `id integer NN identity/sequence`; `chatId varchar NN`; `name varchar NULL`; `username varchar NULL`; `sendNews boolean NN DEFAULT true`; `sendImportant boolean NN DEFAULT true`; `isAdmin boolean NN DEFAULT false`; `isOperator boolean NN DEFAULT false`; `talkingTo varchar NULL`; `firstSeenAt timestamp NULL`; `lastSeenAt timestamp NULL`; `platform varchar NN DEFAULT 'telegram'`.
- `user_channels`: `id integer NN identity/sequence`; `userId integer NN`; `platform varchar NN`; `externalId varchar NN`; `username varchar NULL`; `displayName varchar NULL`; `isVerified boolean NN DEFAULT false`; `lastSeenAt timestamp NULL`; `createdAt timestamp NN DEFAULT now()`; `updatedAt timestamp NN DEFAULT now()`.
- `admin_users`: `id integer NN identity/sequence`; `login varchar NN`; `displayName varchar NN`; `passwordHash varchar NN`; `role varchar NN DEFAULT 'operator'`; `isActive boolean NN DEFAULT true`; `telegramChatId varchar NULL`; `maxChatId varchar NULL`; `notifyRegistrations boolean NN DEFAULT true`; `notifyTickets boolean NN DEFAULT true`; `notifyServiceRequests boolean NN DEFAULT true`; `messengerBindCode varchar NULL`; `messengerBindPlatform varchar NULL`; `messengerBindCodeExpiresAt timestamp NULL`; `createdAt timestamp NN DEFAULT now()`; `updatedAt timestamp NN DEFAULT now()`.
- `admin_sessions`: `id integer NN identity/sequence`; `tokenHash varchar NN`; `userId integer NN`; `expiresAt timestamp NN`; `createdAt timestamp NN DEFAULT now()`.

### Организации и оборудование

- `organizations`: `id integer NN identity/sequence`; `inn varchar NN`; `kpp varchar NULL`; `ogrn varchar NULL`; `name varchar NULL`; `legalAddress varchar NULL`; `actualAddress varchar NULL`; `taxSystem varchar NULL`; `isVerified boolean NN DEFAULT false`; `lastSyncedAt timestamp NULL`; `createdAt timestamp NN DEFAULT now()`; `updatedAt timestamp NN DEFAULT now()`.
- `organization_members`: `id integer NN identity/sequence`; `organizationId integer NN`; `userId integer NN`; `role varchar NN DEFAULT 'owner'`; `status varchar NN DEFAULT 'active'`; `confirmedAt timestamp NULL`; `createdAt timestamp NN DEFAULT now()`; `updatedAt timestamp NN DEFAULT now()`.
- `cash_registers`: `id integer NN identity/sequence`; `organizationId integer NN`; `model varchar NULL`; `serialNumber varchar NN`; `registrationNumber varchar NULL`; `fnSerialNumber varchar NULL`; `ofdName varchar NULL`; `status varchar NN DEFAULT 'active'`; `registeredAt timestamp NULL`; `lastSyncedAt timestamp NULL`; `createdAt timestamp NN DEFAULT now()`; `updatedAt timestamp NN DEFAULT now()`.
- `fiscal_drives`: `id integer NN identity/sequence`; `organizationId integer NN`; `cashRegisterId integer NN`; `serialNumber varchar NN`; `validFrom timestamp NULL`; `validUntil timestamp NULL`; `source varchar NN DEFAULT 'manual'`; `lastCheckedAt timestamp NULL`; `createdAt timestamp NN DEFAULT now()`; `updatedAt timestamp NN DEFAULT now()`.
- `ofd_subscriptions`: `id integer NN identity/sequence`; `organizationId integer NN`; `cashRegisterId integer NULL`; `provider varchar NN`; `contractNumber varchar NULL`; `validFrom timestamp NULL`; `validUntil timestamp NULL`; `status varchar NN DEFAULT 'unknown'`; `source varchar NN DEFAULT 'manual'`; `lastCheckedAt timestamp NULL`; `createdAt timestamp NN DEFAULT now()`; `updatedAt timestamp NN DEFAULT now()`.
- `equipment_kits`: `id integer NN identity/sequence`; `cashRegisterModel varchar NULL`; `cashRegisterSerial varchar NULL`; `fiscalDriveSerial varchar NULL`; `ofdActivationCode varchar NULL`; `marketplaceOrderId varchar NULL`; `status varchar NN DEFAULT 'stock'`; `registrationRequestId integer NULL`; `comment text NULL`; `createdAt timestamp NN DEFAULT now()`; `updatedAt timestamp NN DEFAULT now()`.

### Регистрации

- `registration_fields`: `id integer NN identity/sequence`; `name varchar NN`; `label varchar NN`; `step integer NN DEFAULT 1`.
- `registration_requests`: `id integer NN identity/sequence`; `chatId text NN`; `currentStep integer NN DEFAULT 1`; `orgName varchar NULL`; `ogrn varchar NULL`; `innKpp varchar NULL`; `urAdress varchar NULL`; `kktAdress varchar NULL`; `kktName varchar NULL`; `phone varchar NULL`; `email varchar NULL`; `nds varchar NULL DEFAULT 'Нет'`; `excise varchar NULL DEFAULT 'Нет'`; `markirovka varchar NULL DEFAULT 'Нет'`; `services varchar NULL DEFAULT 'Нет'`; `strictReporting varchar NULL DEFAULT 'Нет'`; `taxSystem varchar NULL`; `kktModel varchar NULL`; `bankReqs text NULL`; `ofd varchar NULL`; `isFilled boolean NN DEFAULT false`; `pdfLink varchar NULL`; `isStopped boolean NN DEFAULT false`; `isProcessed boolean NN DEFAULT false`; `createdAt timestamp NN DEFAULT now()`; `updatedAt timestamp NN DEFAULT now()`; `phoneToCall varchar NULL`; `pdfPath varchar NULL`; `type registration_requests_type_enum NN DEFAULT 'REGISTRATION'`; `platform varchar NN DEFAULT 'telegram'`; `userId integer NULL`; `organizationId integer NULL`; `equipmentPhotoPath varchar NULL`; `equipmentPhotoName varchar NULL`; `equipmentKitId integer NULL`; `status varchar NN DEFAULT 'new'`; `priority varchar NN DEFAULT 'normal'`.

### Вопросы и сообщения

- `tickets`: `id integer NN identity/sequence`; `userChatId varchar NN`; `username varchar NULL`; `name varchar NULL`; `text varchar NULL`; `createdAt timestamp NN DEFAULT now()`; `isAnswered boolean NN DEFAULT false`; `answeredBy varchar NULL`; `platform varchar NN DEFAULT 'telegram'`; `userId integer NULL`; `organizationId integer NULL`.
- `ticket_messages`: `id integer NN identity/sequence`; `ticketId integer NN`; `sender varchar NN`; `authorId varchar NULL`; `source varchar NN DEFAULT 'bot'`; `text text NULL`; `createdAt timestamp NN DEFAULT now()`; `messageType varchar NN DEFAULT 'text'`; `fileId varchar NULL`; `fileUniqueId varchar NULL`; `fileName varchar NULL`; `mimeType varchar NULL`; `fileSize integer NULL`; `externalUrl text NULL`; `localPath text NULL`.

### Сервисные заявки и история

- `service_types`: `id integer NN identity/sequence`; `code varchar NN`; `title varchar NN`; `description text NULL`; `flow varchar NN DEFAULT 'simple'`; `isActive boolean NN DEFAULT true`; `settings jsonb NULL`; `createdAt timestamp NN DEFAULT now()`; `updatedAt timestamp NN DEFAULT now()`.
- `service_requests`: `id integer NN identity/sequence`; `serviceTypeId integer NN`; `serviceTypeCode varchar NN`; `serviceTypeTitle varchar NN`; `userId integer NULL`; `organizationId integer NULL`; `platform varchar NN DEFAULT 'web'`; `chatId text NN`; `status varchar NN DEFAULT 'draft'`; `currentStep integer NN DEFAULT 0`; `answers jsonb NN DEFAULT '{}'`; `calculatedPrice integer NULL`; `invoiceFileId varchar NULL`; `invoiceFileName varchar NULL`; `visitAddress varchar NULL`; `visitTime timestamp NULL`; `operatorComment text NULL`; `responsibleOperatorId varchar NULL`; `createdAt timestamp NN DEFAULT now()`; `updatedAt timestamp NN DEFAULT now()`; `executorName varchar NULL`; `priority varchar NN DEFAULT 'normal'`.
- `service_request_events`: `id integer NN identity/sequence`; `serviceRequestId integer NN`; `type varchar NN`; `actor varchar NULL`; `message text NULL`; `payload jsonb NULL`; `createdAt timestamp NN DEFAULT now()`.
- `customer_activities`: `id integer NN identity/sequence`; `userId integer NULL`; `organizationId integer NULL`; `platform varchar NN DEFAULT 'web'`; `chatId text NN`; `type varchar NN`; `title varchar NULL`; `description text NULL`; `ticketId integer NULL`; `serviceRequestId integer NULL`; `payload jsonb NULL`; `createdAt timestamp NN DEFAULT now()`.

### Legacy-таблицы без entities

- `bid_fields`: `id integer NN identity/sequence`; `name varchar NN`; `label varchar NN`; `step integer NN DEFAULT 1`.
- `bids`: `id integer NN identity/sequence`; `chatId text NN`; `type bids_type_enum NN DEFAULT 'KKT_REMOTE_WORK'`; `currentStep integer NN DEFAULT 1`; `problemDescription varchar NULL`; `contactForCall varchar NULL`; `isFilled boolean NN DEFAULT false`; `isStopped boolean NN DEFAULT false`; `isProcessed boolean NN DEFAULT false`; `createdAt timestamp NN DEFAULT now()`; `updatedAt timestamp NN DEFAULT now()`; `platform varchar NN DEFAULT 'telegram'`; `userId integer NULL`; `organizationId integer NULL`.

## Primary keys, unique constraints и foreign keys

У всех 20 таблиц primary key состоит из единственной колонки `id`.

Unique constraints:

| Таблица | Колонки |
|---|---|
| `admin_sessions` | `tokenHash` |
| `admin_users` | `login` |
| `bid_fields` | `name` |
| `cash_registers` | `organizationId`, `serialNumber` |
| `fiscal_drives` | `cashRegisterId`, `serialNumber` |
| `organization_members` | `organizationId`, `userId` |
| `organizations` | `inn`, `kpp` |
| `registration_fields` | `name` |
| `service_types` | `code` |
| `user_channels` | `platform`, `externalId` |
| `users` | `platform`, `chatId` |

Фактические foreign keys:

| Из | В | `ON DELETE` |
|---|---|---|
| `admin_sessions.userId` | `admin_users.id` | `NO ACTION` |
| `organization_members.organizationId` | `organizations.id` | `CASCADE` |
| `organization_members.userId` | `users.id` | `CASCADE` |
| `ticket_messages.ticketId` | `tickets.id` | `CASCADE` |
| `user_channels.userId` | `users.id` | `CASCADE` |

## Индексы

В схеме 31 индекс:

- 20 уникальных PK-индексов, по одному на `id` каждой таблицы;
- 11 уникальных индексов, соответствующих unique constraints из предыдущего раздела;
- обычных вторичных индексов нет.

Это означает, что часто используемые для выборок колонки (`status`, `platform`, `createdAt`, `userId`, `organizationId`, `serviceRequestId`, `ticketId`) сейчас не имеют отдельных индексов.

## Последовательности

Обнаружено 20 integer-последовательностей с `START 1`, `MINVALUE 1`, `INCREMENT 1`, `MAXVALUE 2147483647`:

`admin_sessions_id_seq`, `admin_users_id_seq`, `bid_fields_id_seq`, `bids_id_seq`, `cash_registers_id_seq`, `customer_activities_id_seq`, `equipment_kits_id_seq`, `fiscal_drives_id_seq`, `ofd_subscriptions_id_seq`, `organization_members_id_seq`, `organizations_id_seq`, `registration_fields_id_seq`, `registration_requests_id_seq`, `service_request_events_id_seq`, `service_requests_id_seq`, `service_types_id_seq`, `ticket_messages_id_seq`, `tickets_id_seq`, `user_channels_id_seq`, `users_id_seq`.

## Enum-типы

| PostgreSQL enum | Значения |
|---|---|
| `registration_requests_type_enum` | `REGISTRATION`, `FISCAL_REPLACEMENT` |
| `bids_type_enum` | `KKT_REMOTE_WORK`, `FIRMWARE_UPDATE` |

`bids_type_enum` принадлежит legacy-таблице без текущей entity.

## Расхождения с TypeORM entities

### Таблицы и колонки только в БД

- `bids` и все её 14 колонок не представлены текущими entities.
- `bid_fields` и все её 4 колонки не представлены текущими entities.
- `bids_type_enum` не представлен текущим кодом.

Эти объекты не включаются в initial migration чистой целевой БД. Они не удаляются из старой БД и сохраняются в страховочном dump.

### Entities и поля, отсутствующие в БД

Не обнаружены. Все 18 таблиц текущих entities и их колонки присутствуют в старой БД.

### Nullable/non-nullable

Для таблиц, представленных entities, расхождений между `nullable` в TypeORM decorators и фактическим `IS NULLABLE` не обнаружено.

В TypeScript несколько nullable-колонок объявлены как не-nullable свойства (`userId`, `organizationId`, `cashRegisterId`), но это расхождение типов приложения, а не физической схемы. Оно не исправляется в этой пачке.

### Defaults

Расхождений defaults между фактической схемой и текущими entities не обнаружено. В `registration_requests` defaults пяти полей (`nds`, `excise`, `markirovka`, `services`, `strictReporting`) равны строке `Нет` и в PostgreSQL, и в UTF-8 исходнике entity.

### Foreign keys и числовые ссылки

Следующие логические ссылки представлены обычными integer-колонками без FK:

- `registration_requests.userId`, `organizationId`, `equipmentKitId`;
- `tickets.userId`, `organizationId`;
- `service_requests.serviceTypeId`, `userId`, `organizationId`;
- `service_request_events.serviceRequestId`;
- `customer_activities.userId`, `organizationId`, `ticketId`, `serviceRequestId`;
- `cash_registers.organizationId`;
- `fiscal_drives.organizationId`, `cashRegisterId`;
- `ofd_subscriptions.organizationId`, `cashRegisterId`;
- `equipment_kits.registrationRequestId`.

Среди них найдены две orphan-ссылки:

| Таблица/колонка | Строка | Отсутствующий ID |
|---|---:|---:|
| `customer_activities.ticketId` | activity `57` | ticket `67` |
| `customer_activities.ticketId` | activity `60` | ticket `69` |

В остальных проверенных логических ссылках orphan-значений нет. Добавление FK не выполняется автоматически: сначала нужно определить допустимое поведение удаления и очистить либо архивировать существующие orphan-записи.

## Baseline-решение

Так как текущая БД объявлена тестовой:

1. Старая база `db` остаётся без изменений и хранится вместе со страховочным dump.
2. Эталоном становится новая чистая development/test схема, развёрнутая initial migration из текущих entities.
3. Legacy-таблицы `bids` и `bid_fields` не переносятся в clean baseline, поскольку соответствующего работающего кода/entities нет.
4. Initial migration не добавляет новые FK к существующим numeric links: это отдельное изменение данных и поведения.
5. Тестовые справочники и демонстрационные данные не входят в migration; существующие application seed-сервисы остаются отдельным механизмом.
6. Старой базе не регистрируется фиктивный baseline и migrations на ней в этой пачке не запускаются.
7. `InitialSchema.up()` не содержит `DROP`/`RENAME`. Её `down()` является полным teardown clean schema и допустим только для disposable development/test DB без ценных данных.

## Оставшиеся решения

- Определить судьбу 14 строк `bids` и 2 строк `bid_fields`: архивировать, импортировать в `service_requests` отдельной процедурой либо оставить только в старом dump.
- Определить `ON DELETE` для каждой logical link перед добавлением FK.
- Добавить вторичные индексы после профилирования реальных запросов админки и публичного API.
