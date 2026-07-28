# Audit Log Guide

`audit_events` is append-only at application level. No update/delete API exists.

Recorded foundation events include staff login success/failure, logout, staff creation, role/active/password/session changes, permission denial, registration state/kit changes, engineer assignment, service state transitions, invoice attachment/upload, payment confirmation, ticket reply/file/close, equipment kit creation, protected registration PDF download and completed backup/restore operations.

Metadata passes through `sanitizeAuditMetadata`. Passwords, hashes, tokens, cookies, CSRF/OTP values, buffers and raw content are redacted. Message bodies and file contents are not logged.

Only `audit.read` can call `GET /admin/api/audit-events`; only `superadmin` receives that permission. The React tab supports result/action filters and newest-first display. Pagination and actor/target/date filters are available in the API.

Login failures, denied access and downloads are separate audit writes. Several controller-level success events are written after the business operation; full same-transaction audit coverage remains follow-up work and no outbox was introduced.
