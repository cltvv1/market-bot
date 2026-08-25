import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserDialogStateEntity } from './entities/user-dialog-state.entity';
import { UserContextService } from './user-context.service';

@Module({
    imports: [TypeOrmModule.forFeature([UserDialogStateEntity])],
    providers: [UserContextService],
    exports: [UserContextService],
})
export class UserContextModule {}
