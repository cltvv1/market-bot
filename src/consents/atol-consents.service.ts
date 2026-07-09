import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerActivityService } from 'src/customer-activity/customer-activity.service';
import { OrganizationsService } from 'src/organizations/organizations.service';
import { PdfGeneratorService } from 'src/pdf/pdf.service';
import { ServiceRequestsService } from 'src/service-requests/service-requests.service';
import { UsersService } from 'src/users/users.service';
import type { ClientIdentity } from 'src/client/client-workflow.types';
import { getAtolConsentStep } from './atol-consent.flow';
import { AtolConsentEntity } from './entities/atol-consent.entity';

@Injectable()
export class AtolConsentsService {
    private readonly storageDir: string;

    constructor(
        @InjectRepository(AtolConsentEntity)
        private readonly consentsRepo: Repository<AtolConsentEntity>,
        private readonly usersService: UsersService,
        private readonly organizationsService: OrganizationsService,
        private readonly activityService: CustomerActivityService,
        private readonly pdfService: PdfGeneratorService,
        private readonly serviceRequestsService: ServiceRequestsService,
        configService: ConfigService,
    ) {
        this.storageDir = configService.get<string>('CONSENT_DIR') ?? 'storage/consents';
    }

    async start(identity: ClientIdentity) {
        const user = await this.usersService.getOrCreateOrUpdate(
            identity.chatId,
            identity.name,
            identity.username,
            identity.platform,
        );
        await this.organizationsService.assertUserOrganization(
            identity.chatId,
            identity.platform,
            identity.organizationId,
        );

        const existing = await this.getLatestPending(identity);
        const consent = existing ?? await this.consentsRepo.save(this.consentsRepo.create({
            userId: user.id,
            organizationId: identity.organizationId,
            platform: identity.platform,
            chatId: identity.chatId,
            status: 'draft',
            currentStep: 0,
            city: 'Красноярск',
        }));

        if (!existing) {
            await this.activityService.add({
                userId: user.id,
                organizationId: identity.organizationId,
                platform: identity.platform,
                chatId: identity.chatId,
                type: 'atol_consent_started',
                title: 'Согласие на доступ АТОЛ',
                description: `Создан черновик согласия #${consent.id}`,
                payload: { consentId: consent.id },
            });
        }

        return this.present(consent);
    }

    async answer(identity: ClientIdentity, value: string) {
        const consent = await this.getLatestPending(identity);
        if (!consent) {
            return null;
        }

        if (consent.status === 'generated') {
            return this.present(consent);
        }

        const step = getAtolConsentStep(consent);
        if (!step) {
            return this.present(consent);
        }

        const normalizedValue = value.trim();
        if (!normalizedValue) {
            throw new BadRequestException('Consent answer value is required');
        }

        consent[step.key] = normalizedValue;
        consent.currentStep += 1;

        let saved = await this.consentsRepo.save(consent);
        if (!getAtolConsentStep(saved)) {
            saved.status = 'generated';
            saved.generatedPdfPath = await this.pdfService.generateAtolConsentPdf(saved);
            saved = await this.consentsRepo.save(saved);

            await this.activityService.add({
                userId: saved.userId,
                organizationId: saved.organizationId,
                platform: saved.platform,
                chatId: saved.chatId,
                type: 'atol_consent_generated',
                title: 'Согласие на доступ АТОЛ',
                description: `PDF согласия #${saved.id} сформирован`,
                payload: { consentId: saved.id },
            });
        }

        return this.present(saved);
    }

    async attachSignedFile(identity: ClientIdentity, file: { buffer: Buffer; fileName?: string }) {
        const consent = await this.consentsRepo.findOne({
            where: {
                chatId: identity.chatId,
                platform: identity.platform,
                status: 'generated',
            },
            order: { createdAt: 'DESC', id: 'DESC' },
        });

        if (!consent) {
            return null;
        }

        const dir = path.join(process.cwd(), this.storageDir, String(consent.id));
        await fs.promises.mkdir(dir, { recursive: true });

        const originalName = file.fileName || 'signed-consent.jpg';
        const safeName = originalName.replace(/[^\wа-яА-ЯёЁ.\-]+/g, '_');
        const filePath = path.join(dir, `signed_${Date.now()}_${safeName}`);
        await fs.promises.writeFile(filePath, file.buffer);

        consent.signedFilePath = filePath;
        consent.signedFileName = originalName;
        consent.status = 'signed_received';
        let saved = await this.consentsRepo.save(consent);

        if (!saved.serviceRequestId) {
            const serviceRequest = await this.serviceRequestsService.createAtolConsentReviewRequest(identity, {
                consentId: saved.id,
                city: saved.city,
                clientName: saved.clientName ?? '',
                inn: saved.inn ?? '',
                representativeName: saved.representativeName ?? '',
                representativeBasis: saved.representativeBasis ?? '',
                generatedPdfPath: saved.generatedPdfPath ?? '',
                signedFilePath: saved.signedFilePath ?? '',
                signedFileName: saved.signedFileName ?? originalName,
            });
            saved.serviceRequestId = serviceRequest.id;
            saved = await this.consentsRepo.save(saved);
        }

        await this.activityService.add({
            userId: saved.userId,
            organizationId: saved.organizationId,
            platform: saved.platform,
            chatId: saved.chatId,
            type: 'atol_consent_signed_received',
            title: 'Согласие на доступ АТОЛ',
            description: `Получен подписанный файл согласия #${saved.id}`,
            payload: { consentId: saved.id, fileName: originalName },
        });

        return this.present(saved);
    }

    present(consent: AtolConsentEntity) {
        return {
            consent,
            nextStep: getAtolConsentStep(consent),
            isGenerated: consent.status === 'generated' && !!consent.generatedPdfPath,
            isSignedReceived: consent.status === 'signed_received',
        };
    }

    private async getLatestPending(identity: ClientIdentity) {
        return this.consentsRepo.findOne({
            where: [
                {
                    chatId: identity.chatId,
                    platform: identity.platform,
                    status: 'draft',
                },
                {
                    chatId: identity.chatId,
                    platform: identity.platform,
                    status: 'generated',
                },
            ],
            order: { createdAt: 'DESC', id: 'DESC' },
        });
    }
}
