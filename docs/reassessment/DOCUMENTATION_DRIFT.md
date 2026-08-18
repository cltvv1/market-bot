# Карта documentation drift

Проверка выполнена против `main` / `be9c755`. Этот документ не переписывает историю, а отмечает, каким источникам можно доверять сейчас.

## Существенные расхождения

| Документ / утверждение | Фактическое состояние | Серьёзность | Действие |
|---|---|---|---|
| `PROJECT_AUDIT.md` 5.4: Files/Audit/notifications/integrations не найдены; integration только в ветке | StoredFile/Audit и integrations находятся в `main`; payment proof и 8 integration entities мигрированы | High | Обновить основной аудит или пометить snapshot датой |
| `PROJECT_AUDIT.md` 6.1: service routes зарегистрированы дважды | В `ClientApiController` service-request routes больше нет; единственный controller `ServiceRequestsController` | High | Исправить finding как resolved E0-14 |
| `PROJECT_AUDIT.md` 8.1: нет staff/roles/audit/engineer view | Staff/RBAC/Audit UI/API есть; engineer filtering есть, но workflow частичный | High | Обновить admin inventory |
| `PROJECT_AUDIT.md` 8.2/9.4: legacy выбирается при отсутствии build artifact | Текущий `UiServingService` требует явный flag; production запрещает legacy | Medium | Исправить описание serving policy |
| `PROJECT_AUDIT.md` 9.1/9.2: service form/status/callback mock по умолчанию | `VITE_USE_REAL_SERVICE_API !== false`; service/callback по умолчанию идут в API, status session-backed | High | Обновить; сохранить описание mock fallback |
| `PROJECT_AUDIT.md` 12–16: FileStorage/Audit/full backup/CI отсутствуют или блокируют | Foundation и CI реализованы; текущие blockers другие: shop, durable delivery/state, deployment decisions | High | Пересобрать risk/readiness section |
| `PROJECT_AUDIT.md` результаты: 14 unit, 16 integration, 2 migrations | Сейчас 71 unit, 30 integration, 6 e2e, 5 migrations | Medium | Не обновлять числа вручную в старом snapshot; сослаться на reassessment |
| `TARGET_ARCHITECTURE.md` top: E0-08/E0-10/E0-12 не реализованы | Files, Audit и coordinated backup/restore уже есть | High | Обновить foundation status |
| `TARGET_ARCHITECTURE.md` Integrations: АТОЛ/ОФД future | Read-only shadow integration foundation и local bridges уже реализованы | Medium | Разделить current/shadow и future production adapter |
| `TARGET_ARCHITECTURE.md` Catalog/Orders | Остаётся корректной target-моделью, не current state | Low | Оставить, добавить явную ссылку на reassessment |
| `BACKLOG.md` E0-08/E0-10/E0-12 status | В ранних status rows помечены pending, ниже имеются follow-ups; итог неоднозначен | High | Свернуть E0 в immutable completion table и вынести follow-ups |
| `BACKLOG.md` BOT-01/BOT-07 | Значительная часть выполнена B1, но общий backlog всё ещё описывает исходное состояние | Medium | Привязать к B1 report и оставить только deferred scope |
| `BACKLOG.md` INT-03/04 | Research/first adapter показаны future, хотя shadow foundation в main | Medium | Обновить на current shadow + production validation follow-up |
| `ROADMAP.md` phase sequence | Stage 0 completion и B1/integrations отражены addendum, но основной порядок не учитывает новый website redesign decision | Medium | После выбора стратегии создать короткий revised roadmap, не сейчас |
| `OPEN_QUESTIONS.md` OQ-22: АТОЛ/ОФД только архитектурные ports | Bridges и import core есть; юридическое право/production support всё ещё не подтверждены | Medium | Переформулировать вопрос, не считать закрытым |
| `OPEN_QUESTIONS.md` legacy UI deletion | Вопрос остаётся, но production уже строго React | Low | Оставить как cleanup decision |
| `README.md` migrations: перечислены только Initial + Security | Фактически 5, добавлены FileStorage/Audit, payment proof, integrations | High | Обновить migration history |
| `README.md` initial migration создаёт 18 entity tables | После всех migrations текущая схема существенно шире; фраза формально про initial, но легко неверно читается | Low | Уточнить current total отдельно от initial |
| `README.md` frontend limitations | Каталог/cart/order mock и real service default описаны верно | None | Сохранить |
| `quality/CI_GUIDE.md` | CI topology и safe env соответствуют workflow; конкретные bundle/legacy counts могут устаревать | Low | Генерировать цифры из последнего run или не фиксировать их |
| `bots/B1_FIX_REPORT.md` | Соответствует коду и текущим tests | None | Оставить canonical для B1 |
| `bots/BOT_AUDIT_SUMMARY.md` risk register содержит дорефакторные формулировки про fixed callbacks/OFD/MAX media | В таблице B1 status исправлен, но нижний общий risk/readiness текст всё ещё говорит «blocked» | Medium | Добавить post-B1 consolidated status или архивную маркировку |
| `integrations/*` | Архитектура, contracts и runbook соответствуют текущему модулю | None | Оставить canonical для shadow integration |
| `files/*`, `backup/*`, `audit/*` | Соответствуют foundation и scripts | Low | Оставить; повторять restore drill только по операционной процедуре |

## Рекомендуемая политика документов

1. Сделать `docs/reassessment/AUDIT_SUMMARY.md` входной точкой текущего состояния.
2. Сохранить прежний `PROJECT_AUDIT.md` как исторический snapshot, но добавить в начало заметную ссылку и дату, а не продолжать наращивать addendum.
3. Разделить `TARGET_ARCHITECTURE` на current foundation markers и target sections; не выдавать target entities за реализованные.
4. После продуктового решения по сайту заменить детальный старый roadmap коротким sequence of decisions; backlog реализации не расширять до выбора модели магазина.
5. Оставить bot B1 и integration docs предметными canonical-источниками.

## Что актуально без оговорок

- `docs/bots/B1_FIX_REPORT.md` для B1 scope и deferred risks.
- `docs/integrations/INTEGRATION_ARCHITECTURE.md`, `PROVIDER_CONTRACTS.md`, `INTEGRATION_RUNBOOK.md` для shadow sync.
- `docs/files/FILE_STORAGE_GUIDE.md` и `docs/backup/BACKUP_FORMAT.md` для storage/backup foundation.
- `.github/workflows/ci.yml` и `package.json` как источник фактического CI pipeline.

## Что оставить историческим

- Baseline schema/restore reports с указанной датой и commit.
- Первичный bot audit как evidence до B1, при условии ссылки на B1 report.
- Ранние Stage 0 findings, которые уже закрыты, без попытки переписать историю задним числом.
