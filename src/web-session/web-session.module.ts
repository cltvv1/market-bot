import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from 'src/users/users.module';
import { CustomerWebSessionEntity } from './entities/customer-web-session.entity';
import { WebSessionController } from './web-session.controller';
import { WebSessionGuard } from './web-session.guard';
import { WebSessionService } from './web-session.service';
import { WebMutationOriginGuard } from './web-mutation-origin.guard';

@Global()
@Module({
    imports: [
        TypeOrmModule.forFeature([CustomerWebSessionEntity]),
        UsersModule,
    ],
    controllers: [WebSessionController],
    providers: [WebSessionService, WebSessionGuard, WebMutationOriginGuard],
    exports: [WebSessionService, WebSessionGuard, WebMutationOriginGuard],
})
export class WebSessionModule {}
