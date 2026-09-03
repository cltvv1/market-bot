import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const baseline = '4de78fe5696d781341272328305041236ebece99';
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'vitma-fe1a-build-'));
const report = [];
for (const app of ['admin-ui', 'client-ui']) {
  const oldMain = execFileSync('git', ['show', `${baseline}:${app}/src/main.tsx`], { encoding: 'utf8' });
  const mainPath = path.resolve(app, 'src/main.tsx').replaceAll('\\', '/');
  const output = path.resolve(temporaryRoot, app);
  if (!output.startsWith(`${temporaryRoot}${path.sep}`)) throw new Error('Output outside temporary root');
  await build({ configFile: path.resolve(app, 'vite.config.ts'), plugins: [{ name: 'baseline-entry', enforce: 'pre', transform(code, id) { return id.replaceAll('\\', '/') === mainPath ? { code: oldMain, map: null } : null; } }], build: { outDir: output, emptyOutDir: true } });
  for (const file of (await readdir(output)).filter(file => /\.(js|css)$/.test(file))) {
    const before = await readFile(path.join(output, file));
    const after = await readFile(path.resolve(app, 'dist', file));
    report.push({ app, file, before: before.length, after: after.length, delta: after.length - before.length, identical: before.equals(after) });
  }
}
console.log(JSON.stringify(report, null, 2));
