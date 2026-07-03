import * as fs from 'fs';
import { BadRequestException, Body, Controller, Get, Header, Param, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { UserPlatform } from 'src/users/entities/user.entity';
import { AdminService } from './admin.service';
import type { AdminStatusFilter } from './admin.service';
import { adminPageHtml } from './admin.page';

@Controller('admin')
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
        if (platform === 'telegram' || platform === 'max') {
            return platform;
        }

        return undefined;
    }
}
