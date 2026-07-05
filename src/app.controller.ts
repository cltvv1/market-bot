import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@Controller()
@ApiTags('system')
export class AppController {
    constructor(private readonly appService: AppService) { }

    @Get()
    getStatus() {
        return this.appService.getStatus();
    }
}
