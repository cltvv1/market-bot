import type { Readable } from 'node:stream';

export const FILE_STORAGE_PORT = Symbol('FILE_STORAGE_PORT');

export interface StoredObject {
    objectKey: string;
    sizeBytes: number;
    sha256: string;
}

export interface FileStoragePort {
    write(objectKey: string, source: Readable, maxBytes: number): Promise<StoredObject>;
    openRead(objectKey: string): Promise<Readable>;
    exists(objectKey: string): Promise<boolean>;
    checksum(objectKey: string): Promise<string>;
    remove(objectKey: string): Promise<void>;
    resolveObjectKey(objectKey: string): string;
}

export type FilePurpose =
    | 'registration-photo'
    | 'ticket-image'
    | 'ticket-document'
    | 'ticket-audio'
    | 'ticket-video'
    | 'service-invoice'
    | 'atol-consent'
    | 'generated-pdf'
    | 'signed-document'
    | 'payment-proof';

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
