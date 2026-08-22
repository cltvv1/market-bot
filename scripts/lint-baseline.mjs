import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const baselinePath = path.resolve('scripts', 'lint-baseline.json');
const eslintPath = path.resolve('node_modules', 'eslint', 'bin', 'eslint.js');
const targets = [
    '{src,test}/**/*.ts',
    'admin-ui/src/**/*.{ts,tsx}',
    'admin-ui/vite.config.ts',
    'client-ui/src/**/*.{ts,tsx}',
    'client-ui/vite.config.ts',
];
const result = spawnSync(
    process.execPath,
    [eslintPath, ...targets, '--no-fix', '--format', 'json'],
    {
        cwd: process.cwd(),
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
    },
);
if (result.status !== 0 && result.status !== 1) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 2);
}

const report = JSON.parse(result.stdout);
const current = summarize(report);
if (process.argv.includes('--write-baseline')) {
    fs.writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
    process.stdout.write(`Lint baseline written to ${baselinePath}\n`);
    printTotals(current);
    process.exit(0);
}

if (!fs.existsSync(baselinePath)) {
    throw new Error(
        'Lint baseline is missing; run npm run lint:baseline:update after reviewing the full report',
    );
}
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const regressions = [];
for (const [file, rules] of Object.entries(current.files)) {
    const allowed = baseline.files[file] || {};
    for (const [rule, count] of Object.entries(rules)) {
        const previous = allowed[rule] || 0;
        if (count > previous) {
            regressions.push(`${file}: ${rule} ${previous} -> ${count}`);
        }
    }
}
if (regressions.length) {
    throw new Error(`New lint violations detected:\n${regressions.join('\n')}`);
}

process.stdout.write(
    'No lint violations were added relative to the reviewed Stage 0 baseline.\n',
);
printTotals(current);

function summarize(entries) {
    const files = {};
    let errors = 0;
    let warnings = 0;
    for (const entry of entries) {
        const relative = path
            .relative(process.cwd(), entry.filePath)
            .replaceAll('\\', '/');
        const rules = {};
        for (const message of entry.messages) {
            const key = `${message.severity === 2 ? 'error' : 'warning'}:${message.ruleId || 'fatal'}`;
            rules[key] = (rules[key] || 0) + 1;
            if (message.severity === 2) errors += 1;
            else if (message.severity === 1) warnings += 1;
        }
        if (Object.keys(rules).length) files[relative] = rules;
    }
    return {
        generatedFrom: 'reviewed E0-13 Stage 0 baseline',
        errors,
        warnings,
        files,
    };
}

function printTotals(summary) {
    process.stdout.write(
        `Current lint debt: ${summary.errors} errors, ${summary.warnings} warnings in ${Object.keys(summary.files).length} files.\n`,
    );
}
