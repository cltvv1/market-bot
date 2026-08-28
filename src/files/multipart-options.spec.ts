import {
    multipartOptionsForPurpose,
    multipartOptionsForPurposes,
} from './multipart-options';

describe('multipart options', () => {
    it('derives the transport file limit from the domain policy', () => {
        expect(
            multipartOptionsForPurpose('service-attachment').limits,
        ).toMatchObject({
            fileSize: 20 * 1024 * 1024,
            files: 1,
            fields: 0,
            parts: 2,
            fieldNameSize: 64,
            fieldSize: 64 * 1024,
            fieldNestingDepth: 0,
        });
    });

    it('uses the strictest policy for a route with dynamic media types', () => {
        expect(
            multipartOptionsForPurposes(
                [
                    'ticket-image',
                    'ticket-document',
                    'ticket-audio',
                    'ticket-video',
                ],
                3,
            ).limits,
        ).toMatchObject({
            fileSize: 12 * 1024 * 1024,
            files: 1,
            fields: 3,
            parts: 5,
        });
    });

    it.each([
        ['order-invoice', 15 * 1024 * 1024],
        ['order-payment-proof', 20 * 1024 * 1024],
    ] as const)(
        'bounds %s upload to one file and one field',
        (purpose, size) => {
            expect(multipartOptionsForPurpose(purpose, 1).limits).toMatchObject(
                {
                    fileSize: size,
                    files: 1,
                    fields: 1,
                    parts: 3,
                },
            );
        },
    );
});
