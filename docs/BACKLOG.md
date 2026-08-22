# Current backlog

Only post-rebaseline work is listed here. Completed migration/conversion tasks
are recorded in Git history and the purge report.

| ID | Task | Dependency | Acceptance | Size | Priority |
|---|---|---|---|---|---|
| CH-01 | Restart code-health audit | Rebaseline merged and main CI green | New reports use the merge SHA; active/dead/uncertain code is evidenced | M | P0 |
| SHOP-01 | Catalog/order domain contract | Product decisions for price, availability and permissions | Approved entities, status model and API contract without replacing 1C | M | P1 |
| SHOP-02 | Admin catalog vertical | SHOP-01 | Staff creates, edits, publishes and hides one product with images/attributes | L | P1 |
| SHOP-03 | Customer catalog from API | SHOP-02 | Current UI reads PostgreSQL catalog; filters and product routes remain usable | L | P1 |
| SHOP-04 | Order-request workflow | SHOP-03 | Customer submits items/contact; sales manager assigns, comments, uploads invoice and changes status | XL | P1 |
| SR-01 | Approve current service form schemas | Business field/status decisions | Each published type has an approved versioned schema and channel visibility | M | P1 |
| SR-02 | Finish web status/message UX | SR-01 | Public-token/session views show real status, files and messages without local-only status data | L | P1 |
| BOT-01 | Durable conversation state | CH-01 | Restart does not lose active flow; stale state expires explicitly | L | P1 |
| BOT-02 | Inbound deduplication | BOT-01 | Replayed Telegram/MAX events do not duplicate domain effects | L | P1 |
| MSG-01 | Transactional outbox and retry | CH-01 | External delivery is retryable/idempotent and core mutation survives provider outage | XL | P1 |
| ID-01 | Verified channel linking design | SMS/email provider decisions optional | Telegram/MAX ownership challenge and controlled merge rules are specified | M | P1 |
| OPS-01 | Production deployment/retention runbook | Hosting and retention decisions | TLS/proxy/CORS/storage/backup monitoring and recovery procedure approved | L | P0 before production |

Explicitly excluded from this backlog package: online acquiring, replacement of
1C, microservices, AI selection, broad UI redesign and dependency upgrades.
