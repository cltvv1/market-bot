import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { FILE_POLICIES } from './file-policies';
import type { FilePurpose } from './file-storage.types';

const FIELD_NAME_BYTES = 64;
const FIELD_VALUE_BYTES = 64 * 1024;

type HardenedMulterLimits = NonNullable<MulterOptions['limits']> & {
    fieldNestingDepth: number;
};

export function multipartOptionsForPurpose(
    purpose: FilePurpose,
    allowedFields = 0,
): MulterOptions {
    return multipartOptionsForPurposes([purpose], allowedFields);
}

export function multipartOptionsForPurposes(
    purposes: readonly FilePurpose[],
    allowedFields = 0,
): MulterOptions {
    if (!purposes.length)
        throw new Error('At least one file purpose is required');
    const limits: HardenedMulterLimits = {
        fileSize: Math.min(
            ...purposes.map((purpose) => FILE_POLICIES[purpose].maxBytes),
        ),
        files: 1,
        fields: allowedFields,
        // Busboy emits partsLimit when the counter reaches the limit, so one
        // sentinel slot is required to accept exactly the declared contract.
        parts: allowedFields + 2,
        fieldSize: FIELD_VALUE_BYTES,
        fieldNameSize: FIELD_NAME_BYTES,
        fieldNestingDepth: 0,
        headerPairs: 50,
    };
    return { limits };
}
