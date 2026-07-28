import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { UserChannelEntity } from './entities/user-channel.entity';
import { UsersService } from './users.service';

@Module({
    imports: [TypeOrmModule.forFeature([UserEntity, UserChannelEntity])],
    providers: [UsersService],
    exports: [UsersService],
})
export class UsersModule { }
