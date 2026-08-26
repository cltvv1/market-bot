import * as path from 'node:path';
import { BadRequestException } from '@nestjs/common';
import type { SupportResourceType } from 'src/support-knowledge/support-knowledge.types';

export const SUPPORT_SIGNATURE_PREFIX_BYTES = 128 * 1024;

export type SupportFileKind =
    | 'pdf'
    | 'zip'
    | 'pe'
    | 'msi'
    | 'seven_zip'
    | 'rar'
    | 'cab'
    | 'gzip';

interface SupportFileRule {
    extensions: readonly string[];
    mimeType: string;
    declaredMimeTypes: readonly string[];
}

const RULES: Record<SupportFileKind, SupportFileRule> = {
    pdf: rule(['.pdf'], 'application/pdf', ['application/pdf']),
    zip: rule(['.zip'], 'application/zip', [
        'application/zip',
        'application/x-zip-compressed',
    ]),
    pe: rule(['.exe'], 'application/vnd.microsoft.portable-executable', [
        'application/vnd.microsoft.portable-executable',
        'application/x-msdownload',
    ]),
    msi: rule(['.msi'], 'application/x-msi', [
        'application/x-msi',
        'application/x-msdownload',
    ]),
    seven_zip: rule(['.7z'], 'application/x-7z-compressed', [
        'application/x-7z-compressed',
    ]),
    rar: rule(['.rar'], 'application/vnd.rar', [
        'application/vnd.rar',
        'application/x-rar-compressed',
    ]),
    cab: rule(['.cab'], 'application/vnd.ms-cab-compressed', [
        'application/vnd.ms-cab-compressed',
        'application/x-cab',
    ]),
    gzip: rule(['.gz', '.tgz', '.tar.gz'], 'application/gzip', [
        'application/gzip',
        'application/x-gzip',
    ]),
};

const DOCUMENT_KINDS = new Set<SupportFileKind>(['pdf']);
const PACKAGE_KINDS = new Set<SupportFileKind>([
    'zip',
    'pe',
    'msi',
    'seven_zip',
    'rar',
    'cab',
    'gzip',
]);
const ARCHIVE_KINDS = new Set<SupportFileKind>([
    'zip',
    'seven_zip',
    'rar',
    'cab',
    'gzip',
]);

export interface ValidatedSupportFile {
    originalName: string;
    kind: SupportFileKind;
    mimeType: string;
}

export function decodeSupportFilename(value: string | undefined) {
    if (!value) {
        throw new BadRequestException('X-Vitma-Filename header is required');
    }
    let decoded: string;
    try {
        decoded = decodeURIComponent(value).normalize('NFC').trim();
    } catch {
        throw new BadRequestException('X-Vitma-Filename is malformed');
    }
    if (
        !decoded ||
        Buffer.byteLength(decoded, 'utf8') > 255 ||
        [...decoded].some((character) => {
            const code = character.charCodeAt(0);
            return code <= 0x1f || code === 0x7f;
        }) ||
        decoded.includes('/') ||
        decoded.includes('\\') ||
        path.basename(decoded) !== decoded ||
        decoded === '.' ||
        decoded === '..'
    ) {
        throw new BadRequestException('Invalid support filename');
    }
    return decoded;
}

export function validateSupportFile(
    prefix: Buffer,
    originalName: string,
    declaredMime: string | undefined,
    resourceType: SupportResourceType,
): ValidatedSupportFile {
    const kind = detectSupportFileKind(prefix);
    if (!kind) {
        throw new BadRequestException('Unsupported support file content');
    }
    const rule = RULES[kind];
    const lowerName = originalName.toLowerCase();
    if (!rule.extensions.some((extension) => lowerName.endsWith(extension))) {
        throw new BadRequestException(
            'Support filename extension does not match file content',
        );
    }
    const normalizedMime = declaredMime?.split(';', 1)[0].trim().toLowerCase();
    if (
        normalizedMime &&
        normalizedMime !== 'application/octet-stream' &&
        !rule.declaredMimeTypes.includes(normalizedMime)
    ) {
        throw new BadRequestException(
            'Declared MIME type does not match file content',
        );
    }
    assertSupportFileKindAllowed(kind, resourceType);
    return { originalName, kind, mimeType: rule.mimeType };
}

export function assertSupportFileKindAllowed(
    kind: SupportFileKind,
    resourceType: SupportResourceType,
) {
    if (!isSupportFileKindAllowed(kind, resourceType)) {
        throw new BadRequestException(
            'File content is not allowed for this support resource type',
        );
    }
}

export function isSupportFileKindAllowed(
    kind: string,
    resourceType: SupportResourceType,
): kind is SupportFileKind {
    return allowedKinds(resourceType).has(kind as SupportFileKind);
}

export function detectSupportFileKind(prefix: Buffer): SupportFileKind | null {
    if (prefix.subarray(0, 5).toString('ascii') === '%PDF-') return 'pdf';
    if (
        prefix.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) ||
        prefix.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x05, 0x06])) ||
        prefix.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x07, 0x08]))
    ) {
        return 'zip';
    }
    if (
        prefix
            .subarray(0, 8)
            .equals(
                Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
            )
    ) {
        return 'msi';
    }
    if (
        prefix
            .subarray(0, 6)
            .equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))
    ) {
        return 'seven_zip';
    }
    if (
        prefix
            .subarray(0, 7)
            .equals(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])) ||
        prefix
            .subarray(0, 8)
            .equals(
                Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]),
            )
    ) {
        return 'rar';
    }
    if (prefix.subarray(0, 4).toString('ascii') === 'MSCF') return 'cab';
    if (prefix.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]))) {
        return 'gzip';
    }
    if (isPortableExecutable(prefix)) return 'pe';
    return null;
}

function isPortableExecutable(prefix: Buffer) {
    if (
        prefix.length < 64 ||
        prefix.subarray(0, 2).toString('ascii') !== 'MZ'
    ) {
        return false;
    }
    const peOffset = prefix.readUInt32LE(0x3c);
    return (
        peOffset >= 64 &&
        peOffset + 4 <= prefix.length &&
        prefix.subarray(peOffset, peOffset + 4).equals(Buffer.from('PE\0\0'))
    );
}

function allowedKinds(resourceType: SupportResourceType) {
    if (
        ['manual', 'quick_start', 'datasheet', 'certificate'].includes(
            resourceType,
        )
    ) {
        return DOCUMENT_KINDS;
    }
    if (resourceType === 'firmware') return ARCHIVE_KINDS;
    if (resourceType === 'other') {
        return new Set<SupportFileKind>([...DOCUMENT_KINDS, ...PACKAGE_KINDS]);
    }
    return PACKAGE_KINDS;
}

function rule(
    extensions: readonly string[],
    mimeType: string,
    declaredMimeTypes: readonly string[],
): SupportFileRule {
    return { extensions, mimeType, declaredMimeTypes };
}
