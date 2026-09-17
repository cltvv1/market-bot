import { BadRequestException } from '@nestjs/common';
import * as path from 'node:path';
import type { FilePurpose } from './file-storage.types';
import { detectContent } from './file-content';

export interface FilePolicy {
    maxBytes: number;
    mimeTypes: readonly string[];
    extensions: readonly string[];
    serverGeneratedOnly: boolean;
    customerReadable: boolean;
    staffReadable: boolean;
    inline: boolean;
    afterClose: boolean;
    strictContent: boolean;
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
    'order-invoice': policy(
        15 * MB,
        ['application/pdf'],
        ['.pdf'],
        false,
        true,
        false,
        true,
    ),
    'order-payment-proof': policy(
        20 * MB,
        ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        ['.pdf', '.jpg', '.jpeg', '.png', '.webp'],
        false,
        true,
        false,
        true,
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
        true,
        false,
        true,
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
    'support-resource': policy(
        512 * MB,
        [
            'application/pdf',
            'application/zip',
            'application/octet-stream',
            'application/vnd.microsoft.portable-executable',
            'application/x-msdownload',
            'application/x-msi',
            'application/x-7z-compressed',
            'application/vnd.rar',
            'application/x-rar-compressed',
            'application/vnd.ms-cab-compressed',
            'application/x-cab',
            'application/gzip',
            'application/x-gzip',
        ],
        [
            '.pdf',
            '.zip',
            '.exe',
            '.msi',
            '.7z',
            '.rar',
            '.cab',
            '.gz',
            '.tgz',
            '.tar.gz',
        ],
        false,
        true,
        false,
        false,
    ),
};

function policy(
    maxBytes: number,
    mimeTypes: readonly string[],
    extensions: readonly string[],
    inline: boolean,
    customerReadable: boolean,
    serverGeneratedOnly = false,
    strictContent = true,
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
        strictContent,
    };
}

export const detectMime = detectContent;

export async function assertFilePolicy(
    purpose: FilePurpose,
    buffer: Buffer,
    suppliedMime?: string,
    serverGenerated = false,
    originalName?: string,
) {
    const policy = FILE_POLICIES[purpose];
    if (purpose === 'support-resource')
        throw new BadRequestException(
            'Support resources require the streaming upload workflow',
        );
    if (buffer.length > policy.maxBytes)
        throw new BadRequestException('File exceeds the configured size limit');
    if (policy.serverGeneratedOnly && !serverGenerated)
        throw new BadRequestException(
            'This file category is server-generated only',
        );
    const detected = await detectContent(buffer);
    if (!detected || !policy.mimeTypes.includes(detected))
        throw new BadRequestException('File content type is not allowed');
    assertDeclaredMime(detected, suppliedMime);
    const name = validatedFilename(originalName);
    const extension = path.extname(name).toLowerCase();
    if (
        !policy.extensions.includes(extension) ||
        !EXTENSIONS_BY_MIME[detected]?.includes(extension)
    )
        throw new BadRequestException(
            'File extension does not match its content',
        );
    return { policy, mime: detected };
}

export const EXTENSIONS_BY_MIME: Record<string, readonly string[]> = {
    'application/pdf': ['.pdf'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp'],
    'image/gif': ['.gif'],
    'text/plain': ['.txt'],
    'application/zip': ['.zip'],
    'audio/mpeg': ['.mp3'],
    'audio/ogg': ['.ogg'],
    'audio/mp4': ['.m4a'],
    'audio/webm': ['.webm'],
    'video/mp4': ['.mp4'],
    'video/webm': ['.webm'],
    'video/quicktime': ['.mov'],
};

export function validatedFilename(value?: string) {
    if (
        !value ||
        value.length > 255 ||
        Array.from(value).some(
            (character) =>
                character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        )
    )
        throw new BadRequestException('Invalid original filename');
    const name = path.win32.basename(path.posix.basename(value)).trim();
    if (!name || name === '.' || name === '..')
        throw new BadRequestException('Invalid original filename');
    return name;
}

function normalizeDeclaredMime(value?: string) {
    if (!value?.trim()) return undefined;
    const [mime, ...parameters] = value
        .trim()
        .toLowerCase()
        .split(';')
        .map((part) => part.trim());
    if (
        parameters.length &&
        !(
            mime === 'text/plain' &&
            parameters.length === 1 &&
            /^charset=(?:utf-8|"utf-8")$/.test(parameters[0])
        )
    )
        throw new BadRequestException('Unsupported MIME parameters');
    const aliases: Record<string, string> = {
        'image/jpg': 'image/jpeg',
        'image/pjpeg': 'image/jpeg',
        'application/x-zip-compressed': 'application/zip',
        'audio/mp3': 'audio/mpeg',
        'audio/x-m4a': 'audio/mp4',
        'application/ogg': 'audio/ogg',
    };
    return aliases[mime] ?? mime;
}

export function assertDeclaredMime(detected: string, supplied?: string) {
    const declared = normalizeDeclaredMime(supplied);
    if (
        declared &&
        declared !== 'application/octet-stream' &&
        declared !== detected
    )
        throw new BadRequestException(
            'File content does not match its declared MIME type',
        );
}

// Only internal channel adapters call this for genuinely absent provider filenames.
export async function channelFilename(
    buffer: Buffer,
    name?: string,
    prefix = 'attachment',
) {
    if (name !== undefined && name !== '') return name;
    const mime = await detectContent(buffer);
    const extension = mime && EXTENSIONS_BY_MIME[mime]?.[0];
    if (!extension)
        throw new BadRequestException('File content type is not allowed');
    return `${prefix}${extension}`;
}
