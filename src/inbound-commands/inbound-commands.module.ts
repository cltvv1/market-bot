import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from 'src/users/users.module';
import { InboundCommandEntity } from './entities/inbound-command.entity';
import { InboundCommandsService } from './inbound-commands.service';

@Module({
    imports: [TypeOrmModule.forFeature([InboundCommandEntity]), UsersModule],
    providers: [InboundCommandsService],
    exports: [InboundCommandsService],
})
export class InboundCommandsModule {}
