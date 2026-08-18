# Integration runbook

## Configuration

Set secrets only in `.env.local` or the deployment secret store:

```dotenv
INTEGRATION_BRIDGE_KEY=<random value of at least 32 characters>
VITMA_APP_URL=http://127.0.0.1:3000

ATOL_LOGIN=
ATOL_PASSWORD=
ATOL_BRIDGE_URL=http://127.0.0.1:4318

POFD_LOGIN=
POFD_PASSWORD=
POFD_BRIDGE_URL=http://127.0.0.1:4319
```

Never commit `.env.local` or `.integration-profiles`.

## Start

Run VITMA MARKET after applying migrations, then start both sidecars:

```powershell
npm run start:bridge:atol
npm run start:bridge:pofd
```

The first non-headless run can be used to diagnose a changed login flow:

```dotenv
ATOL_HEADLESS=false
POFD_HEADLESS=false
```

Platforma OFD currently redirects an expired session to `/sso-login`. The
bridge recognizes both this route and the older OAuth route. A successful
read-only shadow import against the current cabinet contract was verified on
2026-08-17; provider contracts remain private and may change without notice.

## Synchronize

Use the Integrations tab as a superadmin, or run:

```powershell
npm run sync:integrations
npm run sync:atol
npm run sync:pofd
```

For automatic operation, schedule `npm run sync:atol` daily and
`npm run sync:pofd` every 2-4 hours. Do not overlap runs of the same provider.

## Verification

1. Check both bridge health cards.
2. Confirm a successful shadow run and plausible received/applied counts.
3. Inspect a sample of matched organizations and cash registers.
4. Check the Signals tab for duplicate opportunities.
5. Review failed runs and their sanitized error summaries.
6. Confirm that no customer messages were sent.
7. Resolve mapping conflicts before enabling any future notification mode.

## Signal exclusions

A superadmin can add an exclusion on the Integrations tab by INN. The scope can
optionally be narrowed to one provider and/or one observation type. Exclusions
do not stop synchronization and do not delete observations; they only suppress
creation of new operator opportunities. Deactivating an exclusion affects later
imports and does not recreate historical opportunities automatically.

## Provider change

If a bridge reports an unexpected response or login-form change:

1. Stop only that bridge.
2. Keep the last synchronized VITMA data unchanged.
3. Run it non-headless against a test/manual invocation.
4. Update the provider adapter aliases or endpoint contract.
5. Run normalization and ingestion tests.
6. Resume in shadow mode.

Login failures that happen before any batch reaches VITMA remain visible in the
bridge health card. Import failures after ingestion starts are also stored in
`integration_runs` and `integration_errors`.
