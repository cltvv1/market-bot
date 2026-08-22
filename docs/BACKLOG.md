# Backlog VITMA MARKET

## BKV1-2 follow-ups

- Real legacy DB/FileStorage dry-run on an isolated restored copy.
- Encryption-at-rest decision for commercially sensitive OFD codes.
- General inbound messenger/media deduplication; duplicate content is harmless
  to readiness but can leave duplicate evidence rows.
- Outbox/retry worker for registration data-request delivery.
- Full engineer task/location workflow after the canonical equipment package.

## Bot B1 follow-ups

- **Completed in B1:** Telegram callback RBAC, OFD-to-ticket routing, bounded
  MAX media persistence, MAX operator image/document forwarding and ATOL
  request-local cleanup.
- **Partially mitigated:** operator chat fails closed after loss of in-memory
  context, but conversation mode is not durable.
- **Deferred:** durable state, incoming deduplication, per-conversation
  serialization, Telegram provider-URL migration, outbox/retry/status and
  handler decomposition.

## Storage follow-ups

- Copy remaining Telegram-only remote media into controlled storage through a bounded worker.
- Complete transaction-scoped audit coverage for all business mutations.
- Add Range responses for locally stored audio/video.
- Agree retention, encryption and a second external backup copy.
- S3, antivirus, outbox, scheduler and automatic deletion remain out of scope.

## Обозначения

- **P0** - блокирует безопасный запуск или следующий этап.
- **P1** - обязательная функция рабочего продукта.
- **P2** - последующее развитие.
- **S/M/L/XL** - относительная сложность.
- Путь с пометкой `(new)` обозначает предлагаемый новый модуль, а не уже существующий файл.

## Этап 0. Стабилизация основы

| ID | Название | Описание | Зависимость | Модули/файлы | Критерии приёмки | Сложность | Приоритет |
|---|---|---|---|---|---|---|---|
| E0-01 | Снимок фактической схемы | Получить schema dump и отчёт о расхождениях с TypeORM entities; перечислить orphan links и конфликтующие constraints | Доступная копия PostgreSQL | `src/**/entities`, database tooling | Есть versioned schema report; количество строк/таблиц до миграции зафиксировано; production не изменяется | M | P0 |
| E0-02 | Baseline TypeORM migrations | Создать baseline и механизм запуска миграций для чистой и существующей БД | E0-01, backup | `src/database/migrations` (new), TypeORM data source, `package.json` | Чистая БД разворачивается; существующая не пересоздаётся; migration history корректна | L | P0 |
| E0-03 | Отключение synchronize | Разделить development/test/production database config и отключить `synchronize` для постоянных окружений | E0-02 | `src/app.module.ts`, config | Startup production использует `synchronize: false`; схема меняется только migration-командой | S | P0 |
| E0-04 | Безопасная admin-аутентификация | Убрать fallback `admin`, запретить query token, включить secure cookie options и управление сроком/отзывом сессий | Нет | `src/admin/admin.controller.ts`, `admin-auth.service.ts`, config | Без сотрудника startup только предупреждает; default account не создаётся; token не принимается в URL; cookie secure в production | M | P0 |
| E0-05 | Минимальный RBAC | Ввести роли operator/engineer/sales_manager/superadmin и backend policies для текущих admin endpoints | E0-04 | `src/admin`, `src/auth` (new), admin entities | Operator не управляет сотрудниками/каталогом; engineer видит только назначенное; superadmin имеет полный доступ | L | P0 |
| E0-06 | Анонимная web-сессия | Заменить доверие к frontend `chatId` на HttpOnly web-session и server-side customer context | E0-02 | `src/users`, `src/client`, `client-ui/src/services/client.ts` | Изменение localStorage не открывает чужие данные; web session восстанавливает свои drafts | L | P0 |
| E0-07 | DTO и глобальная валидация | Ввести `ValidationPipe`, DTO для публичных/admin mutation routes и единый error shape | E0-03 | `src/main.ts`, `src/**/dto` (new), controllers | Whitelist включён; неизвестные/невалидные поля отклоняются; Swagger видит схемы | L | P0 |
| E0-08 | FileStorage foundation | Создать `StoredFile`, `FileStoragePort`, local provider, safe object key, checksum и policy лимитов | E0-02 | `src/files` (new), registration/ticket/service uploads | Original filename не участвует в пути; forbidden MIME/size отклоняются; доступ проверяется use case | L | P0 |
| E0-09 | Защита публичного периметра | Добавить rate limiting логина/форм, production CORS, Swagger flag, security headers и health endpoints | E0-04, E0-07 | `src/main.ts`, config, guards/middleware | Лимит измеримо работает; production Swagger закрыт; allowed origins явные; health/readiness разделены | M | P0 |
| E0-10 | Минимальный audit log | Записывать actor/action/target/result для критичных действий сотрудника | E0-05, E0-02 | `src/audit` (new), admin application services | Статус, назначение, документ и закрытие имеют audit event; audit нельзя менять обычному оператору | M | P0 |
| E0-11 | Критичный test harness | Поднять отдельную test DB и characterization tests регистрации, тикета, ФН и АТОЛ | E0-02 | `test`, module test builders, messenger fakes | Тесты не ходят в реальные Telegram/MAX; проверяют основные текущие переходы и restart-sensitive данные | L | P0 |
| E0-12 | Backup БД и файлов | Расширить backup/restore: DB dump, storage manifest/checksum, проверяемая restore-команда | E0-08 | `scripts/db-*`, `scripts/storage-*` (new), docs | На чистом окружении восстанавливаются выбранные регистрация, фото, PDF и счёт; checksums совпадают | M | P0 |
| E0-13 | CI quality gate | Добавить non-fixing lint, typecheck, build, unit/integration и migration check | E0-11 | `.github/workflows` или выбранный CI, `package.json` | CI не меняет файлы; падает на ошибке; собирает оба frontend и backend | M | P1 |
| E0-14 | Один service-request controller | После contract tests удалить двойную регистрацию одинаковых public routes | E0-07, E0-11 | `src/client/client-api.controller.ts`, `src/service-requests/service-requests.controller.ts/module.ts` | Для каждого маршрута один handler; API contract не изменён без versioning | S | P1 |
| E0-15 | Явная политика legacy UI | Зафиксировать React как target, добавить production check build-артефактов, не удаляя fallback | E0-13 | `src/site/site.controller.ts`, `src/admin/admin.controller.ts`, deployment docs | Production не переключается молча на legacy; React smoke является deploy gate | S | P1 |

### Статус утверждённой пачки

| ID | Статус на 2026-07-26 | Примечание |
|---|---|---|
| E0-01 | завершена | `docs/database/SCHEMA_BASELINE_REPORT.md` |
| E0-02 | завершена | Clean baseline для тестовой базы; старая `db` сохранена без изменений |
| E0-03 | завершена | `synchronize: false`, строгие `DB_*`, `.env.example` |
| E0-04 | завершена | Cookie-only admin sessions, CLI bootstrap, revoke/TTL/CSRF; legacy default test account в `vitma_dev` отключён |
| E0-05 | завершена | Multi-role RBAC, staff API/UI, last-superadmin protection и assigned engineer relation |
| E0-06 | завершена | HttpOnly anonymous web-session и IDOR isolation; browser `platform/chatId` больше не credential |
| E0-07 | завершена | DTO, global whitelist/forbid validation и единый error shape |
| E0-09 | завершена | Route limits, CORS allowlist, Helmet, Swagger policy, health и body limits |
| E0-11 | частично завершена | 14 unit и 16 PostgreSQL integration/characterization tests; расширенная bot callback/media characterization остаётся в BOT-01 |
| E0-08 | не начата | Следующая блокирующая foundation-задача |
| E0-10 | не начата | Нужна после/вместе с E0-08 до production |
| E0-12 | не начата как продуктовая задача | Есть только страховочный dump/archive/manifest/restore drill перед миграцией; зависимость E0-08 сохраняется |

## Этап 1. Настоящий магазин

| ID | Название | Описание | Зависимость | Модули/файлы | Критерии приёмки | Сложность | Приоритет |
|---|---|---|---|---|---|---|---|
| SHOP-01 | Схема каталога | Добавить Product, Category, Brand, Image, Attribute, Price, Availability и миграции | E0-02, решения по цене/НДС | `src/catalog` (new), migrations | FK/индексы созданы; current price однозначен; publication status задан | L | P1 |
| SHOP-02 | Перенос demo-каталога | Импортировать 24 существующих товара и категории из frontend data в PostgreSQL через повторяемый seed/import | SHOP-01 | `client-ui/src/data/catalog.ts`, catalog seed/import | Повтор не создаёт дубли; SKU/slug уникальны; изображения связаны через StoredFile | M | P1 |
| SHOP-03 | Admin catalog API | Реализовать CRUD, price/availability, publication и image operations с RBAC/audit | SHOP-01, E0-05, E0-08 | `src/catalog`, admin controllers | Менеджер управляет каталогом; operator только читает; изменения аудитируются | L | P1 |
| SHOP-04 | Редактор каталога в админке | Добавить списки категорий/товаров, редактор, изображения, характеристики, preview и публикацию | SHOP-03 | `admin-ui/src/catalog` (new), routing/layout | Все обязательные поля редактируются; ошибки видимы; hidden/published различаются | L | P1 |
| SHOP-05 | Public catalog API | Реализовать категории, list/detail, поиск, фильтры, сортировку и пагинацию | SHOP-01 | `src/catalog` public controller/DTO | Непубликованные товары не выдаются; query валидируется; пагинация стабильна | M | P1 |
| SHOP-06 | Client catalog adapter | Перевести Home/Catalog/Product/Search на API service с loading/error/empty и typed mapper | SHOP-05 | `client-ui/src/services`, catalog pages/context | Production mode не импортирует `products` как source; UI сохраняет текущий сценарий | L | P1 |
| SHOP-07 | Схема и state machine заказа | Добавить Order, Item, Contact, DeliveryMethod, History, Comment, Document и transition rules | E0-02, SHOP-01 | `src/orders` (new), migrations | Item хранит snapshots; разрешённые переходы тестируются; number/public token уникальны | L | P1 |
| SHOP-08 | Idempotent checkout API | Создать заказ по корзине и контакту, пересчитать цену на сервере, вернуть number/token | SHOP-07, E0-06 | `src/orders`, public DTO/controller | Клиентская цена не доверяется; повтор idempotency key возвращает тот же order | L | P1 |
| SHOP-09 | Реальный checkout frontend | Отправлять корзину и форму в backend; показывать field/server errors и success access | SHOP-08, SHOP-06 | `client-ui/src/pages/CheckoutPage.tsx`, order service | Заказ сохраняется в PostgreSQL; cart очищается только после успеха; failure не теряет данные | M | P1 |
| SHOP-10 | Очередь заказов менеджера | Добавить вкладку заказов, фильтры, assignment, статусы, contact card и comments | SHOP-07, E0-05 | `admin-ui/src/orders` (new), admin order API | Новый заказ появляется без ручного DB-действия; менеджер назначается relation | L | P1 |
| SHOP-11 | Счёт и документы | Загрузка PDF/документа, безопасная выдача клиенту, событие `invoice_ready` | SHOP-10, E0-08 | orders/files/notifications, admin/client UI | Документ доступен только владельцу/token; checksum и audit есть; old version сохраняется | M | P1 |
| SHOP-12 | Статус заказа клиента | Защищённая страница номера, customer status, history и документы | SHOP-08, SHOP-11 | public order API, `client-ui/src/pages/OrderStatusPage.tsx` (new) | Последовательный номер без token не открывается; internal comments скрыты | M | P1 |
| SHOP-13 | История и уведомление | Записывать все переходы/actor и доставлять invoice/status в подтверждённый channel при наличии | SHOP-10, SHOP-11 | orders/audit/notifications | History полна; отсутствие messenger не откатывает order; delivery result сохраняется | M | P1 |
| SHOP-14 | Shop vertical E2E | Автоматизировать create product -> publish -> checkout -> admin invoice -> client status | SHOP-04..13 | test/Playwright/integration fixtures | Сценарий проходит на чистой БД; проверяет desktop/mobile и RBAC | L | P1 |

## Этап 2. Клиентские сервисные заявки

| ID | Название | Описание | Зависимость | Модули/файлы | Критерии приёмки | Сложность | Приоритет |
|---|---|---|---|---|---|---|---|
| SR-01 | Целевые статусы сервиса | Ввести internal/customer statuses, transition service и mapping текущих статусов | E0-02, status agreement | `src/service-requests`, migration | Старые статусы backfill; неразрешённый переход отклоняется; клиентский mapping тестируется | L | P1 |
| SR-02 | Versioned form definitions | Добавить form definition/version JSON schema, validation и channel visibility | SR-01 | `src/forms` или `src/service-requests/forms` (new) | Опубликованная версия immutable; draft editable; schema проходит validation | L | P1 |
| SR-03 | Structured request draft API | Создавать web draft с service type/form version и сохранять ответы по ключам | SR-02, E0-06 | service public API/application | Ответы не сворачиваются в строку; invalid field/type отклоняется; resume работает | L | P1 |
| SR-04 | Вложения сервисной заявки | Upload/remove/list attachment до submit и после в разрешённых статусах | SR-03, E0-08 | service/files API | До пяти файлов по policy; attachment привязан к request; чужой token не скачивает | M | P1 |
| SR-05 | Интеграция web-формы | Перевести `ServiceRequestPage` с mock/summary на schema+draft+attachments+submit | SR-03, SR-04 | `client-ui/src/pages/ServiceRequestPage.tsx`, service client | Все поля отправляются структурированно; progress/error/retry работают; draft server-side | L | P1 |
| SR-06 | Безопасный web-статус | Реальный status/history/messages endpoint по session/public token | SR-01, SR-03 | service public API, `ServiceStatusPage.tsx` | DemoRequests не используются в production; ID без token не раскрывает данные | M | P1 |
| SR-07 | Новая карточка заявки | Показать answers по schema snapshot, attachments, два статуса, assignees, comments/results | SR-01..04 | admin-ui service view, admin API | Оператор видит поля отдельно; internal data не попадает клиенту; actions permission-aware | L | P1 |
| SR-08 | Ручное создание оператором | Создавать тот же ServiceRequest из admin после звонка с source=`admin/phone` | SR-03, SR-07 | admin service create flow/UI | Заявка не отличается по downstream workflow; actor/source зафиксированы | M | P1 |
| SR-09 | Рабочее представление инженера | Список назначенных задач, принять, ожидания, результат, фото и передача оператору | E0-05, SR-07 | admin-ui engineer workspace, service policies | Engineer видит только назначенное; разрешённые статусы работают; result сохраняется | L | P1 |
| SR-10 | Миграция старых заявок | Привязать старые answers/status/events к compatibility form/version без потери invoice/consent | SR-01, SR-02 | migration, compatibility mapper | Количество заявок сохраняется; ФН и АТОЛ открываются; документы доступны | L | P0 |
| SR-11 | Service vertical E2E | Web form + files -> admin triage -> engineer -> client status | SR-05..10 | integration/browser tests | Полный сценарий проходит; включает IDOR, file policy и old-request regression | L | P1 |

## Этап 3. Развитие ботов

| ID | Название | Описание | Зависимость | Модули/файлы | Критерии приёмки | Сложность | Приоритет |
|---|---|---|---|---|---|---|---|
| BOT-01 | Characterization Telegram/MAX | Зафиксировать текущие меню, callbacks, тексты, media types, ФН, АТОЛ и регистрацию на fake adapters | E0-11 | `src/telegram`, `src/max`, tests | Тесты описывают существующее поведение и не обращаются во внешнюю сеть | L | P0 |
| BOT-02 | Channel-neutral form runner | Реализовать start/answer/resume/result поверх FormVersion и ServiceRequest | SR-02, BOT-01 | service form application layer | Runner не импортирует SDK; одинаковый input даёт одинаковый переход | L | P1 |
| BOT-03 | Telegram/MAX renderers | Преобразовать view model runner в text/buttons/files каждого SDK | BOT-02 | `src/telegram/renderers`, `src/max/renderers` (new) | Renderer покрывает типы полей/ошибки; business state не хранится в update class | L | P1 |
| BOT-04 | Перенос simple flows | Перевести firmware_update/kkt_remote_work на definitions и общий runner | BOT-03 | flows/seed/update classes | Definition одна; оба бота и web создают одинаковые answers | M | P1 |
| BOT-05 | Перенос ФН и АТОЛ | Сохранить декларативные поля, custom handler цены/PDF/upload/cancel | BOT-03, BOT-04 | handler registry, current service/PDF | Текущие сценарии проходят parity tests; счёт/оплата не меняются | L | P1 |
| BOT-06 | Durable state и update idempotency | Перенести mode/progress из process Map в durable state, хранить provider update key | BOT-02, E0-02 | userContext replacement, bot ingestion | Restart не теряет шаг; повтор update не создаёт второй ответ/заявку | L | P1 |
| BOT-07 | Унификация media ingestion | Скачивать разрешённые messenger media в FileStorage и отправлять actual media в обе стороны | E0-08, BOT-01 | messenger adapters, tickets/conversations | MAX operator media приходит как media, не текст; временная URL не является единственной копией | L | P1 |
| BOT-08 | Удаление дублирования по parity | Удалить только заменённые handlers/branches/unused module после automated и manual smoke | BOT-04..07 | update classes, Telegram handlers, max-messenger module | Нет мёртвых callbacks; все старые сценарии подтверждены; diff не содержит unrelated rewrite | M | P1 |

## Этап 4. Единый профиль клиента

`ID-04 / BKV1-0` частично выполнен: ручной operator approval, безопасная роль `representative`, session isolation и concurrency guards реализованы. Invitations, owner assignment policy и детальные organization capabilities остаются в backlog.

| ID | Название | Описание | Зависимость | Модули/файлы | Критерии приёмки | Сложность | Приоритет |
|---|---|---|---|---|---|---|---|
| ID-01 | Канонический customer backfill | Сделать `users.id` каноническим, backfill channels, добавить merge/status/phone fields | Этапы 1-3, E0-01 | users/channels/migrations | Все старые FK сохранены; для каждого messenger user есть channel | L | P1 |
| ID-02 | Привязка Telegram/MAX | Одноразовый nonce и deep link, transactional channel reassignment | ID-01 | identity API, bot commands | Владение подтверждается messenger account; nonce одноразовый/истекает | L | P1 |
| ID-03 | Клиентский кабинет | Заказы, сервис, регистрации, документы и preferences для подтверждённого профиля | ID-01, SHOP/SR APIs | client-ui account, identity API | Клиент видит историю всех своих подтверждённых каналов и только разрешённых организаций | XL | P1 |
| ID-04 | Безопасное членство организации | BKV1-0: operator approval реализован; далее invitations и детальные capabilities | BKV1-0 выполнен, ID-01 для cross-channel | organizations/members/admin/client | ИНН не даёт автоматический доступ; права представителя проверяются backend | L | P1 |
| ID-05 | Управляемый merge | Preview conflicts, transactional FK move, immutable merge audit и ручное разрешение | ID-01, ID-04 | identity merge service/admin | Нет auto-merge по телефону; source не удаляется; спорный merge обратим компенсирующей операцией | XL | P1 |

## Этап 5. Оборудование

| ID | Название | Описание | Зависимость | Модули/файлы | Критерии приёмки | Сложность | Приоритет |
|---|---|---|---|---|---|---|---|
| EQ-01 | Location и generic Equipment | Добавить точки, общее оборудование, KKT details и миграцию CashRegister | ID-04, SR-10 | `src/equipment` (new), assets migration | ККТ и не-ККТ создаются одной моделью; старые assets доступны | XL | P2 |
| EQ-02 | ФН/ОФД/лицензии | Перевести FN/OFD на FK Equipment, добавить SoftwareLicense и warranty | EQ-01 | equipment/assets/migrations | Даты и источники сохранены; orphan links обработаны отчётом | L | P2 |
| EQ-03 | История обслуживания | Создавать MaintenanceEvent из завершённой заявки и показывать историю | EQ-01, SR-09 | equipment/service/admin/client | Event связан с request/equipment; результат и документы доступны по правам | L | P2 |

## Этап 6. Напоминания

| ID | Название | Описание | Зависимость | Модули/файлы | Критерии приёмки | Сложность | Приоритет |
|---|---|---|---|---|---|---|---|
| NOT-01 | Durable scheduler/outbox | ScheduledEvent, Notification, Delivery и Postgres worker с locking/idempotency | EQ-02, E0-10 | `src/notifications`, `src/jobs` (new) | Два worker не отправляют дубль; retry/error/history сохраняются | L | P2 |
| NOT-02 | ФН и ОФД rule sets | Создавать предупреждения и operator escalation по срокам | NOT-01 | equipment/notifications/admin | Правила версионированы; изменённая дата пересчитывает pending jobs безопасно | M | P2 |
| NOT-03 | Каналы и preferences | Telegram/MAX/email routing, service/marketing categories и fallback | ID-02, NOT-01 | notification adapters/preferences | Opt-out соблюдается; недоставка создаёт одну operator task | L | P2 |

## Этап 7. Интеграции

| ID | Название | Описание | Зависимость | Модули/файлы | Критерии приёмки | Сложность | Приоритет |
|---|---|---|---|---|---|---|---|
| INT-01 | CSV/XLSX импорт из 1С | Staging, column mapping, preview, apply, report и idempotency | SHOP-01, реальный образец файла | `src/integrations/onec-import` (new), admin UI | Повтор файла безопасен; конфликты видимы; массовое удаление невозможно без явного режима | L | P2 |
| INT-02 | Mapping и export orders | Хранить external mappings и формировать согласованный экспорт заказа-заявки | SHOP-07, формат 1С | integrations/orders | Export не объявляется бухгалтерским документом; mapping аудитируется | M | P2 |
| INT-03 | Исследование АТОЛ/ОФД | Проверить официальные API, договорные права, лимиты, auth и sandbox; оформить adapter contracts | EQ-02, доступы | docs + integration ports | Есть подтверждённая документация/решение «доступно или нет»; секреты не получены в код | M | P2 |
| INT-04 | Первый внешний adapter | Реализовать один подтверждённый read-only sync через port с run/error history | INT-03, одобренный provider | `src/integrations/<provider>` (new) | Outage не ломает core; повтор идемпотентен; manual data не перезаписывается молча | XL | P2 |
| INT-05 | АТОЛ Connect + Platforma OFD shadow sync | Два изолированных bridge, mappings, observations и единая очередь возможностей | INT-03, INT-04 | `src/integrations`, `scripts/*-bridge.mjs`, admin UI | Данные поступают порциями и идемпотентно; клиентские сообщения не отправляются | XL | P1 |
| INT-06 | Эксплуатационная сверка shadow sync | Сверить выборку организаций, касс, ФН, подписок и сигналов с кабинетами; зафиксировать расхождения схемы | INT-05, локальные доступы | bridges, integration runs, checklist | Выборка по обоим источникам подтверждена; секреты не попали в БД/логи; решение о расписании принято отдельно | M | P1 |

## Этап 8. Подборщик оборудования

| ID | Название | Описание | Зависимость | Модули/файлы | Критерии приёмки | Сложность | Приоритет |
|---|---|---|---|---|---|---|---|
| PICK-01 | Versioned rule model | Вопросы, ответы, predicates, outcomes, explanations и validation | SHOP-01, стабильные attributes | `src/product-selector` (new) | Цикл/невалидная ссылка отклоняются; опубликованная версия immutable | L | P2 |
| PICK-02 | Rule engine | Детерминированный расчёт требований и товаров/комплектов | PICK-01 | product-selector/catalog | Одинаковый input даёт одинаковый result; hidden product исключён | L | P2 |
| PICK-03 | Client/admin UI | Пошаговый подбор, объяснение, add-to-cart/send-to-manager, editor preview | PICK-02 | client-ui/admin-ui | Результат добавляется в реальную корзину; rule editor имеет preview | L | P2 |

## Рекомендуемая следующая пачка на утверждение

Две ограниченные пачки закрыли E0-01/02/03/04/05/06/07/09 и базовую часть E0-11. Следующая пачка должна быть ограничена:

1. `E0-08` — единый FileStorage foundation и безопасный перевод существующих upload/download.
2. `E0-10` — минимальный audit log для staff/security и критичных текущих действий.
3. Расширение E0-11 тестами file ownership/MIME/size/path traversal и audit.

Только после E0-08 следует выполнять `E0-12` как повторяемый backup/restore БД и всех managed files. Страховочный архив не делает E0-12 завершённой.
# Phase-zero backlog update

E0-13, E0-14, and E0-15 are committed and the three required jobs passed in
[the `main` GitHub Actions run 30334738735](https://github.com/cltvv1/market-bot/actions/runs/30334738735).
The hosted backup/restore drill also passed in
[run 30334884014](https://github.com/cltvv1/market-bot/actions/runs/30334884014).
Stage 0 is complete. The remaining follow-up items are:

- enable `Quality`, `Production builds`, and
  `PostgreSQL, tests, and offline smoke` in branch protection;
- reduce legacy lint debt tracked by `scripts/lint-baseline.json`;
- split the client production bundle, which is currently 677.57 kB on the
  Linux hosted build;
- review the 40 dependency advisories by dependency chain and regression risk.

The next implementation package remains the first real shop vertical slice.
No shop or 1C implementation belongs to this phase-zero package.

## Backend v1 backlog update

BKV1-1 closes the canonical service-request foundation: one aggregate for channels, versioned forms, structured answers, customer-safe status/history, managed attachments, guarded transitions and manual staff creation.

The BKV1-1 migration drill is complete with verdict `PASS`. Legacy backfill, files, admin cards, Telegram/MAX compatibility and the new web flow were verified on disposable copies. BKV1-2 remains the next package after PR #9 review and merge; it is not part of the drill.

Remaining follow-up work is deliberately separate: form publication/admin editor, approved per-service schemas, retention/antivirus policy, durable message delivery, global messenger deduplication, realtime notifications, cleanup of compatibility columns after verified production backfill, and product-specific workflow expansion.

The next approved backend candidate is BKV1-2: registration KKT parity across web, Telegram, MAX and admin. It is not implemented in this package.
