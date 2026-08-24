import {
    Column,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import type { UserPlatform } from 'src/users/entities/user.entity';
import type { UserMode } from '../user-context.types';

@Entity('user_dialog_states')
@Index('UQ_user_dialog_states_platform_chat', ['platform', 'chatId'], {
    unique: true,
})
export class UserDialogStateEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar' })
    platform: UserPlatform;

    @Column({ type: 'text' })
    chatId: string;

    @Column({ type: 'varchar', default: 'IDLE' })
    mode: UserMode;

    @Column({ type: 'varchar', nullable: true })
    talkingTo: string | null;

    @Column({ type: 'integer', nullable: true })
    serviceRequestId: number | null;

    @UpdateDateColumn()
    updatedAt: Date;
}
