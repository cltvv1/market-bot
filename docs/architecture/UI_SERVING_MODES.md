# UI serving modes

UI delivery is selected by configuration, never by silently checking whether an
`index.html` happens to exist.

| Environment | `SERVE_BUILT_UI` | `ENABLE_LEGACY_UI` | Result |
|---|---:|---:|---|
| production | true | false | Nest validates and serves both React builds |
| production | false | any | startup error |
| production | any | true | startup error |
| development/test | true | false | validate and serve both React builds |
| development/test | false | true | explicit legacy HTML mode with warning |
| development/test | false | false | backend/API runs; use Vite for UI |

Production validation requires `index.html`, JavaScript, and CSS for both admin
and client builds. A missing file names the affected application and absolute
path in the startup error. There is no React-to-legacy fallback.

Normal development:

```powershell
npm run start:dev:all
```

Vite serves admin at `http://localhost:5173/admin/` and client UI at
`http://localhost:5174/site/`; Nest can start without production `dist`
directories. To exercise built delivery locally:

```powershell
npm run build
$env:SERVE_BUILT_UI = "true"
npm run start:dev
```

Legacy HTML is retained only for an explicit development diagnostic:

```powershell
$env:ENABLE_LEGACY_UI = "true"
$env:SERVE_BUILT_UI = "false"
npm run start:dev
```

The legacy admin page remains public as a login shell while all admin API calls
retain session and permission guards. It is forbidden in production.

SPA fallback is scoped to `/site/*` and `/admin/*`. The admin wildcard rejects
paths beginning with `/admin/api`; exact file-download routes and API routes are
registered normally. `/api`, `/health`, and `/api/docs` are outside both SPA
prefixes. E2E tests cover nested reload, API/health/file exclusions, session
guards, and built entry delivery.
