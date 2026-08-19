# BKV1-2 backfill report

Дата проверки: 2026-08-19.

## Реальные legacy data

Реальная историческая/production БД в BKV1-2 не подключалась и не изменялась. Поэтому фактические production counts, реальные missing files и реальные неоднозначные строки не заявляются как проверенные. Перед rollout требуется dry-run на отдельной восстановленной копии с маскированным отчётом.

## Synthetic pre-BKV1-2 fixture

Migration test создаёт отдельную PostgreSQL DB `vitma_bkv12_migration_fixture_test`, применяет семь прежних migrations, добавляет synthetic legacy rows и только затем запускает BKV1-2 migration.

| Метрика                                     | Результат |
| ------------------------------------------- | --------: |
| Регистрации до/после                        |     6 / 6 |
| Historical processed                        |         1 |
| Historical stopped/cancelled                |         1 |
| Active                                      |         4 |
| Linked EquipmentKit                         |         5 |
| Найденные точные kit values                 |         9 |
| Active missing requirements                 |         6 |
| Legacy photo links                          |         2 |
| Неоднозначные фото (`requirementId = NULL`) |         2 |
| StoredFile до/после                         |     2 / 2 |
| Synthetic missing physical file record      |         1 |
| DB orphan evidence/file links               |         0 |
| Повторный migration run                     | 0 pending |

Fixture содержит: полный активный комплект, полный processed комплект, KKT-only, FN-only, OFD-only, stopped registration, существующее общее фото и StoredFile со статусом `missing`. Используются только значения с префиксом `SYNTHETIC`.

## Mapping

| Legacy condition                          | Requirement mapping                                | Readiness mapping                  |
| ----------------------------------------- | -------------------------------------------------- | ---------------------------------- |
| Active + exact non-empty linked-kit value | `provided/internal_registry`                       | не готова до operator verify       |
| Active + no exact value                   | `missing`, source null                             | `incomplete`                       |
| Processed + exact linked-kit value        | `verified/internal_registry`, historical timestamp | historical `ready`                 |
| Processed/stopped + no value              | `not_required`, historical reason                  | historical `ready`                 |
| General legacy photo                      | `legacy_photo`, `requirementId = NULL`             | не подтверждает item автоматически |
| Unknown channel/source                    | значение не выдумывается                           | остаётся missing/legacy-compatible |

`handedOffAt` backfill применяется только к `isProcessed`. Для `isStopped` readiness сохраняется historical-compatible, но ложная передача инженеру не создаётся.

## Ambiguity and files

Migration не выполняет OCR, fuzzy matching или чтение filenames. Старое общее фото нельзя доказанно отнести к ККТ, ФН или ОФД, поэтому связь остаётся общей. Наличие DB-row StoredFile не доказывает физическое наличие объекта; synthetic missing row сохранился и не блокировал migration.

## Safety verdict

Synthetic migration/backfill drill: `PASS`.

- IDs и legacy columns сохранены;
- row counts не изменились;
- exact values не потеряны и не стали verified для active rows;
- processed/stopped rows не переоткрыты;
- BKV1-2 migration повторяемо даёт `0 pending`;
- schema drift отсутствует.

Production rollout остаётся условным до отдельного dry-run на восстановленной копии реальной БД и FileStorage inventory. Отчёт такого dry-run не должен содержать реальные номера ККТ/ФН или коды ОФД.
