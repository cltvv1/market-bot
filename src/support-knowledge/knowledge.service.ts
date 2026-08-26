import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { AdminPrincipal } from 'src/admin/admin-auth.types';
import { AuditService } from 'src/audit/audit.service';
import { CatalogProductEntity } from 'src/catalog/entities/catalog-product.entity';
import {
    DataSource,
    EntityManager,
    In,
    QueryFailedError,
    Repository,
} from 'typeorm';
import {
    type CreateKnowledgeArticleDto,
    type KnowledgeArticleListQueryDto,
    type UpdateKnowledgeArticleDto,
} from './dto/support-knowledge.dto';
import { KnowledgeArticleSupportResourceEntity } from './entities/knowledge-article-support-resource.entity';
import { KnowledgeArticleEntity } from './entities/knowledge-article.entity';
import { ProductKnowledgeArticleEntity } from './entities/product-knowledge-article.entity';
import { SupportResourceEntity } from './entities/support-resource.entity';
import {
    CONTENT_PAGE_SIZE_DEFAULT,
    publicUsableVersionExistsSql,
} from './support-knowledge.types';

@Injectable()
export class KnowledgeService {
    constructor(
        private readonly dataSource: DataSource,
        @InjectRepository(KnowledgeArticleEntity)
        private readonly articles: Repository<KnowledgeArticleEntity>,
        @InjectRepository(ProductKnowledgeArticleEntity)
        private readonly productArticles: Repository<ProductKnowledgeArticleEntity>,
        @InjectRepository(KnowledgeArticleSupportResourceEntity)
        private readonly articleResources: Repository<KnowledgeArticleSupportResourceEntity>,
        private readonly audit: AuditService,
    ) {}

    async listPublicArticles(query: KnowledgeArticleListQueryDto) {
        return this.listArticles(query, true);
    }

    async listAdminArticles(query: KnowledgeArticleListQueryDto) {
        return this.listArticles(query, false);
    }

    async getPublicArticle(slug: string) {
        const article = await this.articles.findOneBy({
            slug,
            isPublished: true,
        });
        if (!article)
            throw new NotFoundException('Knowledge article was not found');
        const { productLinks, resourceLinks } =
            await this.loadPublishedRelations(article.id);
        return this.presentPublicDetail(article, productLinks, resourceLinks);
    }

    async getAdminArticle(id: number) {
        const article = await this.requireArticle(this.articles, id);
        const { productLinks, resourceLinks } =
            await this.loadAdminRelations(id);
        return this.presentAdminDetail(article, productLinks, resourceLinks);
    }

    createArticle(input: CreateKnowledgeArticleDto, actor: AdminPrincipal) {
        return this.withConflictMapping(() =>
            this.dataSource.transaction(async (manager) => {
                const articles = manager.getRepository(KnowledgeArticleEntity);
                const article = await articles.save(
                    articles.create({
                        slug: input.slug.trim(),
                        title: input.title.trim(),
                        excerpt: this.nullableText(input.excerpt),
                        bodyMarkdown: input.bodyMarkdown.trim(),
                        type: input.type,
                        seoTitle: this.nullableText(input.seoTitle),
                        seoDescription: this.nullableText(input.seoDescription),
                        authorStaffId: actor.id,
                        isPublished: false,
                        publishedAt: null,
                    }),
                );
                const productLinks = await this.replaceProductLinks(
                    manager,
                    article.id,
                    input.productIds ?? [],
                );
                const resourceLinks = await this.replaceResourceLinks(
                    manager,
                    article.id,
                    input.resourceIds ?? [],
                );
                await this.recordAudit(
                    manager,
                    actor,
                    'knowledge.article.create',
                    article.id,
                    { slug: article.slug, type: article.type },
                );
                return this.presentAdminDetail(
                    article,
                    productLinks,
                    resourceLinks,
                );
            }),
        );
    }

    updateArticle(
        id: number,
        input: UpdateKnowledgeArticleDto,
        actor: AdminPrincipal,
    ) {
        return this.withConflictMapping(() =>
            this.dataSource.transaction(async (manager) => {
                const articles = manager.getRepository(KnowledgeArticleEntity);
                let article = await this.requireArticle(articles, id);
                if (input.slug !== undefined) article.slug = input.slug.trim();
                if (input.title !== undefined)
                    article.title = input.title.trim();
                if (Object.hasOwn(input, 'excerpt')) {
                    article.excerpt = this.nullableText(input.excerpt);
                }
                if (input.bodyMarkdown !== undefined) {
                    article.bodyMarkdown = input.bodyMarkdown.trim();
                }
                if (input.type !== undefined) article.type = input.type;
                if (Object.hasOwn(input, 'seoTitle')) {
                    article.seoTitle = this.nullableText(input.seoTitle);
                }
                if (Object.hasOwn(input, 'seoDescription')) {
                    article.seoDescription = this.nullableText(
                        input.seoDescription,
                    );
                }
                if (
                    article.isPublished &&
                    (!article.slug ||
                        !article.title.trim() ||
                        !article.bodyMarkdown.trim())
                ) {
                    throw new ConflictException(
                        'Published knowledge article must remain publication-ready',
                    );
                }
                article = await articles.save(article);
                const current = await this.loadAdminRelationsWithManager(
                    manager,
                    id,
                );
                const productLinks =
                    input.productIds === undefined
                        ? current.productLinks
                        : await this.replaceProductLinks(
                              manager,
                              id,
                              input.productIds,
                          );
                const resourceLinks =
                    input.resourceIds === undefined
                        ? current.resourceLinks
                        : await this.replaceResourceLinks(
                              manager,
                              id,
                              input.resourceIds,
                          );
                await this.recordAudit(
                    manager,
                    actor,
                    'knowledge.article.update',
                    article.id,
                    { slug: article.slug, type: article.type },
                );
                return this.presentAdminDetail(
                    article,
                    productLinks,
                    resourceLinks,
                );
            }),
        );
    }

    setArticlePublished(
        id: number,
        isPublished: boolean,
        actor: AdminPrincipal,
    ) {
        return this.dataSource.transaction(async (manager) => {
            const articles = manager.getRepository(KnowledgeArticleEntity);
            const article = await this.requireArticle(articles, id);
            if (
                isPublished &&
                (!article.slug ||
                    !article.title.trim() ||
                    !article.bodyMarkdown.trim())
            ) {
                throw new ConflictException(
                    'Knowledge article is not ready for publication',
                );
            }
            if (article.isPublished !== isPublished) {
                article.isPublished = isPublished;
                article.publishedAt = isPublished ? new Date() : null;
                await articles.save(article);
                await this.recordAudit(
                    manager,
                    actor,
                    isPublished
                        ? 'knowledge.article.publish'
                        : 'knowledge.article.unpublish',
                    article.id,
                    { slug: article.slug, type: article.type },
                );
            }
            const { productLinks, resourceLinks } =
                await this.loadAdminRelationsWithManager(manager, id);
            return this.presentAdminDetail(
                article,
                productLinks,
                resourceLinks,
            );
        });
    }

    private async listArticles(
        query: KnowledgeArticleListQueryDto,
        publicOnly: boolean,
    ) {
        const { page, limit } = this.pagination(query);
        const builder = this.articles
            .createQueryBuilder('article')
            .leftJoin(
                ProductKnowledgeArticleEntity,
                'productLink',
                'productLink.articleId = article.id',
            )
            .leftJoin(
                CatalogProductEntity,
                'linkedProduct',
                'linkedProduct.id = productLink.productId',
            )
            .distinct(true);
        if (publicOnly) builder.andWhere('article.isPublished = true');
        if (query.product) {
            builder.andWhere('linkedProduct.slug = :productSlug', {
                productSlug: query.product,
            });
        }
        if (query.type) {
            builder.andWhere('article.type = :type', { type: query.type });
        }
        const search = query.search?.trim();
        if (search) {
            builder.andWhere(
                '(article.title ILIKE :search OR article.excerpt ILIKE :search)',
                { search: `%${this.escapeLike(search)}%` },
            );
        }
        const [articles, total] = await builder
            .orderBy(
                publicOnly ? 'article.publishedAt' : 'article.updatedAt',
                'DESC',
                'NULLS LAST',
            )
            .addOrderBy('article.title', 'ASC')
            .addOrderBy('article.id', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();
        return {
            items: articles.map((article) =>
                publicOnly
                    ? this.presentPublicSummary(article)
                    : this.presentAdminSummary(article),
            ),
            total,
            page,
            limit,
            totalPages: total ? Math.ceil(total / limit) : 0,
        };
    }

    private async loadPublishedRelations(articleId: number) {
        const [productLinks, resourceLinks] = await Promise.all([
            this.productArticles.find({
                where: { articleId },
                relations: { product: true },
                order: { sortOrder: 'ASC', id: 'ASC' },
            }),
            this.articleResources
                .createQueryBuilder('link')
                .innerJoinAndSelect('link.resource', 'resource')
                .where('link.articleId = :articleId', { articleId })
                .andWhere('resource.isPublished = true')
                .andWhere(publicUsableVersionExistsSql('resource'))
                .orderBy('link.sortOrder', 'ASC')
                .addOrderBy('resource.title', 'ASC')
                .addOrderBy('resource.id', 'ASC')
                .getMany(),
        ]);
        return { productLinks, resourceLinks };
    }

    private loadAdminRelations(articleId: number) {
        return this.loadAdminRelationsFromRepositories(
            this.productArticles,
            this.articleResources,
            articleId,
        );
    }

    private loadAdminRelationsWithManager(
        manager: EntityManager,
        articleId: number,
    ) {
        return this.loadAdminRelationsFromRepositories(
            manager.getRepository(ProductKnowledgeArticleEntity),
            manager.getRepository(KnowledgeArticleSupportResourceEntity),
            articleId,
        );
    }

    private async loadAdminRelationsFromRepositories(
        products: Repository<ProductKnowledgeArticleEntity>,
        resources: Repository<KnowledgeArticleSupportResourceEntity>,
        articleId: number,
    ) {
        const [productLinks, resourceLinks] = await Promise.all([
            products.find({
                where: { articleId },
                relations: { product: true },
                order: { sortOrder: 'ASC', id: 'ASC' },
            }),
            resources.find({
                where: { articleId },
                relations: { resource: true },
                order: { sortOrder: 'ASC', id: 'ASC' },
            }),
        ]);
        return { productLinks, resourceLinks };
    }

    private async replaceProductLinks(
        manager: EntityManager,
        articleId: number,
        productIds: number[],
    ) {
        this.assertUniqueIds(productIds, 'productIds');
        await this.requireIds(
            manager.getRepository(CatalogProductEntity),
            productIds,
            'Referenced catalog product was not found',
        );
        const links = manager.getRepository(ProductKnowledgeArticleEntity);
        await links.delete({ articleId });
        if (!productIds.length) return [];
        const saved = await links.save(
            productIds.map((productId, sortOrder) =>
                links.create({ articleId, productId, sortOrder }),
            ),
        );
        const products = await manager
            .getRepository(CatalogProductEntity)
            .findBy({
                id: In(productIds),
            });
        const byId = new Map(products.map((product) => [product.id, product]));
        return saved.map((link) => ({
            ...link,
            product: byId.get(link.productId) as CatalogProductEntity,
        }));
    }

    private async replaceResourceLinks(
        manager: EntityManager,
        articleId: number,
        resourceIds: number[],
    ) {
        this.assertUniqueIds(resourceIds, 'resourceIds');
        await this.requireIds(
            manager.getRepository(SupportResourceEntity),
            resourceIds,
            'Referenced support resource was not found',
        );
        const links = manager.getRepository(
            KnowledgeArticleSupportResourceEntity,
        );
        await links.delete({ articleId });
        if (!resourceIds.length) return [];
        const saved = await links.save(
            resourceIds.map((resourceId, sortOrder) =>
                links.create({ articleId, resourceId, sortOrder }),
            ),
        );
        const resources = await manager
            .getRepository(SupportResourceEntity)
            .findBy({
                id: In(resourceIds),
            });
        const byId = new Map(
            resources.map((resource) => [resource.id, resource]),
        );
        return saved.map((link) => ({
            ...link,
            resource: byId.get(link.resourceId) as SupportResourceEntity,
        }));
    }

    private assertUniqueIds(ids: number[], field: string) {
        if (new Set(ids).size !== ids.length) {
            throw new BadRequestException(`${field} contains duplicate IDs`);
        }
    }

    private async requireIds<T extends { id: number }>(
        repository: Repository<T>,
        ids: number[],
        message: string,
    ) {
        if (!ids.length) return;
        const count = await repository.countBy({ id: In(ids) } as never);
        if (count !== ids.length) throw new BadRequestException(message);
    }

    private async requireArticle(
        repository: Repository<KnowledgeArticleEntity>,
        id: number,
    ) {
        const article = await repository.findOneBy({ id });
        if (!article)
            throw new NotFoundException('Knowledge article was not found');
        return article;
    }

    private presentProduct(product: CatalogProductEntity) {
        return {
            id: product.id,
            slug: product.slug,
            sku: product.sku,
            name: product.name,
            brand: product.brand,
        };
    }

    private presentPublicSummary(article: KnowledgeArticleEntity) {
        return {
            id: article.id,
            slug: article.slug,
            title: article.title,
            excerpt: article.excerpt,
            type: article.type,
            seoTitle: article.seoTitle,
            seoDescription: article.seoDescription,
            publishedAt: article.publishedAt,
        };
    }

    private presentAdminSummary(article: KnowledgeArticleEntity) {
        return {
            ...this.presentPublicSummary(article),
            authorStaffId: article.authorStaffId,
            isPublished: article.isPublished,
            createdAt: article.createdAt,
            updatedAt: article.updatedAt,
        };
    }

    private presentPublicDetail(
        article: KnowledgeArticleEntity,
        productLinks: ProductKnowledgeArticleEntity[],
        resourceLinks: KnowledgeArticleSupportResourceEntity[],
    ) {
        return {
            ...this.presentPublicSummary(article),
            bodyMarkdown: article.bodyMarkdown,
            products: productLinks.map((link) =>
                this.presentProduct(link.product),
            ),
            resources: resourceLinks.map((link) => ({
                id: link.resource.id,
                slug: link.resource.slug,
                title: link.resource.title,
                summary: link.resource.summary,
                type: link.resource.type,
                manufacturerName: link.resource.manufacturerName,
                isOfficial: link.resource.isOfficial,
            })),
        };
    }

    private presentAdminDetail(
        article: KnowledgeArticleEntity,
        productLinks: ProductKnowledgeArticleEntity[],
        resourceLinks: KnowledgeArticleSupportResourceEntity[],
    ) {
        return {
            ...this.presentAdminSummary(article),
            bodyMarkdown: article.bodyMarkdown,
            products: productLinks.map((link) => ({
                ...this.presentProduct(link.product),
                sortOrder: link.sortOrder,
            })),
            resources: resourceLinks.map((link) => ({
                id: link.resource.id,
                slug: link.resource.slug,
                title: link.resource.title,
                type: link.resource.type,
                sortOrder: link.sortOrder,
            })),
        };
    }

    private pagination(query: { page?: number; limit?: number }) {
        return {
            page: query.page ?? 1,
            limit: query.limit ?? CONTENT_PAGE_SIZE_DEFAULT,
        };
    }

    private nullableText(value: string | null | undefined) {
        const normalized = value?.trim();
        return normalized ? normalized : null;
    }

    private escapeLike(value: string) {
        return value.replace(/[\\%_]/g, (item) => `\\${item}`);
    }

    private recordAudit(
        manager: EntityManager,
        actor: AdminPrincipal,
        action: string,
        targetId: number,
        metadata: Record<string, unknown>,
    ) {
        return this.audit.record(
            {
                actorType: 'staff',
                actorStaffId: actor.id,
                actorSessionId: actor.sessionId,
                action,
                targetType: 'knowledge_article',
                targetId,
                metadata,
            },
            manager,
        );
    }

    private async withConflictMapping<T>(operation: () => Promise<T>) {
        try {
            return await operation();
        } catch (error) {
            if (!(error instanceof QueryFailedError)) throw error;
            const driver = error.driverError as {
                code?: string;
                constraint?: string;
            };
            if (driver.code !== '23505') throw error;
            const messages: Record<string, string> = {
                UQ_knowledge_articles_slug:
                    'Knowledge article slug already exists',
                UQ_product_knowledge_articles_pair:
                    'Duplicate product and knowledge article relation',
                UQ_knowledge_article_support_resources_pair:
                    'Duplicate knowledge article and resource relation',
            };
            throw new ConflictException(
                messages[driver.constraint || ''] ||
                    'Knowledge content value already exists',
            );
        }
    }
}
