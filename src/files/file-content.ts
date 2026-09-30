import { imageSize } from 'image-size';
import { TextDecoder } from 'node:util';
import { crc32 } from 'node:zlib';
import { fromBufferPromise } from 'yauzl';
import { inspectMedia } from './media-content';

const bytes = (buffer: Buffer, start: number, value: string) =>
    buffer.subarray(start, start + value.length).toString('latin1') === value;

// Type/structure checks only: no document execution, decompression or image decoding.
export async function detectContent(buffer: Buffer): Promise<string | null> {
    if (!buffer.length) return null;
    try {
        if (bytes(buffer, 0, '%PDF-'))
            return validPdf(buffer) ? 'application/pdf' : null;
        if (
            buffer.length >= 4 &&
            [0x04034b50, 0x06054b50, 0x08074b50].includes(
                buffer.readUInt32LE(0),
            )
        )
            return (await validZip(buffer)) ? 'application/zip' : null;
        if (isMedia(buffer)) {
            if (bytes(buffer, 4, 'ftyp') && !validMp4Boxes(buffer)) return null;
            return await inspectMedia(buffer);
        }
        const image = imageType(buffer);
        if (image) return validImage(buffer, image) ? `image/${image}` : null;
        return validText(buffer) ? 'text/plain' : null;
    } catch {
        return null;
    }
}

function validText(buffer: Buffer) {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (!text.length) return false;
    for (let index = 0; index < text.length; index++) {
        const code = text.charCodeAt(index);
        if (
            (code < 32 && code !== 9 && code !== 10 && code !== 13) ||
            (code >= 127 && code <= 159)
        )
            return false;
    }
    return true;
}

function validPdf(buffer: Buffer) {
    if (
        !/^%PDF-[12]\.\d(?:\r|\n)/.test(
            buffer.subarray(0, 16).toString('ascii'),
        )
    )
        return false;
    const tail = buffer
        .subarray(Math.max(0, buffer.length - 2048))
        .toString('latin1');
    const end = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail);
    if (!end) return false;
    const offset = Number(end[1]);
    if (
        !Number.isSafeInteger(offset) ||
        offset < 8 ||
        offset >= buffer.length - 12
    )
        return false;
    const target = buffer.subarray(offset, offset + 256).toString('latin1');
    return (
        /\b\d{1,10}\s+\d{1,5}\s+obj\b/.test(
            buffer.subarray(0, offset).toString('latin1'),
        ) &&
        (/^xref\s/.test(target) ||
            /^\d{1,10}\s+\d{1,5}\s+obj\b[\s\S]*\/Type\s*\/XRef\b/.test(target))
    );
}

function imageType(buffer: Buffer) {
    if (buffer[0] === 255 && buffer[1] === 216) return 'jpeg';
    if (buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
        return 'png';
    if (bytes(buffer, 0, 'GIF87a') || bytes(buffer, 0, 'GIF89a')) return 'gif';
    if (bytes(buffer, 0, 'RIFF') && bytes(buffer, 8, 'WEBP')) return 'webp';
    return null;
}

function validImage(buffer: Buffer, type: string) {
    const size = imageSize(buffer);
    if (
        !size.width ||
        !size.height ||
        (size.type !== type && !(type === 'jpeg' && size.type === 'jpg'))
    )
        return false;
    if (type === 'jpeg') {
        // image-size validates the SOF segments; require scan data and terminal EOI too.
        const scan = buffer.indexOf(Buffer.from([255, 218]), 2);
        return (
            scan > 2 &&
            scan + 10 < buffer.length &&
            buffer.subarray(-2).equals(Buffer.from([255, 217]))
        );
    }
    if (type === 'gif')
        return (
            buffer.length > 20 &&
            buffer[buffer.length - 1] === 0x3b &&
            buffer.includes(0x2c, 13)
        );
    if (type === 'png') {
        let offset = 8;
        let data = false;
        while (offset + 12 <= buffer.length) {
            const length = buffer.readUInt32BE(offset);
            const end = offset + 12 + length;
            if (end > buffer.length) return false;
            const kind = buffer.toString('ascii', offset + 4, offset + 8);
            if (offset === 8 && (kind !== 'IHDR' || length !== 13))
                return false;
            if (
                crc32(buffer.subarray(offset + 4, end - 4)) !==
                buffer.readUInt32BE(end - 4)
            )
                return false;
            if (kind === 'IDAT' && length > 0) data = true;
            if (kind === 'IEND')
                return data && length === 0 && end === buffer.length;
            offset = end;
        }
        return false;
    }
    if (buffer.readUInt32LE(4) + 8 !== buffer.length) return false;
    let offset = 12;
    let data = false;
    while (offset + 8 <= buffer.length) {
        const length = buffer.readUInt32LE(offset + 4);
        const kind = buffer.toString('ascii', offset, offset + 4);
        offset += 8 + length + (length % 2);
        if (offset > buffer.length) return false;
        if (['VP8 ', 'VP8L', 'ANMF'].includes(kind) && length >= 5) data = true;
    }
    return data && offset === buffer.length;
}

async function validZip(buffer: Buffer) {
    const zip = await fromBufferPromise(buffer, {
        lazyEntries: true,
        autoClose: false,
        strictFileNames: true,
    });
    try {
        if (zip.entryCount > 10000) return false;
        let count = 0;
        for await (const entry of zip.eachEntry()) {
            if (++count > 10000) return false;
            const local = await zip.readLocalFileHeaderPromise(entry, {
                minimal: true,
            });
            if (
                !Number.isSafeInteger(entry.compressedSize) ||
                local.fileDataStart + entry.compressedSize > buffer.length
            )
                return false;
        }
        return count === zip.entryCount;
    } finally {
        zip.close();
    }
}

function isMedia(buffer: Buffer) {
    return (
        bytes(buffer, 0, 'ID3') ||
        bytes(buffer, 0, 'OggS') ||
        bytes(buffer, 4, 'ftyp') ||
        (buffer[0] === 255 &&
            (buffer[1] & 0xe0) === 0xe0 &&
            buffer[1] !== 216) ||
        buffer.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex'))
    );
}

function validMp4Boxes(buffer: Buffer) {
    let offset = 0;
    let metadata = false;
    let media = false;
    while (offset + 8 <= buffer.length) {
        let size = buffer.readUInt32BE(offset);
        let header = 8;
        if (size === 1) {
            if (offset + 16 > buffer.length) return false;
            const wide = buffer.readBigUInt64BE(offset + 8);
            if (wide > BigInt(Number.MAX_SAFE_INTEGER)) return false;
            size = Number(wide);
            header = 16;
        } else if (size === 0) size = buffer.length - offset;
        if (size < header || offset + size > buffer.length) return false;
        const kind = buffer.toString('ascii', offset + 4, offset + 8);
        if (kind === 'moov' && size > header) metadata = true;
        if (kind === 'mdat' && size > header) media = true;
        offset += size;
    }
    return offset === buffer.length && metadata && media;
}
