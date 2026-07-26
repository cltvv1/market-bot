import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1785067383157 implements MigrationInterface {
    name = 'InitialSchema1785067383157';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "users" ("id" SERIAL NOT NULL, "chatId" character varying NOT NULL, "platform" character varying NOT NULL DEFAULT 'telegram', "name" character varying, "username" character varying, "firstSeenAt" TIMESTAMP, "lastSeenAt" TIMESTAMP, "sendNews" boolean NOT NULL DEFAULT true, "sendImportant" boolean NOT NULL DEFAULT true, "isAdmin" boolean NOT NULL DEFAULT false, "isOperator" boolean NOT NULL DEFAULT false, "talkingTo" character varying, CONSTRAINT "UQ_5735e0997e1d377bcb6a752a281" UNIQUE ("platform", "chatId"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "user_channels" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "platform" character varying NOT NULL, "externalId" character varying NOT NULL, "username" character varying, "displayName" character varying, "isVerified" boolean NOT NULL DEFAULT false, "lastSeenAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_07cda9f758bd128a3ff9e284d93" UNIQUE ("platform", "externalId"), CONSTRAINT "PK_2a8ce798a5c5e04ac12aaeb9111" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "tickets" ("id" SERIAL NOT NULL, "userChatId" character varying NOT NULL, "platform" character varying NOT NULL DEFAULT 'telegram', "userId" integer, "organizationId" integer, "username" character varying, "name" character varying, "text" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "isAnswered" boolean NOT NULL DEFAULT false, "answeredBy" character varying, CONSTRAINT "PK_343bc942ae261cf7a1377f48fd0" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "ticket_messages" ("id" SERIAL NOT NULL, "ticketId" integer NOT NULL, "sender" character varying NOT NULL, "authorId" character varying, "source" character varying NOT NULL DEFAULT 'bot', "messageType" character varying NOT NULL DEFAULT 'text', "text" text, "fileId" character varying, "fileUniqueId" character varying, "fileName" character varying, "mimeType" character varying, "fileSize" integer, "externalUrl" text, "localPath" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_37beb692dedf7eccb4e519ccec1" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "service_types" ("id" SERIAL NOT NULL, "code" character varying NOT NULL, "title" character varying NOT NULL, "description" text, "flow" character varying NOT NULL DEFAULT 'simple', "isActive" boolean NOT NULL DEFAULT true, "settings" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_46911ede58bb042f55a83c9349d" UNIQUE ("code"), CONSTRAINT "PK_1dc93417a097cdee3491f39d7cc" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "service_request_events" ("id" SERIAL NOT NULL, "serviceRequestId" integer NOT NULL, "type" character varying NOT NULL, "actor" character varying, "message" text, "payload" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a8ee3b3f3b5d9171c2499212c5c" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "service_requests" ("id" SERIAL NOT NULL, "serviceTypeId" integer NOT NULL, "serviceTypeCode" character varying NOT NULL, "serviceTypeTitle" character varying NOT NULL, "userId" integer, "organizationId" integer, "platform" character varying NOT NULL DEFAULT 'web', "chatId" text NOT NULL, "status" character varying NOT NULL DEFAULT 'draft', "currentStep" integer NOT NULL DEFAULT '0', "answers" jsonb NOT NULL DEFAULT '{}', "calculatedPrice" integer, "invoiceFileId" character varying, "invoiceFileName" character varying, "visitAddress" character varying, "visitTime" TIMESTAMP, "operatorComment" text, "responsibleOperatorId" character varying, "executorName" character varying, "priority" character varying NOT NULL DEFAULT 'normal', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ee60bcd826b7e130bfbd97daf66" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."registration_requests_type_enum" AS ENUM('REGISTRATION', 'FISCAL_REPLACEMENT')`,
        );
        await queryRunner.query(
            `CREATE TABLE "registration_requests" ("id" SERIAL NOT NULL, "chatId" text NOT NULL, "platform" character varying NOT NULL DEFAULT 'telegram', "userId" integer, "organizationId" integer, "type" "public"."registration_requests_type_enum" NOT NULL DEFAULT 'REGISTRATION', "currentStep" integer NOT NULL DEFAULT '1', "orgName" character varying, "ogrn" character varying, "innKpp" character varying, "urAdress" character varying, "kktAdress" character varying, "kktName" character varying, "phone" character varying, "phoneToCall" character varying, "email" character varying, "nds" character varying DEFAULT 'Нет', "excise" character varying DEFAULT 'Нет', "markirovka" character varying DEFAULT 'Нет', "services" character varying DEFAULT 'Нет', "strictReporting" character varying DEFAULT 'Нет', "taxSystem" character varying, "kktModel" character varying, "bankReqs" text, "ofd" character varying, "equipmentPhotoPath" character varying, "equipmentPhotoName" character varying, "equipmentKitId" integer, "isFilled" boolean NOT NULL DEFAULT false, "pdfLink" character varying, "isStopped" boolean NOT NULL DEFAULT false, "isProcessed" boolean NOT NULL DEFAULT false, "status" character varying NOT NULL DEFAULT 'new', "priority" character varying NOT NULL DEFAULT 'normal', "pdfPath" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_75e49f863f30250e82ab8638eaa" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "registration_fields" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "label" character varying NOT NULL, "step" integer NOT NULL DEFAULT '1', CONSTRAINT "UQ_ea98559070cae1d48721f13b14c" UNIQUE ("name"), CONSTRAINT "PK_08c4f059af8d5bfc118cfa98ed2" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "organizations" ("id" SERIAL NOT NULL, "inn" character varying NOT NULL, "kpp" character varying, "ogrn" character varying, "name" character varying, "legalAddress" character varying, "actualAddress" character varying, "taxSystem" character varying, "isVerified" boolean NOT NULL DEFAULT false, "lastSyncedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_d1fc2be545d13df94571953b449" UNIQUE ("inn", "kpp"), CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "organization_members" ("id" SERIAL NOT NULL, "organizationId" integer NOT NULL, "userId" integer NOT NULL, "role" character varying NOT NULL DEFAULT 'owner', "status" character varying NOT NULL DEFAULT 'active', "confirmedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_7c48546e8026fb043d9ad0c2c8c" UNIQUE ("organizationId", "userId"), CONSTRAINT "PK_c2b39d5d072886a4d9c8105eb9a" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "customer_activities" ("id" SERIAL NOT NULL, "userId" integer, "organizationId" integer, "platform" character varying NOT NULL DEFAULT 'web', "chatId" text NOT NULL, "type" character varying NOT NULL, "title" character varying, "description" text, "ticketId" integer, "serviceRequestId" integer, "payload" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_359c4a3763df0f71a998ae7cdf6" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "ofd_subscriptions" ("id" SERIAL NOT NULL, "organizationId" integer NOT NULL, "cashRegisterId" integer, "provider" character varying NOT NULL, "contractNumber" character varying, "validFrom" TIMESTAMP, "validUntil" TIMESTAMP, "status" character varying NOT NULL DEFAULT 'unknown', "source" character varying NOT NULL DEFAULT 'manual', "lastCheckedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_570215286eec7d570624e730b15" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "fiscal_drives" ("id" SERIAL NOT NULL, "organizationId" integer NOT NULL, "cashRegisterId" integer NOT NULL, "serialNumber" character varying NOT NULL, "validFrom" TIMESTAMP, "validUntil" TIMESTAMP, "source" character varying NOT NULL DEFAULT 'manual', "lastCheckedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_18281f87aba5642e047e562ef2f" UNIQUE ("cashRegisterId", "serialNumber"), CONSTRAINT "PK_2730f67f9f62b783e3fcdca0cae" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "equipment_kits" ("id" SERIAL NOT NULL, "cashRegisterModel" character varying, "cashRegisterSerial" character varying, "fiscalDriveSerial" character varying, "ofdActivationCode" character varying, "marketplaceOrderId" character varying, "status" character varying NOT NULL DEFAULT 'stock', "registrationRequestId" integer, "comment" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_97462622816e328f5de07e4f03f" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "cash_registers" ("id" SERIAL NOT NULL, "organizationId" integer NOT NULL, "model" character varying, "serialNumber" character varying NOT NULL, "registrationNumber" character varying, "fnSerialNumber" character varying, "ofdName" character varying, "status" character varying NOT NULL DEFAULT 'active', "registeredAt" TIMESTAMP, "lastSyncedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_304bd9b093a7057cbe62b3255b7" UNIQUE ("organizationId", "serialNumber"), CONSTRAINT "PK_c1cc711056395d079d8f041ce34" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "admin_users" ("id" SERIAL NOT NULL, "login" character varying NOT NULL, "displayName" character varying NOT NULL, "passwordHash" character varying NOT NULL, "role" character varying NOT NULL DEFAULT 'operator', "isActive" boolean NOT NULL DEFAULT true, "telegramChatId" character varying, "maxChatId" character varying, "notifyRegistrations" boolean NOT NULL DEFAULT true, "notifyTickets" boolean NOT NULL DEFAULT true, "notifyServiceRequests" boolean NOT NULL DEFAULT true, "messengerBindCode" character varying, "messengerBindPlatform" character varying, "messengerBindCodeExpiresAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_470b3e213a5110801aa3029684c" UNIQUE ("login"), CONSTRAINT "PK_06744d221bb6145dc61e5dc441d" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "admin_sessions" ("id" SERIAL NOT NULL, "tokenHash" character varying NOT NULL, "userId" integer NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_ca4c418a9411015771ead0487bd" UNIQUE ("tokenHash"), CONSTRAINT "PK_38bb553c2372215d48de2306c5e" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `ALTER TABLE "user_channels" ADD CONSTRAINT "FK_5f84fc0335b0428fac9f618de52" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "ticket_messages" ADD CONSTRAINT "FK_b01e2a35417efbe04c10828266f" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "organization_members" ADD CONSTRAINT "FK_5652c2c6b066835b6c500d0d83f" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "organization_members" ADD CONSTRAINT "FK_e826222ad017663c6db1a45a4f1" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "admin_sessions" ADD CONSTRAINT "FK_0a8efb09a4f3200e8b81c3ebec4" FOREIGN KEY ("userId") REFERENCES "admin_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Destructive by design: only revert this baseline on disposable development/test databases.
        await queryRunner.query(
            `ALTER TABLE "admin_sessions" DROP CONSTRAINT "FK_0a8efb09a4f3200e8b81c3ebec4"`,
        );
        await queryRunner.query(
            `ALTER TABLE "organization_members" DROP CONSTRAINT "FK_e826222ad017663c6db1a45a4f1"`,
        );
        await queryRunner.query(
            `ALTER TABLE "organization_members" DROP CONSTRAINT "FK_5652c2c6b066835b6c500d0d83f"`,
        );
        await queryRunner.query(
            `ALTER TABLE "ticket_messages" DROP CONSTRAINT "FK_b01e2a35417efbe04c10828266f"`,
        );
        await queryRunner.query(
            `ALTER TABLE "user_channels" DROP CONSTRAINT "FK_5f84fc0335b0428fac9f618de52"`,
        );
        await queryRunner.query(`DROP TABLE "admin_sessions"`);
        await queryRunner.query(`DROP TABLE "admin_users"`);
        await queryRunner.query(`DROP TABLE "cash_registers"`);
        await queryRunner.query(`DROP TABLE "equipment_kits"`);
        await queryRunner.query(`DROP TABLE "fiscal_drives"`);
        await queryRunner.query(`DROP TABLE "ofd_subscriptions"`);
        await queryRunner.query(`DROP TABLE "customer_activities"`);
        await queryRunner.query(`DROP TABLE "organization_members"`);
        await queryRunner.query(`DROP TABLE "organizations"`);
        await queryRunner.query(`DROP TABLE "registration_fields"`);
        await queryRunner.query(`DROP TABLE "registration_requests"`);
        await queryRunner.query(
            `DROP TYPE "public"."registration_requests_type_enum"`,
        );
        await queryRunner.query(`DROP TABLE "service_requests"`);
        await queryRunner.query(`DROP TABLE "service_request_events"`);
        await queryRunner.query(`DROP TABLE "service_types"`);
        await queryRunner.query(`DROP TABLE "ticket_messages"`);
        await queryRunner.query(`DROP TABLE "tickets"`);
        await queryRunner.query(`DROP TABLE "user_channels"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }
}
