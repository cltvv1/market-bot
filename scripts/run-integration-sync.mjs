import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

const envFile = resolve('.env.local');
if (existsSync(envFile)) loadEnvFile(envFile);

const key = process.env.INTEGRATION_BRIDGE_KEY || '';
if (!key) throw new Error('INTEGRATION_BRIDGE_KEY is not configured');

const providers = {
  atol_connect: process.env.ATOL_BRIDGE_URL || 'http://127.0.0.1:4318',
  platforma_ofd: process.env.POFD_BRIDGE_URL || 'http://127.0.0.1:4319',
};
const requested = process.argv[2] || 'all';
const selected = requested === 'all' ? Object.entries(providers) : [[requested, providers[requested]]];
if (selected.some(([, url]) => !url)) throw new Error('Unknown integration provider');

for (const [provider, baseUrl] of selected) {
  const response = await fetch(new URL('/sync', baseUrl), {
    method: 'POST',
    headers: { 'x-vitma-bridge-key': key, Accept: 'application/json' },
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${provider}: ${payload.error || `HTTP ${response.status}`}`);
  const summary = Object.fromEntries(Object.entries(payload).filter(([name]) => !/error|token|secret|password|url/i.test(name)));
  console.log(JSON.stringify({ provider, ok: true, summary }));
}
