import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { BadRequestException, Body, Controller, Get, Header, Param, Post, Query, Req, Res, UnauthorizedException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { UserPlatform } from 'src/users/entities/user.entity';
import type { ServiceRequestStatus } from 'src/service-requests/entities/service-request.entity';
import { AdminService } from './admin.service';
import type { AdminStatusFilter } from './admin.service';
import { adminPageHtml } from './admin.page';

@Controller('admin')
@ApiTags('admin')
@ApiSecurity('admin-token')
export class AdminController {
    constructor(
        private readonly adminService: AdminService,
        private readonly configService: ConfigService,
    ) { }

    @Get()
    @Header('Content-Type', 'text/html; charset=utf-8')
    getPage() {
        return adminPageHtml;
    }

    @Get('api/summary')
    getSummary(@Req() request: Request) {
        this.assertAuthorized(request);
        return this.adminService.getSummary();
    }

    @Get('api/registrations')
    getRegistrations(@Req() request: Request, @Query('status') status?: AdminStatusFilter, @Query('platform') platform?: UserPlatform) {
        this.assertAuthorized(request);
        return this.adminService.getRegistrations(this.normalizeStatus(status), this.normalizePlatform(platform));
    }

    @Get('api/bids')
    getBids(@Req() request: Request, @Query('status') status?: AdminStatusFilter, @Query('platform') platform?: UserPlatform) {
        this.assertAuthorized(request);
        return this.adminService.getBids(this.normalizeStatus(status), this.normalizePlatform(platform));
    }

    @Get('api/tickets')
    getTickets(@Req() request: Request, @Query('status') status?: AdminStatusFilter, @Query('platform') platform?: UserPlatform) {
        this.assertAuthorized(request);
        return this.adminService.getTickets(this.normalizeStatus(status), this.normalizePlatform(platform));
    }

    @Get('api/service-requests')
    getServiceRequests(@Req() request: Request, @Query('status') status?: ServiceRequestStatus | 'active' | 'all', @Query('platform') platform?: UserPlatform) {
        this.assertAuthorized(request);
        return this.adminService.getServiceRequests(this.normalizeServiceRequestStatus(status), this.normalizePlatform(platform));
    }

    @Get('api/service-requests/:id')
    getServiceRequest(@Req() request: Request, @Param('id') id: string) {
        this.assertAuthorized(request);
        return this.adminService.getServiceRequestDetails(Number(id));
    }

    @Get('api/customer-context')
    getCustomerContext(
        @Req() request: Request,
        @Query('userId') userId?: string,
        @Query('organizationId') organizationId?: string,
        @Query('platform') platform?: UserPlatform,
        @Query('chatId') chatId?: string,
    ) {
        this.assertAuthorized(request);
        return this.adminService.getCustomerContext({
            userId: userId ? Number(userId) : undefined,
            organizationId: organizationId ? Number(organizationId) : undefined,
            platform: this.normalizePlatform(platform),
            chatId,
        });
    }

    @Post('api/service-requests/:id/invoice')
    attachServiceRequestInvoice(@Req() request: Request, @Param('id') id: string, @Body('invoiceFileId') invoiceFileId?: string, @Body('invoiceFileName') invoiceFileName?: string) {
        this.assertAuthorized(request);
        if (!invoiceFileId?.trim()) {
            throw new BadRequestException('invoiceFileId is required');
        }

        return this.adminService.attachServiceRequestInvoice(Number(id), invoiceFileId.trim(), invoiceFileName?.trim() || undefined);
    }

    @Post('api/service-requests/:id/invoice-file')
    @UseInterceptors(FileInterceptor('file'))
    attachServiceRequestInvoiceFile(@Req() request: Request, @Param('id') id: string, @UploadedFile() file?: any) {
        this.assertAuthorized(request);
        if (!file) {
            throw new BadRequestException('PDF file is required');
        }

        if (file.mimetype !== 'application/pdf') {
            throw new BadRequestException('Only PDF files are supported');
        }

        const invoicesDir = path.join(process.cwd(), 'storage', 'invoices');
        fs.mkdirSync(invoicesDir, { recursive: true });
        const filePath = path.join(invoicesDir, `${randomUUID()}.pdf`);
        fs.writeFileSync(filePath, file.buffer);

        return this.adminService.attachServiceRequestInvoice(Number(id), filePath, file.originalname || `invoice_${id}.pdf`);
    }

    @Get('api/service-requests/:id/invoice')
    async downloadServiceRequestInvoice(@Req() request: Request, @Param('id') id: string, @Query('token') token: string, @Res() response: Response) {
        this.assertAuthorized(request, token);
        const details = await this.adminService.getServiceRequest(Number(id));
        const invoicePath = details.request.invoiceFileId;
        if (!invoicePath || !fs.existsSync(invoicePath)) {
            throw new BadRequestException('Invoice PDF not found');
        }

        return response.download(invoicePath, details.request.invoiceFileName || `invoice_${id}.pdf`);
    }

    @Post('api/service-requests/:id/payment-received')
    markServiceRequestPaymentReceived(@Req() request: Request, @Param('id') id: string) {
        this.assertAuthorized(request);
        return this.adminService.markServiceRequestPaymentReceived(Number(id));
    }

    @Post('api/service-requests/:id/schedule')
    scheduleServiceRequestVisit(@Req() request: Request, @Param('id') id: string, @Body('visitAddress') visitAddress?: string, @Body('visitTime') visitTime?: string, @Body('operatorComment') operatorComment?: string) {
        this.assertAuthorized(request);
        if (!visitAddress?.trim()) {
            throw new BadRequestException('visitAddress is required');
        }

        return this.adminService.scheduleServiceRequestVisit(Number(id), visitAddress.trim(), visitTime?.trim() || undefined, operatorComment?.trim() || undefined);
    }

    @Post('api/service-requests/:id/complete')
    completeServiceRequest(@Req() request: Request, @Param('id') id: string) {
        this.assertAuthorized(request);
        return this.adminService.completeServiceRequest(Number(id));
    }

    @Post('api/service-requests/:id/cancel')
    cancelServiceRequest(@Req() request: Request, @Param('id') id: string) {
        this.assertAuthorized(request);
        return this.adminService.cancelServiceRequest(Number(id));
    }

    @Get('api/activities')
    getActivities(@Req() request: Request, @Query('userId') userId?: string, @Query('organizationId') organizationId?: string) {
        this.assertAuthorized(request);
        return this.adminService.getActivities(userId ? Number(userId) : undefined, organizationId ? Number(organizationId) : undefined);
    }

    @Get('api/organizations')
    getOrganizations(@Req() request: Request) {
        this.assertAuthorized(request);
        return this.adminService.getOrganizations();
    }

    @Get('api/organizations/:id/assets')
    getOrganizationAssets(@Req() request: Request, @Param('id') id: string) {
        this.assertAuthorized(request);
        return this.adminService.getOrganizationAssets(Number(id));
    }

    @Get('api/tickets/:id')
    getTicket(@Req() request: Request, @Param('id') id: string) {
        this.assertAuthorized(request);
        return this.adminService.getTicket(Number(id));
    }

    @Post('api/registrations/:id/process')
    processRegistration(@Req() request: Request, @Param('id') id: string) {
        this.assertAuthorized(request);
        return this.adminService.processRegistration(Number(id));
    }

    @Post('api/bids/:id/process')
    processBid(@Req() request: Request, @Param('id') id: string) {
        this.assertAuthorized(request);
        return this.adminService.processBid(Number(id));
    }

    @Post('api/tickets/:id/reply')
    replyToTicket(@Req() request: Request, @Param('id') id: string, @Body('text') text?: string) {
        this.assertAuthorized(request);
        if (!text?.trim()) {
            throw new BadRequestException('Reply text is required');
        }

        return this.adminService.replyToTicket(Number(id), text.trim(), 'admin-panel');
    }

    @Post('api/tickets/:id/messages')
    sendTicketMessage(@Req() request: Request, @Param('id') id: string, @Body('text') text?: string) {
        this.assertAuthorized(request);
        if (!text?.trim()) {
            throw new BadRequestException('Message text is required');
        }

        return this.adminService.sendTicketMessage(Number(id), text.trim(), 'admin-panel');
    }

    @Post('api/tickets/:id/media')
    @UseInterceptors(FileInterceptor('file'))
    sendTicketMedia(@Req() request: Request, @Param('id') id: string, @UploadedFile() file?: any, @Body('text') text?: string) {
        this.assertAuthorized(request);
        if (!file) {
            throw new BadRequestException('File is required');
        }

        const mediaDir = path.join(process.cwd(), 'storage', 'ticket-media');
        fs.mkdirSync(mediaDir, { recursive: true });
        const safeName = `${randomUUID()}-${file.originalname || 'file'}`;
        const filePath = path.join(mediaDir, safeName);
        fs.writeFileSync(filePath, file.buffer);

        return this.adminService.sendTicketMedia(Number(id), {
            messageType: this.detectMessageType(file.mimetype, file.originalname),
            localPath: filePath,
            fileName: file.originalname || safeName,
            mimeType: file.mimetype,
            fileSize: file.size,
            text: text?.trim() || undefined,
        });
    }

    @Get('api/ticket-messages/:id/file')
    async downloadTicketMessageFile(@Req() request: Request, @Param('id') id: string, @Query('token') token: string, @Res() response: Response) {
        this.assertAuthorized(request, token);
        const data = await this.adminService.getTicketMessage(Number(id));
        if (!data?.localPath || !fs.existsSync(data.localPath)) {
            throw new BadRequestException('File not found');
        }

        return response.download(data.localPath, data.fileName || `ticket_message_${id}`);
    }

    @Post('api/tickets/:id/close')
    closeTicket(@Req() request: Request, @Param('id') id: string) {
        this.assertAuthorized(request);
        return this.adminService.closeTicket(Number(id), 'admin-panel');
    }

    @Get('api/registrations/:id/pdf')
    async getRegistrationPdf(@Req() request: Request, @Param('id') id: string, @Query('token') token: string, @Res() response: Response) {
        this.assertAuthorized(request, token);
        const registration = await this.adminService.getRegistration(Number(id));
        if (!registration?.pdfPath || !fs.existsSync(registration.pdfPath)) {
            throw new BadRequestException('PDF not found');
        }

        return response.download(registration.pdfPath, `registration_${registration.id}.pdf`);
    }

    private assertAuthorized(request: Request, queryToken?: string) {
        const expectedToken = this.configService.get<string>('ADMIN_TOKEN') || 'admin';
        const headerToken = request.header('x-admin-token');
        const bearerToken = request.header('authorization')?.replace(/^Bearer\s+/i, '');
        const actualToken = headerToken || bearerToken || queryToken;

        if (actualToken !== expectedToken) {
            throw new UnauthorizedException();
        }
    }

    private normalizeStatus(status?: AdminStatusFilter): AdminStatusFilter {
        if (status === 'all' || status === 'processed' || status === 'new') {
            return status;
        }

        return 'new';
    }

    private normalizePlatform(platform?: UserPlatform) {
        if (platform === 'telegram' || platform === 'max' || platform === 'web') {
            return platform;
        }

        return undefined;
    }

    private normalizeServiceRequestStatus(status?: ServiceRequestStatus | 'active' | 'all') {
        if (
            status === 'all' ||
            status === 'active' ||
            status === 'draft' ||
            status === 'price_confirmed' ||
            status === 'invoice_required' ||
            status === 'waiting_payment' ||
            status === 'paid' ||
            status === 'scheduled' ||
            status === 'completed' ||
            status === 'cancelled'
        ) {
            return status;
        }

        return 'active';
    }

    private detectMessageType(mimeType?: string, fileName?: string) {
        if (mimeType?.startsWith('image/')) return 'image';
        if (mimeType?.startsWith('video/')) return 'video';
        if (mimeType?.startsWith('audio/')) return 'audio';
        if (fileName?.toLowerCase().endsWith('.ogg')) return 'voice';

        return 'document';
    }
}
