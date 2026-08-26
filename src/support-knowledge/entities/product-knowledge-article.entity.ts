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
import { CatalogProductEntity } from 'src/catalog/entities/catalog-product.entity';
import { KnowledgeArticleEntity } from './knowledge-article.entity';

@Entity('product_knowledge_articles')
@Unique('UQ_product_knowledge_articles_pair', ['productId', 'articleId'])
@Index('IDX_product_knowledge_articles_product', ['productId'])
@Index('IDX_product_knowledge_articles_article', ['articleId'])
export class ProductKnowledgeArticleEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'integer' })
    productId: number;

    @ManyToOne(() => CatalogProductEntity, { onDelete: 'CASCADE' })
    @JoinColumn({
        name: 'productId',
        foreignKeyConstraintName: 'FK_product_knowledge_articles_product',
    })
    product: CatalogProductEntity;

    @Column({ type: 'integer' })
    articleId: number;

    @ManyToOne(
        () => KnowledgeArticleEntity,
        (article) => article.productLinks,
        {
            onDelete: 'CASCADE',
        },
    )
    @JoinColumn({
        name: 'articleId',
        foreignKeyConstraintName: 'FK_product_knowledge_articles_article',
    })
    article: KnowledgeArticleEntity;

    @Column({ type: 'integer', default: 0 })
    sortOrder: number;

    @CreateDateColumn()
    createdAt: Date;
}
