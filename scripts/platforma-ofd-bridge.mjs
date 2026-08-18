import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { chromium } from 'playwright-core';

const envFile = resolve('.env.local');
if (existsSync(envFile)) loadEnvFile(envFile);

const HOST = '127.0.0.1';
const PORT = Number(process.env.POFD_BRIDGE_PORT || 4319);
const APP_URL = process.env.VITMA_APP_URL || 'http://127.0.0.1:3000';
const BRIDGE_KEY = process.env.INTEGRATION_BRIDGE_KEY || '';
const PROFILE_DIR = resolve(process.env.POFD_PROFILE_DIR || '.integration-profiles/platforma-ofd');
const HEADLESS = process.env.POFD_HEADLESS !== 'false';
const LOGIN = process.env.POFD_LOGIN?.trim() || '';
const PASSWORD = process.env.POFD_PASSWORD || '';
const FETCH_SIZE = Number(process.env.POFD_FETCH_SIZE || 10000);
const BATCH_SIZE = Number(process.env.POFD_IMPORT_BATCH_SIZE || 250);
const browserCandidates = [process.env.POFD_BROWSER_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);

const badges = {
  allClients: { id: 1, type: 'client' },
  allCashRegisters: { id: 17, type: 'terminal' },
  unpaid: { id: 9, type: 'terminal', opportunityType: 'ofd_unpaid', title: 'Нет активного тарифа ОФД', severity: 'high' },
  subscriptionExpiring: { id: 10, type: 'terminal', opportunityType: 'ofd_subscription_expiring', title: 'Заканчивается подписка ОФД', severity: 'high' },
  fiscalDriveExpiring: { id: 11, type: 'terminal', opportunityType: 'fn_expiring', title: 'Заканчивается срок ФН', severity: 'high' },
  noReceipts: { id: 8, type: 'terminal', opportunityType: 'no_receipts_72h', title: 'Нет чеков более 72 часов', severity: 'normal' },
  shiftOpen: { id: 13, type: 'terminal', opportunityType: 'shift_open_24h', title: 'Смена открыта больше 24 часов', severity: 'normal' },
  fnsRegistration: { id: 21, type: 'terminal', opportunityType: 'fns_registration_incomplete', title: 'Регистрация ККТ в ФНС не завершена', severity: 'high' },
  receiptErrors: { id: 24, type: 'terminal', opportunityType: 'receipt_errors', title: 'Ошибки в чеках', severity: 'high' },
};

let context;
let page;
let launching;
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
    const next = await chromium.launchPersistentContext(PROFILE_DIR, {
      executablePath: browserPath(),
      headless: HEADLESS,
      viewport: HEADLESS ? { width: 1440, height: 1000 } : null,
    });
    next.on('close', () => { context = undefined; page = undefined; });
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

async function authenticate() {
  if (!LOGIN || !PASSWORD) throw new Error('POFD_LOGIN and POFD_PASSWORD are not configured');
  await page.waitForSelector('input[name="username"], input[type="tel"], input[type="email"]', { timeout: 20000 });
  const login = await firstVisible('input[name="username"], input[type="tel"], input[type="email"], input[autocomplete="username"]');
  const password = await firstVisible('input[name="password"], input[type="password"], input[autocomplete="current-password"]');
  const submit = await firstVisible('button[type="submit"], input[type="submit"]');
  if (!login || !password || !submit) throw new Error('Platforma OFD login form has changed');
  await login.fill(LOGIN);
  await password.fill(PASSWORD);
  await Promise.all([
    page.waitForURL((url) => url.hostname === 'pk.platformaofd.ru' && !url.pathname.includes('sso-login'), { timeout: 45000 }),
    submit.click(),
  ]);
}

async function preparePage() {
  await ensureContext();
  await page.goto('https://pk.platformaofd.ru/monitoring_new', { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (page.url().includes('oauth.platformaofd.ru') || page.url().includes('/sso-login')) {
    await authenticate();
    await page.goto('https://pk.platformaofd.ru/monitoring_new', { waitUntil: 'domcontentloaded', timeout: 45000 });
  }
  if (new URL(page.url()).hostname !== 'pk.platformaofd.ru') throw new Error('Platforma OFD authentication failed');
}

async function apiJson(path, method = 'GET', data) {
  const result = await page.evaluate(async ({ requestPath, requestMethod, body }) => {
    const response = await fetch(requestPath, {
      method: requestMethod,
      credentials: 'include',
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, text: await response.text(), finalUrl: response.url };
  }, { requestPath: path, requestMethod: method, body: data });
  if (result.status < 200 || result.status >= 300) throw new Error(`Platforma OFD returned HTTP ${result.status}`);
  const normalized = result.text.replace(/^\uFEFF/, '').replace(/^\)\]\}',?\s*/, '');
  try {
    return JSON.parse(normalized);
  } catch {
    const authenticationPage = /^\s*</.test(normalized) && /oauth|login|авториза|вход/i.test(normalized);
    const responseKind = authenticationPage ? 'an authentication page' : /^\s*</.test(normalized) ? 'HTML' : 'non-JSON data';
    const finalUrl = new URL(result.finalUrl || path, 'https://pk.platformaofd.ru');
    throw new Error(`Platforma OFD returned ${responseKind} for ${finalUrl.hostname}${finalUrl.pathname}`);
  }
}

function unwrapRows(payload) {
  if (Array.isArray(payload)) return payload;
  for (const candidate of [payload?.result, payload?.data, payload?.items, payload?.rows, payload?.value]) if (Array.isArray(candidate)) return candidate;
  throw new Error('Platforma OFD response schema has changed');
}

async function fetchBadge(badge) {
  const path = `/api/monitoring/get-${badge.type === 'client' ? 'clients' : 'terminals'}-badge-value?badgeId=${badge.id}&withArchive=0&fetchSize=${FETCH_SIZE}`;
  return unwrapRows(await apiJson(path, 'POST', []));
}

function pick(row, names) {
  for (const name of names) {
    const raw = row?.[name];
    const value = raw && typeof raw === 'object' && 'value' in raw ? raw.value : raw;
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return '';
}

function digits(value) { return String(value ?? '').replace(/\D/g, ''); }
function hash(value) { return createHash('sha256').update(String(value)).digest('hex'); }

function parseDate(value) {
  if (!value) return undefined;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  const match = String(value).match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!match) return undefined;
  return new Date(`${match[3]}-${match[2]}-${match[1]}T${match[4] || '00'}:${match[5] || '00'}:00+07:00`).toISOString();
}

function clientExternalId(row) {
  const inn = digits(pick(row, ['clientInn', 'inn']));
  return pick(row, ['clientId', 'id']) || (inn ? `inn:${inn}` : '');
}

function cashRegisterExternalId(row) {
  const rnm = pick(row, ['kktRegId', 'deviceRegId', 'rnm']);
  const serial = pick(row, ['deviceNumber', 'serialNumber', 'serial', 'kktNumber']);
  return pick(row, ['deviceId', 'terminalId', 'id']) || (rnm ? `rnm:${rnm}` : serial ? `serial:${serial}` : '');
}

function normalizeClient(row) {
  const inn = digits(pick(row, ['clientInn', 'inn']));
  const externalId = clientExternalId(row);
  if (!externalId || ![10, 12].includes(inn.length)) return null;
  return {
    externalId,
    inn,
    kpp: digits(pick(row, ['clientKpp', 'kpp'])) || undefined,
    ogrn: digits(pick(row, ['clientOgrn', 'ogrn'])) || undefined,
    name: pick(row, ['clientName', 'name']) || undefined,
    legalAddress: pick(row, ['clientAddress', 'legalAddress']) || undefined,
    taxSystem: pick(row, ['taxSystem', 'taxationSystem']) || undefined,
  };
}

function normalizeCashRegister(row, clientById) {
  const externalId = cashRegisterExternalId(row);
  const organizationExternalId = clientExternalId(row);
  const registrationNumber = pick(row, ['kktRegId', 'deviceRegId', 'rnm']);
  const serialNumber = pick(row, ['deviceNumber', 'serialNumber', 'serial', 'kktNumber']) || registrationNumber;
  const client = clientById.get(organizationExternalId);
  if (!externalId || !serialNumber || (!organizationExternalId && !client)) return null;
  return {
    externalId,
    organizationExternalId: organizationExternalId || client?.externalId,
    organizationInn: client?.inn,
    serialNumber,
    registrationNumber: registrationNumber || undefined,
    model: pick(row, ['deviceName', 'modelName', 'model', 'kktName']) || undefined,
    installationAddress: pick(row, ['kktAddress', 'address']) || undefined,
    status: /^(1|да|true)$/i.test(pick(row, ['isArchive', 'archived'])) ? 'archived' : 'active',
    registeredAt: parseDate(pick(row, ['kktRegDate', 'registeredAt'])),
  };
}

function normalizeFiscalDrive(row) {
  const cashExternalId = cashRegisterExternalId(row);
  const serialNumber = pick(row, ['fnSn', 'fiscalDriveNumber', 'fnSerialNumber']);
  if (!cashExternalId || !serialNumber) return null;
  return {
    externalId: pick(row, ['fnId']) || `fn:${serialNumber}`,
    cashRegisterExternalId: cashExternalId,
    serialNumber,
    validFrom: parseDate(pick(row, ['fnDateFrom'])),
    validUntil: parseDate(pick(row, ['fnDateTillWoExciseDuty', 'fnDateTill'])),
  };
}

function normalizeSubscription(row) {
  const cashExternalId = cashRegisterExternalId(row);
  const validUntil = parseDate(pick(row, ['subsDateTill', 'subscriptionDateTill']));
  if (!cashExternalId || !validUntil) return null;
  return {
    externalId: `ofd:${cashExternalId}`,
    cashRegisterExternalId: cashExternalId,
    providerName: 'Платформа ОФД',
    validUntil,
    status: new Date(validUntil) >= new Date() ? 'active' : 'expired',
  };
}

function normalizeContacts(rows) {
  const contacts = [];
  for (const row of rows) {
    const organizationExternalId = clientExternalId(row);
    if (!organizationExternalId) continue;
    const phone = pick(row, ['clientPhone', 'phone', 'telephone']);
    const email = pick(row, ['clientEmail', 'email']);
    if (phone) contacts.push({ externalId: hash(`${organizationExternalId}|phone|${phone}`), organizationExternalId, kind: 'phone', value: phone, quality: 'provider' });
    if (email) contacts.push({ externalId: hash(`${organizationExternalId}|email|${email.toLowerCase()}`), organizationExternalId, kind: 'email', value: email.toLowerCase(), quality: 'provider' });
  }
  return [...new Map(contacts.map((item) => [item.externalId, item])).values()];
}

function normalizeObservation(row, badge, observedAt) {
  const cashExternalId = cashRegisterExternalId(row);
  const organizationExternalId = clientExternalId(row);
  if (!cashExternalId && !organizationExternalId) return null;
  return {
    externalId: `${badge.id}:${cashExternalId || organizationExternalId}`,
    organizationExternalId: organizationExternalId || undefined,
    organizationInn: digits(pick(row, ['clientInn', 'inn'])) || undefined,
    cashRegisterExternalId: cashExternalId || undefined,
    type: badge.opportunityType,
    title: badge.title,
    description: pick(row, ['recommendation', 'message', 'statusDescription']) || undefined,
    severity: badge.severity,
    status: 'active',
    occurredAt: observedAt,
    metadata: { sourceBadgeId: badge.id },
  };
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function postImport(kind, sourceCursor, syncId, batchIndex, batchCount, records) {
  const response = await fetch(`${APP_URL}/internal/integrations/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vitma-bridge-key': BRIDGE_KEY },
    body: JSON.stringify({ provider: 'platforma_ofd', kind, mode: 'shadow', sourceCursor, syncId, batchIndex, batchCount, organizations: [], cashRegisters: [], fiscalDrives: [], ofdSubscriptions: [], contacts: [], observations: [], ...records }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || `VITMA MARKET returned HTTP ${response.status}`);
  return body;
}

async function sendBatches(kind, cursor, syncId, key, values) {
  const results = [];
  const batches = chunks(values, BATCH_SIZE);
  for (let index = 0; index < batches.length; index += 1) results.push(await postImport(kind, cursor, syncId, index + 1, batches.length, { [key]: batches[index] }));
  return results;
}

async function synchronize() {
  if (syncing) throw new Error('Synchronization is already running');
  syncing = true;
  lastError = null;
  const observedAt = new Date().toISOString();
  const syncId = randomUUID();
  try {
    if (!BRIDGE_KEY) throw new Error('INTEGRATION_BRIDGE_KEY is not configured');
    await preparePage();
    const clientRows = await fetchBadge(badges.allClients);
    const terminalRows = await fetchBadge(badges.allCashRegisters);
    const organizations = [...new Map(clientRows.map(normalizeClient).filter(Boolean).map((item) => [item.externalId, item])).values()];
    const clientsById = new Map(organizations.map((item) => [item.externalId, item]));
    for (const row of terminalRows) {
      const organization = normalizeClient(row);
      if (organization && !clientsById.has(organization.externalId)) { clientsById.set(organization.externalId, organization); organizations.push(organization); }
    }
    const cashRegisters = terminalRows.map((row) => normalizeCashRegister(row, clientsById)).filter(Boolean);
    const fiscalDrives = terminalRows.map(normalizeFiscalDrive).filter(Boolean);
    const ofdSubscriptions = terminalRows.map(normalizeSubscription).filter(Boolean);
    const contacts = normalizeContacts([...clientRows, ...terminalRows]);

    const summaries = [];
    summaries.push(...await sendBatches('organizations_snapshot', observedAt, syncId, 'organizations', organizations));
    summaries.push(...await sendBatches('cash_registers_snapshot', observedAt, syncId, 'cashRegisters', cashRegisters));
    summaries.push(...await sendBatches('fiscal_drives_snapshot', observedAt, syncId, 'fiscalDrives', fiscalDrives));
    summaries.push(...await sendBatches('ofd_subscriptions_snapshot', observedAt, syncId, 'ofdSubscriptions', ofdSubscriptions));
    summaries.push(...await sendBatches('contacts_snapshot', observedAt, syncId, 'contacts', contacts));

    let observationCount = 0;
    for (const badge of Object.values(badges).filter((item) => item.opportunityType)) {
      const rows = await fetchBadge(badge);
      const observations = rows.map((row) => normalizeObservation(row, badge, observedAt)).filter(Boolean);
      observationCount += observations.length;
      summaries.push(...await sendBatches(`monitoring_badge_${badge.id}`, observedAt, syncId, 'observations', observations));
    }
    lastSync = new Date().toISOString();
    return {
      syncedAt: lastSync,
      organizations: organizations.length,
      cashRegisters: cashRegisters.length,
      fiscalDrives: fiscalDrives.length,
      ofdSubscriptions: ofdSubscriptions.length,
      contacts: contacts.length,
      observations: observationCount,
      batches: summaries.length,
    };
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

server.listen(PORT, HOST, () => console.log(`Platforma OFD bridge is listening on ${HOST}:${PORT}`));
async function shutdown() { server.close(); if (context) await context.close().catch(() => undefined); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
