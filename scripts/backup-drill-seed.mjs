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
            `INSERT INTO admin_users (login, "displayName", "passwordHash", role)
     VALUES ('ci-admin', 'CI Admin', 'not-a-real-password-hash', 'admin') RETURNING id`,
        )
    ).rows[0];
    await client.query(
        `INSERT INTO admin_user_roles ("userId", role) VALUES ($1, 'superadmin')`,
        [admin.id],
    );

    const registrationFile = await createStoredFile(
        client,
        user.id,
        'registrations/ci-photo.txt',
        'registration fixture',
    );
    const ticketFile = await createStoredFile(
        client,
        user.id,
        'tickets/ci-attachment.txt',
        'ticket fixture',
    );
    await client.query(
        `INSERT INTO registration_requests ("chatId", platform, "userId", "equipmentPhotoFileId", "isFilled")
     VALUES ('ci-customer', 'web', $1, $2, true)`,
        [user.id, registrationFile],
    );
    await client.query(
        `INSERT INTO service_requests ("serviceTypeId", "serviceTypeCode", "serviceTypeTitle", "userId", platform, "chatId", status)
     VALUES (1, 'ci-service', 'CI service', $1, 'web', 'ci-customer', 'submitted')`,
        [user.id],
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
     VALUES ($1, 'client', 'document', 'CI attachment', $2)`,
        [ticket.id, ticketFile],
    );
    process.stdout.write('Created synthetic backup drill records and files.\n');
} finally {
    await client.end();
}

async function createStoredFile(database, customerId, objectKey, contents) {
    const filePath = path.join(storageRoot, ...objectKey.split('/'));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
    const digest = createHash('sha256').update(contents).digest('hex');
    return (
        await database.query(
            `INSERT INTO stored_files
       (provider, "objectKey", "originalName", "mimeType", "sizeBytes", sha256, "createdByCustomerId")
     VALUES ('local', $1, $2, 'text/plain', $3, $4, $5) RETURNING id`,
            [
                objectKey,
                path.basename(objectKey),
                Buffer.byteLength(contents),
                digest,
                customerId,
            ],
        )
    ).rows[0].id;
}
