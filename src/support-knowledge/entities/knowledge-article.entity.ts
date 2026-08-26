import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { AdminUserEntity } from 'src/admin/entities/admin-user.entity';
import type { KnowledgeArticleType } from '../support-knowledge.types';
import { KnowledgeArticleSupportResourceEntity } from './knowledge-article-support-resource.entity';
import { ProductKnowledgeArticleEntity } from './product-knowledge-article.entity';

@Entity('knowledge_articles')
@Index('UQ_knowledge_articles_slug', ['slug'], { unique: true })
@Index('IDX_knowledge_articles_public_type', ['isPublished', 'type'])
@Check(
    'CK_knowledge_articles_type',
    `"type" IN ('instruction','setup','troubleshooting','faq','compatibility','service','other')`,
)
export class KnowledgeArticleEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 160 })
    slug: string;

    @Column({ type: 'varchar', length: 255 })
    title: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    excerpt: string | null;

    @Column({ type: 'text' })
    bodyMarkdown: string;

    @Column({ type: 'varchar', length: 32 })
    type: KnowledgeArticleType;

    @Column({ type: 'varchar', length: 160, nullable: true })
    seoTitle: string | null;

    @Column({ type: 'varchar', length: 320, nullable: true })
    seoDescription: string | null;

    @Column({ type: 'integer', nullable: true })
    authorStaffId: number | null;

    @ManyToOne(() => AdminUserEntity, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({
        name: 'authorStaffId',
        foreignKeyConstraintName: 'FK_knowledge_articles_author',
    })
    authorStaff: AdminUserEntity | null;

    @Column({ default: false })
    isPublished: boolean;

    @Column({ type: 'timestamp', nullable: true })
    publishedAt: Date | null;

    @OneToMany(() => ProductKnowledgeArticleEntity, (link) => link.article)
    productLinks: ProductKnowledgeArticleEntity[];

    @OneToMany(
        () => KnowledgeArticleSupportResourceEntity,
        (link) => link.article,
    )
    resourceLinks: KnowledgeArticleSupportResourceEntity[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
