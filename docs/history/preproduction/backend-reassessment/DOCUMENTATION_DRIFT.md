# Documentation drift

This file records material drift only; historical documents were not rewritten.

| Document | Historical statement | Current fact | Impact | Action |
|---|---|---|---|---|
| `docs/TARGET_ARCHITECTURE.md` | E0-08 FileStorage and E0-10 Audit Log not implemented | both exist with migrations, services and tests | readers may plan already-finished foundation | update status section; retain target architecture |
| `docs/ROADMAP.md` E0 table | Audit Log/full backup statements reflect older stage | Audit Log and DB+storage backup format/verification exist; production scheduling/external copy remain incomplete | completed foundation and operations gap are conflated | split implemented foundation from pilot operations |
| `docs/PROJECT_AUDIT.md` admin | RBAC absent | multi-role RBAC, permission guard and security tests exist | security maturity understated | replace with link to B1/security foundation |
| `docs/PROJECT_AUDIT.md` files | registrations/tickets/PDF use only local paths; FileStorage absent | StoredFile adopted for core new paths, legacy fallbacks remain | migration state misstated | mark `PARTIAL/LEGACY`, link file inventory |
| `docs/PROJECT_AUDIT.md` integrations | integration branch not merged / integrations absent | integration foundation is on main with migration, admin APIs and integration tests | backend scope understated | update to shadow foundation; retain live verification caveat |
| `docs/PROJECT_AUDIT.md` service web | web integration incomplete/disabled framing | React defaults to real service API and common service types; contract is still narrow | wrong reason for incompleteness | state “real but structurally incomplete” |
| `docs/PROJECT_AUDIT.md` backup | full backup/restore absent | backup utility verifies DB dump + storage archive in isolated restore tests | operation maturity understated | distinguish utility from scheduled off-host production process |
| `docs/reassessment/*` | current site is mock catalog/local cart and real partial service/registration | confirmed by current code | still accurate | preserve and cross-link this audit |
| `docs/bots/B1_FIX_REPORT.md` | B1 callback/media/temp/chat fixes | current tests and code still confirm fixes | reliable historical baseline | preserve |
| `docs/bots/BOT_*` | some high/medium findings deferred: outbox, dedupe, durable state/decomposition | still deferred | remains relevant | preserve; update only after reliability package |
| `docs/integrations/*` | live provider checks reported on prior date | not independently re-run in this audit; code/tests confirm only normalized foundation | runtime freshness unknown | retain dated evidence and require operational revalidation |
| `README.md` | catalog/cart are typed frontend data and localStorage; real models still needed | confirmed | accurate | preserve |
| `docs/BACKLOG.md` | contains older E0 statuses mixed with current integration tasks | several foundation items are complete, pilot hardening remains | prioritization noise | archive completed E0 rows or point to current status map |
| `docs/OPEN_QUESTIONS.md` | mixes resolved decisions, product questions and historical English items | multi-role decision is already implemented; many catalog/order questions remain valid | unclear decision queue | replace resolved items with references; keep owner decisions only |

## Canonical navigation recommendation

- Use this directory for the current backend baseline and Backend v1 boundary.
- Keep `docs/reassessment/` as the current client-site baseline.
- Keep `docs/bots/` and `docs/integrations/` as specialist audits with dated runtime claims.
- Keep `TARGET_ARCHITECTURE.md` aspirational, but add a prominent “implemented vs target” link rather than repeatedly copying status tables.
- Do not delete legacy reports until their unique evidence and commit context are linked from newer summaries.
