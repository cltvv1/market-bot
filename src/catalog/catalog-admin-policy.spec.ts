import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
    assertCatalogSnapshot,
    catalogProductActions,
    isCatalogPathId,
    nextCatalogTimestamp,
} from './catalog-admin-policy';
import {
    AdminCatalogProductListQueryDto,
    CatalogPreconditionDto,
    CreateCatalogCategoryDto,
    CreateCatalogProductDto,
    UpdateCatalogCategoryDto,
    UpdateCatalogProductDto,
} from './dto/catalog.dto';

describe('Catalog production contract', () => {
    it.each([
        '0',
        '-1',
        '1.5',
        '+1',
        '1e3',
        '1abc',
        'Infinity',
        'NaN',
        '2147483648',
        '9007199254740992',
        '9'.repeat(500),
        '01',
    ])('rejects bounded path %s', (id) =>
        expect(isCatalogPathId(id)).toBe(false),
    );
    it('accepts canonical positive int32 paths only', () => {
        expect(isCatalogPathId('1')).toBe(true);
        expect(isCatalogPathId('2147483647')).toBe(true);
        expect(isCatalogPathId(1)).toBe(false);
    });
    it('keeps compatibility optional but rejects null/noncanonical timestamps', () => {
        expect(
            validateSync(plainToInstance(CatalogPreconditionDto, {})),
        ).toHaveLength(0);
        for (const expectedUpdatedAt of [
            null,
            '',
            '2026-09-15',
            '2026-02-30T00:00:00.000Z',
            '2026-09-15T00:00:00Z',
        ])
            expect(
                validateSync(
                    plainToInstance(CatalogPreconditionDto, {
                        expectedUpdatedAt,
                    }),
                ).length,
            ).toBeGreaterThan(0);
        expect(
            validateSync(
                plainToInstance(CatalogPreconditionDto, {
                    expectedUpdatedAt: '2026-09-15T00:00:00.000Z',
                }),
            ),
        ).toHaveLength(0);
    });
    it('bounds all numeric Catalog foreign keys', () => {
        for (const dto of [CreateCatalogCategoryDto, UpdateCatalogCategoryDto])
            expect(
                validateSync(
                    plainToInstance(dto, { parentId: 2147483648 }),
                ).some((e) => e.property === 'parentId'),
            ).toBe(true);
        for (const dto of [CreateCatalogProductDto, UpdateCatalogProductDto])
            expect(
                validateSync(
                    plainToInstance(dto, { categoryId: 2147483648 }),
                ).some((e) => e.property === 'categoryId'),
            ).toBe(true);
    });
    it('uses exact snapshots and strictly advances milliseconds', () => {
        const date = new Date(Date.now() + 10000);
        expect(() =>
            assertCatalogSnapshot(date, date.toISOString()),
        ).not.toThrow();
        expect(() => assertCatalogSnapshot(date)).not.toThrow();
        expect(() =>
            assertCatalogSnapshot(date, new Date(0).toISOString()),
        ).toThrow('snapshot changed');
        expect(nextCatalogTimestamp(date).getTime()).toBe(date.getTime() + 1);
    });
    const product = {
        name: 'Demo',
        sku: 'DEMO',
        slug: 'demo',
        isActive: true,
        isPublished: false,
    };
    it.each([
        [
            { ...product, isActive: false },
            { isPublished: true },
            true,
            'inactive',
        ],
        [product, { isPublished: false }, true, 'category_hidden'],
        [{ ...product, name: '' }, { isPublished: true }, true, 'incomplete'],
        [product, { isPublished: true }, false, 'permission'],
    ] as const)(
        'explains publication refusal %#',
        (row, category, manage, reason) => {
            expect(
                catalogProductActions(row, category, manage).publish,
            ).toEqual({ allowed: false, reason });
        },
    );
    it('allows ready publication, not a repeated command or unauthorized edit', () => {
        expect(
            catalogProductActions(product, { isPublished: true }, true).publish
                .allowed,
        ).toBe(true);
        expect(
            catalogProductActions(
                { ...product, isPublished: true },
                { isPublished: true },
                true,
            ).publish.allowed,
        ).toBe(false);
        expect(
            catalogProductActions(product, { isPublished: true }, false).edit
                .allowed,
        ).toBe(false);
    });
    it('bounds admin filters and retains all defaults', () => {
        expect(
            validateSync(
                plainToInstance(AdminCatalogProductListQueryDto, {
                    active: 'all',
                    publication: 'all',
                }),
            ),
        ).toHaveLength(0);
        expect(
            validateSync(
                plainToInstance(AdminCatalogProductListQueryDto, {
                    active: 'yes',
                    publication: 'ready',
                }),
            ),
        ).toHaveLength(2);
    });
});
