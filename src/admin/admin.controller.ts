import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Header,
    Param,
    Post,
    Query,
    Req,
    Res,
    UnauthorizedException,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AdminService } from './admin.service';
import { adminPageHtml } from './admin.page';
import { AdminAuthService } from './admin-auth.service';
import {
    CurrentAdmin,
    PublicAdmin,
    RequireAnyPermission,
    RequirePermissions,
} from './admin-auth.decorators';
import {
    AdminPermissionGuard,
    AdminSessionGuard,
} from './admin-auth.guard';
import type { AdminPrincipal } from './admin-auth.types';
import {
    AdminIdParamDto,
    AdminLoginDto,
    CreateAdminUserDto,
    NotificationBindCodeDto,
    NotificationSettingsDto,
    ResetAdminPasswordDto,
    SetAdminActiveDto,
    SetAdminRolesDto,
} from './dto/admin-auth.dto';
import {
    ActivityQueryDto,
    AdminListQueryDto,
    AssignEngineerDto,
    CustomerContextQueryDto,
    EquipmentKitDto,
    InvoiceReferenceDto,
    LinkEquipmentKitDto,
    OptionalMediaTextDto,
    PositiveIdParamDto,
    RegistrationOperatorStateDto,
    ScheduleServiceRequestDto,
    SearchQueryDto,
    ServiceRequestListQueryDto,
    ServiceRequestOperatorStateDto,
    TextMessageDto,
} from './dto/admin-api.dto';
import { RateLimit } from 'src/security/rate-limit';

interface UploadedMemoryFile {
    buffer: Buffer;
    originalname?: string;
    mimetype?: string;
    size?: number;
}

@Controller('admin')
@ApiTags('admin')
@UseGuards(AdminSessionGuard, AdminPermissionGuard)
export class AdminController {
    constructor(
        private readonly adminService: AdminService,
        private readonly authService: AdminAuthService,
        private readonly config: ConfigService,
    ) {}

    @Get()
    @PublicAdmin()
    @Header('Content-Type', 'text/html; charset=utf-8')
    @Header('Cache-Control', 'no-store')
    getPage() {
        const reactPagePath = path.join(
            process.cwd(),
            'admin-ui',
            'dist',
            'index.html',
        );
        return fs.existsSync(reactPagePath)
            ? fs.readFileSync(reactPagePath, 'utf8')
            : adminPageHtml;
    }

    @Get('admin.js')
    @PublicAdmin()
    getReactScript(@Res() response: Response) {
        return response.sendFile(
            path.join(process.cwd(), 'admin-ui', 'dist', 'admin.js'),
        );
    }

    @Get('admin.css')
    @PublicAdmin()
    getReactStyles(@Res() response: Response) {
        return response.sendFile(
            path.join(process.cwd(), 'admin-ui', 'dist', 'admin.css'),
        );
    }

    @Get('api/me')
    getCurrentAdmin(@CurrentAdmin() admin: AdminPrincipal) {
        return { admin };
    }

    @Post('api/login')
    @PublicAdmin()
    @RateLimit('admin-login', 10, 60)
    async login(
        @Body() body: AdminLoginDto,
        @Res({ passthrough: true }) response: Response,
    ) {
        const result = await this.authService.login(body.login, body.password);
        if (!result) {
            throw new UnauthorizedException('Invalid login or password');
        }
        response.cookie(
            this.authService.getSessionCookieName(),
            result.token,
            this.sessionCookieOptions(result.expiresAt),
        );
        return { admin: result.admin };
    }

    @Post('api/logout')
    async logout(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ) {
        await this.authService.logout(
            this.getCookie(
                request,
                this.authService.getSessionCookieName(),
            ),
        );
        response.clearCookie(
            this.authService.getSessionCookieName(),
            this.sessionCookieOptions(),
        );
        return { ok: true };
    }

    @Get('api/staff')
    @RequirePermissions('staff.roles.manage')
    listStaff() {
        return this.authService.listStaff();
    }

    @Get('api/staff/engineers')
    @RequirePermissions('staff.read')
    listEngineers() {
        return this.authService.listActiveEngineers();
    }

    @Post('api/staff')
    @RequirePermissions('staff.create')
    createStaff(@Body() body: CreateAdminUserDto) {
        return this.authService.createStaff(body);
    }

    @Post('api/staff/:id/roles')
    @RequirePermissions('staff.roles.manage')
    setStaffRoles(
        @Param() params: AdminIdParamDto,
        @Body() body: SetAdminRolesDto,
    ) {
        return this.authService.setRoles(Number(params.id), body.roles);
    }

    @Post('api/staff/:id/active')
    @RequirePermissions('staff.update')
    setStaffActive(
        @Param() params: AdminIdParamDto,
        @Body() body: SetAdminActiveDto,
    ) {
        return this.authService.setActive(Number(params.id), body.isActive);
    }

    @Post('api/staff/:id/password')
    @RequirePermissions('staff.update')
    resetStaffPassword(
        @Param() params: AdminIdParamDto,
        @Body() body: ResetAdminPasswordDto,
    ) {
        return this.authService.resetPassword(
            Number(params.id),
            body.password,
        );
    }

    @Post('api/staff/:id/sessions/revoke')
    @RequirePermissions('staff.sessions.revoke')
    revokeStaffSessions(@Param() params: AdminIdParamDto) {
        return this.authService.revokeAllSessions(Number(params.id));
    }

    @Get('api/notification-bindings')
    getNotificationBindings(@CurrentAdmin() admin: AdminPrincipal) {
        return this.adminService.getNotificationBindings(admin.id);
    }

    @Post('api/notification-bindings/code')
    createNotificationBindCode(
        @CurrentAdmin() admin: AdminPrincipal,
        @Body() body: NotificationBindCodeDto,
    ) {
        return this.adminService.createMessengerBindCode(
            admin.id,
            body.platform,
        );
    }

    @Post('api/notification-bindings/settings')
    updateNotificationSettings(
        @CurrentAdmin() admin: AdminPrincipal,
        @Body() body: NotificationSettingsDto,
    ) {
        return this.adminService.updateNotificationSettings(admin.id, body);
    }

    @Get('api/summary')
    getSummary(@CurrentAdmin() admin: AdminPrincipal) {
        return this.adminService.getSummary(admin);
    }

    @Get('api/registrations')
    @RequirePermissions('registrations.read')
    getRegistrations(@Query() query: AdminListQueryDto) {
        return this.adminService.getRegistrations(
            query.status || 'new',
            query.platform,
            query.priority,
        );
    }

    @Get('api/registrations/:id')
    @RequirePermissions('registrations.read')
    getRegistration(@Param() params: PositiveIdParamDto) {
        return this.adminService.getRegistration(Number(params.id));
    }

    @Get('api/tickets')
    @RequirePermissions('tickets.read')
    getTickets(@Query() query: AdminListQueryDto) {
        return this.adminService.getTickets(
            query.status || 'new',
            query.platform,
        );
    }

    @Get('api/service-requests')
    @RequireAnyPermission(
        'serviceRequests.read.all',
        'serviceRequests.read.assigned',
    )
    getServiceRequests(
        @CurrentAdmin() admin: AdminPrincipal,
        @Query() query: ServiceRequestListQueryDto,
    ) {
        return this.adminService.getServiceRequestsForAdmin(
            admin,
            query.status || 'active',
            query.platform,
        );
    }

    @Get('api/service-requests/:id')
    @RequireAnyPermission(
        'serviceRequests.read.all',
        'serviceRequests.read.assigned',
    )
    getServiceRequest(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
    ) {
        return this.adminService.getServiceRequestDetailsForAdmin(
            admin,
            Number(params.id),
        );
    }

    @Post('api/service-requests/:id/assign-engineer')
    @RequirePermissions('serviceRequests.assign')
    assignEngineer(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @Body() body: AssignEngineerDto,
    ) {
        return this.adminService.assignEngineer(
            Number(params.id),
            body.assignedEngineerId,
            admin.displayName,
        );
    }

    @Get('api/customer-context')
    @RequirePermissions('organizations.read')
    getCustomerContext(@Query() query: CustomerContextQueryDto) {
        return this.adminService.getCustomerContext(query);
    }

    @Get('api/customer-card')
    @RequirePermissions('organizations.read')
    getCustomerCard(@Query() query: CustomerContextQueryDto) {
        return this.adminService.getCustomerCard(query);
    }

    @Post('api/service-requests/:id/invoice')
    @RequirePermissions('serviceRequests.invoice')
    attachServiceRequestInvoice(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @Body() body: InvoiceReferenceDto,
    ) {
        return this.adminService.attachServiceRequestInvoice(
            Number(params.id),
            body.invoiceFileId,
            body.invoiceFileName,
            admin.displayName,
        );
    }

    @Post('api/service-requests/:id/invoice-file')
    @RequirePermissions('serviceRequests.invoice')
    @UseInterceptors(FileInterceptor('file'))
    async attachServiceRequestInvoiceFile(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @UploadedFile() file?: UploadedMemoryFile,
    ) {
        if (!file) throw new BadRequestException('PDF file is required');
        if (file.mimetype !== 'application/pdf') {
            throw new BadRequestException('Only PDF files are supported');
        }
        const invoicesDir = path.join(process.cwd(), 'storage', 'invoices');
        fs.mkdirSync(invoicesDir, { recursive: true });
        const filePath = path.join(invoicesDir, `${randomUUID()}.pdf`);
        fs.writeFileSync(filePath, file.buffer);
        return this.adminService.attachServiceRequestInvoice(
            Number(params.id),
            filePath,
            file.originalname || `invoice_${params.id}.pdf`,
            admin.displayName,
        );
    }

    @Get('api/service-requests/:id/invoice')
    @RequirePermissions('serviceRequests.read.all')
    async downloadServiceRequestInvoice(
        @Param() params: PositiveIdParamDto,
        @Res() response: Response,
    ) {
        const details = await this.adminService.getServiceRequest(
            Number(params.id),
        );
        const invoicePath = details.request.invoiceFileId;
        if (!invoicePath || !fs.existsSync(invoicePath)) {
            throw new BadRequestException('Invoice PDF not found');
        }
        return response.download(
            invoicePath,
            details.request.invoiceFileName || `invoice_${params.id}.pdf`,
        );
    }

    @Get('api/service-requests/:id/signed-consent')
    @RequirePermissions('serviceRequests.read.all')
    async downloadServiceRequestSignedConsent(
        @Param() params: PositiveIdParamDto,
        @Res() response: Response,
    ) {
        const details = await this.adminService.getServiceRequest(
            Number(params.id),
        );
        const answers = details.request.answers || {};
        const filePath =
            typeof answers.signedConsentPath === 'string'
                ? answers.signedConsentPath
                : '';
        const fileName =
            typeof answers.signedConsentName === 'string'
                ? answers.signedConsentName
                : `signed_consent_${params.id}`;
        if (!filePath || !fs.existsSync(filePath)) {
            throw new BadRequestException('Signed consent file not found');
        }
        return response.download(filePath, fileName);
    }

    @Post('api/service-requests/:id/payment-received')
    @RequirePermissions('serviceRequests.payment')
    markServiceRequestPaymentReceived(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
    ) {
        return this.adminService.markServiceRequestPaymentReceived(
            Number(params.id),
            admin.displayName,
        );
    }

    @Post('api/service-requests/:id/schedule')
    @RequirePermissions('serviceRequests.schedule')
    scheduleServiceRequestVisit(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @Body() body: ScheduleServiceRequestDto,
    ) {
        return this.adminService.scheduleServiceRequestVisit(
            Number(params.id),
            body.visitAddress,
            body.visitTime,
            body.operatorComment,
            admin.displayName,
        );
    }

    @Post('api/service-requests/:id/complete')
    @RequirePermissions('serviceRequests.close')
    completeServiceRequest(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
    ) {
        return this.adminService.completeServiceRequest(
            Number(params.id),
            admin.displayName,
        );
    }

    @Post('api/service-requests/:id/cancel')
    @RequirePermissions('serviceRequests.close')
    cancelServiceRequest(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
    ) {
        return this.adminService.cancelServiceRequest(
            Number(params.id),
            admin.displayName,
        );
    }

    @Post('api/service-requests/:id/operator-state')
    @RequirePermissions('serviceRequests.update')
    updateServiceRequestOperatorState(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @Body() body: ServiceRequestOperatorStateDto,
    ) {
        return this.adminService.updateServiceRequestOperatorState(
            Number(params.id),
            body,
            admin.displayName,
        );
    }

    @Get('api/activities')
    @RequirePermissions('organizations.read')
    getActivities(@Query() query: ActivityQueryDto) {
        return this.adminService.getActivities(
            query.userId,
            query.organizationId,
        );
    }

    @Get('api/organizations')
    @RequirePermissions('organizations.read')
    getOrganizations() {
        return this.adminService.getOrganizations();
    }

    @Get('api/equipment-kits')
    @RequirePermissions('assets.read')
    getEquipmentKits(@Query() query: SearchQueryDto) {
        return this.adminService.getEquipmentKits(query.q);
    }

    @Get('api/equipment-kits/free')
    @RequirePermissions('assets.read')
    getFreeEquipmentKits(@Query() query: SearchQueryDto) {
        return this.adminService.getFreeEquipmentKits(query.q);
    }

    @Post('api/equipment-kits')
    @RequirePermissions('assets.update')
    createEquipmentKit(@Body() body: EquipmentKitDto) {
        return this.adminService.createEquipmentKit(body);
    }

    @Post('api/registrations/:id/equipment-kit')
    @RequirePermissions('registrations.update')
    linkEquipmentKitToRegistration(
        @Param() params: PositiveIdParamDto,
        @Body() body: LinkEquipmentKitDto,
    ) {
        return this.adminService.linkEquipmentKitToRegistration(
            Number(params.id),
            body.kitId,
        );
    }

    @Get('api/organizations/:id/assets')
    @RequirePermissions('assets.read')
    getOrganizationAssets(@Param() params: PositiveIdParamDto) {
        return this.adminService.getOrganizationAssets(Number(params.id));
    }

    @Get('api/tickets/:id')
    @RequirePermissions('tickets.read')
    getTicket(@Param() params: PositiveIdParamDto) {
        return this.adminService.getTicket(Number(params.id));
    }

    @Post('api/registrations/:id/process')
    @RequirePermissions('registrations.update')
    processRegistration(@Param() params: PositiveIdParamDto) {
        return this.adminService.processRegistration(Number(params.id));
    }

    @Post('api/registrations/:id/operator-state')
    @RequirePermissions('registrations.update')
    updateRegistrationOperatorState(
        @Param() params: PositiveIdParamDto,
        @Body() body: RegistrationOperatorStateDto,
    ) {
        return this.adminService.updateRegistrationOperatorState(
            Number(params.id),
            body,
        );
    }

    @Post('api/tickets/:id/reply')
    @RequirePermissions('tickets.reply')
    replyToTicket(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @Body() body: TextMessageDto,
    ) {
        return this.adminService.replyToTicket(
            Number(params.id),
            body.text,
            admin.displayName,
        );
    }

    @Post('api/tickets/:id/messages')
    @RequirePermissions('tickets.reply')
    sendTicketMessage(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @Body() body: TextMessageDto,
    ) {
        return this.adminService.sendTicketMessage(
            Number(params.id),
            body.text,
            admin.displayName,
        );
    }

    @Post('api/tickets/:id/media')
    @RequirePermissions('tickets.reply')
    @UseInterceptors(FileInterceptor('file'))
    async sendTicketMedia(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @UploadedFile() file?: UploadedMemoryFile,
        @Body() body?: OptionalMediaTextDto,
    ) {
        if (!file) throw new BadRequestException('File is required');
        const mediaDir = path.join(
            process.cwd(),
            'storage',
            'ticket-media',
        );
        fs.mkdirSync(mediaDir, { recursive: true });
        const safeName = `${randomUUID()}-${file.originalname || 'file'}`;
        const filePath = path.join(mediaDir, safeName);
        fs.writeFileSync(filePath, file.buffer);
        return this.adminService.sendTicketMedia(
            Number(params.id),
            {
                messageType: this.detectMessageType(
                    file.mimetype,
                    file.originalname,
                ),
                localPath: filePath,
                fileName: file.originalname || safeName,
                mimeType: file.mimetype,
                fileSize: file.size,
                text: body?.text,
            },
            admin.displayName,
        );
    }

    @Get('api/ticket-messages/:id/file')
    @RequirePermissions('tickets.read')
    async downloadTicketMessageFile(
        @Param() params: PositiveIdParamDto,
        @Res() response: Response,
    ) {
        const data = await this.adminService.getTicketMessage(
            Number(params.id),
        );
        if (!data?.localPath || !fs.existsSync(data.localPath)) {
            throw new BadRequestException('File not found');
        }
        return response.download(
            data.localPath,
            data.fileName || `ticket_message_${params.id}`,
        );
    }

    @Post('api/tickets/:id/close')
    @RequirePermissions('tickets.close')
    closeTicket(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
    ) {
        return this.adminService.closeTicket(
            Number(params.id),
            admin.displayName,
        );
    }

    @Get('api/registrations/:id/pdf')
    @RequirePermissions('registrations.read')
    async getRegistrationPdf(
        @Param() params: PositiveIdParamDto,
        @Res() response: Response,
    ) {
        const registration = await this.adminService.getRegistration(
            Number(params.id),
        );
        if (!registration?.pdfPath || !fs.existsSync(registration.pdfPath)) {
            throw new BadRequestException('PDF not found');
        }
        return response.download(
            registration.pdfPath,
            `registration_${registration.id}.pdf`,
        );
    }

    @Get('api/registrations/:id/equipment-photo')
    @RequirePermissions('registrations.read')
    async getRegistrationEquipmentPhoto(
        @Param() params: PositiveIdParamDto,
        @Res() response: Response,
    ) {
        const registration = await this.adminService.getRegistration(
            Number(params.id),
        );
        if (
            !registration?.equipmentPhotoPath ||
            !fs.existsSync(registration.equipmentPhotoPath)
        ) {
            throw new BadRequestException('Equipment photo not found');
        }
        return response.download(
            registration.equipmentPhotoPath,
            registration.equipmentPhotoName ||
                `registration_${registration.id}_equipment_photo`,
        );
    }

    private getCookie(request: Request, name: string) {
        const prefix = `${name}=`;
        const item = (request.header('cookie') || '')
            .split(';')
            .map((part) => part.trim())
            .find((part) => part.startsWith(prefix));
        return item ? decodeURIComponent(item.slice(prefix.length)) : null;
    }

    private sessionCookieOptions(expires?: Date) {
        return {
            httpOnly: true,
            sameSite: 'strict' as const,
            secure: this.config.get<string>('NODE_ENV') === 'production',
            path: '/admin',
            ...(expires ? { expires } : {}),
        };
    }

    private detectMessageType(mimeType?: string, fileName?: string) {
        const mime = mimeType?.toLowerCase() || '';
        const extension = path.extname(fileName || '').toLowerCase();
        if (mime.startsWith('image/')) return 'image' as const;
        if (mime.startsWith('video/')) return 'video' as const;
        if (mime.startsWith('audio/')) return 'audio' as const;
        if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension)) {
            return 'image' as const;
        }
        if (['.mp4', '.mov', '.webm'].includes(extension)) {
            return 'video' as const;
        }
        if (['.mp3', '.wav', '.ogg', '.m4a'].includes(extension)) {
            return 'audio' as const;
        }
        return 'document' as const;
    }
}
