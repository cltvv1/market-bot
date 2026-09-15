import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from 'src/audit/audit.service';
import { FilesService } from 'src/files/files.service';
import { PdfGeneratorService } from 'src/pdf/pdf.service';
import { AdminNotificationsService } from 'src/admin/admin-notifications.service';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import { RegistrationFieldEntity } from './entities/registration-field.entity';
import { RegistrationRequirementEntity } from './entities/registration-requirement.entity';
import { RegistrationsService } from './registrations.service';
import { RegistrationClientReadService } from './registration-client-read.service';
import {
    assertRegistrationDraft,
    assertRequiredRegistrationValues,
    clientRegistrationForm,
    normalizeRegistrationValues,
    registrationChecklistAvailable,
} from './registration-client-policy';

@Injectable()
export class RegistrationClientCommandsService {
    private readonly logger = new Logger(
        RegistrationClientCommandsService.name,
    );
    constructor(
        private readonly db: DataSource,
        private readonly registrations: RegistrationsService,
        private readonly read: RegistrationClientReadService,
        private readonly pdf: PdfGeneratorService,
        private readonly files: FilesService,
        private readonly audit: AuditService,
        private readonly notifications: AdminNotificationsService,
    ) {}

    async start(session: WebSessionPrincipal) {
        const draft = await this.registrations.createRegistration(
            session.chatId,
            'web',
            session.userId,
        );
        return this.read.details(session, draft.id);
    }

    async save(
        session: WebSessionPrincipal,
        id: number,
        expectedUpdatedAt: string,
        values: unknown,
    ) {
        const normalized = normalizeRegistrationValues(values);
        await this.db.transaction(async (manager) => {
            const registration = await this.read.owner(
                manager,
                session,
                id,
                true,
            );
            assertRegistrationDraft(registration, expectedUpdatedAt);
            await this.checklist(manager, id);
            await this.form(manager);
            // Omitted fields survive form changes; an explicit empty string clears a value.
            Object.assign(registration, normalized);
            registration.updatedAt = new Date(
                Math.max(Date.now(), registration.updatedAt.getTime() + 1),
            );
            await manager.save(registration);
            await this.record(manager, session, id, 'registration.draft.saved');
        });
        return this.read.details(session, id);
    }

    async submit(
        session: WebSessionPrincipal,
        id: number,
        expectedUpdatedAt: string,
    ) {
        const snapshot = await this.db.transaction((manager) =>
            this.submitSnapshot(manager, session, id, expectedUpdatedAt),
        );
        const fingerprint = this.fingerprint(snapshot);
        // PDF rendering/storage must not hold a registration lock.
        const buffer = await this.pdf.generateRegistrationPdf(
            snapshot.registration,
            snapshot.fields,
            {
                draft: true,
                requirements: snapshot.requirements,
            },
        );
        const stored = await this.files.saveBuffer({
            purpose: 'generated-pdf',
            buffer,
            originalName: `registration_${id}.pdf`,
            mimeType: 'application/pdf',
            serverGenerated: true,
            metadata: { registrationId: id, draft: true, final: false },
        });
        try {
            await this.db.transaction(async (manager) => {
                const current = await this.submitSnapshot(
                    manager,
                    session,
                    id,
                    expectedUpdatedAt,
                );
                if (this.fingerprint(current) !== fingerprint)
                    throw new ConflictException(
                        'Registration changed during submission',
                    );
                current.registration.status = 'new';
                current.registration.currentStep =
                    Math.max(...current.fields.map((field) => field.step), 1) +
                    1;
                current.registration.pdfFileId = stored.id;
                current.registration.updatedAt = new Date(
                    Math.max(
                        Date.now(),
                        current.registration.updatedAt.getTime() + 1,
                    ),
                );
                await manager.save(current.registration);
                await this.record(
                    manager,
                    session,
                    id,
                    'registration.submitted',
                );
                const context = {
                    manager,
                    dedupeKey: `registration:${id}:submitted`,
                    sourceType: 'registration',
                    sourceId: id,
                };
                await this.notifications.notify(
                    'registrations',
                    `Новая анкета на регистрацию кассы #${id}. Проверьте данные в админке.`,
                    context,
                );
                await this.notifications.notifyDocument(
                    'registrations',
                    {
                        storedFileId: stored.id,
                        filename: `registration_${id}.pdf`,
                    },
                    context,
                );
            });
        } catch (error) {
            await this.retire(stored.id);
            throw error;
        }
        if (
            snapshot.registration.pdfFileId &&
            snapshot.registration.pdfFileId !== stored.id
        )
            await this.retire(snapshot.registration.pdfFileId);
        return this.read.details(session, id);
    }

    async legacyForm(session: WebSessionPrincipal, values: unknown) {
        assertRequiredRegistrationValues(normalizeRegistrationValues(values));
        const detail = await this.start(session);
        const saved = await this.save(
            session,
            detail.registration.id,
            detail.customerWorkflow.expectedUpdatedAt,
            values,
        );
        const result = await this.submit(
            session,
            saved.registration.id,
            saved.customerWorkflow.expectedUpdatedAt,
        );
        return { status: 'completed', data: result.registration };
    }

    async legacyStart(session: WebSessionPrincipal) {
        const existing = await this.registrations.getNotFilledReg(
            session.chatId,
            'web',
        );
        const detail = await this.start(session);
        return {
            status: existing ? 'continued' : 'started',
            data: detail.registration,
            nextField: await this.registrations.getFieldTextByStep(
                detail.registration.currentStep,
            ),
        };
    }

    async legacyAnswer(session: WebSessionPrincipal, value: string) {
        const draft = await this.registrations.getNotFilledReg(
            session.chatId,
            'web',
        );
        if (!draft) return { status: 'not_found' };
        await this.read.details(session, draft.id);
        const field = await this.registrations.getFieldNameByStep(
            draft.currentStep,
        );
        if (
            field === 'equipmentPhoto' &&
            !/^(пропустить|нет|skip)$/i.test(value.trim())
        ) {
            const detail = await this.read.details(session, draft.id);
            return {
                status: 'continued',
                data: detail.registration,
                nextField: await this.registrations.getFieldTextByStep(
                    draft.currentStep,
                ),
            };
        }
        if (!field || field === 'equipmentPhoto') {
            const detail = await this.submit(
                session,
                draft.id,
                draft.updatedAt.toISOString(),
            );
            return { status: 'completed', data: detail.registration };
        }
        const values = normalizeRegistrationValues({ [field]: value });
        await this.db.transaction(async (manager) => {
            const row = await this.read.owner(manager, session, draft.id, true);
            assertRegistrationDraft(row, draft.updatedAt.toISOString());
            await this.checklist(manager, draft.id);
            await this.form(manager);
            Object.assign(row, values);
            row.currentStep += 1;
            row.updatedAt = new Date(
                Math.max(Date.now(), row.updatedAt.getTime() + 1),
            );
            await manager.save(row);
            await this.record(
                manager,
                session,
                draft.id,
                'registration.draft.saved',
            );
        });
        const detail = await this.read.details(session, draft.id);
        const nextField = await this.registrations.getFieldTextByStep(
            detail.registration.currentStep,
        );
        if (!nextField) {
            const submitted = await this.submit(
                session,
                draft.id,
                detail.customerWorkflow.expectedUpdatedAt,
            );
            return { status: 'completed', data: submitted.registration };
        }
        return {
            status: 'continued',
            data: detail.registration,
            nextField,
        };
    }

    private async checklist(manager: EntityManager, id: number) {
        const requirements = await manager.find(RegistrationRequirementEntity, {
            where: { registrationId: id },
            order: { id: 'ASC' },
        });
        if (!registrationChecklistAvailable(requirements))
            throw new ConflictException(
                'Registration checklist is unavailable',
            );
        return requirements;
    }
    private async submitSnapshot(
        manager: EntityManager,
        session: WebSessionPrincipal,
        id: number,
        expected: string,
    ) {
        const registration = await this.read.owner(manager, session, id, true);
        assertRegistrationDraft(registration, expected);
        assertRequiredRegistrationValues(registration);
        const requirements = await this.checklist(manager, id);
        const fields = await this.form(manager);
        return { registration, requirements, fields };
    }
    private async form(manager: EntityManager) {
        const fields = await manager.find(RegistrationFieldEntity, {
            order: { id: 'ASC' },
        });
        if (!clientRegistrationForm(fields).available)
            throw new ConflictException('Registration form is unavailable');
        return fields;
    }
    private fingerprint(
        snapshot: Awaited<
            ReturnType<RegistrationClientCommandsService['submitSnapshot']>
        >,
    ) {
        return createHash('sha256')
            .update(JSON.stringify(snapshot))
            .digest('hex');
    }
    private record(
        manager: EntityManager,
        session: WebSessionPrincipal,
        id: number,
        action: string,
    ) {
        return this.audit.record(
            {
                actorType: 'customer',
                actorCustomerId: session.userId,
                actorWebSessionId: session.sessionId,
                action,
                targetType: 'registration',
                targetId: id,
            },
            manager,
        );
    }
    private async retire(id: number) {
        await this.files
            .logicalDelete(id)
            .catch(() =>
                this.logger.warn(
                    'Could not retire an unattached registration PDF',
                ),
            );
    }
}
