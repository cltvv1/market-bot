# Client UI Light B2B: phase 1

## Scope

This phase updates only the shared client shell and three public routes:

- `/` - home;
- `/catalog` - catalog listing;
- `/service` - service center.

All other routes remain available through the compatible shared shell. Their
internal layouts and workflows are intentionally deferred.

## Current client structure

- Runtime: React, TypeScript, Vite and React Router under the `/site` basename.
- Shared shell: `client-ui/src/components/Layout.tsx`.
- Router: `client-ui/src/App.tsx`.
- Shared controls: `client-ui/src/components/ui.tsx`.
- Cart state: `client-ui/src/context/CartContext.tsx`, persisted under the
  existing `vitma_cart` local-storage key.
- Web session: `client-ui/src/components/WebSessionBoundary.tsx` and existing
  API/session clients.
- Catalog data: `client-ui/src/data/catalog.ts` (24 demonstration products).
- Service data: `client-ui/src/data/services.ts` and
  `client-ui/src/data/solutions.ts`.
- Company details: `client-ui/src/data/company.ts`.
- Local imagery: `client-ui/public/assets/hero-service.png`,
  `service-engineer.png` and `vitmamarket-logo.png`.
- Icons: `lucide-react`.

## Route map

The existing routes are preserved: `/`, `/search`, `/solutions`, `/catalog`,
`/catalog/:slug`, `/cart`, `/checkout`, `/service`, `/service/request`,
`/service/status`, `/cash-registration`, `/organizations`, `/about`,
`/delivery`, `/warranty`, `/contacts`, `/privacy` and the not-found route.

## Technical invariants

- No backend, API contract, database, migration, admin or messenger changes.
- Existing router paths and deep links remain valid.
- Web-session behavior and authorization remain unchanged.
- Existing cart actions and persistence remain unchanged.
- Existing service-request and KKT-registration entry points remain unchanged.
- Product, price, contact and status data continue to come from current data,
  configuration and state sources rather than page-level hardcoding.
- Existing loading, empty and error behavior remains part of the catalog flow.

## CSS migration plan

The legacy `client-ui/src/styles.css` is a 4,500+ line compatibility layer with
multiple token declarations and overlapping late overrides. Phase 1 does not
append another global page theme to that file.

The new style architecture is:

- `styles/tokens.css` - centralized semantic design tokens;
- `styles/base.css` - reset, typography, focus and global document behavior;
- `styles/primitives.css` - shared buttons, fields, badges, dialogs and states;
- CSS Modules beside the migrated shell and pages - locally scoped layout and
  component rules.

Legacy CSS is loaded first for deferred routes. New tokens and base primitives
are loaded after it, and migrated components use scoped class names. Rules that
are proven unused by the migrated pages will be removed during the final
cleanup commit; deferred routes keep their required compatibility rules.

## Demonstration and non-production behavior

- The catalog, prices, stock labels and checkout use demonstration data.
- Product visuals without a licensed local image use the existing honest icon
  fallback; no invented product photography or remote hotlinks are introduced.
- Catalog UI must state that prices and availability can differ from actual
  values.
- Comparison, favorites, partner cabinet, public firmware library, separate
  support system, new checkout/payment options and new OFD workflows are not
  implemented or presented as working features.
- Only existing routes are used for calls to action.

## Baseline results

Baseline commit: `e7779f25c97ddcf811230634dd7fe9d7840b424c`.

- `npx tsc -p client-ui/tsconfig.json --noEmit` - passed.
- `npm run lint:site` - passed.
- `npm test -- --runInBand` - passed: 20 suites, 86 tests.
- `npm run build:site` - passed.
- Baseline site bundle: CSS 64.43 kB (13.35 kB gzip), JavaScript 369.67 kB
  (114.16 kB gzip).
- Expected test warnings already present: explicitly enabled legacy built UI
  serving and a simulated ATOL temporary-file cleanup failure.
- `npm ci` reported existing dependency audit findings (4 low, 16 moderate,
  21 high, 1 critical). Dependency upgrades are outside this UI phase and no
  audit-fix command was run.

## Reference interpretation

The supplied Light B2B mockups define composition, density and hierarchy, not
production content. Phase 1 adopts the compact utility/header/navigation stack,
light working surfaces, graphite footer, functional green accents and dense
equipment/service layouts. It deliberately omits mockup-only controls and uses
only current routes, data and local assets.
