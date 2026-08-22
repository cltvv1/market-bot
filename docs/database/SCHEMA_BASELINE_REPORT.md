# Pre-production schema baseline

Current as of 2026-08-22.

## Source of truth

- DataSource: `src/database/data-source.ts`;
- entities: 38 active TypeORM entities;
- migration: `InitialPreproductionBaseline1787388476982`;
- schema synchronization: disabled;
- bootstrap data: current registration field dictionary, service types and one
  published form version per active type.

An empty PostgreSQL creates 38 entity tables plus `typeorm_migrations`.

## Tables by responsibility

| Area | Tables |
|---|---|
| Identity | `users`, `user_channels`, `customer_web_sessions` |
| Staff/security | `admin_users`, `admin_user_roles`, `admin_sessions`, `audit_events` |
| Organizations/assets | `organizations`, `organization_members`, `organization_access_requests`, `cash_registers`, `fiscal_drives`, `ofd_subscriptions`, `equipment_kits` |
| Registration | `registration_requests`, `registration_fields`, `registration_requirements`, `registration_evidence`, `registration_data_requests` |
| Service | `service_types`, `service_form_definitions`, `service_form_versions`, `service_requests`, `service_request_events`, `service_request_messages`, `service_request_attachments` |
| Questions/files/activity | `tickets`, `ticket_messages`, `stored_files`, `customer_activities` |
| Integrations | `integration_runs`, `integration_errors`, `integration_exclusions`, `external_mappings`, `external_observations`, `organization_contacts`, `service_opportunities`, `opportunity_observations` |
| Migration history | `typeorm_migrations` |

## Deliberately absent objects

- tables `bids`, `bid_fields` and any parallel V2 request/registration tables;
- alternate answer/message/file tables for individual channels;
- old admin role column and user notification/admin flags;
- service request raw filename/path/operator-string fields;
- registration boolean-state, raw path/name and old photo relation fields;
- ticket provider URL/ID/path metadata fields;
- source/status values used only by discarded development records.

## Important constraints

- unique staff login and normalized channel identity;
- one staff role assignment per `(userId, role)`;
- one pending organization access request per `(organizationId, userId)`;
- one published service form version per definition;
- every service request references a form version;
- service submit idempotency per customer/key;
- typed service attachment/message checks;
- one registration requirement per kind;
- active data-request uniqueness per requirement;
- evidence links requirements and `StoredFile` by FK;
- StoredFile object keys reject absolute/drive/parent traversal and enforce
  SHA-256/size/status checks.

## Verification contract

`test/preproduction-baseline.integration-spec.ts` asserts the single migration,
absence of discarded tables/columns/values and key security constraints.
`schema:log` must remain empty after `migration:run`.
