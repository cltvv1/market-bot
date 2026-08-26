import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
} from 'typeorm';
import { KnowledgeArticleEntity } from './knowledge-article.entity';
import { SupportResourceEntity } from './support-resource.entity';

@Entity('knowledge_article_support_resources')
@Unique('UQ_knowledge_article_support_resources_pair', [
    'articleId',
    'resourceId',
])
@Index('IDX_knowledge_article_support_resources_article', ['articleId'])
@Index('IDX_knowledge_article_support_resources_resource', ['resourceId'])
export class KnowledgeArticleSupportResourceEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'integer' })
    articleId: number;

    @ManyToOne(
        () => KnowledgeArticleEntity,
        (article) => article.resourceLinks,
        {
            onDelete: 'CASCADE',
        },
    )
    @JoinColumn({
        name: 'articleId',
        foreignKeyConstraintName: 'FK_knowledge_article_resources_article',
    })
    article: KnowledgeArticleEntity;

    @Column({ type: 'integer' })
    resourceId: number;

    @ManyToOne(() => SupportResourceEntity, { onDelete: 'CASCADE' })
    @JoinColumn({
        name: 'resourceId',
        foreignKeyConstraintName: 'FK_knowledge_article_resources_resource',
    })
    resource: SupportResourceEntity;

    @Column({ type: 'integer', default: 0 })
    sortOrder: number;

    @CreateDateColumn()
    createdAt: Date;
}
