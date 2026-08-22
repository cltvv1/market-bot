# UI serving modes

VITMA MARKET has exactly two current frontend applications:

- `admin-ui` - React/TypeScript/Vite;
- `client-ui` - React/TypeScript/Vite.

There is no static HTML application, fallback renderer or React/HTML switch.

| Environment | `SERVE_BUILT_UI` | Result |
|---|---:|---|
| production | `true` | Nest validates and serves both React builds |
| production | `false` | Configuration error at startup |
| development/test | `true` | Nest validates and serves both React builds |
| development/test | `false` | API only; run the two Vite development servers |

Production validation requires `index.html`, JavaScript and CSS assets for both
applications. `ADMIN_UI_DIST` and `CLIENT_UI_DIST` can override their build
locations. Missing assets fail startup instead of selecting another UI.

Relevant checks:

- `src/ui/ui-serving.service.spec.ts` covers built and disabled modes;
- `scripts/offline-smoke.mjs` validates the production build path;
- `npm run build` builds both React applications before NestJS.
