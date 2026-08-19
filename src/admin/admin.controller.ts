import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    BadRequestException,
    Body,
    Controller,
    ForbiddenException,
    Get,
    Header,
    NotFoundException,
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
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
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
import type { AdminPermission } from './admin.permissions';
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
    AuditListQueryDto,
    AdminListQueryDto,
    AssignEngineerDto,
    CustomerContextQueryDto,
    EquipmentKitDto,
    InvoiceReferenceDto,
    LinkEquipmentKitDto,
    OptionalMediaTextDto,
    OrganizationAccessListQueryDto,
    OrganizationAccessReviewDto,
    PositiveIdParamDto,
    RegistrationOperatorStateDto,
    ScheduleServiceRequestDto,
    SearchQueryDto,
    ServiceRequestListQueryDto,
    ServiceRequestOperatorStateDto,
    TextMessageDto,
} from './dto/admin-api.dto';
import { RateLimit } from 'src/security/rate-limit';
import { FilesService } from 'src/files/files.service';
import { AuditService } from 'src/audit/audit.service';
import { UiServingService } from 'src/ui/ui-serving.service';
import { OrganizationAccessService } from 'src/organizations/organization-access.service';
import { OrganizationAccessAdminResponseDto } from 'src/organizations/dto/organization-api.dto';
import { CanonicalServiceRequestsService } from 'src/service-requests/canonical-service-requests.service';
import {
    AdminCreateServiceRequestDto,
    AdminServiceRequestMessageDto,
    AdminTransitionServiceRequestDto,
} from 'src/service-requests/dto/canonical-service-request.dto';

interface UploadedMemoryFile {
    buffer: Buffer;
    originalname?: string;
    mimetype?: string;
    size?: number;
}

@Controller('admin')
@ApiTags('admin')
@ApiCookieAuth('adminSession')
@UseGuards(AdminSessionGuard, AdminPermissionGuard)
export class AdminController {
    constructor(
        private readonly adminService: AdminService,
        private readonly authService: AdminAuthService,
        private readonly config: ConfigService,
        private readonly filesService: FilesService,
        private readonly auditService: AuditService,
        private readonly uiServing: UiServingService,
        private readonly organizationAccessService: OrganizationAccessService,
        private readonly canonicalServiceRequests: CanonicalServiceRequestsService,
    ) {}

    @Get()
    @PublicAdmin()
    @Header('Content-Type', 'text/html; charset=utf-8')
    @Header('Cache-Control', 'no-store')
    getPage() {
        return this.uiServing.getEntryHtml('admin', adminPageHtml);
    }

    @Get('admin.js')
    @PublicAdmin()
    getReactScript(@Res() response: Response) {
        return response.sendFile(this.uiServing.getAssetPath('admin', 'admin.js'));
    }

    @Get('admin.css')
    @PublicAdmin()
    getReactStyles(@Res() response: Response) {
        return response.sendFile(this.uiServing.getAssetPath('admin', 'admin.css'));
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
        @Req() request: Request,
    ) {
        const result = await this.authService.login(body.login, body.password);
        if (!result) {
            await this.auditService.record({
                actorType: 'system',
                action: 'admin.login',
                targetType: 'admin_user',
                result: 'failure',
                reason: 'invalid_credentials',
                requestId: request.header('x-request-id'),
                metadata: { login: body.login },
            });
            throw new UnauthorizedException('Invalid login or password');
        }
        await this.auditService.record({
            actorType: 'staff',
            actorStaffId: result.admin.id,
            actorSessionId: result.admin.sessionId,
            action: 'admin.login',
            targetType: 'admin_user',
            targetId: result.admin.id,
            requestId: request.header('x-request-id'),
        });
        response.cookie(
            this.authService.getSessionCookieName(),
            result.token,
            this.sessionCookieOptions(result.expiresAt),
        );
        return { admin: result.admin };
    }

    @Post('api/logout')
    async logout(
        @CurrentAdmin() admin: AdminPrincipal,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ) {
        await this.authService.logout(
            this.getCookie(
                request,
                this.authService.getSessionCookieName(),
            ),
        );
        await this.auditService.record({
            actorType: 'staff',
            actorStaffId: admin.id,
            actorSessionId: admin.sessionId,
            action: 'admin.logout',
            targetType: 'admin_session',
            targetId: admin.sessionId,
        });
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
    async createStaff(@CurrentAdmin() admin: AdminPrincipal, @Body() body: CreateAdminUserDto) {
        const staff = await this.authService.createStaff(body);
        await this.auditService.record({ actorType: 'staff', actorStaffId: admin.id, actorSessionId: admin.sessionId, action: 'staff.create', targetType: 'admin_user', targetId: staff.id, metadata: { roles: body.roles } });
        return staff;
    }

    @Post('api/staff/:id/roles')
    @RequirePermissions('staff.roles.manage')
    async setStaffRoles(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: AdminIdParamDto,
        @Body() body: SetAdminRolesDto,
    ) {
        const staff = await this.authService.setRoles(Number(params.id), body.roles);
        await this.auditService.record({ actorType: 'staff', actorStaffId: admin.id, actorSessionId: admin.sessionId, action: 'staff.roles.change', targetType: 'admin_user', targetId: params.id, metadata: { roles: body.roles } });
        return staff;
    }

    @Post('api/staff/:id/active')
    @RequirePermissions('staff.update')
    async setStaffActive(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: AdminIdParamDto,
        @Body() body: SetAdminActiveDto,
    ) {
        const staff = await this.authService.setActive(Number(params.id), body.isActive);
        await this.auditService.record({ actorType: 'staff', actorStaffId: admin.id, actorSessionId: admin.sessionId, action: 'staff.active.change', targetType: 'admin_user', targetId: params.id, metadata: { isActive: body.isActive } });
        return staff;
    }

    @Post('api/staff/:id/password')
    @RequirePermissions('staff.update')
    async resetStaffPassword(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: AdminIdParamDto,
        @Body() body: ResetAdminPasswordDto,
    ) {
        const result = await this.authService.resetPassword(
            Number(params.id),
            body.password,
        );
        await this.auditService.record({ actorType: 'staff', actorStaffId: admin.id, actorSessionId: admin.sessionId, action: 'staff.password.reset', targetType: 'admin_user', targetId: params.id });
        return result;
    }

    @Post('api/staff/:id/sessions/revoke')
    @RequirePermissions('staff.sessions.revoke')
    async revokeStaffSessions(@CurrentAdmin() admin: AdminPrincipal, @Param() params: AdminIdParamDto) {
        const result = await this.authService.revokeAllSessions(Number(params.id));
        await this.auditService.record({ actorType: 'staff', actorStaffId: admin.id, actorSessionId: admin.sessionId, action: 'staff.sessions.revoke', targetType: 'admin_user', targetId: params.id });
        return result;
    }

    @Get('api/audit-events')
    @RequirePermissions('audit.read')
    listAuditEvents(@Query() query: AuditListQueryDto) {
        return this.auditService.list({
            ...query,
            from: query.from ? new Date(query.from) : undefined,
            to: query.to ? new Date(query.to) : undefined,
        });
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

    @Post('api/service-requests/manual')
    @RequirePermissions('serviceRequests.update')
    async createManualServiceRequest(
        @CurrentAdmin() admin: AdminPrincipal,
        @Body() body: AdminCreateServiceRequestDto,
    ) {
        const result = await this.canonicalServiceRequests.createManual(
            admin.id,
            body,
        );
        await this.recordStaffAction(
            admin,
            'service_request.manual.create',
            'service_request',
            result.request.id,
            { source: body.source },
        );
        return result;
    }

    @Post('api/service-requests/:id/messages')
    @RequirePermissions('serviceRequests.update')
    async addServiceRequestMessage(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @Body() body: AdminServiceRequestMessageDto,
    ) {
        const result = await this.canonicalServiceRequests.addStaffMessage(
            admin.id,
            Number(params.id),
            body.text,
            body.visibility ?? 'customer',
        );
        await this.recordStaffAction(
            admin,
            'service_request.message.add',
            'service_request',
            params.id,
            { visibility: body.visibility ?? 'customer' },
        );
        return result;
    }

    @Post('api/service-requests/:id/transition')
    @RequirePermissions('serviceRequests.update')
    async transitionServiceRequest(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @Body() body: AdminTransitionServiceRequestDto,
    ) {
        const requiredPermission = this.serviceTransitionPermission(
            body.status,
        );
        if (!admin.permissions.includes(requiredPermission)) {
            await this.auditService.record({
                actorType: 'staff',
                actorStaffId: admin.id,
                actorSessionId: admin.sessionId,
                action: 'permission.denied',
                targetType: 'service_request',
                targetId: params.id,
                result: 'denied',
                metadata: { operation: 'status_transition' },
            });
            throw new ForbiddenException('Insufficient permissions');
        }
        const result = await this.canonicalServiceRequests.transitionByStaff(
            admin.id,
            Number(params.id),
            body.status,
            body.expectedVersion,
        );
        await this.recordStaffAction(
            admin,
            'service_request.status.transition',
            'service_request',
            params.id,
            { status: body.status },
        );
        return result;
    }

    private serviceTransitionPermission(
        status: AdminTransitionServiceRequestDto['status'],
    ): AdminPermission {
        if (['invoice_required', 'waiting_payment'].includes(status)) {
            return 'serviceRequests.invoice';
        }
        if (status === 'paid') return 'serviceRequests.payment';
        if (status === 'scheduled') return 'serviceRequests.schedule';
        if (['completed', 'closed', 'cancelled'].includes(status)) {
            return 'serviceRequests.close';
        }
        return 'serviceRequests.update';
    }

    @Post('api/service-requests/:id/assign-engineer')
    @RequirePermissions('serviceRequests.assign')
    async assignEngineer(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @Body() body: AssignEngineerDto,
    ) {
        const result = await this.adminService.assignEngineer(
            Number(params.id),
            body.assignedEngineerId,
            admin.displayName,
        );
        await this.recordStaffAction(admin, 'service_request.engineer.assign', 'service_request', params.id, { assignedEngineerId: body.assignedEngineerId });
        return result;
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
    async attachServiceRequestInvoice(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @Body() body: InvoiceReferenceDto,
    ) {
        const result = await this.adminService.attachServiceRequestInvoice(
            Number(params.id),
            body.invoiceFileId,
            body.invoiceFileName,
            admin.displayName,
        );
        await this.recordStaffAction(admin, 'service_request.invoice.attach', 'service_request', params.id);
        return result;
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
        const storedFile = await this.filesService.saveBuffer({
            purpose: 'service-invoice',
            buffer: file.buffer,
            originalName: file.originalname,
            mimeType: file.mimetype,
            createdByStaffId: admin.id,
            metadata: { serviceRequestId: Number(params.id) },
        });
        const result = await this.adminService.attachServiceRequestInvoice(
            Number(params.id),
            storedFile.objectKey,
            storedFile.originalName,
            admin.displayName,
            storedFile.id,
        );
        await this.recordStaffAction(admin, 'service_request.invoice.upload', 'service_request', params.id, { storedFileId: storedFile.id });
        return result;
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
        if (details.request.invoiceStoredFileId) {
            return this.sendStoredFile(response, details.request.invoiceStoredFileId);
        }
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
        if (details.request.signedConsentFileId) {
            return this.sendStoredFile(response, details.request.signedConsentFileId);
        }
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
    async markServiceRequestPaymentReceived(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
    ) {
        const result = await this.adminService.markServiceRequestPaymentReceived(
            Number(params.id),
            admin.displayName,
        );
        await this.recordStaffAction(admin, 'service_request.payment.confirm', 'service_request', params.id);
        return result;
    }

    @Get('api/service-requests/:id/payment-proof')
    @RequireAnyPermission(
        'serviceRequests.read.all',
        'serviceRequests.read.assigned',
    )
    async downloadServiceRequestPaymentProof(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @Res() response: Response,
    ) {
        const details =
            await this.adminService.getServiceRequestDetailsForAdmin(
                admin,
                Number(params.id),
            );
        if (!details.request.paymentProofFileId) {
            throw new BadRequestException('Payment proof was not found');
        }
        return this.sendStoredFile(
            response,
            details.request.paymentProofFileId,
            true,
        );
    }

    @Get('api/service-requests/:id/attachments/:attachmentId')
    @RequireAnyPermission(
        'serviceRequests.read.all',
        'serviceRequests.read.assigned',
    )
    async downloadServiceRequestAttachment(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param('id') id: string,
        @Param('attachmentId') attachmentId: string,
        @Res() response: Response,
    ) {
        await this.adminService.getServiceRequestDetailsForAdmin(
            admin,
            Number(id),
        );
        const { file, stream } =
            await this.canonicalServiceRequests.openAdminAttachment(
                Number(id),
                Number(attachmentId),
            );
        response.setHeader('Content-Type', file.mimeType);
        response.setHeader(
            'Content-Disposition',
            `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName || 'file')}`,
        );
        stream.pipe(response);
    }

    @Post('api/service-requests/:id/schedule')
    @RequirePermissions('serviceRequests.schedule')
    async scheduleServiceRequestVisit(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @Body() body: ScheduleServiceRequestDto,
    ) {
        const result = await this.adminService.scheduleServiceRequestVisit(
            Number(params.id),
            body.visitAddress,
            body.visitTime,
            body.operatorComment,
            admin.displayName,
        );
        await this.recordStaffAction(admin, 'service_request.visit.schedule', 'service_request', params.id);
        return result;
    }

    @Post('api/service-requests/:id/complete')
    @RequirePermissions('serviceRequests.close')
    async completeServiceRequest(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
    ) {
        const result = await this.adminService.completeServiceRequest(
            Number(params.id),
            admin.displayName,
        );
        await this.recordStaffAction(admin, 'service_request.complete', 'service_request', params.id);
        return result;
    }

    @Post('api/service-requests/:id/cancel')
    @RequirePermissions('serviceRequests.close')
    async cancelServiceRequest(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
    ) {
        const result = await this.adminService.cancelServiceRequest(
            Number(params.id),
            admin.displayName,
        );
        await this.recordStaffAction(admin, 'service_request.cancel', 'service_request', params.id);
        return result;
    }

    @Post('api/service-requests/:id/operator-state')
    @RequirePermissions('serviceRequests.update')
    async updateServiceRequestOperatorState(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @Body() body: ServiceRequestOperatorStateDto,
    ) {
        const result = await this.adminService.updateServiceRequestOperatorState(
            Number(params.id),
            body,
            admin.displayName,
        );
        await this.recordStaffAction(admin, 'service_request.operator_state.update', 'service_request', params.id, {
            priority: body.priority,
            executorAssigned: body.executorName !== undefined,
        });
        return result;
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

    @Get('api/organization-access-requests')
    @RequirePermissions('organizationAccess.read')
    @ApiOkResponse({ type: OrganizationAccessAdminResponseDto, isArray: true })
    getOrganizationAccessRequests(
        @Query() query: OrganizationAccessListQueryDto,
    ) {
        return this.organizationAccessService.listForAdmin(
            query.status ?? 'pending',
        );
    }

    @Get('api/organization-access-requests/:id')
    @RequirePermissions('organizationAccess.read')
    @ApiOkResponse({ type: OrganizationAccessAdminResponseDto })
    getOrganizationAccessRequest(@Param() params: PositiveIdParamDto) {
        return this.organizationAccessService.getForAdmin(Number(params.id));
    }

    @Post('api/organization-access-requests/:id/approve')
    @RequirePermissions('organizationAccess.review')
    @ApiOkResponse({ type: OrganizationAccessAdminResponseDto })
    approveOrganizationAccessRequest(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @Body() body: OrganizationAccessReviewDto,
    ) {
        return this.organizationAccessService.approve(
            Number(params.id),
            admin,
            body.reviewComment,
        );
    }

    @Post('api/organization-access-requests/:id/reject')
    @RequirePermissions('organizationAccess.review')
    @ApiOkResponse({ type: OrganizationAccessAdminResponseDto })
    rejectOrganizationAccessRequest(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @Body() body: OrganizationAccessReviewDto,
    ) {
        return this.organizationAccessService.reject(
            Number(params.id),
            admin,
            body.reviewComment,
        );
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
    async createEquipmentKit(
        @CurrentAdmin() admin: AdminPrincipal,
        @Body() body: EquipmentKitDto,
    ) {
        const result = await this.adminService.createEquipmentKit(body);
        await this.recordStaffAction(admin, 'equipment_kit.create', 'equipment_kit', result.id);
        return result;
    }

    @Post('api/registrations/:id/equipment-kit')
    @RequirePermissions('registrations.update')
    async linkEquipmentKitToRegistration(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @Body() body: LinkEquipmentKitDto,
    ) {
        const result = await this.adminService.linkEquipmentKitToRegistration(
            Number(params.id),
            body.kitId,
        );
        await this.recordStaffAction(admin, 'registration.equipment_kit.link', 'registration', params.id, {
            equipmentKitId: body.kitId,
        });
        return result;
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
    async processRegistration(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
    ) {
        const result = await this.adminService.processRegistration(Number(params.id));
        await this.recordStaffAction(admin, 'registration.process', 'registration', params.id);
        return result;
    }

    @Post('api/registrations/:id/operator-state')
    @RequirePermissions('registrations.update')
    async updateRegistrationOperatorState(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @Body() body: RegistrationOperatorStateDto,
    ) {
        const result = await this.adminService.updateRegistrationOperatorState(
            Number(params.id),
            body,
        );
        await this.recordStaffAction(admin, 'registration.operator_state.update', 'registration', params.id, {
            status: body.status,
            priority: body.priority,
        });
        return result;
    }

    @Post('api/tickets/:id/reply')
    @RequirePermissions('tickets.reply')
    async replyToTicket(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @Body() body: TextMessageDto,
    ) {
        const result = await this.adminService.replyToTicket(
            Number(params.id),
            body.text,
            admin.displayName,
        );
        await this.recordStaffAction(admin, 'ticket.reply_and_close', 'ticket', params.id);
        return result;
    }

    @Post('api/tickets/:id/messages')
    @RequirePermissions('tickets.reply')
    async sendTicketMessage(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @Body() body: TextMessageDto,
    ) {
        const result = await this.adminService.sendTicketMessage(
            Number(params.id),
            body.text,
            admin.displayName,
        );
        await this.recordStaffAction(admin, 'ticket.reply', 'ticket', params.id);
        return result;
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
        const result = await this.adminService.sendTicketMedia(
            Number(params.id),
            {
                messageType: this.detectMessageType(
                    file.mimetype,
                    file.originalname,
                ),
                buffer: file.buffer,
                fileName: file.originalname || 'file',
                mimeType: file.mimetype,
                fileSize: file.size,
                text: body?.text,
            },
            admin.displayName,
        );
        await this.recordStaffAction(admin, 'ticket.file.send', 'ticket', params.id, { mimeType: file.mimetype, sizeBytes: file.size });
        return result;
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
        if (data?.storedFileId) {
            return this.sendStoredFile(response, data.storedFileId);
        }
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
    async closeTicket(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
    ) {
        const result = await this.adminService.closeTicket(
            Number(params.id),
            admin.displayName,
        );
        await this.recordStaffAction(admin, 'ticket.close', 'ticket', params.id);
        return result;
    }

    @Get('api/registrations/:id/pdf')
    @RequirePermissions('registrations.read')
    async getRegistrationPdf(
        @CurrentAdmin() admin: AdminPrincipal,
        @Param() params: PositiveIdParamDto,
        @Res() response: Response,
    ) {
        const registration = await this.adminService.getRegistration(
            Number(params.id),
        );
        if (registration?.pdfFileId) {
            await this.recordStaffAction(admin, 'registration.pdf.download', 'registration', params.id, { storedFileId: registration.pdfFileId });
            return this.sendStoredFile(response, registration.pdfFileId);
        }
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
        if (registration?.equipmentPhotoFileId) {
            return this.sendStoredFile(response, registration.equipmentPhotoFileId);
        }
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

    @Get('*path')
    @PublicAdmin()
    getReactRoute(
        @Param('path') routePath: string | string[],
        @Res({ passthrough: true }) response: Response,
    ) {
        const parts = Array.isArray(routePath) ? routePath : [routePath];
        if (parts[0] === 'api') {
            throw new NotFoundException('Admin API route not found');
        }
        response.type('text/html; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        return this.getPage();
    }

    private getCookie(request: Request, name: string) {
        const prefix = `${name}=`;
        const item = (request.header('cookie') || '')
            .split(';')
            .map((part) => part.trim())
            .find((part) => part.startsWith(prefix));
        return item ? decodeURIComponent(item.slice(prefix.length)) : null;
    }

    private async sendStoredFile(
        response: Response,
        fileId: number,
        inline = false,
    ) {
        const { file, stream } = await this.filesService.open(fileId);
        response.setHeader('Content-Type', file.mimeType);
        response.setHeader(
            'Content-Disposition',
            `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
        );
        response.setHeader('Cache-Control', 'private, no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        stream.pipe(response);
    }

    private recordStaffAction(
        admin: AdminPrincipal,
        action: string,
        targetType: string,
        targetId: string | number,
        metadata?: Record<string, unknown>,
    ) {
        return this.auditService.record({
            actorType: 'staff',
            actorStaffId: admin.id,
            actorSessionId: admin.sessionId,
            action,
            targetType,
            targetId,
            metadata,
        });
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
