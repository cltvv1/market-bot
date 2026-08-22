import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialPreproductionBaseline1787388476982
    implements MigrationInterface
{
    name = 'InitialPreproductionBaseline1787388476982';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "users" ("id" SERIAL NOT NULL, "chatId" character varying NOT NULL, "platform" character varying NOT NULL DEFAULT 'telegram', "name" character varying, "username" character varying, "firstSeenAt" TIMESTAMP, "lastSeenAt" TIMESTAMP, "talkingTo" character varying, CONSTRAINT "UQ_5735e0997e1d377bcb6a752a281" UNIQUE ("platform", "chatId"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "customer_web_sessions" ("id" SERIAL NOT NULL, "tokenHash" character varying NOT NULL, "userId" integer NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "lastUsedAt" TIMESTAMP, "revokedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_7a8408099c23f5fdc907c4be44a" UNIQUE ("tokenHash"), CONSTRAINT "PK_a05278ab92f50fe9b8ee7400b11" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_customer_web_sessions_expiry_active" ON "customer_web_sessions" ("expiresAt", "revokedAt") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_customer_web_sessions_user" ON "customer_web_sessions" ("userId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "user_channels" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "platform" character varying NOT NULL, "externalId" character varying NOT NULL, "username" character varying, "displayName" character varying, "isVerified" boolean NOT NULL DEFAULT false, "lastSeenAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_07cda9f758bd128a3ff9e284d93" UNIQUE ("platform", "externalId"), CONSTRAINT "PK_2a8ce798a5c5e04ac12aaeb9111" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "tickets" ("id" SERIAL NOT NULL, "userChatId" character varying NOT NULL, "platform" character varying NOT NULL DEFAULT 'telegram', "userId" integer, "organizationId" integer, "username" character varying, "name" character varying, "text" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "isAnswered" boolean NOT NULL DEFAULT false, "answeredBy" character varying, CONSTRAINT "PK_343bc942ae261cf7a1377f48fd0" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "admin_user_roles" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "role" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_admin_user_roles_user_role" UNIQUE ("userId", "role"), CONSTRAINT "PK_f44948d8f0b35fdc444bf105b03" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_admin_user_roles_role" ON "admin_user_roles" ("role") `,
        );
        await queryRunner.query(
            `CREATE TABLE "admin_users" ("id" SERIAL NOT NULL, "login" character varying NOT NULL, "displayName" character varying NOT NULL, "passwordHash" character varying NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "telegramChatId" character varying, "maxChatId" character varying, "notifyRegistrations" boolean NOT NULL DEFAULT true, "notifyTickets" boolean NOT NULL DEFAULT true, "notifyServiceRequests" boolean NOT NULL DEFAULT true, "messengerBindCode" character varying, "messengerBindPlatform" character varying, "messengerBindCodeExpiresAt" TIMESTAMP, "lastLoginAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_470b3e213a5110801aa3029684c" UNIQUE ("login"), CONSTRAINT "PK_06744d221bb6145dc61e5dc441d" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`CREATE TABLE "stored_files" ("id" SERIAL NOT NULL, "provider" character varying NOT NULL DEFAULT 'local', "objectKey" character varying NOT NULL, "originalName" character varying NOT NULL, "mimeType" character varying NOT NULL, "sizeBytes" bigint NOT NULL, "sha256" character(64) NOT NULL, "status" character varying NOT NULL DEFAULT 'active', "createdByStaffId" integer, "createdByCustomerId" integer, "metadata" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CK_stored_files_status" CHECK ("status" IN ('active','missing','deleted','pending','rejected')), CONSTRAINT "CK_stored_files_size" CHECK ("sizeBytes" >= 0), CONSTRAINT "CK_stored_files_sha256" CHECK ("sha256" ~ '^[0-9a-f]{64}$'), CONSTRAINT "CK_stored_files_object_key_relative" CHECK (left("objectKey", 1) NOT IN ('/', chr(92))
     AND "objectKey" !~ '^[A-Za-z]:'
     AND NOT ('..' = ANY(string_to_array(replace("objectKey", chr(92), '/'), '/')))), CONSTRAINT "PK_5d5be862bf53851c1794b4adf4e" PRIMARY KEY ("id"))`);
        await queryRunner.query(
            `CREATE INDEX "IDX_stored_files_sha256" ON "stored_files" ("sha256") `,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_stored_files_provider_object_key" ON "stored_files" ("provider", "objectKey") `,
        );
        await queryRunner.query(
            `CREATE TABLE "ticket_messages" ("id" SERIAL NOT NULL, "ticketId" integer NOT NULL, "sender" character varying NOT NULL, "authorId" character varying, "source" character varying NOT NULL DEFAULT 'bot', "messageType" character varying NOT NULL DEFAULT 'text', "text" text, "storedFileId" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_37beb692dedf7eccb4e519ccec1" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_ticket_message_file" ON "ticket_messages" ("storedFileId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "service_types" ("id" SERIAL NOT NULL, "code" character varying NOT NULL, "title" character varying NOT NULL, "description" text, "flow" character varying NOT NULL DEFAULT 'simple', "isActive" boolean NOT NULL DEFAULT true, "settings" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_46911ede58bb042f55a83c9349d" UNIQUE ("code"), CONSTRAINT "PK_1dc93417a097cdee3491f39d7cc" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "cash_registers" ("id" SERIAL NOT NULL, "organizationId" integer NOT NULL, "model" character varying, "serialNumber" character varying NOT NULL, "registrationNumber" character varying, "installationAddress" character varying, "fnSerialNumber" character varying, "ofdName" character varying, "status" character varying NOT NULL DEFAULT 'active', "registeredAt" TIMESTAMP, "lastSyncedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_304bd9b093a7057cbe62b3255b7" UNIQUE ("organizationId", "serialNumber"), CONSTRAINT "PK_c1cc711056395d079d8f041ce34" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "service_form_definitions" ("id" SERIAL NOT NULL, "serviceTypeId" integer NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "supportedChannels" jsonb NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_e928e5800c0a659571f74526a17" UNIQUE ("serviceTypeId"), CONSTRAINT "REL_e928e5800c0a659571f74526a1" UNIQUE ("serviceTypeId"), CONSTRAINT "PK_0ae9222089a16f039a5395019c3" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "service_form_versions" ("id" SERIAL NOT NULL, "definitionId" integer NOT NULL, "version" integer NOT NULL, "status" character varying NOT NULL DEFAULT 'draft', "schema" jsonb NOT NULL, "handlerKey" character varying, "publishedAt" TIMESTAMP, "createdByStaffId" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_service_form_version" UNIQUE ("definitionId", "version"), CONSTRAINT "CK_service_form_version_status" CHECK ("status" IN ('draft','published','retired')), CONSTRAINT "PK_284838fc5648d5cf43f5ad6aa41" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_service_form_published" ON "service_form_versions" ("definitionId") WHERE "status" = 'published'`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_service_form_versions_definition_status" ON "service_form_versions" ("definitionId", "status") `,
        );
        await queryRunner.query(
            `CREATE TABLE "service_requests" ("id" SERIAL NOT NULL, "requestNumber" character varying NOT NULL, "serviceTypeId" integer NOT NULL, "serviceTypeCode" character varying NOT NULL, "serviceTypeTitle" character varying NOT NULL, "formVersionId" integer NOT NULL, "userId" integer, "organizationId" integer, "cashRegisterId" integer, "platform" character varying NOT NULL DEFAULT 'web', "source" character varying NOT NULL, "chatId" text NOT NULL, "status" character varying NOT NULL DEFAULT 'draft', "customerStatus" character varying NOT NULL DEFAULT 'received', "currentStep" integer NOT NULL DEFAULT '0', "answers" jsonb NOT NULL DEFAULT '{}', "contactSnapshot" jsonb, "organizationSnapshot" jsonb, "locationSnapshot" jsonb, "equipmentSnapshot" jsonb, "calculatedPrice" integer, "invoiceStoredFileId" integer, "paymentProofFileId" integer, "generatedConsentFileId" integer, "signedConsentFileId" integer, "visitAddress" character varying, "visitTime" TIMESTAMP, "operatorComment" text, "responsibleOperatorStaffId" integer, "assignedEngineerId" integer, "priority" character varying NOT NULL DEFAULT 'normal', "publicTokenHash" character varying, "submitIdempotencyKey" character varying, "submittedAt" TIMESTAMP, "completedAt" TIMESTAMP, "closedAt" TIMESTAMP, "cancelledAt" TIMESTAMP, "version" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_7c1208ab46c2a7733ee474ede8f" UNIQUE ("requestNumber"), CONSTRAINT "UQ_e29a70560459bcd8d66b546c098" UNIQUE ("publicTokenHash"), CONSTRAINT "PK_ee60bcd826b7e130bfbd97daf66" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_service_requests_submit_idempotency" ON "service_requests" ("userId", "submitIdempotencyKey") WHERE "submitIdempotencyKey" IS NOT NULL`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_service_requests_responsible_staff" ON "service_requests" ("responsibleOperatorStaffId") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_service_requests_cash_register" ON "service_requests" ("cashRegisterId") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_service_requests_form_version" ON "service_requests" ("formVersionId") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_service_payment_proof_file" ON "service_requests" ("paymentProofFileId") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_service_invoice_file" ON "service_requests" ("invoiceStoredFileId") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_service_requests_assigned_engineer" ON "service_requests" ("assignedEngineerId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "service_request_messages" ("id" SERIAL NOT NULL, "serviceRequestId" integer NOT NULL, "authorType" character varying NOT NULL, "authorCustomerId" integer, "authorStaffId" integer, "visibility" character varying NOT NULL DEFAULT 'customer', "text" text, "storedFileId" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CK_service_request_message_content" CHECK ("text" IS NOT NULL OR "storedFileId" IS NOT NULL), CONSTRAINT "CK_service_request_message_visibility" CHECK ("visibility" IN ('customer','internal')), CONSTRAINT "CK_service_request_message_author" CHECK ("authorType" IN ('customer','staff','system')), CONSTRAINT "PK_d32b54bb9413cf0da255726430a" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_service_request_messages_request" ON "service_request_messages" ("serviceRequestId", "createdAt") `,
        );
        await queryRunner.query(
            `CREATE TABLE "service_request_events" ("id" SERIAL NOT NULL, "serviceRequestId" integer NOT NULL, "type" character varying NOT NULL, "actor" character varying, "message" text, "payload" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a8ee3b3f3b5d9171c2499212c5c" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "service_request_attachments" ("id" SERIAL NOT NULL, "serviceRequestId" integer NOT NULL, "storedFileId" integer NOT NULL, "kind" character varying NOT NULL DEFAULT 'customer', "customerVisible" boolean NOT NULL DEFAULT true, "uploadedByCustomerId" integer, "uploadedByStaffId" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CK_service_request_attachment_kind" CHECK ("kind" IN ('customer','invoice','payment_proof','generated_consent','signed_consent','message')), CONSTRAINT "PK_b6afc95954a76dcec657bcd32ac" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_service_request_attachment_role" ON "service_request_attachments" ("serviceRequestId", "storedFileId", "kind") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_service_request_attachments_request" ON "service_request_attachments" ("serviceRequestId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "registration_requests" ("id" SERIAL NOT NULL, "chatId" text NOT NULL, "platform" character varying NOT NULL DEFAULT 'telegram', "userId" integer, "organizationId" integer, "currentStep" integer NOT NULL DEFAULT '1', "orgName" character varying, "ogrn" character varying, "innKpp" character varying, "urAdress" character varying, "kktAdress" character varying, "kktName" character varying, "phone" character varying, "phoneToCall" character varying, "email" character varying, "nds" character varying DEFAULT 'Нет', "excise" character varying DEFAULT 'Нет', "markirovka" character varying DEFAULT 'Нет', "services" character varying DEFAULT 'Нет', "strictReporting" character varying DEFAULT 'Нет', "taxSystem" character varying, "kktModel" character varying, "bankReqs" text, "ofd" character varying, "equipmentKitId" integer, "ofdProvisionMode" character varying NOT NULL DEFAULT 'clarification_required', "readiness" character varying NOT NULL DEFAULT 'incomplete', "readinessUpdatedAt" TIMESTAMP, "assignedEngineerId" integer, "handedOffAt" TIMESTAMP, "status" character varying NOT NULL DEFAULT 'draft', "priority" character varying NOT NULL DEFAULT 'normal', "pdfFileId" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_75e49f863f30250e82ab8638eaa" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_registration_pdf_file" ON "registration_requests" ("pdfFileId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "registration_requirements" ("id" SERIAL NOT NULL, "registrationId" integer NOT NULL, "kind" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'missing', "value" text, "source" character varying, "requestedAt" TIMESTAMP, "providedAt" TIMESTAMP, "verifiedAt" TIMESTAMP, "verifiedByStaffId" integer, "notRequiredReason" text, "operatorComment" text, "metadata" jsonb, "version" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_registration_requirement_kind" UNIQUE ("registrationId", "kind"), CONSTRAINT "CK_registration_requirement_source" CHECK ("source" IS NULL OR "source" IN ('internal_registry','customer_input','customer_photo','sold_by_vitma','operator_input','external_system')), CONSTRAINT "CK_registration_requirement_status" CHECK ("status" IN ('missing','requested','provided','verified','not_required')), CONSTRAINT "CK_registration_requirement_kind" CHECK ("kind" IN ('kkt_serial','fiscal_drive_serial','ofd_code')), CONSTRAINT "PK_621275b99708a6ea09194007cfc" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_registration_requirements_status" ON "registration_requirements" ("status") `,
        );
        await queryRunner.query(
            `CREATE TABLE "registration_fields" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "label" character varying NOT NULL, "step" integer NOT NULL DEFAULT '1', CONSTRAINT "UQ_ea98559070cae1d48721f13b14c" UNIQUE ("name"), CONSTRAINT "PK_08c4f059af8d5bfc118cfa98ed2" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "registration_evidence" ("id" SERIAL NOT NULL, "registrationId" integer NOT NULL, "requirementId" integer, "storedFileId" integer NOT NULL, "kind" character varying NOT NULL, "visibility" character varying NOT NULL DEFAULT 'staff', "uploadedByActorType" character varying NOT NULL, "uploadedByActorId" integer, "comment" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "removedAt" TIMESTAMP, CONSTRAINT "UQ_registration_evidence_link" UNIQUE ("requirementId", "storedFileId"), CONSTRAINT "CK_registration_evidence_actor" CHECK ("uploadedByActorType" IN ('customer','staff','system')), CONSTRAINT "CK_registration_evidence_visibility" CHECK ("visibility" IN ('customer','staff','engineer')), CONSTRAINT "CK_registration_evidence_kind" CHECK ("kind" IN ('customer_photo','customer_document','internal_registry')), CONSTRAINT "PK_2e7a91cae36e98b6f458c053b2a" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_registration_evidence_registration" ON "registration_evidence" ("registrationId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "registration_data_requests" ("id" SERIAL NOT NULL, "registrationId" integer NOT NULL, "requirementId" integer NOT NULL, "requestedByStaffId" integer NOT NULL, "requestText" text NOT NULL, "targetChannel" character varying NOT NULL, "responseToken" uuid NOT NULL, "status" character varying NOT NULL DEFAULT 'open', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "deliveredAt" TIMESTAMP, "deliveryError" text, "activatedAt" TIMESTAMP, "answeredAt" TIMESTAMP, "closedAt" TIMESTAMP, CONSTRAINT "CK_registration_data_request_status" CHECK ("status" IN ('open','delivered','delivery_failed','answered','closed')), CONSTRAINT "PK_f9c570ccfb71f1d1c3832e00ef0" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_registration_data_request_token" ON "registration_data_requests" ("responseToken") `,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_registration_data_request_open" ON "registration_data_requests" ("requirementId") WHERE "closedAt" IS NULL`,
        );
        await queryRunner.query(
            `CREATE TABLE "organizations" ("id" SERIAL NOT NULL, "inn" character varying NOT NULL, "kpp" character varying, "ogrn" character varying, "name" character varying, "legalAddress" character varying, "actualAddress" character varying, "taxSystem" character varying, "isVerified" boolean NOT NULL DEFAULT false, "lastSyncedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_d1fc2be545d13df94571953b449" UNIQUE ("inn", "kpp"), CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "organization_members" ("id" SERIAL NOT NULL, "organizationId" integer NOT NULL, "userId" integer NOT NULL, "role" character varying NOT NULL DEFAULT 'owner', "status" character varying NOT NULL DEFAULT 'active', "confirmedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_7c48546e8026fb043d9ad0c2c8c" UNIQUE ("organizationId", "userId"), CONSTRAINT "PK_c2b39d5d072886a4d9c8105eb9a" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "organization_access_requests" ("id" SERIAL NOT NULL, "organizationId" integer NOT NULL, "userId" integer NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "requestedRole" character varying NOT NULL DEFAULT 'representative', "submittedName" character varying, "submittedPhone" character varying, "submittedEmail" character varying, "comment" character varying, "reviewedByStaffId" integer, "reviewComment" character varying, "reviewedAt" TIMESTAMP, "cancelledAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CK_org_access_request_role" CHECK ("requestedRole" = 'representative'), CONSTRAINT "CK_org_access_request_status" CHECK ("status" IN ('pending','approved','rejected','cancelled')), CONSTRAINT "PK_b5376fb799e3b920db47223d4c6" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_org_access_request_pending" ON "organization_access_requests" ("organizationId", "userId") WHERE "status" = 'pending'`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_org_access_request_status_created" ON "organization_access_requests" ("status", "createdAt") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_org_access_request_user_created" ON "organization_access_requests" ("userId", "createdAt") `,
        );
        await queryRunner.query(
            `CREATE TABLE "service_opportunities" ("id" SERIAL NOT NULL, "identityKey" character varying NOT NULL, "organizationId" integer, "cashRegisterId" integer, "type" character varying NOT NULL, "title" character varying NOT NULL, "description" text, "priority" character varying NOT NULL DEFAULT 'normal', "status" character varying NOT NULL DEFAULT 'new', "assignedAdminId" integer, "serviceRequestId" integer, "firstSeenAt" TIMESTAMP NOT NULL, "lastSeenAt" TIMESTAMP NOT NULL, "callbackAt" TIMESTAMP, "resolvedAt" TIMESTAMP, "operatorComment" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_service_opportunity_identity" UNIQUE ("identityKey"), CONSTRAINT "CK_service_opportunities_status" CHECK ("status" IN ('new','in_progress','contact_later','converted','resolved','not_relevant')), CONSTRAINT "CK_service_opportunities_priority" CHECK ("priority" IN ('low','normal','high','urgent')), CONSTRAINT "PK_3daf58ffcdc6889b3d43444175f" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_service_opportunities_status_seen" ON "service_opportunities" ("status", "lastSeenAt") `,
        );
        await queryRunner.query(
            `CREATE TABLE "organization_contacts" ("id" SERIAL NOT NULL, "organizationId" integer NOT NULL, "kind" character varying NOT NULL, "rawValue" character varying NOT NULL, "normalizedValue" character varying, "source" character varying NOT NULL, "externalId" character varying, "quality" character varying, "isActive" boolean NOT NULL DEFAULT true, "lastSeenAt" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CK_organization_contacts_source" CHECK ("source" IN ('atol_connect','platforma_ofd')), CONSTRAINT "CK_organization_contacts_kind" CHECK ("kind" IN ('phone','email')), CONSTRAINT "PK_3728fac56883cb199cd707037a0" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_organization_contacts_external" ON "organization_contacts" ("source", "externalId") WHERE "externalId" IS NOT NULL`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_organization_contacts_normalized" ON "organization_contacts" ("kind", "normalizedValue") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_organization_contacts_organization" ON "organization_contacts" ("organizationId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "integration_runs" ("id" BIGSERIAL NOT NULL, "provider" character varying NOT NULL, "kind" character varying NOT NULL, "mode" character varying NOT NULL DEFAULT 'shadow', "status" character varying NOT NULL DEFAULT 'running', "receivedCount" integer NOT NULL DEFAULT '0', "appliedCount" integer NOT NULL DEFAULT '0', "skippedCount" integer NOT NULL DEFAULT '0', "errorCount" integer NOT NULL DEFAULT '0', "checkpoint" jsonb, "errorSummary" text, "startedAt" TIMESTAMP NOT NULL DEFAULT now(), "finishedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CK_integration_runs_status" CHECK ("status" IN ('running','succeeded','partial','failed')), CONSTRAINT "CK_integration_runs_mode" CHECK ("mode" IN ('shadow','apply')), CONSTRAINT "CK_integration_runs_provider" CHECK ("provider" IN ('atol_connect','platforma_ofd')), CONSTRAINT "PK_b16026f9c5697bbf99fdb02ace8" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_integration_runs_provider_created" ON "integration_runs" ("provider", "createdAt") `,
        );
        await queryRunner.query(
            `CREATE TABLE "external_observations" ("id" BIGSERIAL NOT NULL, "provider" character varying NOT NULL, "externalKey" character varying NOT NULL, "integrationRunId" bigint, "organizationId" integer, "cashRegisterId" integer, "kind" character varying NOT NULL, "severity" character varying NOT NULL DEFAULT 'normal', "title" character varying NOT NULL, "description" text, "status" character varying NOT NULL DEFAULT 'active', "fingerprint" character varying NOT NULL, "metadata" jsonb, "occurredAt" TIMESTAMP NOT NULL, "lastSeenAt" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_external_observation_provider_key" UNIQUE ("provider", "externalKey"), CONSTRAINT "CK_external_observations_status" CHECK ("status" IN ('active','resolved')), CONSTRAINT "CK_external_observations_severity" CHECK ("severity" IN ('info','low','normal','high','urgent')), CONSTRAINT "CK_external_observations_provider" CHECK ("provider" IN ('atol_connect','platforma_ofd')), CONSTRAINT "PK_7726713042e98cb214ca2b2a16e" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_external_observations_status_seen" ON "external_observations" ("status", "lastSeenAt") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_external_observations_subject" ON "external_observations" ("organizationId", "cashRegisterId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "opportunity_observations" ("opportunityId" integer NOT NULL, "observationId" bigint NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_16e352419a0c58e778be38d27a7" PRIMARY KEY ("opportunityId", "observationId"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "integration_exclusions" ("id" SERIAL NOT NULL, "inn" character varying NOT NULL, "provider" character varying, "observationType" character varying, "reason" text, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CK_integration_exclusions_provider" CHECK ("provider" IS NULL OR "provider" IN ('atol_connect','platforma_ofd')), CONSTRAINT "PK_5cd28fc3763f792176b0982a806" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_integration_exclusions_match" ON "integration_exclusions" ("inn", "provider", "observationType", "isActive") `,
        );
        await queryRunner.query(
            `CREATE TABLE "integration_errors" ("id" BIGSERIAL NOT NULL, "integrationRunId" bigint NOT NULL, "provider" character varying NOT NULL, "entityType" character varying, "externalId" character varying, "code" character varying NOT NULL, "message" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CK_integration_errors_provider" CHECK ("provider" IN ('atol_connect','platforma_ofd')), CONSTRAINT "PK_596d6884070c8197d8dbc91f3cb" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_integration_errors_run" ON "integration_errors" ("integrationRunId", "createdAt") `,
        );
        await queryRunner.query(
            `CREATE TABLE "external_mappings" ("id" BIGSERIAL NOT NULL, "provider" character varying NOT NULL, "entityType" character varying NOT NULL, "externalId" character varying NOT NULL, "localId" integer NOT NULL, "externalRevision" character varying, "metadata" jsonb, "lastSeenAt" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_external_mapping_provider_entity_id" UNIQUE ("provider", "entityType", "externalId"), CONSTRAINT "CK_external_mappings_provider" CHECK ("provider" IN ('atol_connect','platforma_ofd')), CONSTRAINT "PK_8bb2ec0ef3c298ed51b44a226be" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_external_mapping_local" ON "external_mappings" ("entityType", "localId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "customer_activities" ("id" SERIAL NOT NULL, "userId" integer, "organizationId" integer, "platform" character varying NOT NULL DEFAULT 'web', "chatId" text NOT NULL, "type" character varying NOT NULL, "title" character varying, "description" text, "ticketId" integer, "serviceRequestId" integer, "payload" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_359c4a3763df0f71a998ae7cdf6" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "admin_sessions" ("id" SERIAL NOT NULL, "tokenHash" character varying NOT NULL, "userId" integer NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "lastUsedAt" TIMESTAMP, "revokedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_ca4c418a9411015771ead0487bd" UNIQUE ("tokenHash"), CONSTRAINT "PK_38bb553c2372215d48de2306c5e" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_admin_sessions_expiry_active" ON "admin_sessions" ("expiresAt", "revokedAt") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_admin_sessions_user" ON "admin_sessions" ("userId") `,
        );
        await queryRunner.query(
            `CREATE TABLE "audit_events" ("id" BIGSERIAL NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "actorType" character varying NOT NULL, "actorStaffId" integer, "actorCustomerId" integer, "actorSessionId" integer, "action" character varying NOT NULL, "targetType" character varying NOT NULL, "targetId" character varying, "result" character varying NOT NULL, "reason" character varying, "requestId" uuid, "metadata" jsonb, CONSTRAINT "CK_audit_events_result" CHECK ("result" IN ('success','denied','failure')), CONSTRAINT "CK_audit_events_actor_type" CHECK ("actorType" IN ('staff','customer','system')), CONSTRAINT "PK_910f64d901a5c3e9878f0d4a407" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_audit_events_target" ON "audit_events" ("targetType", "targetId") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_audit_events_action" ON "audit_events" ("action") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_audit_events_actor_staff" ON "audit_events" ("actorStaffId") `,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_audit_events_created_at" ON "audit_events" ("createdAt") `,
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
            `ALTER TABLE "customer_web_sessions" ADD CONSTRAINT "FK_customer_web_sessions_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "user_channels" ADD CONSTRAINT "FK_5f84fc0335b0428fac9f618de52" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "admin_user_roles" ADD CONSTRAINT "FK_admin_user_roles_user" FOREIGN KEY ("userId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "stored_files" ADD CONSTRAINT "FK_stored_files_staff" FOREIGN KEY ("createdByStaffId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "stored_files" ADD CONSTRAINT "FK_stored_files_customer" FOREIGN KEY ("createdByCustomerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "ticket_messages" ADD CONSTRAINT "FK_b01e2a35417efbe04c10828266f" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "ticket_messages" ADD CONSTRAINT "FK_ticket_message_file" FOREIGN KEY ("storedFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_form_definitions" ADD CONSTRAINT "FK_service_form_definition_type" FOREIGN KEY ("serviceTypeId") REFERENCES "service_types"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_form_versions" ADD CONSTRAINT "FK_service_form_version_definition" FOREIGN KEY ("definitionId") REFERENCES "service_form_definitions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_form_versions" ADD CONSTRAINT "FK_service_form_version_creator" FOREIGN KEY ("createdByStaffId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD CONSTRAINT "FK_service_requests_form_version" FOREIGN KEY ("formVersionId") REFERENCES "service_form_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD CONSTRAINT "FK_service_requests_cash_register" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD CONSTRAINT "FK_service_invoice_file" FOREIGN KEY ("invoiceStoredFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD CONSTRAINT "FK_service_payment_proof_file" FOREIGN KEY ("paymentProofFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD CONSTRAINT "FK_service_generated_consent_file" FOREIGN KEY ("generatedConsentFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD CONSTRAINT "FK_service_signed_consent_file" FOREIGN KEY ("signedConsentFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD CONSTRAINT "FK_service_requests_responsible_staff" FOREIGN KEY ("responsibleOperatorStaffId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" ADD CONSTRAINT "FK_service_requests_assigned_engineer" FOREIGN KEY ("assignedEngineerId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_request_messages" ADD CONSTRAINT "FK_service_request_message_request" FOREIGN KEY ("serviceRequestId") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_request_messages" ADD CONSTRAINT "FK_service_request_message_file" FOREIGN KEY ("storedFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_request_attachments" ADD CONSTRAINT "FK_service_request_attachment_request" FOREIGN KEY ("serviceRequestId") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_request_attachments" ADD CONSTRAINT "FK_service_request_attachment_file" FOREIGN KEY ("storedFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requests" ADD CONSTRAINT "FK_registration_assigned_engineer" FOREIGN KEY ("assignedEngineerId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requests" ADD CONSTRAINT "FK_registration_pdf_file" FOREIGN KEY ("pdfFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requirements" ADD CONSTRAINT "FK_registration_requirement_registration" FOREIGN KEY ("registrationId") REFERENCES "registration_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requirements" ADD CONSTRAINT "FK_registration_requirement_verifier" FOREIGN KEY ("verifiedByStaffId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_evidence" ADD CONSTRAINT "FK_registration_evidence_registration" FOREIGN KEY ("registrationId") REFERENCES "registration_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_evidence" ADD CONSTRAINT "FK_registration_evidence_requirement" FOREIGN KEY ("requirementId") REFERENCES "registration_requirements"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_evidence" ADD CONSTRAINT "FK_registration_evidence_file" FOREIGN KEY ("storedFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_data_requests" ADD CONSTRAINT "FK_registration_data_request_registration" FOREIGN KEY ("registrationId") REFERENCES "registration_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_data_requests" ADD CONSTRAINT "FK_registration_data_request_requirement" FOREIGN KEY ("requirementId") REFERENCES "registration_requirements"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_data_requests" ADD CONSTRAINT "FK_registration_data_request_staff" FOREIGN KEY ("requestedByStaffId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "organization_members" ADD CONSTRAINT "FK_5652c2c6b066835b6c500d0d83f" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "organization_members" ADD CONSTRAINT "FK_e826222ad017663c6db1a45a4f1" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "organization_access_requests" ADD CONSTRAINT "FK_org_access_request_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "organization_access_requests" ADD CONSTRAINT "FK_org_access_request_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "organization_access_requests" ADD CONSTRAINT "FK_org_access_request_reviewer" FOREIGN KEY ("reviewedByStaffId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_opportunities" ADD CONSTRAINT "FK_service_opportunity_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_opportunities" ADD CONSTRAINT "FK_service_opportunity_cash_register" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_opportunities" ADD CONSTRAINT "FK_service_opportunity_admin" FOREIGN KEY ("assignedAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_opportunities" ADD CONSTRAINT "FK_service_opportunity_request" FOREIGN KEY ("serviceRequestId") REFERENCES "service_requests"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "organization_contacts" ADD CONSTRAINT "FK_organization_contacts_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "external_observations" ADD CONSTRAINT "FK_external_observation_run" FOREIGN KEY ("integrationRunId") REFERENCES "integration_runs"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "external_observations" ADD CONSTRAINT "FK_external_observation_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "external_observations" ADD CONSTRAINT "FK_external_observation_cash_register" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "opportunity_observations" ADD CONSTRAINT "FK_opportunity_observations_opportunity" FOREIGN KEY ("opportunityId") REFERENCES "service_opportunities"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "opportunity_observations" ADD CONSTRAINT "FK_opportunity_observations_observation" FOREIGN KEY ("observationId") REFERENCES "external_observations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "integration_errors" ADD CONSTRAINT "FK_integration_error_run" FOREIGN KEY ("integrationRunId") REFERENCES "integration_runs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "admin_sessions" ADD CONSTRAINT "FK_0a8efb09a4f3200e8b81c3ebec4" FOREIGN KEY ("userId") REFERENCES "admin_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "audit_events" ADD CONSTRAINT "FK_audit_staff" FOREIGN KEY ("actorStaffId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "audit_events" ADD CONSTRAINT "FK_audit_customer" FOREIGN KEY ("actorCustomerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "audit_events" ADD CONSTRAINT "FK_audit_session" FOREIGN KEY ("actorSessionId") REFERENCES "admin_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "audit_events" DROP CONSTRAINT "FK_audit_session"`,
        );
        await queryRunner.query(
            `ALTER TABLE "audit_events" DROP CONSTRAINT "FK_audit_customer"`,
        );
        await queryRunner.query(
            `ALTER TABLE "audit_events" DROP CONSTRAINT "FK_audit_staff"`,
        );
        await queryRunner.query(
            `ALTER TABLE "admin_sessions" DROP CONSTRAINT "FK_0a8efb09a4f3200e8b81c3ebec4"`,
        );
        await queryRunner.query(
            `ALTER TABLE "integration_errors" DROP CONSTRAINT "FK_integration_error_run"`,
        );
        await queryRunner.query(
            `ALTER TABLE "opportunity_observations" DROP CONSTRAINT "FK_opportunity_observations_observation"`,
        );
        await queryRunner.query(
            `ALTER TABLE "opportunity_observations" DROP CONSTRAINT "FK_opportunity_observations_opportunity"`,
        );
        await queryRunner.query(
            `ALTER TABLE "external_observations" DROP CONSTRAINT "FK_external_observation_cash_register"`,
        );
        await queryRunner.query(
            `ALTER TABLE "external_observations" DROP CONSTRAINT "FK_external_observation_organization"`,
        );
        await queryRunner.query(
            `ALTER TABLE "external_observations" DROP CONSTRAINT "FK_external_observation_run"`,
        );
        await queryRunner.query(
            `ALTER TABLE "organization_contacts" DROP CONSTRAINT "FK_organization_contacts_organization"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_opportunities" DROP CONSTRAINT "FK_service_opportunity_request"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_opportunities" DROP CONSTRAINT "FK_service_opportunity_admin"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_opportunities" DROP CONSTRAINT "FK_service_opportunity_cash_register"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_opportunities" DROP CONSTRAINT "FK_service_opportunity_organization"`,
        );
        await queryRunner.query(
            `ALTER TABLE "organization_access_requests" DROP CONSTRAINT "FK_org_access_request_reviewer"`,
        );
        await queryRunner.query(
            `ALTER TABLE "organization_access_requests" DROP CONSTRAINT "FK_org_access_request_user"`,
        );
        await queryRunner.query(
            `ALTER TABLE "organization_access_requests" DROP CONSTRAINT "FK_org_access_request_organization"`,
        );
        await queryRunner.query(
            `ALTER TABLE "organization_members" DROP CONSTRAINT "FK_e826222ad017663c6db1a45a4f1"`,
        );
        await queryRunner.query(
            `ALTER TABLE "organization_members" DROP CONSTRAINT "FK_5652c2c6b066835b6c500d0d83f"`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_data_requests" DROP CONSTRAINT "FK_registration_data_request_staff"`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_data_requests" DROP CONSTRAINT "FK_registration_data_request_requirement"`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_data_requests" DROP CONSTRAINT "FK_registration_data_request_registration"`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_evidence" DROP CONSTRAINT "FK_registration_evidence_file"`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_evidence" DROP CONSTRAINT "FK_registration_evidence_requirement"`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_evidence" DROP CONSTRAINT "FK_registration_evidence_registration"`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requirements" DROP CONSTRAINT "FK_registration_requirement_verifier"`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requirements" DROP CONSTRAINT "FK_registration_requirement_registration"`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requests" DROP CONSTRAINT "FK_registration_pdf_file"`,
        );
        await queryRunner.query(
            `ALTER TABLE "registration_requests" DROP CONSTRAINT "FK_registration_assigned_engineer"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_request_attachments" DROP CONSTRAINT "FK_service_request_attachment_file"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_request_attachments" DROP CONSTRAINT "FK_service_request_attachment_request"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_request_messages" DROP CONSTRAINT "FK_service_request_message_file"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_request_messages" DROP CONSTRAINT "FK_service_request_message_request"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" DROP CONSTRAINT "FK_service_requests_assigned_engineer"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" DROP CONSTRAINT "FK_service_requests_responsible_staff"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" DROP CONSTRAINT "FK_service_signed_consent_file"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" DROP CONSTRAINT "FK_service_generated_consent_file"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" DROP CONSTRAINT "FK_service_payment_proof_file"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" DROP CONSTRAINT "FK_service_invoice_file"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" DROP CONSTRAINT "FK_service_requests_cash_register"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_requests" DROP CONSTRAINT "FK_service_requests_form_version"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_form_versions" DROP CONSTRAINT "FK_service_form_version_creator"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_form_versions" DROP CONSTRAINT "FK_service_form_version_definition"`,
        );
        await queryRunner.query(
            `ALTER TABLE "service_form_definitions" DROP CONSTRAINT "FK_service_form_definition_type"`,
        );
        await queryRunner.query(
            `ALTER TABLE "ticket_messages" DROP CONSTRAINT "FK_ticket_message_file"`,
        );
        await queryRunner.query(
            `ALTER TABLE "ticket_messages" DROP CONSTRAINT "FK_b01e2a35417efbe04c10828266f"`,
        );
        await queryRunner.query(
            `ALTER TABLE "stored_files" DROP CONSTRAINT "FK_stored_files_customer"`,
        );
        await queryRunner.query(
            `ALTER TABLE "stored_files" DROP CONSTRAINT "FK_stored_files_staff"`,
        );
        await queryRunner.query(
            `ALTER TABLE "admin_user_roles" DROP CONSTRAINT "FK_admin_user_roles_user"`,
        );
        await queryRunner.query(
            `ALTER TABLE "user_channels" DROP CONSTRAINT "FK_5f84fc0335b0428fac9f618de52"`,
        );
        await queryRunner.query(
            `ALTER TABLE "customer_web_sessions" DROP CONSTRAINT "FK_customer_web_sessions_user"`,
        );
        await queryRunner.query(`DROP TABLE "equipment_kits"`);
        await queryRunner.query(`DROP TABLE "fiscal_drives"`);
        await queryRunner.query(`DROP TABLE "ofd_subscriptions"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_audit_events_created_at"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_audit_events_actor_staff"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_audit_events_action"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_audit_events_target"`,
        );
        await queryRunner.query(`DROP TABLE "audit_events"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_admin_sessions_user"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_admin_sessions_expiry_active"`,
        );
        await queryRunner.query(`DROP TABLE "admin_sessions"`);
        await queryRunner.query(`DROP TABLE "customer_activities"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_external_mapping_local"`,
        );
        await queryRunner.query(`DROP TABLE "external_mappings"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_integration_errors_run"`,
        );
        await queryRunner.query(`DROP TABLE "integration_errors"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_integration_exclusions_match"`,
        );
        await queryRunner.query(`DROP TABLE "integration_exclusions"`);
        await queryRunner.query(`DROP TABLE "opportunity_observations"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_external_observations_subject"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_external_observations_status_seen"`,
        );
        await queryRunner.query(`DROP TABLE "external_observations"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_integration_runs_provider_created"`,
        );
        await queryRunner.query(`DROP TABLE "integration_runs"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_organization_contacts_organization"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_organization_contacts_normalized"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."UQ_organization_contacts_external"`,
        );
        await queryRunner.query(`DROP TABLE "organization_contacts"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_service_opportunities_status_seen"`,
        );
        await queryRunner.query(`DROP TABLE "service_opportunities"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_org_access_request_user_created"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_org_access_request_status_created"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."UQ_org_access_request_pending"`,
        );
        await queryRunner.query(`DROP TABLE "organization_access_requests"`);
        await queryRunner.query(`DROP TABLE "organization_members"`);
        await queryRunner.query(`DROP TABLE "organizations"`);
        await queryRunner.query(
            `DROP INDEX "public"."UQ_registration_data_request_open"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."UQ_registration_data_request_token"`,
        );
        await queryRunner.query(`DROP TABLE "registration_data_requests"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_registration_evidence_registration"`,
        );
        await queryRunner.query(`DROP TABLE "registration_evidence"`);
        await queryRunner.query(`DROP TABLE "registration_fields"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_registration_requirements_status"`,
        );
        await queryRunner.query(`DROP TABLE "registration_requirements"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_registration_pdf_file"`,
        );
        await queryRunner.query(`DROP TABLE "registration_requests"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_service_request_attachments_request"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."UQ_service_request_attachment_role"`,
        );
        await queryRunner.query(`DROP TABLE "service_request_attachments"`);
        await queryRunner.query(`DROP TABLE "service_request_events"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_service_request_messages_request"`,
        );
        await queryRunner.query(`DROP TABLE "service_request_messages"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_service_requests_assigned_engineer"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_service_invoice_file"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_service_payment_proof_file"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_service_requests_form_version"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_service_requests_cash_register"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_service_requests_responsible_staff"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_service_requests_submit_idempotency"`,
        );
        await queryRunner.query(`DROP TABLE "service_requests"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_service_form_versions_definition_status"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."UQ_service_form_published"`,
        );
        await queryRunner.query(`DROP TABLE "service_form_versions"`);
        await queryRunner.query(`DROP TABLE "service_form_definitions"`);
        await queryRunner.query(`DROP TABLE "cash_registers"`);
        await queryRunner.query(`DROP TABLE "service_types"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_ticket_message_file"`,
        );
        await queryRunner.query(`DROP TABLE "ticket_messages"`);
        await queryRunner.query(
            `DROP INDEX "public"."UQ_stored_files_provider_object_key"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_stored_files_sha256"`,
        );
        await queryRunner.query(`DROP TABLE "stored_files"`);
        await queryRunner.query(`DROP TABLE "admin_users"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_admin_user_roles_role"`,
        );
        await queryRunner.query(`DROP TABLE "admin_user_roles"`);
        await queryRunner.query(`DROP TABLE "tickets"`);
        await queryRunner.query(`DROP TABLE "user_channels"`);
        await queryRunner.query(
            `DROP INDEX "public"."IDX_customer_web_sessions_user"`,
        );
        await queryRunner.query(
            `DROP INDEX "public"."IDX_customer_web_sessions_expiry_active"`,
        );
        await queryRunner.query(`DROP TABLE "customer_web_sessions"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }
}
