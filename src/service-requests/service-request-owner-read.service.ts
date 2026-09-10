import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { FilesService } from 'src/files/files.service';
import { FILE_POLICIES } from 'src/files/file-policies';
import type { WebSessionPrincipal } from 'src/web-session/web-session.types';
import { ServiceRequestEntity } from './entities/service-request.entity';
import { ServiceFormVersionEntity } from './entities/service-form-version.entity';
import { ServiceRequestAttachmentEntity } from './entities/service-request-attachment.entity';
import { ServiceRequestMessageEntity } from './entities/service-request-message.entity';
import { ServiceRequestEventEntity } from './entities/service-request-event.entity';
import { ServiceRequestPaymentProofService } from './service-request-payment-proof.service';
import {
    canCustomerMessage,
    ownerAnswers,
    ownerCapability,
    ownerContext,
    ownerForm,
    ownerHistory,
    ownerSummary,
} from './service-request-owner-contract';

@Injectable()
export class ServiceRequestOwnerReadService {
    constructor(
        private readonly db: DataSource,
        private readonly files: FilesService,
        private readonly proofs: ServiceRequestPaymentProofService,
    ) {}

    async list(session: WebSessionPrincipal) {
        const rows = await this.db.getRepository(ServiceRequestEntity).find({
            where: { userId: session.userId },
            relations: { formVersion: true },
            order: { createdAt: 'DESC', id: 'DESC' },
            take: 50,
        });
        return rows.map((row) => ({
            request: {
                ...ownerSummary(row),
                canContinue:
                    row.status === 'draft' &&
                    Boolean(ownerForm(row.formVersion)?.supported),
                customerStatus: row.customerStatus,
            },
        }));
    }

    detail(session: WebSessionPrincipal, id: number) {
        if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647)
            throw new NotFoundException('Service request was not found');
        // Versioned fields and every workflow are derived from one authorized snapshot.
        return this.db.transaction('REPEATABLE READ', async (manager) => {
            const row = await manager
                .getRepository(ServiceRequestEntity)
                .findOneBy({ id, userId: session.userId });
            if (!row)
                throw new NotFoundException('Service request was not found');
            return this.project(row, manager);
        });
    }

    private async project(row: ServiceRequestEntity, manager: EntityManager) {
        const form = ownerForm(
            Number.isInteger(row.formVersionId) && row.formVersionId > 0
                ? await manager
                      .getRepository(ServiceFormVersionEntity)
                      .findOneBy({ id: row.formVersionId })
                : null,
        );
        const attachments = await manager
            .getRepository(ServiceRequestAttachmentEntity)
            .find({
                where: { serviceRequestId: row.id, customerVisible: true },
                relations: { storedFile: true },
                order: { createdAt: 'ASC', id: 'ASC' },
            });
        const documents = await Promise.all(
            attachments
                .filter((item) => item.kind !== 'payment_proof')
                .map(async (item) => {
                    const file = item.storedFile;
                    const downloadable = Boolean(
                        file &&
                            file.status === 'active' &&
                            !file.purgedAt &&
                            (await this.files.exists(file)),
                    );
                    return {
                        id: item.id,
                        kind: item.kind,
                        createdAt: item.createdAt,
                        file: {
                            originalName: file?.originalName ?? null,
                            mimeType: file?.mimeType ?? null,
                            sizeBytes: file ? Number(file.sizeBytes) : null,
                        },
                        downloadable,
                        downloadUrl: downloadable
                            ? `/api/client/service-requests/${row.id}/attachments/${item.id}`
                            : null,
                    };
                }),
        );
        const invoiceIndex = attachments
            .filter((item) => item.kind !== 'payment_proof')
            .findIndex(
                (item) =>
                    item.kind === 'invoice' &&
                    item.storedFileId === row.invoiceStoredFileId,
            );
        const messages = await manager
            .getRepository(ServiceRequestMessageEntity)
            .find({
                where: { serviceRequestId: row.id, visibility: 'customer' },
                order: { createdAt: 'ASC', id: 'ASC' },
            });
        const events = await manager
            .getRepository(ServiceRequestEventEntity)
            .find({
                where: { serviceRequestId: row.id },
                order: { createdAt: 'ASC', id: 'ASC' },
            });
        const proof = await this.proofs.projectOwnedRow(row, manager);
        const edit = row.status === 'draft' && Boolean(form?.supported);
        const communicate = canCustomerMessage(row.status);
        const policy = FILE_POLICIES['service-attachment'];
        const contact = row.contactSnapshot;
        return {
            request: {
                ...ownerSummary(row),
                canContinue: edit,
                version: row.version,
                customerStatus: row.customerStatus,
                answers: ownerAnswers(form?.schema, row.answers),
                contactSnapshot: contact
                    ? {
                          name: contact.name,
                          phone: contact.phone,
                          email: contact.email,
                          preferredChannel: contact.preferredChannel,
                      }
                    : null,
                organizationSnapshot: ownerContext(row.organizationSnapshot, [
                    'name',
                    'inn',
                ]),
                locationSnapshot: ownerContext(row.locationSnapshot, [
                    'city',
                    'address',
                ]),
                equipmentSnapshot: ownerContext(row.equipmentSnapshot, [
                    'type',
                    'model',
                    'serialNumber',
                    'software',
                ]),
                linkedOrganization: Boolean(row.organizationId),
                linkedEquipment: Boolean(row.cashRegisterId),
                submittedAt: row.submittedAt,
                completedAt: row.completedAt,
                closedAt: row.closedAt,
                cancelledAt: row.cancelledAt,
                visitTime: row.visitTime,
                visitAddress: row.visitAddress,
                calculatedPrice: row.calculatedPrice,
            },
            form,
            messages: messages.map((message) => ({
                id: message.id,
                authorType: message.authorType,
                text: message.text,
                createdAt: message.createdAt,
                attachmentId:
                    attachments.find(
                        (item) =>
                            item.kind === 'message' &&
                            item.storedFileId === message.storedFileId,
                    )?.id ?? null,
            })),
            attachments: documents,
            events: ownerHistory(events),
            documents: {
                ...proof.documents,
                invoice: invoiceIndex >= 0 ? documents[invoiceIndex] : null,
            },
            customerWorkflow: {
                ...proof.customerWorkflow,
                editDraft: ownerCapability(
                    edit,
                    'Этот черновик недоступен для редактирования.',
                ),
                submitDraft: ownerCapability(
                    edit,
                    'Отправка этого черновика недоступна.',
                ),
                sendMessage: ownerCapability(
                    communicate,
                    'Переписка недоступна на этом этапе.',
                ),
                attachFile: ownerCapability(
                    communicate,
                    'Отправка файлов недоступна на этом этапе.',
                ),
            },
            attachmentPolicy: {
                maxBytes: policy.maxBytes,
                mimeTypes: policy.mimeTypes,
                extensions: policy.extensions,
                maxAttachments: form?.schema.maxAttachments ?? 5,
            },
        };
    }
}
