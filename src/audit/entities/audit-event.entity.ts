import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AdminSessionEntity } from 'src/admin/entities/admin-session.entity';
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { CustomerWebSessionEntity } from 'src/web-session/entities/customer-web-session.entity';

export type AuditActorType = 'staff' | 'customer' | 'system';
export type AuditResult = 'success' | 'denied' | 'failure';

@Entity('audit_events')
@Index('IDX_audit_events_created_at', ['createdAt'])
@Index('IDX_audit_events_actor_staff', ['actorStaffId'])
@Index('IDX_audit_events_action', ['action'])
@Index('IDX_audit_events_target', ['targetType', 'targetId'])
@Index('IDX_audit_events_actor_web_session', ['actorWebSessionId'])
@Check('CK_audit_events_actor_type', `"actorType" IN ('staff','customer','system')`)
@Check('CK_audit_events_result', `"result" IN ('success','denied','failure')`)
export class AuditEventEntity {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id: string;

    @CreateDateColumn()
    createdAt: Date;

    @Column({ type: 'varchar' })
    actorType: AuditActorType;

    @Column({ type: 'integer', nullable: true })
    actorStaffId: number | null;

    @ManyToOne(() => AdminUserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'actorStaffId', foreignKeyConstraintName: 'FK_audit_staff' })
    actorStaff: AdminUserEntity | null;

    @Column({ type: 'integer', nullable: true })
    actorCustomerId: number | null;

    @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'actorCustomerId', foreignKeyConstraintName: 'FK_audit_customer' })
    actorCustomer: UserEntity | null;

    @Column({ type: 'integer', nullable: true })
    actorSessionId: number | null;

    @ManyToOne(() => AdminSessionEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'actorSessionId', foreignKeyConstraintName: 'FK_audit_session' })
    actorSession: AdminSessionEntity | null;

    @Column({ type: 'integer', nullable: true })
    actorWebSessionId: number | null;

    @ManyToOne(() => CustomerWebSessionEntity, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    @JoinColumn({
        name: 'actorWebSessionId',
        foreignKeyConstraintName: 'FK_audit_web_session',
    })
    actorWebSession: CustomerWebSessionEntity | null;

    @Column({ type: 'varchar' })
    action: string;

    @Column({ type: 'varchar' })
    targetType: string;

    @Column({ type: 'varchar', nullable: true })
    targetId: string | null;

    @Column({ type: 'varchar' })
    result: AuditResult;

    @Column({ type: 'varchar', nullable: true })
    reason: string | null;

    @Column({ type: 'uuid', nullable: true })
    requestId: string | null;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, unknown> | null;
}
