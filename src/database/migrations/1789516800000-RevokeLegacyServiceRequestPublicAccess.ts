import { MigrationInterface, QueryRunner } from 'typeorm';

export class RevokeLegacyServiceRequestPublicAccess1789516800000
    implements MigrationInterface
{
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            'UPDATE "service_requests" SET "publicTokenHash" = NULL WHERE "publicTokenHash" IS NOT NULL',
        );
    }

    public async down(): Promise<void> {
        // Intentionally irreversible: revoked weak capabilities must not be restored.
    }
}
