import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuditService } from 'src/audit/audit.service';
import {
    DataSource,
    EntityManager,
    QueryFailedError,
    Repository,
} from 'typeorm';
import {
    CATALOG_PAGE_SIZE_DEFAULT,
    normalizeCatalogAlias,
    normalizeCatalogSku,
} from './catalog.types';
import type {
    CatalogProductListQueryDto,
    CreateCatalogCategoryDto,
    CreateCatalogProductDto,
    UpdateCatalogCategoryDto,
    UpdateCatalogProductDto,
} from './dto/catalog.dto';
import { CatalogCategoryEntity } from './entities/catalog-category.entity';
import { CatalogProductAliasEntity } from './entities/catalog-product-alias.entity';
import { CatalogProductEntity } from './entities/catalog-product.entity';

export interface CatalogAdminActor {
    id: number;
    sessionId: number;
}

@Injectable()
export class CatalogService {
    constructor(
        private readonly dataSource: DataSource,
        @InjectRepository(CatalogCategoryEntity)
        private readonly categories: Repository<CatalogCategoryEntity>,
        @InjectRepository(CatalogProductEntity)
        private readonly products: Repository<CatalogProductEntity>,
        private readonly audit: AuditService,
    ) {}

    async listPublicCategories() {
        const categories = await this.categories.find({
            where: { isPublished: true },
            order: { sortOrder: 'ASC', name: 'ASC', id: 'ASC' },
        });
        return categories.map((category) =>
            this.presentPublicCategory(category),
        );
    }

    async listPublicProducts(query: CatalogProductListQueryDto) {
        const builder = this.productListBuilder(query, true);
        const { page, limit } = this.pagination(query);
        const [products, total] = await builder
            .orderBy('product.isPopular', 'DESC')
            .addOrderBy('product.isNew', 'DESC')
            .addOrderBy('product.name', 'ASC')
            .addOrderBy('product.id', 'ASC')
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();
        return {
            items: products.map((product) =>
                this.presentPublicProduct(product),
            ),
            total,
            page,
            limit,
            totalPages: total ? Math.ceil(total / limit) : 0,
        };
    }

    async getPublicProduct(slug: string) {
        const product = await this.products.findOne({
            where: {
                slug,
                isActive: true,
                isPublished: true,
                category: { isPublished: true },
            },
            relations: { category: true },
        });
        if (!product)
            throw new NotFoundException('Catalog product was not found');
        return this.presentPublicProduct(product);
    }

    async listAdminCategories() {
        const categories = await this.categories.find({
            order: { sortOrder: 'ASC', name: 'ASC', id: 'ASC' },
        });
        return categories.map((category) =>
            this.presentAdminCategory(category),
        );
    }

    async createCategory(
        input: CreateCatalogCategoryDto,
        actor: CatalogAdminActor,
    ) {
        return this.withCatalogConflictMapping(() =>
            this.dataSource.transaction(async (manager) => {
                const categories = manager.getRepository(CatalogCategoryEntity);
                await this.requireCategoryParent(
                    categories,
                    input.parentId ?? null,
                );
                const category = await categories.save(
                    categories.create({
                        parentId: input.parentId ?? null,
                        name: input.name.trim(),
                        slug: input.slug.trim(),
                        description: this.nullableText(input.description),
                        sortOrder: input.sortOrder ?? 0,
                        isPublished: false,
                        oneCRef: this.nullableText(input.oneCRef),
                    }),
                );
                await this.recordAudit(
                    manager,
                    actor,
                    'catalog.category.create',
                    'catalog_category',
                    category.id,
                    { slug: category.slug, parentId: category.parentId },
                );
                return this.presentAdminCategory(category);
            }),
        );
    }

    async updateCategory(
        id: number,
        input: UpdateCatalogCategoryDto,
        actor: CatalogAdminActor,
    ) {
        return this.withCatalogConflictMapping(() =>
            this.dataSource.transaction(async (manager) => {
                const categories = manager.getRepository(CatalogCategoryEntity);
                const category = await this.requireCategory(categories, id);
                if (Object.hasOwn(input, 'parentId')) {
                    await this.assertCategoryParentChange(
                        categories,
                        id,
                        input.parentId ?? null,
                    );
                    category.parentId = input.parentId ?? null;
                }
                if (input.name !== undefined) category.name = input.name.trim();
                if (input.slug !== undefined) category.slug = input.slug.trim();
                if (Object.hasOwn(input, 'description')) {
                    category.description = this.nullableText(input.description);
                }
                if (input.sortOrder !== undefined)
                    category.sortOrder = input.sortOrder;
                if (Object.hasOwn(input, 'oneCRef')) {
                    category.oneCRef = this.nullableText(input.oneCRef);
                }
                const saved = await categories.save(category);
                await this.recordAudit(
                    manager,
                    actor,
                    'catalog.category.update',
                    'catalog_category',
                    saved.id,
                    { slug: saved.slug, parentId: saved.parentId },
                );
                return this.presentAdminCategory(saved);
            }),
        );
    }

    setCategoryPublished(
        id: number,
        isPublished: boolean,
        actor: CatalogAdminActor,
    ) {
        return this.withCatalogConflictMapping(() =>
            this.dataSource.transaction(async (manager) => {
                const categories = manager.getRepository(CatalogCategoryEntity);
                const category = await this.requireCategory(categories, id);
                if (category.isPublished !== isPublished) {
                    category.isPublished = isPublished;
                    await categories.save(category);
                    await this.recordAudit(
                        manager,
                        actor,
                        isPublished
                            ? 'catalog.category.publish'
                            : 'catalog.category.unpublish',
                        'catalog_category',
                        category.id,
                        { slug: category.slug },
                    );
                }
                return this.presentAdminCategory(category);
            }),
        );
    }

    async listAdminProducts(query: CatalogProductListQueryDto) {
        const builder = this.productListBuilder(query, false).leftJoinAndSelect(
            'product.aliases',
            'selectedAliases',
        );
        const { page, limit } = this.pagination(query);
        const [products, total] = await builder
            .orderBy('product.updatedAt', 'DESC')
            .addOrderBy('product.id', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();
        return {
            items: products.map((product) => this.presentAdminProduct(product)),
            total,
            page,
            limit,
            totalPages: total ? Math.ceil(total / limit) : 0,
        };
    }

    async getAdminProduct(id: number) {
        const product = await this.products.findOne({
            where: { id },
            relations: { category: true, aliases: true },
        });
        if (!product)
            throw new NotFoundException('Catalog product was not found');
        return this.presentAdminProduct(product);
    }

    async createProduct(
        input: CreateCatalogProductDto,
        actor: CatalogAdminActor,
    ) {
        return this.withCatalogConflictMapping(() =>
            this.dataSource.transaction(async (manager) => {
                await this.requireCategory(
                    manager.getRepository(CatalogCategoryEntity),
                    input.categoryId,
                );
                const products = manager.getRepository(CatalogProductEntity);
                const product = await products.save(
                    products.create({
                        categoryId: input.categoryId,
                        sku: normalizeCatalogSku(input.sku),
                        slug: input.slug.trim(),
                        name: input.name.trim(),
                        brand: this.nullableText(input.brand),
                        shortDescription: this.nullableText(
                            input.shortDescription,
                        ),
                        description: this.nullableText(input.description),
                        displayPriceMinor: input.displayPriceMinor ?? null,
                        vatRate: input.vatRate ?? 2000,
                        availabilityStatus:
                            input.availabilityStatus ?? 'on_request',
                        features: this.cleanList(input.features),
                        specifications: input.specifications ?? {},
                        packageContents: this.cleanList(input.packageContents),
                        isActive: true,
                        isPublished: false,
                        isPopular: input.isPopular ?? false,
                        isNew: input.isNew ?? false,
                        oneCRef: this.nullableText(input.oneCRef),
                        oneCSyncedAt: null,
                    }),
                );
                product.aliases = await this.replaceAliases(
                    manager,
                    product.id,
                    input.aliases ?? [],
                );
                product.category = await this.requireCategory(
                    manager.getRepository(CatalogCategoryEntity),
                    product.categoryId,
                );
                await this.recordAudit(
                    manager,
                    actor,
                    'catalog.product.create',
                    'catalog_product',
                    product.id,
                    { sku: product.sku, slug: product.slug },
                );
                return this.presentAdminProduct(product);
            }),
        );
    }

    async updateProduct(
        id: number,
        input: UpdateCatalogProductDto,
        actor: CatalogAdminActor,
    ) {
        return this.withCatalogConflictMapping(() =>
            this.dataSource.transaction(async (manager) => {
                const products = manager.getRepository(CatalogProductEntity);
                const product = await this.requireProduct(products, id);
                if (input.categoryId !== undefined) {
                    await this.requireCategory(
                        manager.getRepository(CatalogCategoryEntity),
                        input.categoryId,
                    );
                    product.categoryId = input.categoryId;
                }
                if (input.sku !== undefined) {
                    product.sku = normalizeCatalogSku(input.sku);
                }
                if (input.slug !== undefined) product.slug = input.slug.trim();
                if (input.name !== undefined) product.name = input.name.trim();
                if (Object.hasOwn(input, 'brand')) {
                    product.brand = this.nullableText(input.brand);
                }
                if (Object.hasOwn(input, 'shortDescription')) {
                    product.shortDescription = this.nullableText(
                        input.shortDescription,
                    );
                }
                if (Object.hasOwn(input, 'description')) {
                    product.description = this.nullableText(input.description);
                }
                if (Object.hasOwn(input, 'displayPriceMinor')) {
                    product.displayPriceMinor = input.displayPriceMinor ?? null;
                }
                if (input.vatRate !== undefined)
                    product.vatRate = input.vatRate;
                if (input.availabilityStatus !== undefined) {
                    product.availabilityStatus = input.availabilityStatus;
                }
                if (input.features !== undefined) {
                    product.features = this.cleanList(input.features);
                }
                if (input.specifications !== undefined) {
                    product.specifications = input.specifications;
                }
                if (input.packageContents !== undefined) {
                    product.packageContents = this.cleanList(
                        input.packageContents,
                    );
                }
                if (input.isActive !== undefined) {
                    product.isActive = input.isActive;
                    if (!input.isActive) product.isPublished = false;
                }
                if (input.isPopular !== undefined) {
                    product.isPopular = input.isPopular;
                }
                if (input.isNew !== undefined) product.isNew = input.isNew;
                if (Object.hasOwn(input, 'oneCRef')) {
                    product.oneCRef = this.nullableText(input.oneCRef);
                }
                const saved = await products.save(product);
                if (input.aliases !== undefined) {
                    saved.aliases = await this.replaceAliases(
                        manager,
                        saved.id,
                        input.aliases,
                    );
                } else {
                    saved.aliases = await manager
                        .getRepository(CatalogProductAliasEntity)
                        .find({ where: { productId: saved.id } });
                }
                saved.category = await this.requireCategory(
                    manager.getRepository(CatalogCategoryEntity),
                    saved.categoryId,
                );
                await this.recordAudit(
                    manager,
                    actor,
                    'catalog.product.update',
                    'catalog_product',
                    saved.id,
                    { sku: saved.sku, slug: saved.slug },
                );
                return this.presentAdminProduct(saved);
            }),
        );
    }

    setProductPublished(
        id: number,
        isPublished: boolean,
        actor: CatalogAdminActor,
    ) {
        return this.withCatalogConflictMapping(() =>
            this.dataSource.transaction(async (manager) => {
                const products = manager.getRepository(CatalogProductEntity);
                const product = await this.requireProduct(products, id);
                const category = await this.requireCategory(
                    manager.getRepository(CatalogCategoryEntity),
                    product.categoryId,
                );
                if (isPublished) this.assertPublishReady(product, category);
                if (product.isPublished !== isPublished) {
                    product.isPublished = isPublished;
                    await products.save(product);
                    await this.recordAudit(
                        manager,
                        actor,
                        isPublished
                            ? 'catalog.product.publish'
                            : 'catalog.product.unpublish',
                        'catalog_product',
                        product.id,
                        { sku: product.sku, slug: product.slug },
                    );
                }
                product.category = category;
                product.aliases = await manager
                    .getRepository(CatalogProductAliasEntity)
                    .find({ where: { productId: product.id } });
                return this.presentAdminProduct(product);
            }),
        );
    }

    private productListBuilder(
        query: CatalogProductListQueryDto,
        publicOnly: boolean,
    ) {
        const builder = this.products
            .createQueryBuilder('product')
            .innerJoinAndSelect('product.category', 'category')
            .leftJoin('product.aliases', 'searchAlias')
            .distinct(true);
        if (publicOnly) {
            builder
                .andWhere('product.isPublished = true')
                .andWhere('product.isActive = true')
                .andWhere('category.isPublished = true');
        }
        if (query.category) {
            builder.andWhere('category.slug = :category', {
                category: query.category,
            });
        }
        if (query.availability) {
            builder.andWhere('product.availabilityStatus = :availability', {
                availability: query.availability,
            });
        }
        const search = query.search?.trim();
        if (search) {
            const normalizedSearch = normalizeCatalogAlias(search);
            const conditions = [
                'product.name ILIKE :search',
                'product.sku ILIKE :search',
                'product.brand ILIKE :search',
            ];
            const parameters: Record<string, string> = {
                search: `%${this.escapeLike(search)}%`,
            };
            if (normalizedSearch) {
                conditions.push(
                    'searchAlias.normalizedAlias LIKE :normalizedSearch',
                );
                parameters.normalizedSearch = `%${normalizedSearch}%`;
            }
            builder.andWhere(`(${conditions.join(' OR ')})`, parameters);
        }
        return builder;
    }

    private pagination(query: CatalogProductListQueryDto) {
        return {
            page: query.page ?? 1,
            limit: query.limit ?? CATALOG_PAGE_SIZE_DEFAULT,
        };
    }

    private async requireCategory(
        repository: Repository<CatalogCategoryEntity>,
        id: number,
    ) {
        const category = await repository.findOneBy({ id });
        if (!category)
            throw new NotFoundException('Catalog category was not found');
        return category;
    }

    private async requireCategoryParent(
        repository: Repository<CatalogCategoryEntity>,
        parentId: number | null,
    ) {
        if (parentId === null) return null;
        return this.requireCategory(repository, parentId);
    }

    private async assertCategoryParentChange(
        repository: Repository<CatalogCategoryEntity>,
        categoryId: number,
        parentId: number | null,
    ) {
        if (parentId === null) return;
        if (parentId === categoryId) {
            throw new ConflictException('A category cannot be its own parent');
        }
        const visited = new Set<number>();
        let currentId: number | null = parentId;
        while (currentId !== null) {
            if (currentId === categoryId) {
                throw new ConflictException(
                    'Category hierarchy cycle detected',
                );
            }
            if (visited.has(currentId)) {
                throw new ConflictException(
                    'Category hierarchy cycle detected',
                );
            }
            visited.add(currentId);
            const current = await this.requireCategory(repository, currentId);
            currentId = current.parentId;
        }
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

    private assertPublishReady(
        product: CatalogProductEntity,
        category: CatalogCategoryEntity,
    ) {
        if (!product.isActive) {
            throw new ConflictException('Inactive product cannot be published');
        }
        if (!category.isPublished) {
            throw new ConflictException(
                'Product category must be published first',
            );
        }
        if (!product.name || !product.sku || !product.slug) {
            throw new ConflictException('Product is not ready for publication');
        }
    }

    private async replaceAliases(
        manager: EntityManager,
        productId: number,
        values: string[],
    ) {
        const aliases = manager.getRepository(CatalogProductAliasEntity);
        const prepared = values.map((value) => ({
            alias: value.trim(),
            normalizedAlias: normalizeCatalogAlias(value),
        }));
        if (prepared.some((alias) => !alias.normalizedAlias)) {
            throw new BadRequestException(
                'Catalog alias is empty after normalization',
            );
        }
        if (prepared.some((alias) => alias.normalizedAlias.length > 160)) {
            throw new BadRequestException(
                'Normalized catalog alias is too long',
            );
        }
        if (
            new Set(prepared.map((alias) => alias.normalizedAlias)).size !==
            prepared.length
        ) {
            throw new ConflictException('Duplicate normalized catalog alias');
        }
        await aliases.delete({ productId });
        if (!prepared.length) return [];
        return aliases.save(
            prepared.map((alias) => aliases.create({ productId, ...alias })),
        );
    }

    private presentPublicCategory(category: CatalogCategoryEntity) {
        return {
            id: category.id,
            parentId: category.parentId,
            name: category.name,
            slug: category.slug,
            description: category.description,
            sortOrder: category.sortOrder,
        };
    }

    private presentAdminCategory(category: CatalogCategoryEntity) {
        return {
            ...this.presentPublicCategory(category),
            isPublished: category.isPublished,
            oneCRef: category.oneCRef,
            createdAt: category.createdAt,
            updatedAt: category.updatedAt,
        };
    }

    private presentPublicProduct(product: CatalogProductEntity) {
        return {
            id: product.id,
            slug: product.slug,
            sku: product.sku,
            name: product.name,
            brand: product.brand,
            category: {
                id: product.category.id,
                slug: product.category.slug,
                name: product.category.name,
            },
            shortDescription: product.shortDescription,
            description: product.description,
            displayPriceMinor: product.displayPriceMinor,
            vatRate: product.vatRate,
            availabilityStatus: product.availabilityStatus,
            features: product.features,
            specifications: product.specifications,
            packageContents: product.packageContents,
            isPopular: product.isPopular,
            isNew: product.isNew,
        };
    }

    private presentAdminProduct(product: CatalogProductEntity) {
        return {
            ...this.presentPublicProduct(product),
            categoryId: product.categoryId,
            aliases: (product.aliases || [])
                .sort((left, right) => left.id - right.id)
                .map((alias) => alias.alias),
            isActive: product.isActive,
            isPublished: product.isPublished,
            oneCRef: product.oneCRef,
            oneCSyncedAt: product.oneCSyncedAt,
            createdAt: product.createdAt,
            updatedAt: product.updatedAt,
        };
    }

    private recordAudit(
        manager: EntityManager,
        actor: CatalogAdminActor,
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

    private nullableText(value: string | null | undefined) {
        const normalized = value?.trim();
        return normalized ? normalized : null;
    }

    private cleanList(values?: string[]) {
        return (values ?? []).map((value) => value.trim());
    }

    private escapeLike(value: string) {
        return value.replace(/[\\%_]/g, (item) => `\\${item}`);
    }

    private async withCatalogConflictMapping<T>(operation: () => Promise<T>) {
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
                UQ_catalog_categories_slug:
                    'Catalog category slug already exists',
                UQ_catalog_products_slug: 'Catalog product slug already exists',
                UQ_catalog_products_sku: 'Catalog product SKU already exists',
                UQ_catalog_product_aliases_product_normalized:
                    'Duplicate normalized catalog alias',
            };
            throw new ConflictException(
                messages[driver.constraint || ''] ||
                    'Catalog value already exists',
            );
        }
    }
}
