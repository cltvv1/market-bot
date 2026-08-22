# Lint ratchet

The full E0-13 scan covers:

- `src/**/*.ts`
- `test/**/*.ts`
- `admin-ui/src/**/*.{ts,tsx}` and its Vite config
- `client-ui/src/**/*.{ts,tsx}` and its Vite config

The Stage 0 snapshot records existing per-file/per-rule debt without allowing
new violations.

This package does not mass-format or repair unrelated code.
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
