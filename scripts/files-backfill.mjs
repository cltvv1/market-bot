import 'dotenv/config';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const dryRun = process.argv.includes('--dry-run');
const root = path.resolve(process.env.FILE_STORAGE_ROOT || 'storage');
const { Client } = pg;
const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
});
const report = {
  dryRun,
  discoveredPaths: 0,
  uniqueFiles: 0,
  createdStoredFiles: 0,
  linkedEntities: 0,
  duplicateChecksums: [],
  missing: [],
  outsideRoot: [],
  orphans: [],
};

await client.connect();
try {
  const references = await loadReferences();
  report.discoveredPaths = references.length;
  const unique = new Map(references.map((item) => [`${item.path}`, item]));
  report.uniqueFiles = unique.size;
  const checksumIds = new Map();

  for (const item of references) {
    if (!item.path) continue;
    const absolute = path.resolve(item.path);
    const relative = path.relative(root, absolute);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      report.outsideRoot.push({ table: item.table, id: item.id, path: item.path });
      continue;
    }
    const objectKey = relative.replaceAll('\\', '/');
    const exists = fs.existsSync(absolute) && fs.statSync(absolute).isFile();
    const sizeBytes = exists ? fs.statSync(absolute).size : 0;
    const sha256 = exists ? await checksum(absolute) : '0'.repeat(64);
    if (!exists) report.missing.push({ table: item.table, id: item.id, objectKey });
    if (checksumIds.has(sha256) && exists) report.duplicateChecksums.push({ sha256, files: [checksumIds.get(sha256), objectKey] });
    else checksumIds.set(sha256, objectKey);

    const previous = await client.query(
      'SELECT id FROM stored_files WHERE provider = $1 AND "objectKey" = $2',
      ['local', objectKey],
    );
    let storedFileId = previous.rows[0]?.id;
    if (!storedFileId && !dryRun) {
      const inserted = await client.query(
        `INSERT INTO stored_files (provider, "objectKey", "originalName", "mimeType", "sizeBytes", sha256, status, metadata)
         VALUES ('local', $1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [objectKey, path.basename(absolute), mimeFor(absolute), sizeBytes, sha256, exists ? 'active' : 'missing', { legacy: true, backfilledFrom: `${item.table}.${item.sourceField}` }],
      );
      storedFileId = inserted.rows[0].id;
      report.createdStoredFiles += 1;
    }
    if (storedFileId && !dryRun) {
      const updated = await client.query(
        `UPDATE ${quote(item.table)} SET ${quote(item.targetField)} = $1 WHERE id = $2 AND ${quote(item.targetField)} IS NULL`,
        [storedFileId, item.id],
      );
      report.linkedEntities += updated.rowCount;
    }
  }

  const referencedKeys = new Set([...unique.values()].map((item) => {
    const relative = path.relative(root, path.resolve(item.path));
    return relative.startsWith('..') ? null : relative.replaceAll('\\', '/');
  }).filter(Boolean));
  for (const file of walk(root)) {
    const key = path.relative(root, file).replaceAll('\\', '/');
    if (!referencedKeys.has(key)) report.orphans.push(key);
  }
} finally {
  await client.end();
}

const output = JSON.stringify(report, null, 2);
process.stdout.write(`${output}\n`);
if (!dryRun) {
  const lines = [
    '# File Backfill Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `- Discovered legacy paths: ${report.discoveredPaths}`,
    `- Unique referenced files: ${report.uniqueFiles}`,
    `- Created StoredFile rows: ${report.createdStoredFiles}`,
    `- Linked entities: ${report.linkedEntities}`,
    `- Duplicate checksums: ${report.duplicateChecksums.length}`,
    `- Missing physical files: ${report.missing.length}`,
    `- Paths outside storage root: ${report.outsideRoot.length}`,
    `- Unreferenced physical files: ${report.orphans.length}`,
    '',
    '## Missing',
    '```json',
    JSON.stringify(report.missing, null, 2),
    '```',
    '',
    '## Outside Root',
    '```json',
    JSON.stringify(report.outsideRoot, null, 2),
    '```',
    '',
    '## Orphans',
    '```json',
    JSON.stringify(report.orphans, null, 2),
    '```',
  ];
  fs.mkdirSync(path.join('docs', 'files'), { recursive: true });
  fs.writeFileSync(path.join('docs', 'files', 'FILE_BACKFILL_REPORT.md'), `${lines.join('\n')}\n`);
}

async function loadReferences() {
  const items = [];
  const registrations = await client.query('SELECT id, "equipmentPhotoPath", "pdfPath" FROM registration_requests');
  for (const row of registrations.rows) {
    add(items, 'registration_requests', row.id, 'equipmentPhotoPath', 'equipmentPhotoFileId', row.equipmentPhotoPath);
    add(items, 'registration_requests', row.id, 'pdfPath', 'pdfFileId', row.pdfPath);
  }
  const messages = await client.query('SELECT id, "localPath" FROM ticket_messages');
  for (const row of messages.rows) add(items, 'ticket_messages', row.id, 'localPath', 'storedFileId', row.localPath);
  const requests = await client.query('SELECT id, "invoiceFileId", answers FROM service_requests');
  for (const row of requests.rows) {
    add(items, 'service_requests', row.id, 'invoiceFileId', 'invoiceStoredFileId', row.invoiceFileId);
    add(items, 'service_requests', row.id, 'answers.generatedPdfPath', 'generatedConsentFileId', row.answers?.generatedPdfPath);
    add(items, 'service_requests', row.id, 'answers.signedConsentPath', 'signedConsentFileId', row.answers?.signedConsentPath);
  }
  return items;
}

function add(items, table, id, sourceField, targetField, value) {
  if (typeof value === 'string' && value.trim()) items.push({ table, id, sourceField, targetField, path: value });
}
function quote(value) { return `"${value.replaceAll('"', '""')}"`; }
async function checksum(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function mimeFor(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.pdf') return 'application/pdf';
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.mp4') return 'video/mp4';
  if (extension === '.ogg') return 'audio/ogg';
  return 'image/jpeg';
}
function* walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}
