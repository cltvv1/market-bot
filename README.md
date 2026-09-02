# VITMA MARKET

Единый pre-production проект клиентского сайта, операторской админки,
Telegram/MAX-ботов и NestJS backend для VITMA MARKET.

Текущее подтверждённое состояние, реальные UI-разрывы и порядок дальнейшей
работы: [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md).

## Состав проекта

- `src/` - NestJS modular monolith, API, общая бизнес-логика и адаптеры Telegram/MAX;
- `client-ui/` - клиентский React/TypeScript/Vite сайт;
- `admin-ui/` - React/TypeScript/Vite админка;
- PostgreSQL - единая база всех runtime-модулей;
- `storage/` - текущий локальный адаптер `FileStoragePort` для development и
  контролируемого pre-production использования; production-топология хранения
  остаётся отложенной;
- `src/database/migrations/` - append-only цепочка из 11 migrations от чистой
  pre-production baseline до текущей схемы.

Решение о чистой исходной baseline зафиксировано в
[`docs/architecture/preproduction-baseline.md`](docs/architecture/preproduction-baseline.md).
Система не поддерживает отброшенные development-форматы, старые маршруты или
схемы до этой baseline. Все последующие изменения применяются append-only
migrations.

## Требования

- Node.js 22.20.x;
- npm 10 или 11;
- Docker Desktop;
- `.env` в корне на основе `.env.example`.

`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` и `DB_PASS` обязательны.
`synchronize` всегда выключен. Локальный `.env`, `storage/`, `backups/`, dumps
и archives игнорируются Git.

## Первый запуск с пустой БД

```powershell
npm ci
docker compose up -d postgres
npm run migration:run
npm run start:dev:all
```

Первый запуск Nest bootstrap создаёт текущие типы услуг и одну опубликованную
версию каждой активной формы. Старые данные и версии форм не импортируются.

Для безопасного локального запуска без внешних вызовов используйте отдельный
фиктивный Telegram token, `BOT_POLLING_ENABLED=false` и пустой
`MAX_BOT_TOKEN`. Не используйте реальные provider credentials в тестах.

После запуска доступны:

- клиентский Vite UI: `http://localhost:5174/site/`;
- админский Vite UI: `http://localhost:5173/admin/`;
- Nest API: `http://localhost:3000`;
- Swagger в development/test: `http://localhost:3000/api/docs`;
- health: `http://localhost:3000/health/live` и `/health/ready`.

После `npm run build` Nest может раздавать обе React-сборки при
`SERVE_BUILT_UI=true`. Отдельного static/HTML UI и fallback-режима нет.

## Первый superadmin

Приложение не создаёт сотрудника автоматически и не принимает статический
admin token. Создайте первую учётную запись явно:

```powershell
npm run admin:create
```

Роли хранятся только в `admin_user_roles`: `operator`, `engineer`,
`sales_manager`, `superadmin`. Один сотрудник может иметь несколько ролей.

## Канонические процессы

### Доступ к организациям

Ввод ИНН создаёт `pending` access request. Только `operator` или `superadmin`
может одобрить запрос, после чего появляется active membership с ролью
`representative`. Знание ИНН само по себе не даёт доступ к организации.

### Сервисные заявки

Web, Telegram, MAX, admin и integrations используют один публичный
`ServiceRequestsService` и одну `service_requests` модель. Web работает через
server-side draft, структурированные answers, вложения и idempotent submit.
Публичный статус использует отдельный bearer token; номер заявки не является
credential. Текущий способ формирования, передачи и отзыва token отмечен как
production security gap в `docs/PROJECT_STATUS.md`.

### Регистрация ККТ

`RegistrationRequestEntity` дополняется checklist из `kkt_serial`,
`fiscal_drive_serial` и `ofd_code`. Клиентские значения получают состояние
`provided`, но не `verified`. Final PDF и engineer handoff разрешаются backend
только при readiness `ready`. Код ОФД маскируется и не передаётся через URL,
callback или AuditEvent.

### Файлы

Runtime хранит предметные ссылки на `StoredFile`; новые Support/Order downloads
проверяют строгий контекст владельца. Для части старых общих file purposes ещё
остаётся permissive fallback, который должен быть закрыт до production.
Допустимые типы и размеры описаны в
[`docs/files/FILE_STORAGE_GUIDE.md`](docs/files/FILE_STORAGE_GUIDE.md).

## Миграции PostgreSQL

Схема создаётся последовательным применением 11 append-only migrations:

```text
InitialPreproductionBaseline1787388476982
...
AddOrderFulfillmentCompletionWorkflow1788355200000
```

Команды:

```powershell
npm run migration:show
npm run migration:run
npm run migration:revert
npm run migration:create
npm run migration:generate
npm run schema:log
```

`migration:revert` допустим только на disposable development/test DB. Базы,
созданные до чистой pre-production baseline, не обновляются этой цепочкой:
такое development окружение пересоздаётся с нуля.

## Отдельная test DB

Имя integration DB обязательно оканчивается на `_test` и не совпадает с
`DB_NAME`:

```powershell
$env:TEST_DB_NAME = "vitma_test"
npm run db:test:create
npm run migration:test:run
npm run migration:test:show
npm run schema:test:log
npm run test:integration
```

`test:integration` удаляет и создаёт только явно заданную `*_test` БД, применяет
полную migration chain и запускает PostgreSQL integration suite.

## Backup и restore

Координированный backup включает PostgreSQL и текущий `storage/`:

```powershell
npm run backup:create
npm run backup:verify -- --backup C:\path\to\backup-set
npm run backup:restore -- --backup C:\path\to\backup-set --target-db vitma_restore_test --target-storage C:\temp\vitma-restore-storage
npm run backup:drill
```

Перед `backup:create` приложение должно быть остановлено. Restore требует
отдельные БД и storage path. Формат и drill описаны в
[`docs/backup/BACKUP_FORMAT.md`](docs/backup/BACKUP_FORMAT.md).

## Проверки

```powershell
npm run config:check
npm run lint:baseline
npm test -- --runInBand
npm run test:integration
npm run test:e2e -- --runInBand
npm run build
npm run ci:offline-smoke
```

Сводные CI-команды:

```powershell
npm run ci:quality
npm run ci:database
npm run ci:build
```

## Клиентский магазин

Catalog и полный whole-order sales workflow уже реализованы в PostgreSQL
backend. Однако видимые каталог, корзина и checkout остаются демонстрационными:
они используют hardcoded frontend data, `localStorage` и не создают backend
Order. Клиентские order screens и staff workspaces для Catalog/Support/Orders
ещё отсутствуют. Переключение на реальные API входит в FE-1; онлайн-эквайринг
явно отложен.

## Интеграции

ATOL/Platforma OFD bridge запускаются отдельно и не входят в обычный bootstrap:

```powershell
npm run start:bridge:atol
npm run start:bridge:pofd
npm run sync:integrations
```

Контракты и ограничения находятся в `docs/integrations/`. Реальные provider
credentials и внешние вызовы не используются в CI.
