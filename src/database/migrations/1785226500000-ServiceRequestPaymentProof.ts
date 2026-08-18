import { MigrationInterface, QueryRunner } from 'typeorm';

export class ServiceRequestPaymentProof1785226500000
    implements MigrationInterface
{
    name = 'ServiceRequestPaymentProof1785226500000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD "paymentProofFileId" integer`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD CONSTRAINT "FK_service_payment_proof_file" FOREIGN KEY ("paymentProofFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_service_payment_proof_file" ON "service_requests" ("paymentProofFileId")`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DROP INDEX "public"."IDX_service_payment_proof_file"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" DROP CONSTRAINT "FK_service_payment_proof_file"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" DROP COLUMN "paymentProofFileId"`,
        );
    }
}
