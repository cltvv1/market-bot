# Функциональная инвентаризация

Статусы относятся к `main` / `be9c755`. `WORKING` требует подтверждения безопасным запуском; `CODE_CONFIRMED` означает, что путь найден и покрыт кодом/тестом, но не выполнялся вручную полностью.

## Клиентский сайт

| Функция и цель | Вход / реализация | Backend и данные | Статус | Доказательство и ограничение |
|---|---|---|---|---|
| Главная: объяснить магазин + сервис | `/site`, `HomePage` | `data/catalog`, `services`, `solutions` | MOCK | Browser 5 viewport; контент и большинство обещаний статические |
| Поиск товаров/услуг | `/site/search`, `SearchPage` | Поиск только по импортированным frontend arrays | MOCK | Browser; PostgreSQL/API не участвуют |
| Каталог/фильтры/сортировка | `/site/catalog`, `CatalogPage` | 24 `Product` в `data/catalog.ts` | MOCK | Browser: «24 позиции для демонстрации» |
| Карточка товара | `/site/catalog/:slug`, `ProductPage` | Frontend product object | MOCK | Browser; изображения `ProductVisual` являются иллюстративными заглушками |
| Корзина | `/site/cart`, `CartContext` | `localStorage: vitma_cart` | LOCAL_ONLY | Browser add-to-cart прошёл; серверного cart нет |
| Checkout | `/site/checkout`, `CheckoutPage`, `orderService.create` | Случайный номер и `vitma_order_*` в localStorage | LOCAL_ONLY | Success UI не доказывает серверный заказ; сущностей/API Order нет |
| Статус заказа | отсутствует | отсутствует | NOT_IMPLEMENTED | Нет route/API/entity |
| Готовые решения | `/site/solutions`, `SolutionsPage` | `data/solutions.ts` | MOCK | Browser; CTA переводят в каталог/форму |
| Сервисный обзор | `/site/service`, `ServicePage` | Frontend content + ссылки | CODE_CONFIRMED | Browser route работает; пакеты не являются backend products |
| ServiceRequest form | `/site/service/request`, `ServiceRequestPage` | `/api/client/service-requests/*`, `ServiceRequest`/events | WORKING | Browser + integration; только 3 типа, web-поля сворачиваются в 2/4 answers |
| Черновик service form | тот же route | `vitma_service_draft` без files | LOCAL_ONLY | Код; не переносится между устройствами, server draft уже создаётся только при submit |
| Вложения service form | поле `files` в frontend type | endpoint отсутствует | NOT_IMPLEMENTED | В UI нет file input, `StoredFile` к общей заявке не привязывается |
| Статус сервисной заявки | `/site/service/status`, `serviceRequestService.find` | список заявок текущей web-session | PARTIAL | Работает ownership; история синтетическая из `createdAt`, нет event history/assignee/comments |
| Web-регистрация ККТ | `/site/cash-registration`, `CashRegistrationPage` | registration fields/form, PostgreSQL, PDF, admin | WORKING | Browser + integration/e2e; обязательные org/INN/phone |
| Фото комплекта при web-регистрации | отсутствует в странице/controller | backend service умеет bot photo | NOT_IMPLEMENTED | Browser: 0 file inputs; flow отличается от Telegram/MAX |
| Обратный звонок | global `CallbackDialog` | POST ticket message с текстом темы/телефона | PARTIAL | Сервер сохраняет тикет, но callback не имеет своей модели/статуса |
| Клиентский чат/вопрос оператору | UI отсутствует | ticket open/messages/media/file API готов | UI_ONLY | Backend WORKING, но React не вызывает API кроме callback message |
| Мои организации | UI отсутствует | list/link-by-INN API, Organization/Member | UI_ONLY | API интеграционно покрыт; link-by-INN сразу даёт active membership |
| Моё оборудование/ФН/ОФД | UI отсутствует | assets API/entities | UI_ONLY | Backend endpoints есть, route React нет |
| Личный кабинет/единая история | отсутствует | только anonymous session и отдельные APIs | NOT_IMPLEMENTED | Нет account route или channel linking UI |
| Информационные страницы | about/delivery/warranty | статический React content | CODE_CONFIRMED | Browser routes работают; факты требуют бизнес-проверки |
| Контакты/реквизиты/карта | `/site/contacts` | `data/company.ts` | MOCK | Browser показывает явные demo notices и map placeholder |
| Privacy | `/site/privacy` | статический demo-текст | MOCK | Browser; документ сам сообщает демонстрационный статус |
| 404 | wildcard `NotFoundPage` | нет | WORKING | Browser; семантически используется H2 вместо H1, title не обновляется |

## Админка

| Функция и цель | Вход / реализация | Entities/storage | Статус | Доказательство и ограничение |
|---|---|---|---|---|
| Login/logout/long session | `/admin`, admin auth/session | `admin_users`, `admin_sessions` | WORKING | Offline browser smoke login/logout; cookie-only, TTL/revoke |
| Multi-role RBAC | permission guard + staff UI | `admin_user_roles` | WORKING | Security integration + permission tests |
| Управление сотрудниками | staff tab/API | AdminUser/roles/sessions | WORKING | Код + admin smoke foundation; superadmin-only mutations |
| Регистрации | registrations workspace | Registration, StoredFile, EquipmentKit | CODE_CONFIRMED | API/UI/test; PDF/photo/kit/status/priority actions найдены |
| Вопросы и чат | tickets workspace | Ticket, TicketMessage, StoredFile | CODE_CONFIRMED | Messages/media/download/close endpoints и tests |
| Сервисные заявки | service workspace | ServiceRequest/Event/StoredFile | CODE_CONFIRMED | Invoice, proof, payment, visit, engineer, complete/cancel |
| Клиентская карточка | customer-card API/UI | User, organizations, activities/assets | CODE_CONFIRMED | История registrations/service/tickets; нет Order |
| Организации/assets/kits | tabs/API | Organization, KKT, FN, OFD, Kit | CODE_CONFIRMED | CRUD/list paths найдены; generic equipment/location нет |
| Audit Log | audit tab/API | append-only `audit_events` | CODE_CONFIRMED | Sanitizer/unit/integration; superadmin read |
| Integration runs/errors/exclusions | integrations UI/API | integration entities | CODE_CONFIRMED | Integration tests; provider bridges вручную не запускались |
| Service opportunities | opportunities workspace | Opportunity/observations | CODE_CONFIRMED | Convert-to-ServiceRequest tested; shadow only |
| Заказы/каталог магазина | отсутствуют | отсутствуют | NOT_IMPLEMENTED | Нет permissions/entities/endpoints/tab |
| Engineer workspace | permission-filtered service list | assignedEngineer relation | PARTIAL | Engineer видит назначенное read-only; отдельного рабочего flow результата нет |
| React architecture | `admin-ui/src/App.tsx` | client API calls | PARTIAL | Работает, но 412-line single-file tab application, часть `any`, router отсутствует |
| Legacy admin | `src/admin/admin.page.ts` | те же APIs | DEAD_OR_UNUSED | Доступна только при явном `ENABLE_LEGACY_UI`; production запрещает этот mode |

## Telegram и MAX

Актуальная подробная parity-матрица остаётся в `docs/bots/*`; ниже только текущее резюме после B1.

| Функция | Telegram | MAX | Общий backend | Статус / доказательство |
|---|---|---|---|---|
| Start/menu | handler | handler | Users/ClientWorkflow | CODE_CONFIRMED; handler tests |
| KKT registration + photo + PDF | update/handlers | update | Registration/Files/PDF | CODE_CONFIRMED; characterization/integration |
| Simple service requests (2) | update | update | ServiceRequests | CODE_CONFIRMED; shared flow |
| FN replacement | update | update | ServiceRequests | CODE_CONFIRMED; price/invoice/payment workflow |
| ATOL consent + signed file | update | update | ServiceRequests/PDF/Files | CODE_CONFIRMED; cleanup tests |
| Question/operator ticket | handlers | update | Tickets/ClientWorkflow | CODE_CONFIRMED; integration |
| Text operator chat | operator handler | update | Tickets/Messenger | PARTIAL; restart fail-safe, mode не durable |
| Customer media | Telegram metadata path | bounded MAX download | TicketMessage/Files | PARTIAL; MAX hardened, Telegram provider URL risk deferred |
| Operator image/document | messenger adapter | binary MAX adapter | MessengerService | CODE_CONFIRMED; MAX regression tests |
| Admin notification binding/preferences | callbacks | callbacks | AdminUser bindings | CODE_CONFIRMED; B1 access tests |
| Admin work inside bots | legacy Telegram callbacks restricted | отсутствует как основной UI | existing RBAC | PARTIAL; web-admin является основной рабочей поверхностью |
| OFD action | ticket routing | ticket routing | Tickets | CODE_CONFIRMED; dedicated OFD renewal NOT_IMPLEMENTED |
| Durable conversation state | in-memory mode + partial DB context | in-memory mode | нет общего engine | NOT_IMPLEMENTED |
| Incoming update deduplication | отсутствует | отсутствует | отсутствует | NOT_IMPLEMENTED |
| Outbox/retry/delivery status | отсутствует | отсутствует | direct sends | NOT_IMPLEMENTED |

## Backend и эксплуатация

| Возможность | Реализация | Статус | Доказательство / предел |
|---|---|---|---|
| PostgreSQL migrations | 5 TypeORM migrations | WORKING | clean run twice, show и schema log passed |
| Anonymous web ownership | HttpOnly session, hashed token | WORKING | security/integration tests |
| FileStorage | local provider, policies, checksum | WORKING | unit/integration; S3/AV не реализованы |
| Coordinated backup/restore | `scripts/backup.mjs` | CODE_CONFIRMED | существующий restore drill документ; в этом аудите не запускался, чтобы не трогать backup resources |
| Health/live/ready | `/health/*` | WORKING | offline smoke HTTP 200 |
| Audit Log | append-only service | WORKING | sanitizer + integration tests |
| External synchronization core | normalized import, mappings, observations, opportunities | WORKING | integration tests на test DB |
| ATOL/POFD bridges | local scripts with protected `/sync` | LOCAL_ONLY | Код/документация; реальные provider sessions не использовались |
| 1С integration | только target/backlog | NOT_IMPLEMENTED | Нет adapter/import |
| Notifications reliability | direct messenger calls | PARTIAL | Нет durable outbox/retry/metrics |
| CI | quality/build/database/offline smoke | WORKING | полный официальный набор passed 2026-08-18 |
