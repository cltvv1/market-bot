import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import type {
    OrderEventActorType,
    OrderEventType,
    OrderEventVisibility,
    OrderStatus,
} from '../order.types';
import { OrderEntity } from './order.entity';

@Entity('order_events')
@Index('IDX_order_events_order_created', ['orderId', 'createdAt', 'id'])
@Check(
    'CK_order_events_type',
    `"type" IN ('submitted','manager_assigned','manager_reassigned','review_started','quote_updated','confirmed','invoice_issued','invoice_replaced','payment_proof_received','payment_confirmed','fulfilled','completed','cancelled')`,
)
@Check(
    'CK_order_events_statuses',
    `("fromStatus" IS NULL OR "fromStatus" IN ('submitted','in_review','confirmed','waiting_payment','paid','fulfilled','completed','cancelled')) AND ("toStatus" IS NULL OR "toStatus" IN ('submitted','in_review','confirmed','waiting_payment','paid','fulfilled','completed','cancelled'))`,
)
@Check(
    'CK_order_events_actor_type',
    `"actorType" IN ('customer','staff','system')`,
)
@Check(
    'CK_order_events_actor_identity',
    `("actorType" = 'customer' AND "actorUserId" IS NOT NULL AND "actorStaffId" IS NULL) OR ("actorType" = 'staff' AND "actorUserId" IS NULL AND "actorStaffId" IS NOT NULL) OR ("actorType" = 'system' AND "actorUserId" IS NULL AND "actorStaffId" IS NULL)`,
)
@Check('CK_order_events_visibility', `"visibility" IN ('customer','staff')`)
export class OrderEventEntity {
    @PrimaryGeneratedColumn({ primaryKeyConstraintName: 'PK_order_events' })
    id: number;

    @Column({ type: 'integer' })
    orderId: number;

    @ManyToOne(() => OrderEntity, (order) => order.events, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({
        name: 'orderId',
        foreignKeyConstraintName: 'FK_order_events_order',
    })
    order: OrderEntity;

    @Column({ type: 'varchar', length: 40 })
    type: OrderEventType;

    @Column({ type: 'varchar', length: 32, nullable: true })
    fromStatus: OrderStatus | null;

    @Column({ type: 'varchar', length: 32, nullable: true })
    toStatus: OrderStatus | null;

    @Column({ type: 'varchar', length: 16 })
    actorType: OrderEventActorType;

    @Column({ type: 'integer', nullable: true })
    actorUserId: number | null;

    @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
    @JoinColumn({
        name: 'actorUserId',
        foreignKeyConstraintName: 'FK_order_events_actor_user',
    })
    actorUser: UserEntity | null;

    @Column({ type: 'integer', nullable: true })
    actorStaffId: number | null;

    @ManyToOne(() => AdminUserEntity, {
        nullable: true,
        onDelete: 'RESTRICT',
    })
    @JoinColumn({
        name: 'actorStaffId',
        foreignKeyConstraintName: 'FK_order_events_actor_staff',
    })
    actorStaff: AdminUserEntity | null;

    @Column({ type: 'varchar', length: 16 })
    visibility: OrderEventVisibility;

    @Column({ type: 'varchar', length: 2000, nullable: true })
    message: string | null;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, unknown> | null;

    @CreateDateColumn()
    createdAt: Date;
}
