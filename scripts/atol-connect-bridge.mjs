import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { chromium } from 'playwright-core';

const envFile = resolve('.env.local');
if (existsSync(envFile)) loadEnvFile(envFile);

const HOST = '127.0.0.1';
const PORT = Number(process.env.ATOL_BRIDGE_PORT || 4318);
const APP_URL = process.env.VITMA_APP_URL || 'http://127.0.0.1:3000';
const BRIDGE_KEY = process.env.INTEGRATION_BRIDGE_KEY || '';
const PROFILE_DIR = resolve(process.env.ATOL_PROFILE_DIR || '.integration-profiles/atol');
const HEADLESS = process.env.ATOL_HEADLESS !== 'false';
const LOGIN = process.env.ATOL_LOGIN?.trim() || '';
const PASSWORD = process.env.ATOL_PASSWORD || '';
const PAGE_SIZE = 100;
const browserCandidates = [process.env.ATOL_BROWSER_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);

let context;
let page;
let launching;
let authorization = null;
let syncing = false;
let lastSync = null;
let lastError = null;

function browserPath() {
  const found = browserCandidates.find(existsSync);
  if (!found) throw new Error('Chrome or Microsoft Edge was not found');
  return found;
}

function authorized(request) {
  return Boolean(BRIDGE_KEY) && request.headers['x-vitma-bridge-key'] === BRIDGE_KEY;
}

function send(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
}

async function ensureContext() {
  if (context) return context;
  if (launching) return launching;
  launching = (async () => {
    mkdirSync(PROFILE_DIR, { recursive: true });
    const next = await chromium.launchPersistentContext(PROFILE_DIR, { executablePath: browserPath(), headless: HEADLESS, viewport: HEADLESS ? { width: 1440, height: 1000 } : null });
    next.on('request', (request) => {
      const auth = request.headers().authorization;
      if (auth?.toLowerCase().startsWith('bearer ') && new URL(request.url()).hostname === 'lkp.atol.ru') authorization = auth;
    });
    next.on('close', () => { context = undefined; page = undefined; authorization = null; });
    context = next;
    page = next.pages()[0] ?? await next.newPage();
    return next;
  })().finally(() => { launching = undefined; });
  return launching;
}

async function firstVisible(selector) {
  const items = page.locator(selector);
  for (let index = 0; index < await items.count(); index += 1) if (await items.nth(index).isVisible().catch(() => false)) return items.nth(index);
  return null;
}

async function submitLogin() {
  const submit = await firstVisible('button[type="submit"], input[type="submit"]');
  if (!submit) throw new Error('ATOL login button was not found');
  await submit.click();
}

async function authenticate() {
  await page.waitForSelector('input[name="username"], input[type="tel"], input[type="email"], input[type="password"]', { timeout: 20000 }).catch(() => undefined);
  const login = await firstVisible('input[name="username"], input[type="tel"], input[type="email"], input[autocomplete="username"]');
  let password = await firstVisible('input[name="password"], input[type="password"], input[autocomplete="current-password"]');
  if (login) await login.fill(LOGIN);
  if (!password && login) {
    await submitLogin();
    await page.waitForTimeout(800);
    password = await firstVisible('input[name="password"], input[type="password"]');
  }
  if (!password) throw new Error('ATOL password field was not found');
  await password.fill(PASSWORD);
  await submitLogin();
  await page.waitForURL((url) => !url.hostname.includes('id.atol.ru') && !url.pathname.includes('/auth/'), { timeout: 35000 }).catch(() => undefined);
}

async function waitForAuthorization(timeout = 20000) {
  const started = Date.now();
  while (!authorization && Date.now() - started < timeout) await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  return authorization;
}

async function preparePage() {
  await ensureContext();
  authorization = null;
  await page.goto('https://lkp.atol.ru/smartradar', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1200);
  if (page.url().includes('id.atol.ru') || page.url().includes('/auth/')) {
    if (!LOGIN || !PASSWORD) throw new Error('ATOL_LOGIN and ATOL_PASSWORD are not configured');
    await authenticate();
    authorization = null;
    await page.goto('https://lkp.atol.ru/smartradar', { waitUntil: 'domcontentloaded', timeout: 45000 });
  }
  if (!await waitForAuthorization()) throw new Error('ATOL authorization was not captured');
}

async function apiJson(url) {
  const result = await page.evaluate(async ({ requestUrl, auth }) => {
    const response = await fetch(requestUrl, { credentials: 'include', headers: { Accept: 'application/json', Authorization: auth } });
    return { status: response.status, text: await response.text() };
  }, { requestUrl: url, auth: authorization });
  if (result.status < 200 || result.status >= 300) throw new Error(`ATOL returned HTTP ${result.status}`);
  return JSON.parse(result.text);
}

function previousDate() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Krasnoyarsk', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function eventUrl(date, pageNumber) {
  const filters = { search: '', tag_ids: [], event_status_ids: [1, 2, 3], priority_ids: [], period: [date, date], event_ids: [], client_status_ids: [], responsible_client_ids: [], responsible_event_ids: [], category_ids: [], client_id: null };
  const url = new URL('https://lkp.atol.ru/api/v1/data-pilot/event-list');
  url.searchParams.set('filters', JSON.stringify(filters));
  url.searchParams.set('filters_exist', 'true');
  url.searchParams.set('limit', String(PAGE_SIZE));
  url.searchParams.set('page', String(pageNumber));
  url.searchParams.set('sort_type', 'desc');
  return url.toString();
}

async function fetchEvents(date) {
  const items = [];
  let current = 1;
  let total = 1;
  while (current <= total) {
    const payload = await apiJson(eventUrl(date, current));
    items.push(...(payload.data?.items ?? []));
    total = Number(payload.meta?.total_pages ?? 1);
    current += 1;
  }
  return items;
}

function plainText(html = '') {
  return String(html).replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
}

function severity(priority) {
  const value = String(priority ?? '').toLocaleLowerCase('ru-RU');
  if (/крит|сроч/.test(value)) return 'urgent';
  if (/высок/.test(value)) return 'high';
  if (/низк/.test(value)) return 'low';
  return 'normal';
}

function externalCashRegisterId(item) {
  const serial = String(item.serial ?? '').trim();
  return serial ? `${item.client_id}:${serial}` : null;
}

function canonicalEventType(value) {
  const normalized = String(value ?? '').trim().toLocaleLowerCase('ru-RU');
  const expiring = /оконч|истека|заканч|срок|ресурс|замен/.test(normalized);
  if (expiring && (/(^|\s)фн(\s|$)/.test(normalized) || /фискальн.*накоп/.test(normalized))) return 'fn_expiring';
  if (expiring && /итс/.test(normalized)) return 'atol_its_expiring';
  if (expiring && /офд/.test(normalized)) return 'ofd_subscription_expiring';
  return `atol_event_${createHash('sha256').update(normalized || 'unknown').digest('hex').slice(0, 20)}`;
}

function transform(events, contactRows) {
  const organizations = [...new Map(events.map((item) => [String(item.client_id), {
    externalId: String(item.client_id), inn: String(item.inn_client ?? '').replace(/\D/g, ''), name: String(item.name_client_company ?? '').trim() || undefined,
  }]).filter(([, item]) => [10, 12].includes(item.inn.length))).values()];
  const cashRegisters = [...new Map(events.map((item) => {
    const externalId = externalCashRegisterId(item);
    return [externalId, externalId ? { externalId, organizationExternalId: String(item.client_id), serialNumber: String(item.serial).trim(), model: String(item.model_name ?? '').trim() || undefined, installationAddress: String(item.address ?? '').trim() || undefined } : null];
  }).filter(([key]) => key)).values()].filter(Boolean);
  const observations = events.map((item) => {
    const sourceEventType = String(item.type_name ?? 'Событие АТОЛ').trim();
    return {
      externalId: `event:${item.id}`,
      organizationExternalId: String(item.client_id),
      cashRegisterExternalId: externalCashRegisterId(item) ?? undefined,
      type: canonicalEventType(sourceEventType),
      title: sourceEventType,
      description: plainText(item.comment),
      severity: severity(item.priority_name),
      status: /закры|заверш/i.test(String(item.status_name ?? '')) ? 'resolved' : 'active',
      occurredAt: new Date(item.date ?? Date.now()).toISOString(),
      metadata: { sourceEventType, tags: (item.client_event_type?.client_event_tags ?? []).map((tag) => tag.name).join(', '), sourceStatus: String(item.status_name ?? ''), responsible: String(item.user_name ?? '').trim() },
    };
  });
  const contacts = contactRows.map((item) => ({
    externalId: createHash('sha256').update(`${item.organizationExternalId}|${item.kind}|${item.value}`).digest('hex'),
    organizationExternalId: item.organizationExternalId,
    kind: item.kind,
    value: item.value,
    quality: item.quality,
  }));
  return { organizations, cashRegisters, fiscalDrives: [], ofdSubscriptions: [], contacts, observations };
}

async function mapLimit(values, limit, mapper) {
  const result = new Array(values.length);
  let next = 0;
  async function worker() { while (next < values.length) { const index = next++; result[index] = await mapper(values[index], index); } }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return result;
}

async function fetchContacts(events) {
  const clients = [...new Map(events.map((item) => [String(item.client_id), { id: item.client_id }])).values()].filter((item) => item.id);
  const details = await mapLimit(clients, 5, async (client) => {
    const payload = await apiJson(`https://lkp.atol.ru/api/v1/data-pilot/clients/${client.id}`);
    return { id: String(client.id), detail: payload.data ?? payload };
  });
  const contacts = [];
  for (const { id, detail } of details) {
    const variants = [detail.contact, ...(Array.isArray(detail.client_contacts) ? detail.client_contacts : [])].filter(Boolean);
    for (const item of variants) {
      for (const raw of [item.telephone, item.phone].filter(Boolean)) contacts.push({ organizationExternalId: id, kind: 'phone', value: String(raw).trim(), quality: 'provider' });
      if (item.email) contacts.push({ organizationExternalId: id, kind: 'email', value: String(item.email).trim().toLowerCase(), quality: 'provider' });
    }
  }
  return contacts;
}

async function postImport(payload, date) {
  const response = await fetch(`${APP_URL}/internal/integrations/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vitma-bridge-key': BRIDGE_KEY },
    body: JSON.stringify({ provider: 'atol_connect', kind: 'daily_events', mode: 'shadow', sourceCursor: date, syncId: randomUUID(), batchIndex: 1, batchCount: 1, ...payload }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || `VITMA MARKET returned HTTP ${response.status}`);
  return body;
}

async function synchronize() {
  if (syncing) throw new Error('Synchronization is already running');
  syncing = true;
  lastError = null;
  try {
    if (!BRIDGE_KEY) throw new Error('INTEGRATION_BRIDGE_KEY is not configured');
    await preparePage();
    const date = previousDate();
    const events = await fetchEvents(date);
    const contacts = await fetchContacts(events);
    const result = await postImport(transform(events, contacts), date);
    lastSync = new Date().toISOString();
    return { ...result, syncedAt: lastSync };
  } catch (error) {
    lastError = error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, '[url removed]') : 'Synchronization failed';
    throw error;
  } finally {
    syncing = false;
    const active = context;
    if (active) await active.close().catch(() => undefined);
  }
}

const server = createServer(async (request, response) => {
  if (!authorized(request)) return send(response, 403, { error: 'Forbidden' });
  const url = new URL(request.url || '/', `http://${HOST}:${PORT}`);
  try {
    if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { ready: true, syncing, lastSync, lastError, credentialsConfigured: Boolean(LOGIN && PASSWORD), headless: HEADLESS });
    if (request.method === 'POST' && url.pathname === '/sync') return send(response, 200, await synchronize());
    return send(response, 404, { error: 'Not found' });
  } catch (error) {
    return send(response, 500, { error: error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, '[url removed]') : 'Synchronization failed' });
  }
});

server.listen(PORT, HOST, () => console.log(`ATOL Connect bridge is listening on ${HOST}:${PORT}`));
async function shutdown() { server.close(); if (context) await context.close().catch(() => undefined); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
