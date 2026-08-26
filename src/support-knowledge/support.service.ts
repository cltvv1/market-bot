import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuditService } from 'src/audit/audit.service';
import type { AdminPrincipal } from 'src/admin/admin-auth.types';
import { normalizeCatalogAlias } from 'src/catalog/catalog.types';
import { CatalogProductAliasEntity } from 'src/catalog/entities/catalog-product-alias.entity';
import { CatalogProductEntity } from 'src/catalog/entities/catalog-product.entity';
import {
    DataSource,
    EntityManager,
    In,
    QueryFailedError,
    Repository,
} from 'typeorm';
import {
    type CreateSupportResourceDto,
    type CreateSupportResourceVersionDto,
    type SupportProductListQueryDto,
    type SupportResourceListQueryDto,
    type SupportResourceProductDto,
    type UpdateProductSupportProfileDto,
    type UpdateSupportResourceDto,
    type UpdateSupportResourceVersionDto,
} from './dto/support-knowledge.dto';
import { KnowledgeArticleEntity } from './entities/knowledge-article.entity';
import { ProductKnowledgeArticleEntity } from './entities/product-knowledge-article.entity';
import { ProductSupportProfileEntity } from './entities/product-support-profile.entity';
import { ProductSupportResourceEntity } from './entities/product-support-resource.entity';
import { SupportResourceVersionEntity } from './entities/support-resource-version.entity';
import { SupportResourceEntity } from './entities/support-resource.entity';
import {
    CONTENT_PAGE_SIZE_DEFAULT,
    isSafeHttpsUrl,
} from './support-knowledge.types';

@Injectable()
export class SupportService {
    constructor(
        private readonly dataSource: DataSource,
        @InjectRepository(ProductSupportProfileEntity)
        private readonly profiles: Repository<ProductSupportProfileEntity>,
        @InjectRepository(CatalogProductEntity)
        private readonly products: Repository<CatalogProductEntity>,
        @InjectRepository(SupportResourceEntity)
        private readonly resources: Repository<SupportResourceEntity>,
        @InjectRepository(SupportResourceVersionEntity)
        private readonly versions: Repository<SupportResourceVersionEntity>,
        @InjectRepository(ProductSupportResourceEntity)
        private readonly productResources: Repository<ProductSupportResourceEntity>,
        @InjectRepository(ProductKnowledgeArticleEntity)
        private readonly productArticles: Repository<ProductKnowledgeArticleEntity>,
        private readonly audit: AuditService,
    ) {}

    async listPublicProducts(query: SupportProductListQueryDto) {
        const { page, limit } = this.pagination(query);
        const builder = this.products
            .createQueryBuilder('product')
            .innerJoin(
                ProductSupportProfileEntity,
                'profile',
                'profile.productId = product.id AND profile.isPublished = true',
            )
            .leftJoin('product.aliases', 'searchAlias')
            .distinct(true);
        this.applyProductSearch(builder, query.search);
        const [products, total] = await builder
            .orderBy('product.name', 'ASC')
            .addOrderBy('product.id', 'ASC')
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();
        return this.page(
            products.map((product) => this.presentProduct(product)),
            total,
            page,
            limit,
        );
    }

    async getPublicProduct(productSlug: string) {
        const product = await this.products.findOneBy({ slug: productSlug });
        if (!product)
            throw new NotFoundException('Support product was not found');
        const profile = await this.profiles.findOneBy({
            productId: product.id,
            isPublished: true,
        });
        if (!profile)
            throw new NotFoundException('Support product was not found');

        const resourceLinks = await this.productResources
            .createQueryBuilder('link')
            .innerJoinAndSelect('link.resource', 'resource')
            .where('link.productId = :productId', { productId: product.id })
            .andWhere('resource.isPublished = true')
            .andWhere(
                `EXISTS (
                    SELECT 1
                    FROM "support_resource_versions" "publishedVersion"
                    WHERE "publishedVersion"."resourceId" = resource.id
                      AND "publishedVersion"."isPublished" = true
                )`,
            )
            .orderBy('link.sortOrder', 'ASC')
            .addOrderBy('resource.type', 'ASC')
            .addOrderBy('resource.title', 'ASC')
            .addOrderBy('resource.id', 'ASC')
            .getMany();
        const articleLinks = await this.productArticles
            .createQueryBuilder('link')
            .innerJoinAndSelect('link.article', 'article')
            .where('link.productId = :productId', { productId: product.id })
            .andWhere('article.isPublished = true')
            .orderBy('link.sortOrder', 'ASC')
            .addOrderBy('article.title', 'ASC')
            .addOrderBy('article.id', 'ASC')
            .getMany();

        return {
            product: this.presentProduct(product),
            profile: {
                introMarkdown: profile.introMarkdown,
                seoTitle: profile.seoTitle,
                seoDescription: profile.seoDescription,
                publishedAt: profile.publishedAt,
            },
            resources: resourceLinks.map((link) => ({
                ...this.presentPublicResource(link.resource),
                compatibilityNote: link.compatibilityNote,
            })),
            articles: articleLinks.map((link) =>
                this.presentArticleSummary(link.article),
            ),
        };
    }

    async listPublicResources(query: SupportResourceListQueryDto) {
        const { page, limit } = this.pagination(query);
        const builder = this.resourceListBuilder(query, true);
        const [resources, total] = await builder
            .orderBy('resource.type', 'ASC')
            .addOrderBy('resource.title', 'ASC')
            .addOrderBy('resource.id', 'ASC')
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();
        return this.page(
            resources.map((resource) => this.presentPublicResource(resource)),
            total,
            page,
            limit,
        );
    }

    async getPublicResource(slug: string) {
        const resource = await this.resources.findOneBy({
            slug,
            isPublished: true,
        });
        if (!resource)
            throw new NotFoundException('Support resource was not found');
        const [productLinks, versions] = await Promise.all([
            this.productResources
                .createQueryBuilder('link')
                .innerJoinAndSelect('link.product', 'product')
                .where('link.resourceId = :resourceId', {
                    resourceId: resource.id,
                })
                .orderBy('link.sortOrder', 'ASC')
                .addOrderBy('product.name', 'ASC')
                .addOrderBy('product.id', 'ASC')
                .getMany(),
            this.versions.find({
                where: { resourceId: resource.id, isPublished: true },
                order: {
                    isCurrent: 'DESC',
                    sortOrder: 'ASC',
                    releaseDate: 'DESC',
                    id: 'DESC',
                },
            }),
        ]);
        if (!versions.length) {
            throw new NotFoundException('Support resource was not found');
        }
        return {
            ...this.presentPublicResource(resource),
            products: productLinks.map((link) => ({
                ...this.presentProduct(link.product),
                compatibilityNote: link.compatibilityNote,
            })),
            versions: versions.map((version) =>
                this.presentPublicVersion(version),
            ),
        };
    }

    async getAdminProfile(productId: number) {
        const product = await this.requireProduct(this.products, productId);
        const profile = await this.profiles.findOneBy({ productId });
        return {
            product: this.presentProduct(product),
            profile: profile ? this.presentAdminProfile(profile) : null,
        };
    }

    updateProfile(
        productId: number,
        input: UpdateProductSupportProfileDto,
        actor: AdminPrincipal,
    ) {
        return this.dataSource.transaction(async (manager) => {
            const products = manager.getRepository(CatalogProductEntity);
            const product = await this.requireProduct(products, productId);
            const profiles = manager.getRepository(ProductSupportProfileEntity);
            let profile = await profiles.findOneBy({ productId });
            profile ??= profiles.create({
                productId,
                introMarkdown: null,
                seoTitle: null,
                seoDescription: null,
                isPublished: false,
                publishedAt: null,
            });
            if (Object.hasOwn(input, 'introMarkdown')) {
                profile.introMarkdown = this.nullableText(input.introMarkdown);
            }
            if (Object.hasOwn(input, 'seoTitle')) {
                profile.seoTitle = this.nullableText(input.seoTitle);
            }
            if (Object.hasOwn(input, 'seoDescription')) {
                profile.seoDescription = this.nullableText(
                    input.seoDescription,
                );
            }
            if (profile.isPublished && !profile.introMarkdown?.trim()) {
                throw new ConflictException(
                    'Published support profile requires intro content',
                );
            }
            profile = await profiles.save(profile);
            await this.recordAudit(
                manager,
                actor,
                'support.profile.update',
                'product_support_profile',
                productId,
                { productSlug: product.slug },
            );
            return {
                product: this.presentProduct(product),
                profile: this.presentAdminProfile(profile),
            };
        });
    }

    setProfilePublished(
        productId: number,
        isPublished: boolean,
        actor: AdminPrincipal,
    ) {
        return this.dataSource.transaction(async (manager) => {
            const product = await this.requireProduct(
                manager.getRepository(CatalogProductEntity),
                productId,
            );
            const profiles = manager.getRepository(ProductSupportProfileEntity);
            const profile = await profiles.findOneBy({ productId });
            if (!profile)
                throw new ConflictException(
                    'Support profile must be created first',
                );
            if (isPublished && !profile.introMarkdown?.trim()) {
                throw new ConflictException(
                    'Support profile intro is required for publication',
                );
            }
            if (profile.isPublished !== isPublished) {
                profile.isPublished = isPublished;
                profile.publishedAt = isPublished ? new Date() : null;
                await profiles.save(profile);
                await this.recordAudit(
                    manager,
                    actor,
                    isPublished
                        ? 'support.profile.publish'
                        : 'support.profile.unpublish',
                    'product_support_profile',
                    productId,
                    { productSlug: product.slug },
                );
            }
            return {
                product: this.presentProduct(product),
                profile: this.presentAdminProfile(profile),
            };
        });
    }

    async listAdminResources(query: SupportResourceListQueryDto) {
        const { page, limit } = this.pagination(query);
        const builder = this.resourceListBuilder(query, false);
        const [resources, total] = await builder
            .orderBy('resource.updatedAt', 'DESC')
            .addOrderBy('resource.id', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();
        return this.page(
            resources.map((resource) => this.presentAdminResource(resource)),
            total,
            page,
            limit,
        );
    }

    async getAdminResource(id: number) {
        const resource = await this.requireResource(this.resources, id);
        const [productLinks, versions] = await Promise.all([
            this.productResources.find({
                where: { resourceId: id },
                relations: { product: true },
                order: { sortOrder: 'ASC', id: 'ASC' },
            }),
            this.versions.find({
                where: { resourceId: id },
                order: { sortOrder: 'ASC', id: 'ASC' },
            }),
        ]);
        return this.presentAdminResourceDetail(
            resource,
            productLinks,
            versions,
        );
    }

    createResource(input: CreateSupportResourceDto, actor: AdminPrincipal) {
        return this.withConflictMapping(() =>
            this.dataSource.transaction(async (manager) => {
                this.assertSafeOptionalUrl(input.sourceUrl, 'sourceUrl');
                const resources = manager.getRepository(SupportResourceEntity);
                const resource = await resources.save(
                    resources.create({
                        slug: input.slug.trim(),
                        title: input.title.trim(),
                        summary: this.nullableText(input.summary),
                        descriptionMarkdown: this.nullableText(
                            input.descriptionMarkdown,
                        ),
                        type: input.type,
                        manufacturerName: this.nullableText(
                            input.manufacturerName,
                        ),
                        isOfficial: input.isOfficial ?? false,
                        sourceName: this.nullableText(input.sourceName),
                        sourceUrl: this.nullableText(input.sourceUrl),
                        lastVerifiedAt: this.toDate(input.lastVerifiedAt),
                        seoTitle: this.nullableText(input.seoTitle),
                        seoDescription: this.nullableText(input.seoDescription),
                        isPublished: false,
                        publishedAt: null,
                    }),
                );
                const productLinks = await this.replaceProductLinks(
                    manager,
                    resource.id,
                    input.products ?? [],
                );
                await this.recordAudit(
                    manager,
                    actor,
                    'support.resource.create',
                    'support_resource',
                    resource.id,
                    { slug: resource.slug, type: resource.type },
                );
                return this.presentAdminResourceDetail(
                    resource,
                    productLinks,
                    [],
                );
            }),
        );
    }

    updateResource(
        id: number,
        input: UpdateSupportResourceDto,
        actor: AdminPrincipal,
    ) {
        return this.withConflictMapping(() =>
            this.dataSource.transaction(async (manager) => {
                const resources = manager.getRepository(SupportResourceEntity);
                let resource = await this.requireResource(resources, id);
                if (input.slug !== undefined) resource.slug = input.slug.trim();
                if (input.title !== undefined)
                    resource.title = input.title.trim();
                if (Object.hasOwn(input, 'summary')) {
                    resource.summary = this.nullableText(input.summary);
                }
                if (Object.hasOwn(input, 'descriptionMarkdown')) {
                    resource.descriptionMarkdown = this.nullableText(
                        input.descriptionMarkdown,
                    );
                }
                if (input.type !== undefined) resource.type = input.type;
                if (Object.hasOwn(input, 'manufacturerName')) {
                    resource.manufacturerName = this.nullableText(
                        input.manufacturerName,
                    );
                }
                if (input.isOfficial !== undefined) {
                    resource.isOfficial = input.isOfficial;
                }
                if (Object.hasOwn(input, 'sourceName')) {
                    resource.sourceName = this.nullableText(input.sourceName);
                }
                if (Object.hasOwn(input, 'sourceUrl')) {
                    this.assertSafeOptionalUrl(input.sourceUrl, 'sourceUrl');
                    resource.sourceUrl = this.nullableText(input.sourceUrl);
                }
                if (Object.hasOwn(input, 'lastVerifiedAt')) {
                    resource.lastVerifiedAt = this.toDate(input.lastVerifiedAt);
                }
                if (Object.hasOwn(input, 'seoTitle')) {
                    resource.seoTitle = this.nullableText(input.seoTitle);
                }
                if (Object.hasOwn(input, 'seoDescription')) {
                    resource.seoDescription = this.nullableText(
                        input.seoDescription,
                    );
                }
                if (
                    resource.isPublished &&
                    (!resource.slug || !resource.title || !resource.type)
                ) {
                    throw new ConflictException(
                        'Published support resource must remain publication-ready',
                    );
                }
                resource = await resources.save(resource);
                const productLinks =
                    input.products === undefined
                        ? await manager
                              .getRepository(ProductSupportResourceEntity)
                              .find({
                                  where: { resourceId: id },
                                  relations: { product: true },
                                  order: { sortOrder: 'ASC', id: 'ASC' },
                              })
                        : await this.replaceProductLinks(
                              manager,
                              id,
                              input.products,
                          );
                const versions = await manager
                    .getRepository(SupportResourceVersionEntity)
                    .find({
                        where: { resourceId: id },
                        order: { sortOrder: 'ASC', id: 'ASC' },
                    });
                await this.recordAudit(
                    manager,
                    actor,
                    'support.resource.update',
                    'support_resource',
                    id,
                    { slug: resource.slug, type: resource.type },
                );
                return this.presentAdminResourceDetail(
                    resource,
                    productLinks,
                    versions,
                );
            }),
        );
    }

    setResourcePublished(
        id: number,
        isPublished: boolean,
        actor: AdminPrincipal,
    ) {
        return this.dataSource.transaction(async (manager) => {
            const resources = manager.getRepository(SupportResourceEntity);
            const resource = await this.requireResource(resources, id);
            if (isPublished) {
                const publishedVersionCount = await manager
                    .getRepository(SupportResourceVersionEntity)
                    .countBy({ resourceId: id, isPublished: true });
                if (!resource.slug || !resource.title || !resource.type) {
                    throw new ConflictException(
                        'Support resource is not ready for publication',
                    );
                }
                if (!publishedVersionCount) {
                    throw new ConflictException(
                        'A published resource version is required',
                    );
                }
            }
            if (resource.isPublished !== isPublished) {
                resource.isPublished = isPublished;
                resource.publishedAt = isPublished ? new Date() : null;
                await resources.save(resource);
                await this.recordAudit(
                    manager,
                    actor,
                    isPublished
                        ? 'support.resource.publish'
                        : 'support.resource.unpublish',
                    'support_resource',
                    id,
                    { slug: resource.slug, type: resource.type },
                );
            }
            return this.getAdminResourceWithManager(manager, resource);
        });
    }

    createVersion(
        resourceId: number,
        input: CreateSupportResourceVersionDto,
        actor: AdminPrincipal,
    ) {
        return this.dataSource.transaction(async (manager) => {
            await this.requireResource(
                manager.getRepository(SupportResourceEntity),
                resourceId,
            );
            const versions = manager.getRepository(
                SupportResourceVersionEntity,
            );
            const version = versions.create({
                resourceId,
                versionLabel: this.nullableText(input.versionLabel),
                releaseDate: input.releaseDate ?? null,
                platform: input.platform,
                architecture: input.architecture,
                languageCode: input.languageCode,
                distributionMode: input.distributionMode,
                externalUrl: this.nullableText(input.externalUrl),
                storedFileId: null,
                releaseNotesMarkdown: this.nullableText(
                    input.releaseNotesMarkdown,
                ),
                isCurrent: false,
                isPublished: false,
                sortOrder: input.sortOrder ?? 0,
            });
            this.assertVersionShape(version);
            const saved = await versions.save(version);
            await this.recordAudit(
                manager,
                actor,
                'support.version.create',
                'support_resource_version',
                saved.id,
                {
                    resourceId,
                    versionLabel: saved.versionLabel,
                    platform: saved.platform,
                },
            );
            return this.presentAdminVersion(saved);
        });
    }

    updateVersion(
        versionId: number,
        input: UpdateSupportResourceVersionDto,
        actor: AdminPrincipal,
    ) {
        return this.dataSource.transaction(async (manager) => {
            const versions = manager.getRepository(
                SupportResourceVersionEntity,
            );
            let version = await this.requireVersion(versions, versionId);
            const changesCurrentScope =
                (input.platform !== undefined &&
                    input.platform !== version.platform) ||
                (input.architecture !== undefined &&
                    input.architecture !== version.architecture) ||
                (input.languageCode !== undefined &&
                    input.languageCode !== version.languageCode);
            if (version.isCurrent && changesCurrentScope) {
                throw new ConflictException(
                    'Select another current version before changing this scope',
                );
            }
            if (Object.hasOwn(input, 'versionLabel')) {
                version.versionLabel = this.nullableText(input.versionLabel);
            }
            if (Object.hasOwn(input, 'releaseDate')) {
                version.releaseDate = input.releaseDate ?? null;
            }
            if (input.platform !== undefined) version.platform = input.platform;
            if (input.architecture !== undefined) {
                version.architecture = input.architecture;
            }
            if (input.languageCode !== undefined) {
                version.languageCode = input.languageCode;
            }
            if (input.distributionMode !== undefined) {
                if (
                    input.distributionMode === 'external' &&
                    version.storedFileId !== null
                ) {
                    throw new ConflictException(
                        'A hosted file must be detached by the future FS-1 workflow',
                    );
                }
                version.distributionMode = input.distributionMode;
                if (input.distributionMode === 'hosted')
                    version.externalUrl = null;
            }
            if (Object.hasOwn(input, 'externalUrl')) {
                version.externalUrl = this.nullableText(input.externalUrl);
            }
            if (Object.hasOwn(input, 'releaseNotesMarkdown')) {
                version.releaseNotesMarkdown = this.nullableText(
                    input.releaseNotesMarkdown,
                );
            }
            if (input.sortOrder !== undefined)
                version.sortOrder = input.sortOrder;
            this.assertVersionShape(version);
            if (version.isPublished) this.assertVersionPublishReady(version);
            version = await versions.save(version);
            await this.recordAudit(
                manager,
                actor,
                'support.version.update',
                'support_resource_version',
                version.id,
                {
                    resourceId: version.resourceId,
                    versionLabel: version.versionLabel,
                    platform: version.platform,
                },
            );
            return this.presentAdminVersion(version);
        });
    }

    setVersionPublished(
        versionId: number,
        isPublished: boolean,
        actor: AdminPrincipal,
    ) {
        return this.dataSource.transaction(async (manager) => {
            const versions = manager.getRepository(
                SupportResourceVersionEntity,
            );
            const version = await this.requireVersion(versions, versionId);
            if (isPublished) this.assertVersionPublishReady(version);
            if (version.isPublished !== isPublished) {
                version.isPublished = isPublished;
                await versions.save(version);
                await this.recordAudit(
                    manager,
                    actor,
                    isPublished
                        ? 'support.version.publish'
                        : 'support.version.unpublish',
                    'support_resource_version',
                    version.id,
                    {
                        resourceId: version.resourceId,
                        versionLabel: version.versionLabel,
                        platform: version.platform,
                    },
                );
            }
            return this.presentAdminVersion(version);
        });
    }

    makeVersionCurrent(versionId: number, actor: AdminPrincipal) {
        return this.withConflictMapping(() =>
            this.dataSource.transaction(async (manager) => {
                const versions = manager.getRepository(
                    SupportResourceVersionEntity,
                );
                let version = await this.requireVersion(versions, versionId);
                const lockKey = [
                    version.resourceId,
                    version.platform,
                    version.architecture,
                    version.languageCode,
                ].join(':');
                await manager.query(
                    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
                    [lockKey],
                );
                version = await this.requireVersion(versions, versionId);
                if (!version.isPublished) {
                    throw new ConflictException(
                        'Only a published resource version can be current',
                    );
                }
                if (!version.isCurrent) {
                    await versions
                        .createQueryBuilder()
                        .update(SupportResourceVersionEntity)
                        .set({ isCurrent: false })
                        .where('resourceId = :resourceId', {
                            resourceId: version.resourceId,
                        })
                        .andWhere('platform = :platform', {
                            platform: version.platform,
                        })
                        .andWhere('architecture = :architecture', {
                            architecture: version.architecture,
                        })
                        .andWhere('languageCode = :languageCode', {
                            languageCode: version.languageCode,
                        })
                        .andWhere('isCurrent = true')
                        .execute();
                    version.isCurrent = true;
                    await versions.save(version);
                    await this.recordAudit(
                        manager,
                        actor,
                        'support.version.make_current',
                        'support_resource_version',
                        version.id,
                        {
                            resourceId: version.resourceId,
                            versionLabel: version.versionLabel,
                            platform: version.platform,
                        },
                    );
                }
                return this.presentAdminVersion(version);
            }),
        );
    }

    private resourceListBuilder(
        query: SupportResourceListQueryDto,
        publicOnly: boolean,
    ) {
        const builder = this.resources
            .createQueryBuilder('resource')
            .leftJoin(
                ProductSupportResourceEntity,
                'productLink',
                'productLink.resourceId = resource.id',
            )
            .leftJoin(
                CatalogProductEntity,
                'linkedProduct',
                'linkedProduct.id = productLink.productId',
            )
            .leftJoin(
                CatalogProductAliasEntity,
                'linkedAlias',
                'linkedAlias.productId = linkedProduct.id',
            )
            .leftJoin(
                SupportResourceVersionEntity,
                'searchVersion',
                publicOnly
                    ? 'searchVersion.resourceId = resource.id AND searchVersion.isPublished = true'
                    : 'searchVersion.resourceId = resource.id',
            )
            .distinct(true);
        if (publicOnly) {
            builder
                .andWhere('resource.isPublished = true')
                .andWhere('searchVersion.id IS NOT NULL');
        }
        if (query.product) {
            builder.andWhere('linkedProduct.slug = :productSlug', {
                productSlug: query.product,
            });
        }
        if (query.type) {
            builder.andWhere('resource.type = :type', { type: query.type });
        }
        if (query.platform) {
            builder.andWhere('searchVersion.platform = :platform', {
                platform: query.platform,
            });
        }
        const search = query.search?.trim();
        if (search) {
            const normalized = normalizeCatalogAlias(search);
            const conditions = [
                'resource.title ILIKE :search',
                'resource.manufacturerName ILIKE :search',
                'linkedProduct.name ILIKE :search',
                'linkedProduct.sku ILIKE :search',
            ];
            const parameters: Record<string, string> = {
                search: `%${this.escapeLike(search)}%`,
            };
            if (normalized) {
                conditions.push('linkedAlias.normalizedAlias LIKE :normalized');
                parameters.normalized = `%${normalized}%`;
            }
            builder.andWhere(`(${conditions.join(' OR ')})`, parameters);
        }
        return builder;
    }

    private applyProductSearch(
        builder: ReturnType<
            Repository<CatalogProductEntity>['createQueryBuilder']
        >,
        value?: string,
    ) {
        const search = value?.trim();
        if (!search) return;
        const normalized = normalizeCatalogAlias(search);
        const conditions = [
            'product.name ILIKE :search',
            'product.sku ILIKE :search',
            'product.brand ILIKE :search',
        ];
        const parameters: Record<string, string> = {
            search: `%${this.escapeLike(search)}%`,
        };
        if (normalized) {
            conditions.push('searchAlias.normalizedAlias LIKE :normalized');
            parameters.normalized = `%${normalized}%`;
        }
        builder.andWhere(`(${conditions.join(' OR ')})`, parameters);
    }

    private async replaceProductLinks(
        manager: EntityManager,
        resourceId: number,
        values: SupportResourceProductDto[],
    ) {
        const productIds = values.map((value) => value.productId);
        if (new Set(productIds).size !== productIds.length) {
            throw new BadRequestException('Duplicate product relation');
        }
        await this.requireProducts(manager, productIds);
        const links = manager.getRepository(ProductSupportResourceEntity);
        await links.delete({ resourceId });
        if (!values.length) return [];
        const saved = await links.save(
            values.map((value) =>
                links.create({
                    resourceId,
                    productId: value.productId,
                    compatibilityNote: this.nullableText(
                        value.compatibilityNote,
                    ),
                    sortOrder: value.sortOrder ?? 0,
                }),
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

    private async requireProducts(manager: EntityManager, ids: number[]) {
        if (!ids.length) return;
        const count = await manager
            .getRepository(CatalogProductEntity)
            .countBy({ id: In(ids) });
        if (count !== ids.length) {
            throw new BadRequestException(
                'Referenced catalog product was not found',
            );
        }
    }

    private async getAdminResourceWithManager(
        manager: EntityManager,
        resource: SupportResourceEntity,
    ) {
        const [links, versions] = await Promise.all([
            manager.getRepository(ProductSupportResourceEntity).find({
                where: { resourceId: resource.id },
                relations: { product: true },
                order: { sortOrder: 'ASC', id: 'ASC' },
            }),
            manager.getRepository(SupportResourceVersionEntity).find({
                where: { resourceId: resource.id },
                order: { sortOrder: 'ASC', id: 'ASC' },
            }),
        ]);
        return this.presentAdminResourceDetail(resource, links, versions);
    }

    private async requireProduct(
        repository: Repository<CatalogProductEntity>,
        id: number,
    ) {
        const product = await repository.findOneBy({ id });
        if (!product)
            throw new NotFoundException('Catalog product was not found');
        return product;
    }

    private async requireResource(
        repository: Repository<SupportResourceEntity>,
        id: number,
    ) {
        const resource = await repository.findOneBy({ id });
        if (!resource)
            throw new NotFoundException('Support resource was not found');
        return resource;
    }

    private async requireVersion(
        repository: Repository<SupportResourceVersionEntity>,
        id: number,
    ) {
        const version = await repository.findOneBy({ id });
        if (!version)
            throw new NotFoundException(
                'Support resource version was not found',
            );
        return version;
    }

    private assertVersionShape(version: SupportResourceVersionEntity) {
        if (version.distributionMode === 'hosted') {
            if (version.externalUrl) {
                throw new BadRequestException(
                    'Hosted resource version cannot have externalUrl',
                );
            }
            return;
        }
        if (version.storedFileId !== null) {
            throw new ConflictException(
                'External resource version cannot have a stored file',
            );
        }
        this.assertSafeOptionalUrl(version.externalUrl, 'externalUrl');
    }

    private assertVersionPublishReady(version: SupportResourceVersionEntity) {
        if (version.distributionMode === 'hosted') {
            throw new ConflictException(
                'Hosted support publication requires the future FS-1 attachment workflow',
            );
        }
        if (!version.externalUrl || !isSafeHttpsUrl(version.externalUrl)) {
            throw new ConflictException(
                'A safe HTTPS externalUrl is required for publication',
            );
        }
    }

    private assertSafeOptionalUrl(
        value: string | null | undefined,
        field: string,
    ) {
        if (value && !isSafeHttpsUrl(value)) {
            throw new BadRequestException(
                `${field} must be an HTTPS URL without credentials`,
            );
        }
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

    private presentAdminProfile(profile: ProductSupportProfileEntity) {
        return {
            productId: profile.productId,
            introMarkdown: profile.introMarkdown,
            seoTitle: profile.seoTitle,
            seoDescription: profile.seoDescription,
            isPublished: profile.isPublished,
            publishedAt: profile.publishedAt,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
        };
    }

    private presentPublicResource(resource: SupportResourceEntity) {
        return {
            id: resource.id,
            slug: resource.slug,
            title: resource.title,
            summary: resource.summary,
            descriptionMarkdown: resource.descriptionMarkdown,
            type: resource.type,
            manufacturerName: resource.manufacturerName,
            isOfficial: resource.isOfficial,
            sourceName: resource.sourceName,
            sourceUrl:
                resource.sourceUrl && isSafeHttpsUrl(resource.sourceUrl)
                    ? resource.sourceUrl
                    : null,
            lastVerifiedAt: resource.lastVerifiedAt,
            seoTitle: resource.seoTitle,
            seoDescription: resource.seoDescription,
            publishedAt: resource.publishedAt,
        };
    }

    private presentAdminResource(resource: SupportResourceEntity) {
        return {
            ...this.presentPublicResource(resource),
            isPublished: resource.isPublished,
            createdAt: resource.createdAt,
            updatedAt: resource.updatedAt,
        };
    }

    private presentAdminResourceDetail(
        resource: SupportResourceEntity,
        links: ProductSupportResourceEntity[],
        versions: SupportResourceVersionEntity[],
    ) {
        return {
            ...this.presentAdminResource(resource),
            products: links.map((link) => ({
                ...this.presentProduct(link.product),
                compatibilityNote: link.compatibilityNote,
                sortOrder: link.sortOrder,
            })),
            versions: versions.map((version) =>
                this.presentAdminVersion(version),
            ),
        };
    }

    private presentPublicVersion(version: SupportResourceVersionEntity) {
        return {
            id: version.id,
            versionLabel: version.versionLabel,
            releaseDate: version.releaseDate,
            platform: version.platform,
            architecture: version.architecture,
            languageCode: version.languageCode,
            distributionMode: version.distributionMode,
            externalUrl:
                version.distributionMode === 'external' &&
                version.externalUrl &&
                isSafeHttpsUrl(version.externalUrl)
                    ? version.externalUrl
                    : null,
            releaseNotesMarkdown: version.releaseNotesMarkdown,
            isCurrent: version.isCurrent,
        };
    }

    private presentAdminVersion(version: SupportResourceVersionEntity) {
        return {
            ...this.presentPublicVersion(version),
            resourceId: version.resourceId,
            hasStoredFile: version.storedFileId !== null,
            isPublished: version.isPublished,
            sortOrder: version.sortOrder,
            createdAt: version.createdAt,
            updatedAt: version.updatedAt,
        };
    }

    private presentArticleSummary(article: KnowledgeArticleEntity) {
        return {
            id: article.id,
            slug: article.slug,
            title: article.title,
            excerpt: article.excerpt,
            type: article.type,
            publishedAt: article.publishedAt,
        };
    }

    private pagination(query: { page?: number; limit?: number }) {
        return {
            page: query.page ?? 1,
            limit: query.limit ?? CONTENT_PAGE_SIZE_DEFAULT,
        };
    }

    private page<T>(items: T[], total: number, page: number, limit: number) {
        return {
            items,
            total,
            page,
            limit,
            totalPages: total ? Math.ceil(total / limit) : 0,
        };
    }

    private nullableText(value: string | null | undefined) {
        const normalized = value?.trim();
        return normalized ? normalized : null;
    }

    private toDate(value: string | null | undefined) {
        return value ? new Date(value) : null;
    }

    private escapeLike(value: string) {
        return value.replace(/[\\%_]/g, (item) => `\\${item}`);
    }

    private recordAudit(
        manager: EntityManager,
        actor: AdminPrincipal,
        action: string,
        targetType: string,
        targetId: number,
        metadata: Record<string, unknown>,
    ) {
        return this.audit.record(
            {
                actorType: 'staff',
                actorStaffId: actor.id,
                actorSessionId: actor.sessionId,
                action,
                targetType,
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
                UQ_support_resources_slug:
                    'Support resource slug already exists',
                UQ_product_support_resources_pair:
                    'Duplicate product and support resource relation',
                UQ_support_resource_versions_current_scope:
                    'Another current version exists for this scope',
            };
            throw new ConflictException(
                messages[driver.constraint || ''] ||
                    'Support content value already exists',
            );
        }
    }
}
