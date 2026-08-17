# VITMA MARKET

## Phase 0 quality foundation

The final phase-zero package adds reproducible GitHub Actions checks, unique
service-request HTTP ownership, and explicit React/legacy UI modes. Start with
`docs/quality/CI_GUIDE.md`,
`docs/architecture/SERVICE_REQUEST_ROUTE_INVENTORY.md`, and
`docs/architecture/UI_SERVING_MODES.md`.

Development uses Vite by default; Nest no longer silently falls back to legacy
HTML. Set `SERVE_BUILT_UI=true` only after `npm run build`. Production requires
the built admin and client React assets.

## E0-08, E0-10 and E0-12

Business uploads now use `FileStoragePort`; audit events are available to superadmins; PostgreSQL and `storage/` are backed up as one offline set.

```powershell
npm run migration:run
npm run files:backfill -- --dry-run
npm run files:backfill
npm run backup:create
npm run backup:verify -- --backup C:\path\to\backup-set
npm run backup:restore -- --backup C:\path\to\backup-set --target-db vitma_restore --target-storage C:\temp\vitma-storage
npm run backup:drill
```

Stop the application before backup creation. Current limits are 12 MB for images, 20 MB for documents, 30 MB for audio, 80 MB for video, 15 MB for invoices/generated PDFs and 20 MB for signed documents. Details: `docs/files/FILE_STORAGE_GUIDE.md`, `docs/audit/AUDIT_LOG_GUIDE.md`, `docs/backup/BACKUP_FORMAT.md`.

Единый проект клиентского сайта, операторской админки и ботов VITMA MARKET.

## Состав проекта

- `src/` — NestJS API, Telegram/MAX-боты, бизнес-логика заявок и раздача production frontend.
- `client-ui/` — клиентский сайт на React, TypeScript, Vite и React Router.
- `admin-ui/` — операторская админка на React, TypeScript и Vite.
- PostgreSQL — пользователи, организации, регистрации, вопросы и сервисные заявки.

## Требования

- Node.js 22+
- npm 10 or 11
- Docker Desktop
- заполненный `.env` в корне проекта на основе `.env.example`

## Первый запуск

```powershell
npm ci
docker compose up -d postgres
npm run migration:run
npm run start:dev:all
```

`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` и `DB_PASS` обязательны. Приложение не использует значения БД по умолчанию и всегда запускается с `synchronize: false`. Для локального запуска без polling и внешних обращений к Telegram установите `BOT_POLLING_ENABLED=false` и используйте только фиктивный или отдельный тестовый `BOT_TOKEN`; MAX отключается пустым `MAX_BOT_TOKEN`.

После запуска доступны:

- клиентский сайт с hot reload: `http://localhost:5174/site/`
- встроенная production-сборка сайта: `http://localhost:3000/site`
- админка с hot reload: `http://localhost:5173/admin/`
- встроенная админка: `http://localhost:3000/admin`
- Swagger в development/test: `http://localhost:3000/api/docs`

На Windows с сертификатами Минцифры backend запускается командой `start:dev:system-ca`, она уже входит в `start:dev:all`.

## Первый superadmin

Приложение не создаёт сотрудника автоматически и не принимает статический или query-токен. Первый superadmin создаётся только явной командой:

```powershell
npm run admin:create
```

Команда интерактивно запрашивает логин, отображаемое имя и скрытый пароль. Пароль должен содержать 12-128 символов, не менее трёх групп символов и не включать логин. Для защищённого non-interactive окружения поддерживаются `ADMIN_CREATE_LOGIN`, `ADMIN_CREATE_DISPLAY_NAME` и `ADMIN_CREATE_PASSWORD`; эти значения не следует сохранять в `.env`.

Один сотрудник может иметь несколько ролей: `operator`, `engineer`, `sales_manager`, `superadmin`. Управление сотрудниками, ролями, паролями, активностью и сессиями доступно superadmin во вкладке «Сотрудники». Старое поле `admin_users.role` временно сохранено только для обратной совместимости.

## Сессии и HTTP-защита

- админка использует server-side сессию в HttpOnly cookie с `SameSite=Strict`, TTL и отзывом;
- клиентский браузер получает отдельную анонимную server-side сессию в HttpOnly cookie с `SameSite=Lax`;
- браузер больше не выбирает `platform/chatId` и не использует UUID из `localStorage` как credential;
- mutation-запросы админки защищены same-origin проверкой;
- глобальная DTO-валидация отклоняет неизвестные top-level поля;
- ошибки API имеют единый формат с `requestId`;
- Helmet, раздельные rate limits и ограничения HTTP body включаются централизованно;
- `/health/live` проверяет процесс, `/health/ready` — PostgreSQL и наличие ожидаемой migration;
- в production CORS разрешает только `CORS_ORIGINS`, Swagger по умолчанию выключен;
- включённый в production Swagger требует действующую admin-сессию.

`Secure` для cookie включается автоматически при `NODE_ENV=production`. TLS должен завершаться на приложении или доверенном reverse proxy; `TRUST_PROXY` задаётся только в соответствии с реальной схемой deployment.

Базовые лимиты одного процесса:

| Bucket | Лимит |
|---|---|
| `admin-login` | 10 запросов / 60 секунд |
| `web-session-create` | 20 / 60 секунд |
| `public-form` | 30 / 600 секунд |
| `public-message` | 60 / 600 секунд |
| `public-sensitive-read` | 60 / 60 секунд |
| `public-read` | 120 / 60 секунд |

Лимит переопределяется переменными `RATE_LIMIT_<BUCKET>_LIMIT` и `RATE_LIMIT_<BUCKET>_WINDOW_SECONDS`, где дефисы заменяются подчёркиваниями. In-memory limiter подходит для одного экземпляра; распределённый лимитер понадобится только при горизонтальном масштабировании.

## Сборка

```powershell
npm run build
```

Команда последовательно собирает `admin-ui`, `client-ui` и NestJS. После сборки Nest раздаёт клиентский SPA по всем маршрутам `/site/*`.

## Данные клиентского сайта

Каталог, готовые решения по типу бизнеса, корзина и оформление заказов находятся в типизированных модулях `client-ui/src/data` и `client-ui/src/services`. Глобальный поиск по `/site/search` объединяет товары и сервисные направления. Корзина пока сохраняется в `localStorage`.

Сервисная форма по умолчанию использует реальный API, общий каталог `service_types` и тот же workflow, что Telegram и MAX. Созданные заявки сохраняются в PostgreSQL и отображаются в админке. Mock-режим можно включить только явно:

```env
VITE_USE_REAL_SERVICE_API=false
```

Для полноценной production-интеграции ещё потребуются backend-модели товаров, заказов и общих вложений сервисной заявки.

## Полезные команды

```powershell
npm run start:dev:all      # API + админка + клиентский сайт
npm run start:site         # только клиентский Vite frontend
npm run build:site         # TypeScript-проверка и сборка клиентского сайта
npm run test               # unit-тесты Nest
npm run test:characterization # pure/unit characterization tests
npm run test:e2e           # e2e-тесты Nest
npm run test:integration   # clean test DB + migrations + API/characterization
npm run db:backup          # резервная копия PostgreSQL
npm run start:bridge:atol  # read-only ATOL Connect bridge
npm run start:bridge:pofd  # read-only Platforma OFD bridge
npm run sync:integrations  # запустить обе синхронизации вручную
```

Настройка внешних синхронизаций описана в
[`docs/integrations/INTEGRATION_RUNBOOK.md`](docs/integrations/INTEGRATION_RUNBOOK.md).

Демонстрационные контакты и реквизиты вынесены в `client-ui/src/data/company.ts` и должны быть заменены перед публикацией.

## Миграции PostgreSQL

Схема изменяется только TypeORM migrations из `src/database/migrations`:

```powershell
npm run migration:show
npm run migration:run
npm run migration:revert
npm run migration:create
npm run migration:generate
npm run schema:log
```

Для миграции с собственным осмысленным именем используйте CLI напрямую:

```powershell
npm run typeorm -- migration:create src/database/migrations/AddExample
npm run typeorm -- migration:generate src/database/migrations/AddExample -d src/database/data-source.ts
```

Сгенерированную миграцию нужно проверить вручную до запуска. Initial migration создаёт 18 актуальных entity-таблиц и `typeorm_migrations`; старые таблицы `bids` и `bid_fields`, найденные только в локальной тестовой БД, в clean baseline не входят.

`InitialSchema.down()` удаляет всю созданную baseline-схему. `migration:revert` для initial migration разрешён только на disposable development/test DB без ценных данных и не должен запускаться на сохранённой старой `db`.

## Отдельная test DB

Integration tests обязаны использовать отдельную БД, имя которой оканчивается на `_test` и не совпадает с `DB_NAME`:

```powershell
$env:TEST_DB_NAME = "vitma_test"
npm run db:test:create
npm run migration:test:run
npm run migration:test:show
npm run schema:test:log
npm run test:integration
```

`test:integration` пересоздаёт только указанную `*_test` БД, применяет migrations и запускает characterization suite. По умолчанию test DB использует сервер и учётные данные `DB_*`; их можно переопределить через `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER` и `TEST_DB_PASS`.

Текущая история:

1. `InitialSchema1785067383157` — clean baseline.
2. `SecurityFoundation1785079000000` — роли сотрудников, поля отзыва сессий, анонимные web-сессии и назначение инженера.

`SecurityFoundation.down()` удаляет security foundation и предназначен только для disposable test/development DB. На БД с ценными данными его выполнять нельзя.

## Backup и restore

Текущий DB-only backup:

```powershell
npm run db:backup
npm run db:restore -- -DumpPath "backups\example.dump" -Force
```

Перед initial migration дополнительно создана одноразовая страховочная копия в `backups/preflight-20260726_184939`: PostgreSQL dump, архив текущего `storage`, manifest размеров/SHA-256 и результат restore drill. Это не завершает E0-12: повторяемая система backup/restore БД и файлов будет добавлена после FileStorage foundation E0-08.
