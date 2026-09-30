import { BadRequestException } from '@nestjs/common';
import type { TicketMediaInput } from 'src/tickets/tickets.service';
import {
    assertDeclaredMime,
    channelFilename,
    detectMime,
} from 'src/files/file-policies';

type FetchLike = (input: string) => Promise<{
    ok: boolean;
    status: number;
    headers: { get(name: string): string | null };
    body: ReadableStream<Uint8Array> | null;
}>;

export function extractMaxMedia(message: unknown): TicketMediaInput | null {
    const messageRecord = asRecord(message);
    const body = asRecord(messageRecord?.body);
    const attachments = Array.isArray(body?.attachments)
        ? body.attachments.map(asRecord).filter((item) => item !== null)
        : [];
    const attachment = attachments.find(
        (item) =>
            item.type === 'image' ||
            item.type === 'video' ||
            item.type === 'audio' ||
            item.type === 'file',
    );
    const payload = asRecord(attachment?.payload);
    if (
        !attachment ||
        typeof payload?.token !== 'string' ||
        typeof payload.url !== 'string'
    ) {
        return null;
    }

    const attachmentType = attachment.type as
        | 'image'
        | 'video'
        | 'audio'
        | 'file';
    const messageType =
        attachmentType === 'image'
            ? 'image'
            : attachmentType === 'file'
              ? 'document'
              : attachmentType;

    return {
        messageType,
        text: typeof body?.text === 'string' ? body.text : undefined,
        fileId: payload.token,
        fileName:
            typeof attachment.filename === 'string'
                ? attachment.filename
                : undefined,
        fileSize:
            typeof attachment.size === 'number' ? attachment.size : undefined,
        externalUrl: payload.url,
    };
}

export async function materializeMaxMedia(
    media: TicketMediaInput,
    maxBytes: number,
    fetcher: FetchLike = fetch,
): Promise<TicketMediaInput> {
    if (!media.fileId || !media.externalUrl) {
        throw new BadRequestException('MAX media reference is incomplete');
    }
    if (media.fileSize && media.fileSize > maxBytes) {
        throw new BadRequestException('File exceeds the configured size limit');
    }

    const response = await fetcher(media.externalUrl);
    if (!response.ok || !response.body) {
        throw new BadRequestException(
            `MAX media download failed with status ${response.status}`,
        );
    }

    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw new BadRequestException('File exceeds the configured size limit');
    }

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel();
            throw new BadRequestException(
                'File exceeds the configured size limit',
            );
        }
        chunks.push(Buffer.from(value));
    }

    const buffer = Buffer.concat(chunks, total);
    const detectedMime = await detectMime(buffer);
    if (!detectedMime)
        throw new BadRequestException('File content type is not allowed');
    assertDeclaredMime(detectedMime, media.mimeType);
    assertDeclaredMime(
        detectedMime,
        response.headers.get('content-type') ?? undefined,
    );
    return {
        ...media,
        buffer,
        externalUrl: undefined,
        fileSize: total,
        mimeType: detectedMime,
        fileName: await channelFilename(
            buffer,
            media.fileName,
            media.messageType,
        ),
    };
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : null;
}
