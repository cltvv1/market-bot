import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { FilesService } from 'src/files/files.service';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import { RegistrationRequestEntity } from './entities/registration.entity';
import { RegistrationFieldEntity } from './entities/registration-field.entity';
import { RegistrationRequirementEntity } from './entities/registration-requirement.entity';
import { RegistrationEvidenceEntity } from './entities/registration-evidence.entity';
import { RegistrationDataRequestEntity } from './entities/registration-data-request.entity';
import {
    assertRegistrationOwner,
    CLIENT_REGISTRATION_FIELDS,
    clientRegistrationForm,
    registrationChecklistAvailable,
} from './registration-client-policy';

@Injectable()
export class RegistrationClientReadService {
    constructor(
        private readonly db: DataSource,
        private readonly files: FilesService,
    ) {}

    async owner(
        manager: EntityManager,
        session: WebSessionPrincipal,
        id: number,
        lock = false,
    ) {
        const row = await manager.findOne(RegistrationRequestEntity, {
            where: { id },
            ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
        });
        assertRegistrationOwner(row, session);
        return row;
    }

    list(session: WebSessionPrincipal) {
        return this.db.transaction('REPEATABLE READ', async (manager) => {
            const rows = await manager
                .getRepository(RegistrationRequestEntity)
                .createQueryBuilder('registration')
                .where('registration.platform = :platform', { platform: 'web' })
                .andWhere(
                    '(registration.userId = :userId OR (registration.userId IS NULL AND registration.chatId = :chatId))',
                    session,
                )
                .orderBy('registration.createdAt', 'DESC')
                .addOrderBy('registration.id', 'DESC')
                .take(50)
                .getMany();
            return {
                items: rows.map((row) => ({
                    ...this.summary(row),
                    canResumeDraft: row.status === 'draft' && !row.handedOffAt,
                    needsCustomerAction:
                        row.status !== 'processed' &&
                        row.readiness === 'awaiting_customer',
                })),
                limit: 50,
            };
        });
    }

    details(session: WebSessionPrincipal, id: number) {
        return this.db.transaction('REPEATABLE READ', async (manager) => {
            const registration = await this.owner(manager, session, id);
            const requirements = await manager.find(
                RegistrationRequirementEntity,
                { where: { registrationId: id }, order: { id: 'ASC' } },
            );
            const checklistAvailable =
                registrationChecklistAvailable(requirements);
            const fields = await manager.find(RegistrationFieldEntity);
            const form = clientRegistrationForm(fields);
            const evidence = await manager.find(RegistrationEvidenceEntity, {
                where: {
                    registrationId: id,
                    visibility: 'customer',
                    removedAt: IsNull(),
                },
                relations: { storedFile: true },
                order: { id: 'ASC' },
            });
            const requests = await manager.find(RegistrationDataRequestEntity, {
                where: { registrationId: id },
                order: { id: 'DESC' },
            });
            const canEdit =
                form.available &&
                checklistAvailable &&
                registration.status === 'draft' &&
                !registration.handedOffAt;
            const canRespond =
                checklistAvailable &&
                ['new', 'in_work'].includes(registration.status) &&
                !registration.handedOffAt;
            return {
                registration: {
                    ...this.summary(registration),
                    currentStep: registration.currentStep,
                    handedOffAt: registration.handedOffAt,
                    ofdProvisionMode: registration.ofdProvisionMode,
                },
                application: Object.fromEntries(
                    CLIENT_REGISTRATION_FIELDS.map((key) => [
                        key,
                        registration[key] ?? '',
                    ]),
                ),
                form,
                checklistAvailable,
                customerWorkflow: {
                    canEditDraft: canEdit,
                    canSubmitDraft: canEdit,
                    expectedUpdatedAt: registration.updatedAt.toISOString(),
                    blockedReason: !checklistAvailable
                        ? 'checklist_unavailable'
                        : !form.available
                          ? 'form_unavailable'
                          : canEdit
                            ? null
                            : 'not_draft',
                },
                requirements: requirements.map((item) => {
                    const allowed =
                        canRespond &&
                        !['verified', 'not_required'].includes(item.status);
                    return {
                        id: item.id,
                        kind: item.kind,
                        status: item.status,
                        version: item.version,
                        value:
                            item.kind === 'ofd_code' && item.value
                                ? `****${item.value.length > 4 ? item.value.slice(-4) : ''}`
                                : item.value,
                        source: item.source,
                        requestedAt: item.requestedAt,
                        providedAt: item.providedAt,
                        verifiedAt: item.verifiedAt,
                        canProvideValue: allowed,
                        canUploadEvidence: allowed,
                        blockedReason: !checklistAvailable
                            ? 'checklist_unavailable'
                            : !canRespond
                              ? 'not_accepting_responses'
                              : !allowed
                                ? 'already_checked'
                                : null,
                    };
                }),
                evidence: await Promise.all(
                    evidence.map(async (item) => {
                        const bound = this.boundEvidence(item);
                        return {
                            id: item.id,
                            requirementId: item.requirementId,
                            fileName: bound
                                ? item.storedFile.originalName
                                : 'Недоступное вложение',
                            mimeType: bound
                                ? item.storedFile.mimeType
                                : 'application/octet-stream',
                            sizeBytes: bound ? item.storedFile.sizeBytes : '0',
                            createdAt: item.createdAt,
                            available:
                                bound &&
                                (await this.files.exists(item.storedFile)),
                            downloadUrl: `/api/client/registrations/${id}/evidence/${item.id}`,
                        };
                    }),
                ),
                dataRequests: requests.map((item) => ({
                    id: item.id,
                    requirementId: item.requirementId,
                    requestText: item.requestText,
                    status:
                        item.status === 'delivery_failed'
                            ? 'open'
                            : item.status,
                    createdAt: item.createdAt,
                    deliveredAt: item.deliveredAt,
                    answeredAt: item.answeredAt,
                    closedAt: item.closedAt,
                })),
            };
        });
    }

    async download(
        session: WebSessionPrincipal,
        id: number,
        evidenceId: number,
    ) {
        const file = await this.db.transaction(
            'REPEATABLE READ',
            async (manager) => {
                await this.owner(manager, session, id);
                const evidence = await manager.findOne(
                    RegistrationEvidenceEntity,
                    {
                        where: {
                            id: evidenceId,
                            registrationId: id,
                            visibility: 'customer',
                            removedAt: IsNull(),
                        },
                        relations: { storedFile: true },
                    },
                );
                if (
                    !evidence ||
                    !this.boundEvidence(evidence) ||
                    !(await this.files.exists(evidence.storedFile))
                )
                    throw new NotFoundException('Evidence was not found');
                return evidence.storedFile;
            },
        );
        try {
            return { file, stream: await this.files.openStoredFile(file) };
        } catch {
            throw new NotFoundException('Evidence was not found');
        }
    }

    private boundEvidence(item: RegistrationEvidenceEntity) {
        const file = item.storedFile;
        return (
            file.status === 'active' &&
            !file.purgedAt &&
            file.metadata?.purpose === 'registration-evidence' &&
            file.metadata?.registrationId === item.registrationId
        );
    }

    private summary(row: RegistrationRequestEntity) {
        return {
            id: row.id,
            status: row.status,
            readiness: row.readiness,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            orgName: row.orgName,
            kktModel: row.kktModel,
        };
    }
}
