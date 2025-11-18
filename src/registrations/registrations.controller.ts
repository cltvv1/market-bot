import { Controller, Post, Body, Param, Get } from '@nestjs/common';
import { RegistrationsService } from './registrations.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';

@Controller('registrations')
export class RegistrationsController {
    constructor(private readonly registrationsService: RegistrationsService) { }

    // Старт регистрации или получение текущей
    @Post('start')
    async start(@Body('chatId') chatId: string) {
        return this.registrationsService.startRegistration(chatId);
    }

    // Обновление текущего шага с частичными данными
    @Post('update/:chatId/:step')
    async updateStep(
        @Param('chatId') chatId: string,
        @Param('step') step: number,
        @Body() partialData: Partial<CreateRegistrationDto>
    ) {
        return this.registrationsService.updateStep(chatId, step, partialData);
    }

    // Получить текущую регистрацию по chatId
    @Get(':chatId')
    async getRegistration(@Param('chatId') chatId: string) {
        return this.registrationsService.getRegistration(chatId);
    }
}
