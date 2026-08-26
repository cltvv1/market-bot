/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getBotToken } from 'nestjs-telegraf';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Telegraf } from 'telegraf';
import { DataSource } from 'typeorm';
import { AdminAuthService } from '../src/admin/admin-auth.service';
import type { AdminRole } from '../src/admin/entities/admin-user-role.entity';
import { configureApplication } from '../src/app.bootstrap';
import { AppModule } from '../src/app.module';
import { AuditEventEntity } from '../src/audit/entities/audit-event.entity';
import { FilesService } from '../src/files/files.service';
import { KnowledgeArticleSupportResourceEntity } from '../src/support-knowledge/entities/knowledge-article-support-resource.entity';
import { ProductKnowledgeArticleEntity } from '../src/support-knowledge/entities/product-knowledge-article.entity';
import { ProductSupportResourceEntity } from '../src/support-knowledge/entities/product-support-resource.entity';
import { SupportResourceVersionEntity } from '../src/support-knowledge/entities/support-resource-version.entity';
import { SupportResourceEntity } from '../src/support-knowledge/entities/support-resource.entity';

const PASSWORD = 'Strong!Password2026';
const ORIGIN = 'http://localhost:5173';

describe('support and knowledge foundation on migrated PostgreSQL', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let auth: AdminAuthService;
    let files: FilesService;
    let ip = 120;

    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication({ bodyParser: false });
        configureApplication(app);
        await app.init();
        dataSource = app.get(DataSource);
        auth = app.get(AdminAuthService);
        files = app.get(FilesService);
        jest.spyOn(app.get<Telegraf>(getBotToken()), 'stop').mockImplementation(
            () => undefined,
        );
    });

    beforeEach(async () => {
        const tables: Array<{ table_name: string }> = await dataSource.query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
               AND table_name <> 'typeorm_migrations' ORDER BY table_name`,
        );
        await dataSource.query(
            `TRUNCATE TABLE ${tables
                .map(
                    ({ table_name }) =>
                        `"public"."${table_name.replaceAll('"', '""')}"`,
                )
                .join(', ')} RESTART IDENTITY CASCADE`,
        );
    });

    afterAll(async () => {
        if (app) await app.close();
    });

    const nextIp = () => `10.120.0.${++ip}`;

    async function staff(login: string, roles: AdminRole[]) {
        const user = await auth.createStaff({
            login,
            displayName: login,
            password: PASSWORD,
            roles,
        });
        const agent = request.agent(app.getHttpServer());
        await agent
            .post('/admin/api/login')
            .set('X-Forwarded-For', nextIp())
            .send({ login, password: PASSWORD })
            .expect(201);
        return { agent, user };
    }

    function mutate(
        agent: ReturnType<typeof request.agent>,
        method: 'post' | 'patch' | 'put',
        path: string,
    ) {
        return agent[method](path).set('Origin', ORIGIN);
    }

    async function createCategory(
        agent: ReturnType<typeof request.agent>,
        slug: string,
        publish = true,
    ) {
        const created = await mutate(
            agent,
            'post',
            '/admin/api/catalog/categories',
        )
            .send({ name: `Category ${slug}`, slug })
            .expect(201);
        if (publish) {
            await mutate(
                agent,
                'post',
                `/admin/api/catalog/categories/${created.body.id}/publish`,
            ).expect(201);
        }
        return created.body as { id: number; slug: string };
    }

    async function createProduct(
        agent: ReturnType<typeof request.agent>,
        categoryId: number,
        slug: string,
        publish = false,
    ) {
        const created = await mutate(
            agent,
            'post',
            '/admin/api/catalog/products',
        )
            .send({
                categoryId,
                sku: `sku-${slug}`,
                slug,
                name: `Product ${slug}`,
                brand: 'MERTECH',
                aliases: [`Alias ${slug}`],
            })
            .expect(201);
        if (publish) {
            await mutate(
                agent,
                'post',
                `/admin/api/catalog/products/${created.body.id}/publish`,
            ).expect(201);
        }
        return created.body as { id: number; slug: string };
    }

    async function publishProfile(
        agent: ReturnType<typeof request.agent>,
        productId: number,
        intro = 'Support information',
    ) {
        await mutate(agent, 'put', `/admin/api/support/products/${productId}`)
            .send({ introMarkdown: intro })
            .expect(200);
        return mutate(
            agent,
            'post',
            `/admin/api/support/products/${productId}/publish`,
        ).expect(201);
    }

    async function createResource(
        agent: ReturnType<typeof request.agent>,
        slug: string,
        products: Array<Record<string, unknown>> = [],
    ) {
        return mutate(agent, 'post', '/admin/api/support/resources')
            .send({
                slug,
                title: `Resource ${slug}`,
                summary: `Summary ${slug}`,
                descriptionMarkdown: `Description ${slug}`,
                type: 'driver',
                manufacturerName: 'MERTECH',
                isOfficial: true,
                sourceName: 'MERTECH',
                sourceUrl: 'https://www.mertech.example/support',
                products,
            })
            .expect(201);
    }

    async function createExternalVersion(
        agent: ReturnType<typeof request.agent>,
        resourceId: number,
        label: string,
        options: Record<string, unknown> = {},
    ) {
        return mutate(
            agent,
            'post',
            `/admin/api/support/resources/${resourceId}/versions`,
        )
            .send({
                versionLabel: label,
                platform: 'windows',
                architecture: 'x64',
                languageCode: 'ru',
                distributionMode: 'external',
                externalUrl: `https://downloads.example.test/${label}.zip`,
                ...options,
            })
            .expect(201);
    }

    async function publishVersion(
        agent: ReturnType<typeof request.agent>,
        versionId: number,
    ) {
        return mutate(
            agent,
            'post',
            `/admin/api/support/resource-versions/${versionId}/publish`,
        ).expect(201);
    }

    async function publishResource(
        agent: ReturnType<typeof request.agent>,
        resourceId: number,
    ) {
        return mutate(
            agent,
            'post',
            `/admin/api/support/resources/${resourceId}/publish`,
        ).expect(201);
    }

    it('creates the seven KB tables with focused checks, FKs, and current-scope index', async () => {
        const tables: Array<{ table_name: string }> = await dataSource.query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_name IN (
                 'product_support_profiles', 'support_resources',
                 'support_resource_versions', 'product_support_resources',
                 'knowledge_articles', 'product_knowledge_articles',
                 'knowledge_article_support_resources'
               ) ORDER BY table_name`,
        );
        expect(tables.map((row) => row.table_name)).toEqual([
            'knowledge_article_support_resources',
            'knowledge_articles',
            'product_knowledge_articles',
            'product_support_profiles',
            'product_support_resources',
            'support_resource_versions',
            'support_resources',
        ]);
        const constraints: Array<{ conname: string }> = await dataSource.query(
            `SELECT conname FROM pg_constraint
             WHERE conname LIKE 'CK_support_%'
                OR conname LIKE 'FK_support_%'
                OR conname LIKE 'CK_knowledge_%'
                OR conname LIKE 'FK_knowledge_%'
                OR conname LIKE 'UQ_product_%'
             ORDER BY conname`,
        );
        expect(constraints.map((row) => row.conname)).toEqual(
            expect.arrayContaining([
                'CK_support_resource_versions_architecture',
                'CK_support_resource_versions_distribution',
                'CK_support_resource_versions_location',
                'CK_support_resource_versions_platform',
                'CK_support_resources_type',
                'CK_knowledge_articles_type',
                'FK_support_resource_versions_stored_file',
                'UQ_product_support_resources_pair',
                'UQ_product_knowledge_articles_pair',
            ]),
        );
        const indexes: Array<{ indexdef: string }> = await dataSource.query(
            `SELECT indexdef FROM pg_indexes
             WHERE schemaname = 'public'
               AND indexname = 'UQ_support_resource_versions_current_scope'`,
        );
        expect(indexes[0].indexdef).toContain('WHERE ("isCurrent" = true)');
        const storedFileColumn: Array<{ is_nullable: string }> =
            await dataSource.query(
                `SELECT is_nullable FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = 'support_resource_versions'
                   AND column_name = 'storedFileId'`,
            );
        expect(storedFileColumn).toEqual([{ is_nullable: 'YES' }]);
    });

    it('keeps support publication independent from commercial publication', async () => {
        const { agent } = await staff('kb-visibility', ['sales_manager']);
        const category = await createCategory(agent, 'kb-visibility');
        const product = await createProduct(
            agent,
            category.id,
            'retired-device',
            true,
        );

        await request(app.getHttpServer())
            .get('/api/support/products/retired-device')
            .expect(404);
        await publishProfile(agent, product.id);
        await mutate(
            agent,
            'patch',
            `/admin/api/catalog/products/${product.id}`,
        )
            .send({ isActive: false })
            .expect(200);

        await request(app.getHttpServer())
            .get('/api/catalog/products/retired-device')
            .expect(404);
        const support = await request(app.getHttpServer())
            .get('/api/support/products/retired-device')
            .expect(200);
        expect(support.body.product).toMatchObject({
            id: product.id,
            slug: 'retired-device',
            sku: 'SKU-RETIRED-DEVICE',
        });
        expect(support.body.product).toHaveProperty('brand');
        expect(support.body.product).not.toHaveProperty('isPublished');
        expect(support.body.product).not.toHaveProperty('isActive');
        expect(support.body.product).not.toHaveProperty('oneCRef');
        await mutate(
            agent,
            'patch',
            `/admin/api/support/products/${product.id}`,
        )
            .send({ introMarkdown: '   ' })
            .expect(409);
        await request(app.getHttpServer())
            .get('/api/support/products/retired-device')
            .expect(200);
    });

    it('shares one published resource across two compatible products and hides drafts', async () => {
        const { agent } = await staff('kb-compatibility', ['sales_manager']);
        const category = await createCategory(agent, 'kb-compatible');
        const tlp100 = await createProduct(agent, category.id, 'tlp100');
        const tlp300 = await createProduct(agent, category.id, 'tlp300');
        await publishProfile(agent, tlp100.id);
        await publishProfile(agent, tlp300.id);
        const resource = await createResource(agent, 'mertech-driver', [
            {
                productId: tlp100.id,
                compatibilityNote: 'Windows 10+',
                sortOrder: 2,
            },
            { productId: tlp300.id, sortOrder: 1 },
        ]);
        const current = await createExternalVersion(
            agent,
            resource.body.id,
            '1.0',
        );
        await createExternalVersion(agent, resource.body.id, 'draft-2.0');
        await publishVersion(agent, current.body.id);
        await publishResource(agent, resource.body.id);

        for (const slug of ['tlp100', 'tlp300']) {
            const page = await request(app.getHttpServer())
                .get(`/api/support/products/${slug}`)
                .expect(200);
            expect(page.body.resources).toHaveLength(1);
            expect(page.body.resources[0].slug).toBe('mertech-driver');
        }
        const detail = await request(app.getHttpServer())
            .get('/api/support/resources/mertech-driver')
            .expect(200);
        expect(
            detail.body.products.map((item: { slug: string }) => item.slug),
        ).toEqual(['tlp300', 'tlp100']);
        expect(detail.body.versions).toHaveLength(1);
        expect(detail.body.versions[0]).toMatchObject({
            distributionMode: 'external',
            externalUrl: 'https://downloads.example.test/1.0.zip',
            hostedFile: null,
        });
        expect(detail.body.versions[0]).not.toHaveProperty('storedFileId');
        await request(app.getHttpServer())
            .get(
                `/api/support/resources/mertech-driver/versions/${current.body.id}/download`,
            )
            .expect(404);
        expect(
            await dataSource.getRepository(SupportResourceEntity).count(),
        ).toBe(1);
        await mutate(
            agent,
            'patch',
            `/admin/api/support/resources/${resource.body.id}`,
        )
            .send({ title: '   ' })
            .expect(409);
        await mutate(
            agent,
            'patch',
            `/admin/api/support/resource-versions/${current.body.id}`,
        )
            .send({ externalUrl: null })
            .expect(409);

        await mutate(
            agent,
            'post',
            `/admin/api/support/resources/${resource.body.id}/unpublish`,
        ).expect(201);
        await request(app.getHttpServer())
            .get('/api/support/resources/mertech-driver')
            .expect(404);
        const profile = await request(app.getHttpServer())
            .get('/api/support/products/tlp100')
            .expect(200);
        expect(profile.body.resources).toEqual([]);
        expect(
            await dataSource
                .getRepository(SupportResourceVersionEntity)
                .countBy({ resourceId: resource.body.id, isPublished: true }),
        ).toBe(1);

        await publishResource(agent, resource.body.id);
        await mutate(
            agent,
            'post',
            `/admin/api/support/resource-versions/${current.body.id}/unpublish`,
        ).expect(201);
        await request(app.getHttpServer())
            .get('/api/support/resources/mertech-driver')
            .expect(404);
        const emptyProfile = await request(app.getHttpServer())
            .get('/api/support/products/tlp100')
            .expect(200);
        expect(emptyProfile.body.resources).toEqual([]);
        const emptyList = await request(app.getHttpServer())
            .get('/api/support/resources')
            .expect(200);
        expect(emptyList.body.items).toEqual([]);
    });

    it('validates external URLs and keeps hosted drafts fail-closed without file calls', async () => {
        const { agent } = await staff('kb-distribution', ['sales_manager']);
        const resource = await createResource(agent, 'distribution');
        const saveSpy = jest.spyOn(files, 'saveBuffer');

        const missing = await createExternalVersion(
            agent,
            resource.body.id,
            'missing-url',
            { externalUrl: null },
        );
        await mutate(
            agent,
            'post',
            `/admin/api/support/resource-versions/${missing.body.id}/publish`,
        ).expect(409);
        await mutate(
            agent,
            'post',
            `/admin/api/support/resources/${resource.body.id}/versions`,
        )
            .send({
                platform: 'windows',
                architecture: 'x64',
                languageCode: 'ru',
                distributionMode: 'external',
                externalUrl: 'http://downloads.example.test/file.zip',
            })
            .expect(400);
        await mutate(
            agent,
            'post',
            `/admin/api/support/resources/${resource.body.id}/versions`,
        )
            .send({
                platform: 'windows',
                architecture: 'x64',
                languageCode: 'ru',
                distributionMode: 'external',
                externalUrl:
                    'https://username:password@downloads.example.test/file.zip',
            })
            .expect(400);
        const hosted = await mutate(
            agent,
            'post',
            `/admin/api/support/resources/${resource.body.id}/versions`,
        )
            .send({
                versionLabel: 'hosted-draft',
                platform: 'windows',
                architecture: 'x64',
                languageCode: 'ru',
                distributionMode: 'hosted',
            })
            .expect(201);
        expect(hosted.body).toMatchObject({
            distributionMode: 'hosted',
            hasStoredFile: false,
            isPublished: false,
        });
        expect(hosted.body).not.toHaveProperty('storedFileId');
        await mutate(
            agent,
            'post',
            `/admin/api/support/resource-versions/${hosted.body.id}/publish`,
        ).expect(409);
        await mutate(
            agent,
            'patch',
            `/admin/api/support/resource-versions/${hosted.body.id}`,
        )
            .send({ storedFileId: 123 })
            .expect(400);
        expect(saveSpy).not.toHaveBeenCalled();
        saveSpy.mockRestore();
        expect(await dataSource.query('SELECT * FROM stored_files')).toEqual(
            [],
        );
    });

    it('enforces one current version per scope and serializes concurrent switches', async () => {
        const { agent } = await staff('kb-current', ['sales_manager']);
        const resource = await createResource(agent, 'current-versions');
        const v1 = await createExternalVersion(agent, resource.body.id, 'v1');
        const v2 = await createExternalVersion(agent, resource.body.id, 'v2');
        const linux = await createExternalVersion(
            agent,
            resource.body.id,
            'linux-v1',
            { platform: 'linux' },
        );
        await Promise.all(
            [v1, v2, linux].map((version) =>
                publishVersion(agent, version.body.id),
            ),
        );
        await mutate(
            agent,
            'post',
            `/admin/api/support/resource-versions/${v1.body.id}/make-current`,
        ).expect(201);
        await mutate(
            agent,
            'post',
            `/admin/api/support/resource-versions/${v2.body.id}/make-current`,
        ).expect(201);
        await mutate(
            agent,
            'post',
            `/admin/api/support/resource-versions/${linux.body.id}/make-current`,
        ).expect(201);
        const current = await dataSource
            .getRepository(SupportResourceVersionEntity)
            .find({ where: { resourceId: resource.body.id, isCurrent: true } });
        expect(current.map((version) => version.versionLabel).sort()).toEqual([
            'linux-v1',
            'v2',
        ]);

        const v3 = await createExternalVersion(agent, resource.body.id, 'v3');
        const v4 = await createExternalVersion(agent, resource.body.id, 'v4');
        await publishVersion(agent, v3.body.id);
        await publishVersion(agent, v4.body.id);
        const results = await Promise.all([
            mutate(
                agent,
                'post',
                `/admin/api/support/resource-versions/${v3.body.id}/make-current`,
            ),
            mutate(
                agent,
                'post',
                `/admin/api/support/resource-versions/${v4.body.id}/make-current`,
            ),
        ]);
        expect(results.map((result) => result.status)).toEqual([201, 201]);
        const windowsCurrent = await dataSource
            .getRepository(SupportResourceVersionEntity)
            .countBy({
                resourceId: resource.body.id,
                platform: 'windows',
                architecture: 'x64',
                languageCode: 'ru',
                isCurrent: true,
            });
        expect(windowsCurrent).toBe(1);

        const currentRow = await dataSource
            .getRepository(SupportResourceVersionEntity)
            .findOneByOrFail({
                resourceId: resource.body.id,
                platform: 'windows',
                isCurrent: true,
            });
        const otherId = currentRow.id === v3.body.id ? v4.body.id : v3.body.id;
        await expect(
            dataSource
                .getRepository(SupportResourceVersionEntity)
                .update(otherId, { isCurrent: true }),
        ).rejects.toMatchObject({ driverError: { code: '23505' } });
    });

    it('publishes knowledge with many-to-many product and resource relations', async () => {
        const { agent } = await staff('kb-knowledge', ['sales_manager']);
        const category = await createCategory(agent, 'kb-knowledge');
        const tlp100 = await createProduct(agent, category.id, 'kb-tlp100');
        const tlp300 = await createProduct(agent, category.id, 'kb-tlp300');
        await publishProfile(agent, tlp100.id);
        const resource = await createResource(agent, 'kb-driver', [
            { productId: tlp100.id },
            { productId: tlp300.id },
        ]);
        const version = await createExternalVersion(
            agent,
            resource.body.id,
            'knowledge-driver',
        );
        await publishVersion(agent, version.body.id);
        await publishResource(agent, resource.body.id);

        const article = await mutate(
            agent,
            'post',
            '/admin/api/knowledge/articles',
        )
            .send({
                slug: 'install-driver',
                title: 'Install MERTECH driver',
                excerpt: 'Windows setup',
                bodyMarkdown: '# Safe Markdown\n\nInstall the driver.',
                type: 'setup',
                productIds: [tlp100.id, tlp300.id],
                resourceIds: [resource.body.id],
            })
            .expect(201);
        await request(app.getHttpServer())
            .get('/api/knowledge/articles/install-driver')
            .expect(404);
        await mutate(
            agent,
            'post',
            `/admin/api/knowledge/articles/${article.body.id}/publish`,
        ).expect(201);

        const detail = await request(app.getHttpServer())
            .get('/api/knowledge/articles/install-driver')
            .expect(200);
        expect(detail.body.bodyMarkdown).toContain('# Safe Markdown');
        expect(detail.body.products).toHaveLength(2);
        expect(detail.body.resources).toHaveLength(1);
        expect(detail.body).not.toHaveProperty('authorStaffId');
        const list = await request(app.getHttpServer())
            .get(
                '/api/knowledge/articles?product=kb-tlp300&type=setup&search=Windows',
            )
            .expect(200);
        expect(list.body.items).toHaveLength(1);
        const supportPage = await request(app.getHttpServer())
            .get('/api/support/products/kb-tlp100')
            .expect(200);
        expect(supportPage.body.articles).toHaveLength(1);
        await mutate(
            agent,
            'patch',
            `/admin/api/knowledge/articles/${article.body.id}`,
        )
            .send({ bodyMarkdown: '   ' })
            .expect(409);
        const unchanged = await request(app.getHttpServer())
            .get('/api/knowledge/articles/install-driver')
            .expect(200);
        expect(unchanged.body.bodyMarkdown).toContain('# Safe Markdown');

        await mutate(
            agent,
            'post',
            `/admin/api/knowledge/articles/${article.body.id}/unpublish`,
        ).expect(201);
        await request(app.getHttpServer())
            .get('/api/knowledge/articles/install-driver')
            .expect(404);
        const hidden = await request(app.getHttpServer())
            .get('/api/support/products/kb-tlp100')
            .expect(200);
        expect(hidden.body.articles).toEqual([]);
        expect(
            await dataSource
                .getRepository(ProductKnowledgeArticleEntity)
                .countBy({ articleId: article.body.id }),
        ).toBe(2);
        expect(
            await dataSource
                .getRepository(KnowledgeArticleSupportResourceEntity)
                .countBy({ articleId: article.body.id }),
        ).toBe(1);
    });

    it('keeps relation replacement atomic and rejects duplicate IDs', async () => {
        const { agent } = await staff('kb-relations', ['sales_manager']);
        const category = await createCategory(agent, 'kb-relations');
        const first = await createProduct(agent, category.id, 'relation-first');
        const second = await createProduct(
            agent,
            category.id,
            'relation-second',
        );
        const resource = await createResource(agent, 'relation-resource', [
            { productId: first.id },
        ]);
        const article = await mutate(
            agent,
            'post',
            '/admin/api/knowledge/articles',
        )
            .send({
                slug: 'relation-article',
                title: 'Relation article',
                bodyMarkdown: 'Body',
                type: 'instruction',
                productIds: [first.id],
                resourceIds: [resource.body.id],
            })
            .expect(201);

        await mutate(
            agent,
            'patch',
            `/admin/api/knowledge/articles/${article.body.id}`,
        )
            .send({ productIds: [second.id, 999_999] })
            .expect(400);
        expect(
            await dataSource
                .getRepository(ProductKnowledgeArticleEntity)
                .find({ where: { articleId: article.body.id } }),
        ).toEqual([expect.objectContaining({ productId: first.id })]);
        await mutate(
            agent,
            'patch',
            `/admin/api/knowledge/articles/${article.body.id}`,
        )
            .send({ productIds: [first.id, first.id] })
            .expect(400);
        await mutate(
            agent,
            'patch',
            `/admin/api/support/resources/${resource.body.id}`,
        )
            .send({
                products: [{ productId: second.id }, { productId: 999_999 }],
            })
            .expect(400);
        expect(
            await dataSource
                .getRepository(ProductSupportResourceEntity)
                .find({ where: { resourceId: resource.body.id } }),
        ).toEqual([expect.objectContaining({ productId: first.id })]);
    });

    it('enforces separate support and knowledge RBAC including disabled staff', async () => {
        const sales = await staff('kb-sales', ['sales_manager']);
        const root = await staff('kb-root', ['superadmin']);
        const operator = await staff('kb-operator', ['operator']);
        const engineer = await staff('kb-engineer', ['engineer']);

        await sales.agent.get('/admin/api/support/resources').expect(200);
        await sales.agent.get('/admin/api/knowledge/articles').expect(200);
        await root.agent.get('/admin/api/support/resources').expect(200);
        await root.agent.get('/admin/api/knowledge/articles').expect(200);
        for (const denied of [operator.agent, engineer.agent]) {
            await denied.get('/admin/api/support/resources').expect(403);
            await denied.get('/admin/api/knowledge/articles').expect(403);
            await mutate(denied, 'post', '/admin/api/support/resources')
                .send({ slug: 'denied', title: 'Denied', type: 'other' })
                .expect(403);
            await mutate(denied, 'post', '/admin/api/knowledge/articles')
                .send({
                    slug: 'denied',
                    title: 'Denied',
                    bodyMarkdown: 'Denied',
                    type: 'other',
                })
                .expect(403);
        }
        await auth.setActive(sales.user.id, false);
        await sales.agent.get('/admin/api/support/resources').expect(401);
        await sales.agent.get('/admin/api/knowledge/articles').expect(401);
    });

    it('records compact transactional audit events without markdown or URLs', async () => {
        const { agent } = await staff('kb-audit', ['sales_manager']);
        const category = await createCategory(agent, 'kb-audit');
        const product = await createProduct(
            agent,
            category.id,
            'audit-product',
        );
        await publishProfile(agent, product.id, 'Private long intro marker');
        const resource = await createResource(agent, 'audit-resource');
        const version = await createExternalVersion(
            agent,
            resource.body.id,
            'audit-version',
            { releaseNotesMarkdown: 'Private release notes marker' },
        );
        await publishVersion(agent, version.body.id);
        await mutate(
            agent,
            'post',
            `/admin/api/support/resource-versions/${version.body.id}/make-current`,
        ).expect(201);
        await publishResource(agent, resource.body.id);
        const article = await mutate(
            agent,
            'post',
            '/admin/api/knowledge/articles',
        )
            .send({
                slug: 'audit-article',
                title: 'Audit article',
                bodyMarkdown: 'Private article body marker',
                type: 'faq',
            })
            .expect(201);
        await mutate(
            agent,
            'post',
            `/admin/api/knowledge/articles/${article.body.id}/publish`,
        ).expect(201);

        const events = await dataSource.getRepository(AuditEventEntity).find({
            order: { id: 'ASC' },
        });
        const actions = events.map((event) => event.action);
        expect(actions).toEqual(
            expect.arrayContaining([
                'support.profile.update',
                'support.profile.publish',
                'support.resource.create',
                'support.version.create',
                'support.version.publish',
                'support.version.make_current',
                'support.resource.publish',
                'knowledge.article.create',
                'knowledge.article.publish',
            ]),
        );
        const auditJson = JSON.stringify(events);
        expect(auditJson).not.toContain('Private long intro marker');
        expect(auditJson).not.toContain('Private release notes marker');
        expect(auditJson).not.toContain('Private article body marker');
        expect(auditJson).not.toContain('downloads.example.test');
        expect(events.every((event) => event.actorStaffId !== null)).toBe(true);
        expect(events.every((event) => event.actorSessionId !== null)).toBe(
            true,
        );
    });

    it('enforces markdown, relation, search, and pagination bounds', async () => {
        const { agent } = await staff('kb-bounds', ['sales_manager']);
        const category = await createCategory(agent, 'kb-bounds');
        const product = await createProduct(agent, category.id, 'bounded');
        await mutate(agent, 'put', `/admin/api/support/products/${product.id}`)
            .send({ introMarkdown: 'x'.repeat(20_001) })
            .expect(400);
        await mutate(agent, 'post', '/admin/api/knowledge/articles')
            .send({
                slug: 'too-large',
                title: 'Too large',
                bodyMarkdown: 'x'.repeat(100_001),
                type: 'other',
            })
            .expect(400);
        await mutate(agent, 'post', '/admin/api/knowledge/articles')
            .send({
                slug: 'too-many-relations',
                title: 'Too many relations',
                bodyMarkdown: 'Body',
                type: 'other',
                productIds: Array.from(
                    { length: 101 },
                    (_, index) => index + 1,
                ),
            })
            .expect(400);
        for (const path of [
            '/api/support/products?limit=101',
            '/api/support/resources?limit=101',
            '/api/knowledge/articles?limit=101',
            `/api/support/products?search=${'x'.repeat(101)}`,
        ]) {
            await request(app.getHttpServer()).get(path).expect(400);
        }
    });

    it('enforces DB enum, distribution, FK, slug, and junction invariants', async () => {
        const { agent } = await staff('kb-db', ['sales_manager']);
        const category = await createCategory(agent, 'kb-db');
        const product = await createProduct(agent, category.id, 'db-product');
        const resource = await createResource(agent, 'db-resource', [
            { productId: product.id },
        ]);
        const resources = dataSource.getRepository(SupportResourceEntity);
        await expect(
            resources.save(
                resources.create({
                    ...resource.body,
                    id: undefined,
                    title: 'Duplicate slug',
                }),
            ),
        ).rejects.toMatchObject({ driverError: { code: '23505' } });
        await expect(
            dataSource.query(
                `INSERT INTO support_resources (slug, title, type)
                 VALUES ('bad-type', 'Bad type', 'arbitrary')`,
            ),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
            dataSource.query(
                `INSERT INTO support_resource_versions
                 ("resourceId", platform, architecture, "languageCode", "distributionMode", "externalUrl")
                 VALUES ($1, 'dos', 'x64', 'ru', 'external', 'https://example.test/file')`,
                [resource.body.id],
            ),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
            dataSource.query(
                `INSERT INTO support_resource_versions
                 ("resourceId", platform, architecture, "languageCode", "distributionMode", "externalUrl")
                 VALUES ($1, 'windows', 'x64', 'ru', 'hosted', 'https://example.test/file')`,
                [resource.body.id],
            ),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
            dataSource.getRepository(ProductSupportResourceEntity).save({
                productId: product.id,
                resourceId: resource.body.id,
                compatibilityNote: null,
                sortOrder: 0,
            }),
        ).rejects.toMatchObject({ driverError: { code: '23505' } });
        await expect(
            dataSource.getRepository(ProductSupportResourceEntity).save({
                productId: 999_999,
                resourceId: resource.body.id,
                compatibilityNote: null,
                sortOrder: 0,
            }),
        ).rejects.toMatchObject({ driverError: { code: '23503' } });
    });
});
