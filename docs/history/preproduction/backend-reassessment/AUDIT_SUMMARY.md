# Backend reassessment: summary

## BKV1-2 implementation update

The KKT registration gap identified by this reassessment is addressed in
BKV1-2: one `RegistrationRequest` now owns a typed requirement checklist,
evidence links, persistent customer data requests, OFD mode and readiness.
Engineer handoff and final PDF are server-gated. The original audit snapshot
below remains historical; current evidence is in
[`../backend-v1/BKV1_2_KKT_REGISTRATION_PARITY.md`](../backend-v1/BKV1_2_KKT_REGISTRATION_PARITY.md).

Дата среза: 2026-08-18. Полный SHA: `f5e3a2fce027f329fb87c227b0bcede6de1a2f51`.

## Git и метод

- `CODE_CONFIRMED`: аудит выполнен в отдельном worktree `C:\CODING\learn-bot-backend-reassessment`, ветка `codex/backend-reassessment`, созданная от `origin/main`.
- `CODE_CONFIRMED`: `HEAD == origin/main`; открытых PR на момент preflight нет.
- `INCONSISTENT`: исходный worktree находится на `codex/max-bot-commands` и содержит незакоммиченные изменения MAX SDK/команд. Они не входят в этот аудит и не изменялись.
- Изменения аудита ограничены этим каталогом. Commit, push и PR не выполнялись.

## Итог

VITMA MARKET уже является работающим модульным монолитом NestJS, а не прототипом backend. Общие PostgreSQL и FileStorage обслуживают React-клиент, React-админку, Telegram и MAX. Наиболее зрелые части: admin auth/RBAC, web sessions, migrations, файловая основа, Audit Log, основные bot workflows, CI и read-only integration foundation.

Переписывать backend с нуля не нужно. Нужна контролируемая эволюция существующих модулей: укрепить канонические контракты и связи, затем подключать к ним новый клиентский интерфейс.

## Зрелые части

| Область | Статус | Основание |
|---|---|---|
| Admin sessions и multi-role RBAC | `TEST_CONFIRMED` | `src/admin/*`, `test/security-foundation.integration-spec.ts` |
| PostgreSQL migrations | `TEST_CONFIRMED` | 5 migrations применяются повторно; `schema:test:log` пуст |
| FileStorage и content policies | `TEST_CONFIRMED` | `src/files/*`, unit/security/integration tests |
| Telegram/MAX B1 ветки | `TEST_CONFIRMED` | handler/media/RBAC tests в `src/telegram`, `src/max` |
| Регистрации, тикеты, service requests | `PARTIAL` | общие сущности и workflows есть, но контракты каналов расходятся |
| АТОЛ/ОФД integration foundation | `PARTIAL` | import/matching/opportunities покрыты тестами; реальный runtime в этом аудите не проверялся |
| CI/offline bootstrap | `RUNTIME_CONFIRMED` | quality, builds, DB checks, integration/e2e и offline smoke прошли |

## Пять архитектурных разрывов

1. `INCONSISTENT`: `UserEntity` остаётся channel-scoped, а `UserChannelEntity` лишь повторяет тот же профиль; безопасного объединения web/Telegram/MAX нет (`src/users/users.service.ts`).
2. `PARTIAL`: значительная часть доменных связей хранится numeric ID без FK: service request, registration, ticket, activity и equipment (`1785067383157-InitialSchema.ts`).
3. `PARTIAL`: `ServiceRequestsService` совмещает формы, state machine, файлы, PDF, события и delivery; схема формы не versioned (`src/service-requests/service-requests.service.ts`, 938 строк).
4. `MISSING`: нет доменов каталога и заказа; UI-товары и checkout являются frontend/localStorage данными (`client-ui/src/data/catalog.ts`).
5. `MISSING`: нет outbox/delivery status/idempotency/concurrency control для основных пользовательских mutations; возможны частичные side effects.

## Пять функциональных разрывов

1. Web-регистрация пропускает обязательную для ботов фотографию и всё равно завершает анкету.
2. Привязка организации по одному ИНН немедленно создаёт active owner membership без проверки полномочий.
3. Сервисная заявка не имеет location/equipment/form version/customer status/general attachments/result/messages как стабильного контракта.
4. Настоящего backend-каталога, публикации, цены/наличия и заказа-заявки нет.
5. Клиентские delivery failures не восстанавливаются автоматически; web получает состояние чтением, messenger delivery выполняется best-effort.

## Обновление после BKV1-0

Разрыв №2 закрыт пакетом BKV1-0: ИНН создаёт отдельный `pending` access request, оператор вручную approve/reject, а approve выдаёт только `representative`. Исходная формулировка выше сохранена как результат аудита на дату среза. Реализация и ограничения: `docs/backend-v1/BKV1_0_ORGANIZATION_ACCESS.md`.

## Backend v1 for client site

`Backend v1` достигнут, когда сайт может использовать стабильные серверные контракты для:

- канонической сервисной заявки со структурированными ответами, вложениями, привязкой к организации/точке/оборудованию, разделёнными internal/customer statuses и историей;
- единой регистрации ККТ для web/Telegram/MAX с одинаковыми обязательными полями, фото, PDF, продолжением и отменой;
- безопасной клиентской сессии и подтверждаемого доступа к организации;
- реального опубликованного каталога и минимального заказа-заявки с snapshot позиций, идемпотентностью и очередью менеджера;
- стабильных DTO/OpenAPI/error contracts и integration-тестов всех вертикалей.

Outbox, production monitoring, внешний backup/retention и deployment hardening обязательны до public pilot, но не должны блокировать начало визуальной переработки после стабилизации контрактов.

## Рекомендация

После BKV1-0 следующий пакет: **BKV1-1 Canonical service request**. Он задаёт шаблон ownership, status, attachments и history для остальных вертикалей. Детальная последовательность: [BACKEND_V1_SCOPE_AND_SEQUENCE.md](./BACKEND_V1_SCOPE_AND_SEQUENCE.md).

Архитектура: [CURRENT_BACKEND_ARCHITECTURE.md](./CURRENT_BACKEND_ARCHITECTURE.md). Риски: [RELIABILITY_SECURITY_AND_OPERATIONS.md](./RELIABILITY_SECURITY_AND_OPERATIONS.md).

## BKV1-1 update

Рекомендация реализована ограниченным пакетом BKV1-1: существующая таблица `service_requests` расширена до канонического агрегата для web, Telegram, MAX, staff и integrations. Добавлены versioned forms, structured answers, customer/internal statuses, snapshots, messages, generic attachments, optimistic versioning и локальная submit-idempotency. Durable delivery, realtime и глобальная deduplication остаются вне пакета. Подробности: [`../backend-v1/BKV1_1_CANONICAL_SERVICE_REQUESTS.md`](../backend-v1/BKV1_1_CANONICAL_SERVICE_REQUESTS.md).

Migration-риск проверен отдельным drill на восстановленной real legacy-копии (13 заявок) и полном synthetic fixture (16 заявок). Строки, события, предметные поля и файлы сохранены; unsafe unknown-source snapshot и неверная ATOL form mapping исправлены до merge. Verdict и доказательства неизменности источника: [`../backend-v1/BKV1_1_MIGRATION_DRILL.md`](../backend-v1/BKV1_1_MIGRATION_DRILL.md).
