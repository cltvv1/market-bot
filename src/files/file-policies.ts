import { BadRequestException } from '@nestjs/common';
import type { FilePurpose } from './file-storage.types';

export interface FilePolicy {
    maxBytes: number;
    mimeTypes: readonly string[];
    extensions: readonly string[];
    serverGeneratedOnly: boolean;
    customerReadable: boolean;
    staffReadable: boolean;
    inline: boolean;
    afterClose: boolean;
}

const MB = 1024 * 1024;

export const FILE_POLICIES: Record<FilePurpose, FilePolicy> = {
    'registration-photo': policy(
        12 * MB,
        ['image/jpeg', 'image/png', 'image/webp'],
        ['.jpg', '.jpeg', '.png', '.webp'],
        true,
        true,
    ),
    'registration-evidence': policy(
        15 * MB,
        ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        ['.pdf', '.jpg', '.jpeg', '.png', '.webp'],
        false,
        true,
    ),
    'ticket-image': policy(
        12 * MB,
        ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
        true,
        true,
    ),
    'ticket-document': policy(
        20 * MB,
        ['application/pdf', 'text/plain', 'application/zip'],
        ['.pdf', '.txt', '.zip'],
        false,
        true,
    ),
    'ticket-audio': policy(
        30 * MB,
        ['audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/webm'],
        ['.mp3', '.ogg', '.m4a', '.webm'],
        true,
        true,
    ),
    'ticket-video': policy(
        80 * MB,
        ['video/mp4', 'video/webm', 'video/quicktime'],
        ['.mp4', '.webm', '.mov'],
        true,
        true,
    ),
    'service-invoice': policy(
        15 * MB,
        ['application/pdf'],
        ['.pdf'],
        false,
        false,
    ),
    'atol-consent': policy(
        15 * MB,
        ['application/pdf'],
        ['.pdf'],
        false,
        false,
        true,
    ),
    'generated-pdf': policy(
        15 * MB,
        ['application/pdf'],
        ['.pdf'],
        false,
        false,
        true,
    ),
    'signed-document': policy(
        20 * MB,
        ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        ['.pdf', '.jpg', '.jpeg', '.png', '.webp'],
        false,
        false,
    ),
    'payment-proof': policy(
        20 * MB,
        ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        ['.pdf', '.jpg', '.jpeg', '.png', '.webp'],
        false,
        false,
    ),
    'service-attachment': policy(
        20 * MB,
        [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/webp',
            'text/plain',
        ],
        ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.txt'],
        false,
        true,
    ),
};

function policy(
    maxBytes: number,
    mimeTypes: readonly string[],
    extensions: readonly string[],
    inline: boolean,
    customerReadable: boolean,
    serverGeneratedOnly = false,
): FilePolicy {
    return {
        maxBytes,
        mimeTypes,
        extensions,
        serverGeneratedOnly,
        customerReadable,
        staffReadable: true,
        inline,
        afterClose: false,
    };
}

export function detectMime(header: Buffer): string | null {
    if (header.subarray(0, 5).toString('ascii') === '%PDF-')
        return 'application/pdf';
    if (header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
        return 'image/jpeg';
    if (
        header
            .subarray(0, 8)
            .equals(
                Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            )
    )
        return 'image/png';
    if (header.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
    if (
        header.subarray(0, 4).toString('ascii') === 'RIFF' &&
        header.subarray(8, 12).toString('ascii') === 'WEBP'
    )
        return 'image/webp';
    if (header.subarray(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
    if (header.subarray(0, 3).toString('ascii') === 'ID3') return 'audio/mpeg';
    if (header.subarray(4, 8).toString('ascii') === 'ftyp') return 'video/mp4';
    if (header.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])))
        return 'application/zip';
    return null;
}

export function assertFilePolicy(
    purpose: FilePurpose,
    buffer: Buffer,
    suppliedMime?: string,
    serverGenerated = false,
) {
    const policy = FILE_POLICIES[purpose];
    if (buffer.length > policy.maxBytes)
        throw new BadRequestException('File exceeds the configured size limit');
    if (policy.serverGeneratedOnly && !serverGenerated)
        throw new BadRequestException(
            'This file category is server-generated only',
        );
    const detected = detectMime(buffer);
    const mime = detected ?? suppliedMime?.toLowerCase();
    if (!mime || !policy.mimeTypes.includes(mime))
        throw new BadRequestException('File content type is not allowed');
    if (detected && suppliedMime && detected !== suppliedMime.toLowerCase()) {
        throw new BadRequestException(
            'File content does not match its declared MIME type',
        );
    }
    return { policy, mime };
}
