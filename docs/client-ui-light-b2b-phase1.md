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
are loaded after it, and migrated components use scoped class names. The final
cleanup removed rules proven obsolete for migrated components while preserving
the compatibility rules required by deferred routes.

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

## Implemented result

- The shared shell now uses a compact graphite utility bar, focused search,
  existing cart, keyboard-accessible navigation and a restrained dark footer.
- Callback access moved into the header so a fixed control no longer covers
  page actions, filters or footer content.
- Home is organized by user intent: compact hero, trust facts, six working
  tasks, popular catalog items, current service directions and existing support
  routes.
- Catalog has a clear demo-data notice, scoped search, sort, sticky desktop
  filters, active chips and a mobile drawer with draft filters plus explicit
  Apply and Reset actions.
- Product cards retain existing cart behavior and support desktop, compact and
  responsive mobile presentations. Products without licensed local imagery use
  the neutral icon-based fallback.
- Service presents current registration and service-request entry points,
  existing service types, informational work formats and one shared next-step
  block.

## Responsive and accessibility verification

The home, catalog and service routes were checked at 1920, 1440, 1280, 1024,
768, 430, 390 and 360 px. For each route and width, the document scroll width
matched its client width and the page contained its expected H1.

Keyboard and interaction checks cover:

- mobile menu open and Escape close;
- body scroll lock and focus return for menu/dialog/drawer;
- dialog focus containment;
- visible focus styles and skip link;
- mobile filter drawer, Apply, Reset and active-filter chip;
- catalog loading, filtered, empty and reset paths;
- cart add and existing cart navigation;
- reduced-motion preference.

## Final verification results

- Client TypeScript check - passed.
- Client lint - passed.
- Repository lint ratchet - passed with no new violations; the existing legacy
  baseline remains 2,024 errors and 11 warnings across 109 files.
- Configuration isolation check - passed with polling disabled, synthetic bot
  credentials, a temporary storage root and a dedicated `_test` database.
- Unit tests - passed: 20 suites, 86 tests.
- Integration tests - passed: 7 suites, 49 tests.
- E2E tests - passed: 2 suites, 7 tests.
- Client production build - passed.
- Full production build for admin, client and NestJS - passed.
- Site browser smoke - passed.
- Offline Nest bootstrap and health/UI smoke - passed.
- Responsive browser matrix - passed at all eight required widths.
- Product detail, cart, organizations and KKT registration compatibility checks
  passed at 1280 and 390 px without horizontal overflow.
- Final site bundle at the implementation checkpoint: CSS 78.02 kB
  (14.74 kB gzip), JavaScript 375.62 kB (116.11 kB gzip).
- The migrated-component cleanup removed 429 obsolete rules from the legacy
  stylesheet. The intermediate CSS bundle decreased from 104.73 kB to 78.02 kB.

## Screenshots

- [Home desktop](client-ui-light-b2b-phase1-assets/home-desktop.png)
- [Home 390 px](client-ui-light-b2b-phase1-assets/home-390.png)
- [Catalog desktop](client-ui-light-b2b-phase1-assets/catalog-desktop.png)
- [Catalog 390 px with filters](client-ui-light-b2b-phase1-assets/catalog-390-filters.png)
- [Service desktop](client-ui-light-b2b-phase1-assets/service-desktop.png)
- [Service 390 px](client-ui-light-b2b-phase1-assets/service-390.png)

## Remaining legacy CSS dependencies

`client-ui/src/styles.css` remains the compatibility layer for the intentionally
deferred routes: search, solutions, product detail, cart, checkout, KKT
registration, organizations, service request/status and informational pages.
Those routes still use global primitives such as `page`, `page-heading`,
`section-heading`, `product-grid`, `service-grid`, wizard/form and status
classes. Their full visual migration belongs to later phases.

The shell, home, catalog, service, ProductCard, ProductVisual and ServiceCard no
longer depend on their previous global selectors.

## Deferred work

- Product detail, checkout, cart and organization-cabinet redesign.
- KKT registration workflow redesign pending its backend package.
- Search and solutions page redesign beyond shell compatibility.
- Real product imagery and production catalog/price/stock integration.
- Comparison, favorites, partner cabinet, knowledge base and new OFD flows.

## Assumptions

- Current service types and current routes are the only valid public workflow
  entry points for this phase.
- Existing catalog values remain explicitly demonstrational.
- Company configuration is authoritative for phone, email, address and schedule.
- Existing local equipment/service images may be used in the shared public UI.
