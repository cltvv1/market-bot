import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const storageRoot = path.resolve(process.env.FILE_STORAGE_ROOT || '');
if (!process.env.FILE_STORAGE_ROOT || storageRoot === path.resolve('storage')) {
    throw new Error('backup-drill-seed requires an isolated FILE_STORAGE_ROOT');
}

const client = new pg.Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
});
await client.connect();

try {
    const user = (
        await client.query(
            `INSERT INTO users ("chatId", platform, name) VALUES ('ci-customer', 'web', 'CI Customer') RETURNING id`,
        )
    ).rows[0];
    const admin = (
        await client.query(
            `INSERT INTO admin_users (login, "displayName", "passwordHash")
     VALUES ('ci-admin', 'CI Admin', 'not-a-real-password-hash') RETURNING id`,
        )
    ).rows[0];
    await client.query(
        `INSERT INTO admin_user_roles ("userId", role) VALUES ($1, 'superadmin')`,
        [admin.id],
    );

    const registrationPdf = await createStoredFile(
        client,
        user.id,
        'registrations/ci-registration.pdf',
        '%PDF canonical registration fixture',
        'application/pdf',
    );
    const registrationPhoto = await createStoredFile(
        client,
        user.id,
        'registration-evidence/ci-photo.jpg',
        'canonical registration evidence',
        'image/jpeg',
    );
    const ticketFile = await createStoredFile(
        client,
        user.id,
        'tickets/ci-attachment.txt',
        'ticket fixture',
    );
    const registration = (
        await client.query(
            `INSERT INTO registration_requests
       ("chatId", platform, "userId", "currentStep", status, readiness, "ofdProvisionMode", "pdfFileId")
     VALUES ('ci-customer', 'web', $1, 2, 'new', 'incomplete', 'clarification_required', $2)
     RETURNING id`,
            [user.id, registrationPdf],
        )
    ).rows[0];
    const requirement = (
        await client.query(
            `INSERT INTO registration_requirements
       ("registrationId", kind, status, value, source, "providedAt", version)
     VALUES ($1, 'kkt_serial', 'provided', 'CI-KKT-001', 'customer_photo', now(), 1)
     RETURNING id`,
            [registration.id],
        )
    ).rows[0];
    await client.query(
        `INSERT INTO registration_requirements ("registrationId", kind, status, version)
     VALUES ($1, 'fiscal_drive_serial', 'missing', 1), ($1, 'ofd_code', 'missing', 1)`,
        [registration.id],
    );
    await client.query(
        `INSERT INTO registration_evidence
       ("registrationId", "requirementId", "storedFileId", kind, visibility, "uploadedByActorType", "uploadedByActorId")
     VALUES ($1, $2, $3, 'customer_photo', 'customer', 'customer', $4)`,
        [registration.id, requirement.id, registrationPhoto, user.id],
    );

    const serviceType = (
        await client.query(
            `INSERT INTO service_types (code, title, flow, "isActive")
     VALUES ('ci_service', 'CI service', 'simple', true) RETURNING id`,
        )
    ).rows[0];
    const formDefinition = (
        await client.query(
            `INSERT INTO service_form_definitions ("serviceTypeId", "isActive", "supportedChannels")
     VALUES ($1, true, '["web"]'::jsonb) RETURNING id`,
            [serviceType.id],
        )
    ).rows[0];
    const formVersion = (
        await client.query(
            `INSERT INTO service_form_versions
       ("definitionId", version, status, schema, "handlerKey", "publishedAt")
     VALUES ($1, 1, 'published', '{"fields":[]}'::jsonb, 'simple', now()) RETURNING id`,
            [formDefinition.id],
        )
    ).rows[0];
    await client.query(
        `INSERT INTO service_requests
       ("requestNumber", "serviceTypeId", "serviceTypeCode", "serviceTypeTitle", "formVersionId",
        "userId", platform, source, "chatId", status, "customerStatus", "currentStep", answers,
        "contactSnapshot", priority, "submittedAt", version)
     VALUES ('SR-CI-BACKUP-0001', $1, 'ci_service', 'CI service', $2, $3, 'web', 'web',
        'ci-customer', 'submitted', 'received', 0, '{}'::jsonb,
        '{"name":"CI Customer","preferredChannel":"web"}'::jsonb, 'normal', now(), 1)`,
        [serviceType.id, formVersion.id, user.id],
    );
    const ticket = (
        await client.query(
            `INSERT INTO tickets ("userChatId", platform, "userId", text)
     VALUES ('ci-customer', 'web', $1, 'CI ticket') RETURNING id`,
            [user.id],
        )
    ).rows[0];
    await client.query(
        `INSERT INTO ticket_messages ("ticketId", sender, "messageType", text, "storedFileId")
     VALUES ($1, 'user', 'document', 'CI attachment', $2)`,
        [ticket.id, ticketFile],
    );
    process.stdout.write('Created synthetic backup drill records and files.\n');
} finally {
    await client.end();
}

async function createStoredFile(
    database,
    customerId,
    objectKey,
    contents,
    mimeType = 'text/plain',
) {
    const filePath = path.join(storageRoot, ...objectKey.split('/'));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
    const digest = createHash('sha256').update(contents).digest('hex');
    return (
        await database.query(
            `INSERT INTO stored_files
       (provider, "objectKey", "originalName", "mimeType", "sizeBytes", sha256, "createdByCustomerId")
     VALUES ('local', $1, $2, $3, $4, $5, $6) RETURNING id`,
            [
                objectKey,
                path.basename(objectKey),
                mimeType,
                Buffer.byteLength(contents),
                digest,
                customerId,
            ],
        )
    ).rows[0].id;
}
