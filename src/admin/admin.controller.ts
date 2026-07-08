import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { BadRequestException, Body, Controller, Get, Header, Param, Post, Query, Req, Res, UnauthorizedException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { UserPlatform } from 'src/users/entities/user.entity';
import type { ServiceRequestPriority, ServiceRequestStatus } from 'src/service-requests/entities/service-request.entity';
import type { RegistrationRequestPriority, RegistrationRequestStatus } from 'src/registrations/entities/registration.entity';
import { AdminService } from './admin.service';
import type { AdminStatusFilter } from './admin.service';
import { adminPageHtml } from './admin.page';

@Controller('admin')
@ApiTags('admin')
@ApiSecurity('admin-token')
export class AdminController {
    private readonly sessionCookieName = 'admin_session';

    constructor(
        private readonly adminService: AdminService,
        private readonly configService: ConfigService,
    ) { }

    @Get()
    @Header('Content-Type', 'text/html; charset=utf-8')
    getPage() {
        return adminPageHtml;
    }

    @Get('api/me')
    async getCurrentAdmin(@Req() request: Request) {
        const admin = await this.getSessionAdmin(request);
        if (!admin) {
            throw new UnauthorizedException();
        }

        return { admin };
    }

    @Post('api/login')
    async login(@Body('login') login: string, @Body('password') password: string, @Res({ passthrough: true }) response: Response) {
        if (!login?.trim() || !password) {
            throw new BadRequestException('Login and password are required');
        }

        const result = await this.adminService.loginAdmin(login, password);
        if (!result) {
            throw new UnauthorizedException();
        }

        response.setHeader('Set-Cookie', this.buildSessionCookie(result.token, result.expiresAt));
        return { admin: result.admin };
    }

    @Post('api/logout')
    async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
        await this.adminService.logoutAdmin(this.getCookie(request, this.sessionCookieName));
        response.setHeader('Set-Cookie', this.buildExpiredSessionCookie());
        return { ok: true };
    }

    @Get('api/notification-bindings')
    async getNotificationBindings(@Req() request: Request) {
        const admin = await this.getSessionAdmin(request);
        if (!admin) throw new UnauthorizedException();

        return this.adminService.getNotificationBindings(admin.id);
    }

    @Post('api/notification-bindings/code')
    async createNotificationBindCode(@Req() request: Request, @Body('platform') platform?: 'telegram' | 'max') {
        const admin = await this.getSessionAdmin(request);
        if (!admin) throw new UnauthorizedException();
        if (platform !== 'telegram' && platform !== 'max') {
            throw new BadRequestException('platform must be telegram or max');
        }

        return this.adminService.createMessengerBindCode(admin.id, platform);
    }

    @Post('api/notification-bindings/settings')
    async updateNotificationSettings(
        @Req() request: Request,
        @Body('notifyRegistrations') notifyRegistrations?: boolean,
        @Body('notifyTickets') notifyTickets?: boolean,
        @Body('notifyServiceRequests') notifyServiceRequests?: boolean,
    ) {
        const admin = await this.getSessionAdmin(request);
        if (!admin) throw new UnauthorizedException();

        return this.adminService.updateNotificationSettings(admin.id, {
            ...(notifyRegistrations !== undefined ? { notifyRegistrations } : {}),
            ...(notifyTickets !== undefined ? { notifyTickets } : {}),
            ...(notifyServiceRequests !== undefined ? { notifyServiceRequests } : {}),
        });
    }

    @Get('api/summary')
    async getSummary(@Req() request: Request) {
        await this.assertAuthorized(request);
        return this.adminService.getSummary();
    }

    @Get('api/registrations')
    async getRegistrations(
        @Req() request: Request,
        @Query('status') status?: AdminStatusFilter,
        @Query('platform') platform?: UserPlatform,
        @Query('priority') priority?: RegistrationRequestPriority,
    ) {
        await this.assertAuthorized(request);
        return this.adminService.getRegistrations(this.normalizeStatus(status), this.normalizePlatform(platform), this.normalizeRegistrationPriority(priority));
    }

    @Get('api/tickets')
    async getTickets(@Req() request: Request, @Query('status') status?: AdminStatusFilter, @Query('platform') platform?: UserPlatform) {
        await this.assertAuthorized(request);
        return this.adminService.getTickets(this.normalizeStatus(status), this.normalizePlatform(platform));
    }

    @Get('api/service-requests')
    async getServiceRequests(@Req() request: Request, @Query('status') status?: ServiceRequestStatus | 'active' | 'all', @Query('platform') platform?: UserPlatform) {
        await this.assertAuthorized(request);
        return this.adminService.getServiceRequests(this.normalizeServiceRequestStatus(status), this.normalizePlatform(platform));
    }

    @Get('api/service-requests/:id')
    async getServiceRequest(@Req() request: Request, @Param('id') id: string) {
        await this.assertAuthorized(request);
        return this.adminService.getServiceRequestDetails(Number(id));
    }

    @Get('api/customer-context')
    async getCustomerContext(
        @Req() request: Request,
        @Query('userId') userId?: string,
        @Query('organizationId') organizationId?: string,
        @Query('platform') platform?: UserPlatform,
        @Query('chatId') chatId?: string,
    ) {
        await this.assertAuthorized(request);
        return this.adminService.getCustomerContext({
            userId: userId ? Number(userId) : undefined,
            organizationId: organizationId ? Number(organizationId) : undefined,
            platform: this.normalizePlatform(platform),
            chatId,
        });
    }

    @Get('api/customer-card')
    async getCustomerCard(
        @Req() request: Request,
        @Query('userId') userId?: string,
        @Query('organizationId') organizationId?: string,
        @Query('platform') platform?: UserPlatform,
        @Query('chatId') chatId?: string,
    ) {
        await this.assertAuthorized(request);
        return this.adminService.getCustomerCard({
            userId: userId ? Number(userId) : undefined,
            organizationId: organizationId ? Number(organizationId) : undefined,
            platform: this.normalizePlatform(platform),
            chatId,
        });
    }

    @Post('api/service-requests/:id/invoice')
    async attachServiceRequestInvoice(@Req() request: Request, @Param('id') id: string, @Body('invoiceFileId') invoiceFileId?: string, @Body('invoiceFileName') invoiceFileName?: string) {
        const actor = await this.assertAuthorized(request);
        if (!invoiceFileId?.trim()) {
            throw new BadRequestException('invoiceFileId is required');
        }

        return this.adminService.attachServiceRequestInvoice(Number(id), invoiceFileId.trim(), invoiceFileName?.trim() || undefined, actor);
    }

    @Post('api/service-requests/:id/invoice-file')
    @UseInterceptors(FileInterceptor('file'))
    async attachServiceRequestInvoiceFile(@Req() request: Request, @Param('id') id: string, @UploadedFile() file?: any) {
        const actor = await this.assertAuthorized(request);
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

        return this.adminService.attachServiceRequestInvoice(Number(id), filePath, file.originalname || `invoice_${id}.pdf`, actor);
    }

    @Get('api/service-requests/:id/invoice')
    async downloadServiceRequestInvoice(@Req() request: Request, @Param('id') id: string, @Query('token') token: string, @Res() response: Response) {
        await this.assertAuthorized(request, token);
        const details = await this.adminService.getServiceRequest(Number(id));
        const invoicePath = details.request.invoiceFileId;
        if (!invoicePath || !fs.existsSync(invoicePath)) {
            throw new BadRequestException('Invoice PDF not found');
        }

        return response.download(invoicePath, details.request.invoiceFileName || `invoice_${id}.pdf`);
    }

    @Post('api/service-requests/:id/payment-received')
    async markServiceRequestPaymentReceived(@Req() request: Request, @Param('id') id: string) {
        const actor = await this.assertAuthorized(request);
        return this.adminService.markServiceRequestPaymentReceived(Number(id), actor);
    }

    @Post('api/service-requests/:id/schedule')
    async scheduleServiceRequestVisit(@Req() request: Request, @Param('id') id: string, @Body('visitAddress') visitAddress?: string, @Body('visitTime') visitTime?: string, @Body('operatorComment') operatorComment?: string) {
        const actor = await this.assertAuthorized(request);
        if (!visitAddress?.trim()) {
            throw new BadRequestException('visitAddress is required');
        }

        return this.adminService.scheduleServiceRequestVisit(Number(id), visitAddress.trim(), visitTime?.trim() || undefined, operatorComment?.trim() || undefined, actor);
    }

    @Post('api/service-requests/:id/complete')
    async completeServiceRequest(@Req() request: Request, @Param('id') id: string) {
        const actor = await this.assertAuthorized(request);
        return this.adminService.completeServiceRequest(Number(id), actor);
    }

    @Post('api/service-requests/:id/cancel')
    async cancelServiceRequest(@Req() request: Request, @Param('id') id: string) {
        const actor = await this.assertAuthorized(request);
        return this.adminService.cancelServiceRequest(Number(id), actor);
    }

    @Post('api/service-requests/:id/operator-state')
    async updateServiceRequestOperatorState(
        @Req() request: Request,
        @Param('id') id: string,
        @Body('priority') priority?: ServiceRequestPriority,
        @Body('executorName') executorName?: string | null,
        @Body('operatorComment') operatorComment?: string | null,
    ) {
        const actor = await this.assertAuthorized(request);
        return this.adminService.updateServiceRequestOperatorState(Number(id), {
            ...(priority !== undefined ? { priority } : {}),
            ...(executorName !== undefined ? { executorName } : {}),
            ...(operatorComment !== undefined ? { operatorComment } : {}),
        }, actor);
    }

    @Get('api/activities')
    async getActivities(@Req() request: Request, @Query('userId') userId?: string, @Query('organizationId') organizationId?: string) {
        await this.assertAuthorized(request);
        return this.adminService.getActivities(userId ? Number(userId) : undefined, organizationId ? Number(organizationId) : undefined);
    }

    @Get('api/organizations')
    async getOrganizations(@Req() request: Request) {
        await this.assertAuthorized(request);
        return this.adminService.getOrganizations();
    }

    @Get('api/equipment-kits')
    async getEquipmentKits(@Req() request: Request, @Query('q') query?: string) {
        await this.assertAuthorized(request);
        return this.adminService.getEquipmentKits(query);
    }

    @Post('api/equipment-kits')
    async createEquipmentKit(@Req() request: Request, @Body() body: any) {
        await this.assertAuthorized(request);
        return this.adminService.createEquipmentKit(body || {});
    }

    @Post('api/registrations/:id/equipment-kit')
    async linkEquipmentKitToRegistration(@Req() request: Request, @Param('id') id: string, @Body('kitId') kitId?: number) {
        await this.assertAuthorized(request);
        if (!kitId) throw new BadRequestException('kitId is required');
        return this.adminService.linkEquipmentKitToRegistration(Number(id), Number(kitId));
    }

    @Get('api/organizations/:id/assets')
    async getOrganizationAssets(@Req() request: Request, @Param('id') id: string) {
        await this.assertAuthorized(request);
        return this.adminService.getOrganizationAssets(Number(id));
    }

    @Get('api/tickets/:id')
    async getTicket(@Req() request: Request, @Param('id') id: string) {
        await this.assertAuthorized(request);
        return this.adminService.getTicket(Number(id));
    }

    @Post('api/registrations/:id/process')
    async processRegistration(@Req() request: Request, @Param('id') id: string) {
        await this.assertAuthorized(request);
        return this.adminService.processRegistration(Number(id));
    }

    @Post('api/registrations/:id/operator-state')
    async updateRegistrationOperatorState(
        @Req() request: Request,
        @Param('id') id: string,
        @Body('status') status?: RegistrationRequestStatus,
        @Body('priority') priority?: RegistrationRequestPriority,
    ) {
        await this.assertAuthorized(request);
        return this.adminService.updateRegistrationOperatorState(Number(id), {
            ...(this.normalizeRegistrationStatus(status) ? { status: this.normalizeRegistrationStatus(status) } : {}),
            ...(this.normalizeRegistrationPriority(priority) ? { priority: this.normalizeRegistrationPriority(priority) } : {}),
        });
    }

    @Post('api/tickets/:id/reply')
    async replyToTicket(@Req() request: Request, @Param('id') id: string, @Body('text') text?: string) {
        const actor = await this.assertAuthorized(request);
        if (!text?.trim()) {
            throw new BadRequestException('Reply text is required');
        }

        return this.adminService.replyToTicket(Number(id), text.trim(), actor);
    }

    @Post('api/tickets/:id/messages')
    async sendTicketMessage(@Req() request: Request, @Param('id') id: string, @Body('text') text?: string) {
        const actor = await this.assertAuthorized(request);
        if (!text?.trim()) {
            throw new BadRequestException('Message text is required');
        }

        return this.adminService.sendTicketMessage(Number(id), text.trim(), actor);
    }

    @Post('api/tickets/:id/media')
    @UseInterceptors(FileInterceptor('file'))
    async sendTicketMedia(@Req() request: Request, @Param('id') id: string, @UploadedFile() file?: any, @Body('text') text?: string) {
        const actor = await this.assertAuthorized(request);
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
        }, actor);
    }

    @Get('api/ticket-messages/:id/file')
    async downloadTicketMessageFile(@Req() request: Request, @Param('id') id: string, @Query('token') token: string, @Res() response: Response) {
        await this.assertAuthorized(request, token);
        const data = await this.adminService.getTicketMessage(Number(id));
        if (!data?.localPath || !fs.existsSync(data.localPath)) {
            throw new BadRequestException('File not found');
        }

        return response.download(data.localPath, data.fileName || `ticket_message_${id}`);
    }

    @Post('api/tickets/:id/close')
    async closeTicket(@Req() request: Request, @Param('id') id: string) {
        const actor = await this.assertAuthorized(request);
        return this.adminService.closeTicket(Number(id), actor);
    }

    @Get('api/registrations/:id/pdf')
    async getRegistrationPdf(@Req() request: Request, @Param('id') id: string, @Query('token') token: string, @Res() response: Response) {
        await this.assertAuthorized(request, token);
        const registration = await this.adminService.getRegistration(Number(id));
        if (!registration?.pdfPath || !fs.existsSync(registration.pdfPath)) {
            throw new BadRequestException('PDF not found');
        }

        return response.download(registration.pdfPath, `registration_${registration.id}.pdf`);
    }

    @Get('api/registrations/:id/equipment-photo')
    async getRegistrationEquipmentPhoto(@Req() request: Request, @Param('id') id: string, @Query('token') token: string, @Res() response: Response) {
        await this.assertAuthorized(request, token);
        const registration = await this.adminService.getRegistration(Number(id));
        if (!registration?.equipmentPhotoPath || !fs.existsSync(registration.equipmentPhotoPath)) {
            throw new BadRequestException('Equipment photo not found');
        }

        return response.download(registration.equipmentPhotoPath, registration.equipmentPhotoName || `registration_${registration.id}_equipment_photo`);
    }

    private async assertAuthorized(request: Request, queryToken?: string) {
        const sessionAdmin = await this.getSessionAdmin(request);
        if (sessionAdmin) {
            return sessionAdmin.displayName;
        }

        const expectedToken = this.configService.get<string>('ADMIN_TOKEN') || 'admin';
        const headerToken = request.header('x-admin-token');
        const bearerToken = request.header('authorization')?.replace(/^Bearer\s+/i, '');
        const actualToken = headerToken || bearerToken || queryToken;
        const configuredUser = actualToken ? this.getAdminUserByToken(actualToken) : null;

        if (configuredUser) {
            return configuredUser;
        }

        if (actualToken !== expectedToken) {
            throw new UnauthorizedException();
        }

        return this.configService.get<string>('ADMIN_NAME') || 'admin-panel';
    }

    private getSessionAdmin(request: Request) {
        return this.adminService.getAdminBySessionToken(this.getCookie(request, this.sessionCookieName));
    }

    private getCookie(request: Request, name: string) {
        const cookieHeader = request.header('cookie');
        if (!cookieHeader) return null;

        const cookies = cookieHeader.split(';').map((part) => part.trim());
        const prefix = `${name}=`;
        const cookie = cookies.find((part) => part.startsWith(prefix));
        return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
    }

    private buildSessionCookie(token: string, expiresAt: Date) {
        return `${this.sessionCookieName}=${encodeURIComponent(token)}; Path=/admin; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
    }

    private buildExpiredSessionCookie() {
        return `${this.sessionCookieName}=; Path=/admin; HttpOnly; SameSite=Lax; Max-Age=0`;
    }

    private getAdminUserByToken(token: string) {
        const users = this.configService.get<string>('ADMIN_USERS');
        if (!users) return null;

        return users
            .split(';')
            .map((item) => item.trim())
            .filter(Boolean)
            .map((item) => {
                const separatorIndex = item.indexOf('=');
                if (separatorIndex < 1) return null;
                return {
                    name: item.slice(0, separatorIndex).trim(),
                    token: item.slice(separatorIndex + 1).trim(),
                };
            })
            .find((item) => item?.token === token)?.name || null;
    }

    private normalizeStatus(status?: AdminStatusFilter): AdminStatusFilter {
        if (status === 'all' || status === 'processed' || status === 'new' || status === 'in_work') {
            return status;
        }

        return 'new';
    }

    private normalizeRegistrationStatus(status?: RegistrationRequestStatus) {
        if (status === 'new' || status === 'in_work' || status === 'processed') {
            return status;
        }

        return undefined;
    }

    private normalizeRegistrationPriority(priority?: RegistrationRequestPriority) {
        if (priority === 'low' || priority === 'normal' || priority === 'high' || priority === 'urgent') {
            return priority;
        }

        return undefined;
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
