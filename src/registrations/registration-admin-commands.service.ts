import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AdminPrincipal } from 'src/admin/admin-auth.types';
import { AuditService } from 'src/audit/audit.service';
import { RegistrationRequestEntity } from './entities/registration.entity';
import {
    lockRegistrationCommand,
    type RegistrationCommandContext,
    type RegistrationPrecondition,
} from './registration-admin-policy';
import { RegistrationReadinessService } from './registration-readiness.service';
import { RegistrationAdminReadService } from './registration-admin-read.service';
import { RegistrationsService } from './registrations.service';
import type {
    OfdProvisionMode,
    RegistrationRequirementKind,
} from './registration.types';

export interface RegistrationAdminCommandInput {
    precondition: RegistrationPrecondition;
    kind?: RegistrationRequirementKind;
    comment?: string;
    text?: string;
    reason?: string;
    value?: string;
    source?: 'operator_input' | 'sold_by_vitma';
    mode?: OfdProvisionMode;
    kitId?: number;
    engineerId?: number;
    evidenceId?: number;
    priority?: RegistrationRequestEntity['priority'];
    status?: 'new' | 'in_work';
}

@Injectable()
export class RegistrationAdminCommandsService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly readiness: RegistrationReadinessService,
        private readonly registrations: RegistrationsService,
        private readonly read: RegistrationAdminReadService,
        private readonly audit: AuditService,
    ) {}

    async execute(
        admin: AdminPrincipal,
        id: number,
        action: RegistrationCommandContext['action'],
        input: RegistrationAdminCommandInput,
    ) {
        const context: RegistrationCommandContext = {
            staffId: admin.id,
            action,
            precondition: input.precondition,
        };
        switch (action) {
            case 'provide-value':
                await this.readiness.provideStaffValue(
                    id,
                    input.kind!,
                    admin.id,
                    input.value!,
                    input.source,
                    context,
                );
                break;
            case 'verify':
                await this.readiness.verify(
                    id,
                    input.kind!,
                    admin.id,
                    input.comment,
                    context,
                );
                break;
            case 'request-data':
                await this.readiness.requestData(
                    id,
                    input.kind!,
                    admin.id,
                    input.text,
                    context,
                );
                break;
            case 're-request':
                await this.readiness.revokeVerification(
                    id,
                    input.kind!,
                    admin.id,
                    input.text || '',
                    context,
                );
                break;
            case 'not-required':
                await this.readiness.markNotRequired(
                    id,
                    input.kind!,
                    admin.id,
                    input.reason || '',
                    context,
                );
                break;
            case 'ofd-mode':
                await this.readiness.setOfdMode(
                    id,
                    input.mode!,
                    admin.id,
                    input.reason,
                    context,
                );
                break;
            case 'equipment-kit':
                await this.readiness.useEquipmentKit(
                    id,
                    input.kitId!,
                    admin.id,
                    context,
                );
                break;
            case 'link-evidence':
                await this.readiness.linkEvidence(
                    id,
                    input.evidenceId!,
                    input.kind!,
                    admin.id,
                    context,
                );
                break;
            case 'remove-evidence':
                await this.readiness.removeEvidence(
                    id,
                    input.evidenceId!,
                    admin.id,
                    context,
                );
                break;
            case 'handoff':
                await this.readiness.handoff(
                    id,
                    admin.id,
                    input.engineerId,
                    context,
                );
                break;
            case 'final-pdf':
                await this.registrations.generateFinalPdf(id, context);
                break;
            case 'operator-state':
                await this.dataSource.transaction(async (manager) => {
                    const registration = await lockRegistrationCommand(
                        manager,
                        id,
                        context,
                    );
                    if (input.status !== undefined) {
                        if (
                            !['new', 'in_work'].includes(input.status) ||
                            registration.handedOffAt ||
                            !['new', 'in_work'].includes(registration.status)
                        )
                            throw new BadRequestException(
                                'Processing state cannot be changed here',
                            );
                        registration.status = input.status;
                    }
                    if (input.priority !== undefined)
                        registration.priority = input.priority;
                    await manager.save(registration);
                    await this.audit.record(
                        {
                            actorType: 'staff',
                            actorStaffId: admin.id,
                            actorSessionId: admin.sessionId,
                            action: 'registration.operator_state.update',
                            targetType: 'registration',
                            targetId: id,
                            metadata: {
                                status: registration.status,
                                priority: registration.priority,
                            },
                        },
                        manager,
                    );
                });
                break;
        }
        return this.read.details(admin, id);
    }
}
