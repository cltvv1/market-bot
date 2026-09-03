import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { DataSource, In, SelectQueryBuilder } from 'typeorm';
import type { AdminPrincipal } from '../admin/admin-auth.types';
import type { ServiceRequestListQueryDto } from '../admin/dto/admin-api.dto';
import { AdminUserEntity } from '../admin/entities/admin-user.entity';
import { FilesService } from '../files/files.service';
import { StoredFileEntity } from '../files/entities/stored-file.entity';
import { OutboundDeliveriesService } from '../outbound-deliveries/outbound-deliveries.service';
import { ServiceRequestEntity } from './entities/service-request.entity';
import { ServiceRequestAttachmentEntity } from './entities/service-request-attachment.entity';
import { ServiceRequestMessageEntity } from './entities/service-request-message.entity';
import { ServiceRequestEventEntity } from './entities/service-request-event.entity';
import { ServiceTypeEntity } from './entities/service-type.entity';
import { serviceRequestWorkflow } from './service-request-admin-policy';
import { SERVICE_REQUEST_ADMIN_VISIBLE_SQL } from './service-request-admin-visibility';

export function safeStaff(
    staff:
        | Pick<AdminUserEntity, 'id' | 'displayName' | 'isActive'>
        | null
        | undefined,
) {
    return staff
        ? {
              id: staff.id,
              displayName: staff.displayName,
              isActive: staff.isActive,
          }
        : null;
}
const text = (value: unknown) =>
    typeof value === 'string' || typeof value === 'number'
        ? String(value).slice(0, 1000)
        : null;

@Injectable()
export class ServiceRequestAdminReadService {
    constructor(
        private readonly db: DataSource,
        private readonly files: FilesService,
        private readonly outbound: OutboundDeliveriesService,
    ) {}

    private scope(
        builder: SelectQueryBuilder<ServiceRequestEntity>,
        admin: AdminPrincipal,
    ) {
        if (admin.permissions.includes('serviceRequests.read.all'))
            return builder;
        if (!admin.permissions.includes('serviceRequests.read.assigned'))
            throw new ForbiddenException('Insufficient permissions');
        return builder.andWhere('request.assignedEngineerId = :currentStaff', {
            currentStaff: admin.id,
        });
    }

    async list(admin: AdminPrincipal, query: ServiceRequestListQueryDto) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 25;
        const builder = this.scope(
            this.db
                .getRepository(ServiceRequestEntity)
                .createQueryBuilder('request')
                .andWhere(SERVICE_REQUEST_ADMIN_VISIBLE_SQL),
            admin,
        );
        const status = query.status ?? 'active';
        if (status === 'active')
            builder.andWhere('request.status NOT IN (:...terminal)', {
                terminal: ['completed', 'closed', 'cancelled'],
            });
        else if (status !== 'all')
            builder.andWhere('request.status = :status', { status });
        if (query.platform)
            builder.andWhere('request.platform = :platform', {
                platform: query.platform,
            });
        if (query.priority)
            builder.andWhere('request.priority = :priority', {
                priority: query.priority,
            });
        if (query.scope === 'mine')
            builder.andWhere(
                '(request.responsibleOperatorStaffId = :mine OR request.assignedEngineerId = :mine)',
                { mine: admin.id },
            );
        if (query.scope === 'unassigned')
            builder.andWhere(
                'request.responsibleOperatorStaffId IS NULL AND request.assignedEngineerId IS NULL',
            );
        if (query.responsibleStaffId)
            builder.andWhere(
                '(request.responsibleOperatorStaffId = :responsible OR request.assignedEngineerId = :responsible)',
                { responsible: query.responsibleStaffId },
            );
        builder.select(
            [
                'id',
                'requestNumber',
                'serviceTypeCode',
                'serviceTypeTitle',
                'status',
                'customerStatus',
                'priority',
                'source',
                'platform',
                'contactSnapshot',
                'organizationId',
                'organizationSnapshot',
                'equipmentSnapshot',
                'invoiceStoredFileId',
                'paymentProofFileId',
                'version',
                'createdAt',
                'updatedAt',
            ].map((field) => `request.${field}`),
        );
        this.staffJoins(builder);
        const [rows, total] = await builder
            .orderBy('request.createdAt', 'DESC')
            .addOrderBy('request.id', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();
        return {
            items: rows.map((row) => this.listItem(row)),
            page,
            limit,
            total,
            hasNext: page * limit < total,
        };
    }

    types() {
        return this.db.getRepository(ServiceTypeEntity).find({
            where: { isActive: true },
            select: { code: true, title: true },
            order: { id: 'ASC' },
        });
    }

    async detail(admin: AdminPrincipal, id: number) {
        const builder = this.scope(
            this.db
                .getRepository(ServiceRequestEntity)
                .createQueryBuilder('request')
                .where('request.id = :id', { id }),
            admin,
        );
        this.staffJoins(builder);
        const row = await builder.getOne();
        if (!row) throw new NotFoundException('Service request was not found');
        const messages = await this.db
            .getRepository(ServiceRequestMessageEntity)
            .find({
                where: { serviceRequestId: id },
                order: { createdAt: 'ASC', id: 'ASC' },
            });
        const attachments = await this.db
            .getRepository(ServiceRequestAttachmentEntity)
            .find({
                where: { serviceRequestId: id },
                relations: { storedFile: true },
                order: { createdAt: 'ASC', id: 'ASC' },
            });
        const events = await this.db
            .getRepository(ServiceRequestEventEntity)
            .find({
                where: { serviceRequestId: id },
                order: { createdAt: 'ASC', id: 'ASC' },
            });
        const staffIds = [
            ...new Set([
                ...messages.flatMap((message) =>
                    message.authorStaffId ? [message.authorStaffId] : [],
                ),
                ...events.flatMap((event) =>
                    /^staff:[1-9]\d*$/.test(event.actor ?? '')
                        ? [Number(event.actor!.slice(6))]
                        : [],
                ),
            ]),
        ];
        const authors = staffIds.length
            ? await this.db.getRepository(AdminUserEntity).find({
                  where: { id: In(staffIds) },
                  select: { id: true, displayName: true, isActive: true },
              })
            : [];
        const staff = new Map(
            authors.map((author) => [author.id, safeStaff(author)]),
        );
        const fileIds = [
            row.invoiceStoredFileId,
            row.paymentProofFileId,
            row.generatedConsentFileId,
            row.signedConsentFileId,
        ].filter((value): value is number => value !== null);
        const rootFiles = fileIds.length
            ? await this.db
                  .getRepository(StoredFileEntity)
                  .findBy({ id: In(fileIds) })
            : [];
        const documentRows = [] as Awaited<
            ReturnType<ServiceRequestAdminReadService['document']>
        >[];
        for (const attachment of attachments) {
            documentRows.push(
                await this.document(
                    attachment.storedFile,
                    attachment.kind,
                    attachment.customerVisible,
                    attachment.createdAt,
                    `/admin/api/service-requests/${id}/attachments/${attachment.id}`,
                    attachment.id,
                ),
            );
        }
        const currentDocument = async (
            fileId: number | null,
            kind: string,
            route: string,
        ) => {
            if (!fileId) return null;
            const attached = documentRows.find(
                (item) => item.id === fileId && item.kind === kind,
            );
            if (attached) return attached;
            const file = rootFiles.find((item) => item.id === fileId);
            return this.document(
                file,
                kind,
                true,
                file?.createdAt ?? row.createdAt,
                route,
                null,
                fileId,
            );
        };
        const invoice = await currentDocument(
            row.invoiceStoredFileId,
            'invoice',
            `/admin/api/service-requests/${id}/invoice`,
        );
        const paymentProof = await currentDocument(
            row.paymentProofFileId,
            'payment_proof',
            `/admin/api/service-requests/${id}/payment-proof`,
        );
        const signed = await currentDocument(
            row.signedConsentFileId,
            'signed_consent',
            `/admin/api/service-requests/${id}/signed-consent`,
        );
        if (signed && !documentRows.some((item) => item.id === signed.id))
            documentRows.push(signed);
        const deliveries = await this.outbound.listForSource(
            'service_request',
            id,
        );
        return {
            request: {
                ...this.listItem(row),
                answers: row.answers,
                contactSnapshot: this.contact(row),
                organizationSnapshot: row.organizationSnapshot,
                locationSnapshot: row.locationSnapshot,
                equipmentSnapshot: row.equipmentSnapshot,
                organizationId: row.organizationId,
                cashRegisterId: row.cashRegisterId,
                calculatedPrice: row.calculatedPrice,
                operatorComment: row.operatorComment,
                visitAddress: row.visitAddress,
                visitTime: row.visitTime,
                invoiceStoredFileId: row.invoiceStoredFileId,
                paymentProofFileId: row.paymentProofFileId,
                generatedConsentFileId: row.generatedConsentFileId,
                signedConsentFileId: row.signedConsentFileId,
                submittedAt: row.submittedAt,
                completedAt: row.completedAt,
                closedAt: row.closedAt,
                cancelledAt: row.cancelledAt,
            },
            messages: messages.map((message) => ({
                id: message.id,
                authorType: message.authorType,
                author: message.authorStaffId
                    ? (staff.get(message.authorStaffId) ?? null)
                    : null,
                visibility: message.visibility,
                text: message.text,
                attachment:
                    documentRows.find(
                        (doc) => doc.id === message.storedFileId,
                    ) ?? null,
                createdAt: message.createdAt,
            })),
            attachments: documentRows,
            documents: {
                invoice,
                paymentProof,
                attachments: documentRows.filter(
                    (doc) => doc !== invoice && doc !== paymentProof,
                ),
            },
            events: events.map((event) => ({
                id: event.id,
                type: event.type,
                actor: event.actor,
                actorStaff: event.actor?.startsWith('staff:')
                    ? (staff.get(Number(event.actor.slice(6))) ?? null)
                    : null,
                message: event.message,
                createdAt: event.createdAt,
            })),
            deliveries,
            workflow: serviceRequestWorkflow(row, admin.permissions),
        };
    }

    private staffJoins(builder: SelectQueryBuilder<ServiceRequestEntity>) {
        builder
            .leftJoin('request.responsibleOperatorStaff', 'operator')
            .addSelect([
                'operator.id',
                'operator.displayName',
                'operator.isActive',
            ])
            .leftJoin('request.assignedEngineer', 'engineer')
            .addSelect([
                'engineer.id',
                'engineer.displayName',
                'engineer.isActive',
            ]);
    }
    private contact(row: ServiceRequestEntity) {
        return {
            name: row.contactSnapshot?.name ?? '',
            phone: row.contactSnapshot?.phone,
            email: row.contactSnapshot?.email,
            preferredChannel: row.contactSnapshot?.preferredChannel,
        };
    }
    private listItem(row: ServiceRequestEntity) {
        return {
            id: row.id,
            requestNumber: row.requestNumber,
            serviceTypeCode: row.serviceTypeCode,
            serviceTypeTitle: row.serviceTypeTitle,
            status: row.status,
            customerStatus: row.customerStatus,
            priority: row.priority,
            source: row.source,
            platform: row.platform,
            contact: this.contact(row),
            organization: {
                id: row.organizationId ?? null,
                name: text(row.organizationSnapshot?.name),
                inn: text(row.organizationSnapshot?.inn),
            },
            equipment: Object.values(row.equipmentSnapshot ?? {})
                .map(text)
                .filter(Boolean)
                .join(' · ')
                .slice(0, 1000),
            responsibleOperator: safeStaff(row.responsibleOperatorStaff),
            assignedEngineer: safeStaff(row.assignedEngineer),
            hasInvoice: Boolean(row.invoiceStoredFileId),
            hasPaymentProof: Boolean(row.paymentProofFileId),
            version: row.version,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }
    private async document(
        file: StoredFileEntity | undefined,
        kind: string,
        customerVisible: boolean,
        createdAt: Date,
        downloadUrl: string,
        attachmentId: number | null,
        fallbackId?: number,
    ) {
        let downloadable = Boolean(
            file && file.status === 'active' && !file.purgedAt,
        );
        if (downloadable && file) {
            try {
                downloadable = await this.files.exists(file);
            } catch {
                downloadable = false;
            }
        }
        return {
            id: file?.id ?? fallbackId!,
            attachmentId,
            kind,
            originalName: file?.originalName ?? 'Документ',
            mimeType: file?.mimeType ?? null,
            sizeBytes: Number(file?.sizeBytes ?? 0),
            createdAt,
            customerVisible,
            downloadable,
            unavailableReasonCode: downloadable ? null : 'FILE_UNAVAILABLE',
            downloadUrl: downloadable ? downloadUrl : null,
        };
    }
}
