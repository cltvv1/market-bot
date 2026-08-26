import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { StoredFileEntity } from 'src/files/entities/stored-file.entity';
import type {
    SupportArchitecture,
    SupportDistributionMode,
    SupportLanguageCode,
    SupportPlatform,
} from '../support-knowledge.types';
import { SupportResourceEntity } from './support-resource.entity';

@Entity('support_resource_versions')
@Index('IDX_support_resource_versions_resource', ['resourceId'])
@Index('IDX_support_resource_versions_publication_current', [
    'resourceId',
    'isPublished',
    'isCurrent',
])
@Index(
    'UQ_support_resource_versions_current_scope',
    ['resourceId', 'platform', 'architecture', 'languageCode'],
    { unique: true, where: '"isCurrent" = true' },
)
@Check(
    'CK_support_resource_versions_platform',
    `"platform" IN ('windows','linux','macos','android','ios','universal')`,
)
@Check(
    'CK_support_resource_versions_architecture',
    `"architecture" IN ('x86','x64','arm64','universal')`,
)
@Check(
    'CK_support_resource_versions_language',
    `"languageCode" IN ('ru','en','multi')`,
)
@Check(
    'CK_support_resource_versions_distribution',
    `"distributionMode" IN ('external','hosted')`,
)
@Check(
    'CK_support_resource_versions_location',
    `("distributionMode" = 'external' AND "storedFileId" IS NULL) OR ("distributionMode" = 'hosted' AND "externalUrl" IS NULL)`,
)
export class SupportResourceVersionEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'integer' })
    resourceId: number;

    @ManyToOne(() => SupportResourceEntity, (resource) => resource.versions, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({
        name: 'resourceId',
        foreignKeyConstraintName: 'FK_support_resource_versions_resource',
    })
    resource: SupportResourceEntity;

    @Column({ type: 'varchar', length: 100, nullable: true })
    versionLabel: string | null;

    @Column({ type: 'date', nullable: true })
    releaseDate: string | null;

    @Column({ type: 'varchar', length: 32 })
    platform: SupportPlatform;

    @Column({ type: 'varchar', length: 32 })
    architecture: SupportArchitecture;

    @Column({ type: 'varchar', length: 16 })
    languageCode: SupportLanguageCode;

    @Column({ type: 'varchar', length: 16 })
    distributionMode: SupportDistributionMode;

    @Column({ type: 'varchar', length: 2048, nullable: true })
    externalUrl: string | null;

    @Column({ type: 'integer', nullable: true })
    storedFileId: number | null;

    @ManyToOne(() => StoredFileEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({
        name: 'storedFileId',
        foreignKeyConstraintName: 'FK_support_resource_versions_stored_file',
    })
    storedFile: StoredFileEntity | null;

    @Column({ type: 'text', nullable: true })
    releaseNotesMarkdown: string | null;

    @Column({ default: false })
    isCurrent: boolean;

    @Column({ default: false })
    isPublished: boolean;

    @Column({ type: 'integer', default: 0 })
    sortOrder: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
