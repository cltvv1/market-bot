# BKV1-0: подтверждаемый доступ к организации

## Причина изменения

До BKV1-0 `POST /api/client/organizations/link-by-inn` создавал или реактивировал `OrganizationMember` как `active` и по умолчанию назначал `owner`. Любой клиент с web-сессией и известным ИНН сразу получал доступ к защищённым объектам организации.

## Новая модель

`OrganizationAccessRequest` отделён от `OrganizationMember`. Знание ИНН теперь только находит либо создаёт базовую организацию и создаёт запрос:

```text
pending -> approved
        -> rejected
        -> cancelled (только клиентом из pending)
```

В один момент допускается один `pending`-запрос пары organization/customer. Это обеспечено partial unique index и транзакционной advisory lock по нормализованному ИНН. Повторная отправка возвращает существующий запрос. Повторное approve возвращает достигнутый результат без второго membership или audit success.

## Public flow и API

- `POST /api/client/organizations/link-by-inn` сохраняет прежний URL, но создаёт только `pending` access request. Поле роли запрещено DTO.
- `GET /api/client/organizations/access-requests` возвращает только запросы текущей server-side web-сессии.
- `GET /api/client/organizations/access-requests/:id` возвращает только собственный запрос.
- `POST /api/client/organizations/access-requests/:id/cancel` отзывает собственный `pending`-запрос.
- `GET /api/client/organizations` возвращает только `active` memberships.

До approve клиент видит ID и статус собственного запроса, собственные введённые контакты, display name и маскированный ИНН. Ответ не содержит equipment, registrations, requests, documents, members, внутренний review comment или AdminUser.

## Admin flow и permissions

- `GET /admin/api/organization-access-requests?status=...`
- `GET /admin/api/organization-access-requests/:id`
- `POST /admin/api/organization-access-requests/:id/approve`
- `POST /admin/api/organization-access-requests/:id/reject`

`operator` и `superadmin` получают `organizationAccess.read` и `organizationAccess.review`. `engineer` и `sales_manager` не получают эти permissions. Backend guards остаются источником истины.

Approve блокирует строку запроса, повторно проверяет статус и в одной транзакции создаёт/активирует единственный membership с ролью `representative`, сохраняет reviewer/comment/time и AuditEvent. Существующий `owner` не понижается, но новый `owner` через этот API назначить невозможно. Reject не изменяет membership.

## Migration и legacy policy

Forward migration создаёт `organization_access_requests`, FK на organization/user/reviewer, status/role checks, индексы и partial unique index для pending. Существующие organizations, memberships и owners не изменяются и не получают фиктивные approved requests. Их легитимность проверяется отдельно вручную; destructive backfill запрещён.

## Совместимость

Регистрации ККТ, сервисные заявки и вопросы можно создавать без membership и без organizationId. Введённые в обращении реквизиты остаются snapshot обращения и не предоставляют доступ к существующим активам. Telegram/MAX сценарии в этом пакете не изменялись.

## Audit Log

Фиксируются `organization_access.submitted`, `organization_access.duplicate_submission`, `organization_access.cancelled`, `organization_access.approved`, `organization_access.rejected`, `organization_membership.created` и `organization_access.denied`. RBAC-отказы фиксируются общим `permission.denied`. Контакты, комментарии и полный ИНН в metadata не записываются.

## Тесты и ограничения

Интеграционные тесты покрывают pending без membership, session isolation, DTO rejection, approve/reject/cancel, role matrix, disabled staff, asset denial, AuditEvent и параллельные submit/approve. OpenAPI описывает public DTO, status enum и admin permissions.

Ручная проверка оператором является временным рабочим процессом, а не окончательной юридической идентификацией представителя. Не реализованы SMS/OTP, приглашения владельцем, partner status, детальная ACL, объединение каналов и уведомления о решении.

Следующий пакет: **BKV1-1 Canonical service requests**. Он должен использовать только подтверждённый organization context, но поддерживать ad-hoc обращение без membership.
