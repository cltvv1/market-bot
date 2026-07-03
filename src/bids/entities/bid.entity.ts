import { BidType } from '../bid.types';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import type { UserPlatform } from 'src/users/entities/user.entity';


@Entity('bids')
export class BidEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'text' })
    chatId: string;

    @Column({ type: 'varchar', default: 'telegram' })
    platform: UserPlatform;

    @Column({
        type: 'enum',
        enum: BidType,
        default: BidType.KKT_REMOTE_WORK,
    })
    type: BidType;

    @Column({ default: 1 })
    currentStep: number;

    @Column({ nullable: true })
    problemDescription?: string;

    @Column({ nullable: true })
    contactForCall?: string;

    @Column({ default: false })
    isFilled: boolean;

    @Column({ default: false })
    isStopped: boolean;

    @Column({ default: false })
    isProcessed: boolean;   

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
