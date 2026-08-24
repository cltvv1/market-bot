import { Module } from '@nestjs/common';
import { TelegramUpdate } from './telegram.update';
import { UsersModule } from 'src/users/users.module';
import { TicketsModule } from 'src/tickets/tickets.module';
import { RegistrationsModule } from 'src/registrations/registrations.module';
import { RegisterTextHandler } from './handlers/register/register-text.handler';
import { IdleTextHandler } from './handlers/idle/idle-text.handler';
import { TicketTextHandler } from './handlers/ticket/ticket-text.handler';
import { OperatorTextHandler } from './handlers/operator/operator-text.handler';
import { ClientModule } from 'src/client/client.module';
import { ServiceRequestsModule } from 'src/service-requests/service-requests.module';
import { AdminNotificationsModule } from 'src/admin/admin-notifications.module';
import { FilesModule } from 'src/files/files.module';
import { UserContextModule } from 'src/userContext/user-context.module';
import { InboundCommandsModule } from 'src/inbound-commands/inbound-commands.module';

@Module({
    imports: [
        RegistrationsModule,
        TicketsModule,
        UsersModule,
        ClientModule,
        ServiceRequestsModule,
        AdminNotificationsModule,
        FilesModule,
        UserContextModule,
        InboundCommandsModule,
    ],
    providers: [
        TelegramUpdate,
        RegisterTextHandler,
        IdleTextHandler,
        TicketTextHandler,
        OperatorTextHandler,
    ],
})
export class TelegramModule {}
