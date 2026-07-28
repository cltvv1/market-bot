import { Context } from 'telegraf';
import { Injectable } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { TextHandler } from '../interfaces/text-handler.interface';
import { UserContextService } from 'src/userContext/user-context.service';
import { disconnectFromButton } from 'src/telegram/keyboards/disconnect.keyboard';
import { mainMenuButton } from 'src/telegram/keyboards/return-to-main-menu.keyboard';
import { TicketsService } from 'src/tickets/tickets.service';
import { MessengerAdminAccessService } from 'src/admin/messenger-admin-access.service';

@Injectable()
export class OperatorTextHandler implements TextHandler {
    constructor(
        private readonly usersService: UsersService,
        private readonly ctxService: UserContextService,
        private readonly ticketsService: TicketsService,
        private readonly adminAccess: MessengerAdminAccessService,
    ) {}

    async handle(ctx: Context) {
        const chatId = String(ctx.chat?.id);
        if (!chatId) return;

        const talkingToId = await this.usersService.getTalkingTo(chatId);
        const reciprocalTarget = talkingToId ? await this.usersService.getTalkingTo(talkingToId) : null;
        const staff = await this.adminAccess.findAuthorizedStaff('telegram', chatId, 'tickets.reply');
        const targetStaff = talkingToId ? await this.adminAccess.findAuthorizedStaff('telegram', talkingToId, 'tickets.reply') : null;
        const clientChatId = staff ? talkingToId : chatId;
        const activeTicket = clientChatId ? await this.ticketsService.getActiveTicket(clientChatId) : null;
        if (!talkingToId || reciprocalTarget !== chatId || (!staff && !targetStaff) || !activeTicket) {
            await ctx.reply('К вам сейчас не подключен оператор', mainMenuButton());

            await this.ctxService.set(chatId, { mode: 'IDLE' });

            return;
        }
        await ctx.copyMessage(talkingToId, disconnectFromButton(chatId));
    }
}
