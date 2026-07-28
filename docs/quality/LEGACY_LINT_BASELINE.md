# Legacy lint baseline

The full E0-13 scan covers:

- `src/**/*.ts`
- `test/**/*.ts`
- `admin-ui/src/**/*.{ts,tsx}` and its Vite config
- `client-ui/src/**/*.{ts,tsx}` and its Vite config

At baseline creation it reported **2634 errors and 21 warnings in 117 files**.
The earlier backend/client-only preflight scan reported 2093 errors and 15
warnings in 111 files. The difference is the previously unscanned admin React
source plus the expanded final target set.

This package does not mass-format or repair unrelated legacy code.
`scripts/lint-baseline.json` stores reviewed per-file, per-rule counts.
`npm run lint:baseline` performs a fresh full scan and fails when any count
increases or a new violation appears. Reductions pass automatically.

New E0-13/E0-14/E0-15 TypeScript test and UI-serving files were checked
independently and have no lint findings. The long-term goal remains a genuinely
green full lint; the baseline is a ratchet, not a claim that the debt is clean.

Only update the baseline after reviewing a full report:

```powershell
npm run lint:baseline:update
git diff -- scripts/lint-baseline.json
```
