# Provider contracts

## ATOL Connect

Bridge: `scripts/atol-connect-bridge.mjs`

The bridge signs in to `lkp.atol.ru`, captures the short-lived authorization
used by the cabinet and reads:

- `GET /api/v1/data-pilot/event-list`;
- `GET /api/v1/data-pilot/clients/{id}`.

It emits organizations, cash registers, contacts and SmartRadar observations.
Provider tokens are used only inside the browser process and are never sent to
VITMA MARKET.

Known event names are mapped to stable domain codes such as `fn_expiring`,
`atol_its_expiring` and `ofd_subscription_expiring`. Unknown names receive a
deterministic `atol_event_*` code; the original provider label remains the
observation title and sanitized metadata.

## Platforma OFD

Bridge: `scripts/platforma-ofd-bridge.mjs`

The partner cabinet has no public partner API. Version `2.2.18` of the cabinet
uses read-only JSON monitoring methods:

- `POST /api/monitoring/get-clients-badge-value`;
- `POST /api/monitoring/get-terminals-badge-value`;
- `GET /api/monitoring/get-columns-clients`;
- `GET /api/monitoring/get-columns-terminals`;
- `GET /api/monitoring/get-badges`.

The login flow may use `/sso-login`, and some successful JSON responses are
served with a non-JSON content type. The bridge validates and parses the body
without persisting response HTML, credentials or session data.

Confirmed system badge IDs:

| ID | Type | Meaning |
|---:|---|---|
| 1 | client | all clients |
| 17 | terminal | all cash registers |
| 9 | terminal | no active OFD tariff |
| 10 | terminal | OFD subscription ending |
| 11 | terminal | fiscal drive ending |
| 8 | terminal | no receipts for more than 72 hours |
| 13 | terminal | shift open for more than 24 hours |
| 21 | terminal | FNS registration incomplete |
| 24 | terminal | receipt errors |

The bridge first imports client and equipment snapshots, then imports each
monitoring category as observations. It accepts both primitive JSON fields and
the cabinet's `{ value }` cell representation. Only master data and the badge
categories listed above are read; fiscal receipt contents are not imported.

These are private cabinet methods and can change without notice. Endpoint names,
badge IDs and response-field aliases therefore belong only to the provider
adapter. No domain service imports or depends on them.
