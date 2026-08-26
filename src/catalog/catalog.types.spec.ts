import { normalizeCatalogAlias, normalizeCatalogSku } from './catalog.types';

describe('catalog normalization', () => {
    it('normalizes SKU with an explicit uppercase and whitespace policy', () => {
        expect(normalizeCatalogSku('  vm- 1001  ')).toBe('VM- 1001');
    });

    it('normalizes aliases deterministically for punctuation and spelling variants', () => {
        expect(normalizeCatalogAlias(' MERTECH TLP-100 ')).toBe(
            'MERTECHTLP100',
        );
        expect(normalizeCatalogAlias('Тёрка  2')).toBe('ТЕРКА2');
    });
});
