import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from 'src/users/users.module';
import { CustomerWebSessionEntity } from './entities/customer-web-session.entity';
import { WebSessionController } from './web-session.controller';
import { WebSessionGuard } from './web-session.guard';
import { WebSessionService } from './web-session.service';

@Global()
@Module({
    imports: [
        TypeOrmModule.forFeature([CustomerWebSessionEntity]),
        UsersModule,
    ],
    controllers: [WebSessionController],
    providers: [WebSessionService, WebSessionGuard],
    exports: [WebSessionService, WebSessionGuard],
})
export class WebSessionModule {}
