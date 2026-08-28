import type { Readable } from 'node:stream';

export const FILE_STORAGE_PORT = Symbol('FILE_STORAGE_PORT');

export interface StoredObject {
    objectKey: string;
    sizeBytes: number;
    sha256: string;
}

export interface StorageEntry {
    objectKey: string;
    sizeBytes: number;
    modifiedAt: Date;
    kind: 'object' | 'temporary';
}

export class FileSizeLimitError extends Error {
    constructor(readonly maxBytes: number) {
        super('File exceeds the configured size limit');
        this.name = 'FileSizeLimitError';
    }
}

export interface FileStoragePort {
    write(
        objectKey: string,
        source: Readable,
        maxBytes: number,
    ): Promise<StoredObject>;
    openRead(objectKey: string): Promise<Readable>;
    exists(objectKey: string): Promise<boolean>;
    checksum(objectKey: string): Promise<string>;
    remove(objectKey: string): Promise<void>;
    listEntries(): AsyncIterable<StorageEntry>;
    resolveObjectKey(objectKey: string): string;
}

export type FilePurpose =
    | 'registration-photo'
    | 'registration-evidence'
    | 'ticket-image'
    | 'ticket-document'
    | 'ticket-audio'
    | 'ticket-video'
    | 'service-invoice'
    | 'order-invoice'
    | 'order-payment-proof'
    | 'atol-consent'
    | 'generated-pdf'
    | 'signed-document'
    | 'payment-proof'
    | 'service-attachment'
    | 'support-resource';

export interface SaveFileInput {
    purpose: FilePurpose;
    source: Readable;
    originalName?: string;
    mimeType?: string;
    declaredSize?: number;
    createdByStaffId?: number;
    createdByCustomerId?: number;
    metadata?: Record<string, unknown>;
}
