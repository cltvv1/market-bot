import { Controller, Get, Param } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get(':chatId')
    get(@Param('chatId') chatId: string) {
        return this.usersService.getByChatId(chatId);
    }
}
