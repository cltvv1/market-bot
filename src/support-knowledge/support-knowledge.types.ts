export const SUPPORT_RESOURCE_TYPES = [
    'driver',
    'utility',
    'software',
    'firmware',
    'manual',
    'quick_start',
    'datasheet',
    'certificate',
    'sdk',
    'other',
] as const;

export type SupportResourceType = (typeof SUPPORT_RESOURCE_TYPES)[number];

export const SUPPORT_PLATFORMS = [
    'windows',
    'linux',
    'macos',
    'android',
    'ios',
    'universal',
] as const;

export type SupportPlatform = (typeof SUPPORT_PLATFORMS)[number];

export const SUPPORT_ARCHITECTURES = [
    'x86',
    'x64',
    'arm64',
    'universal',
] as const;

export type SupportArchitecture = (typeof SUPPORT_ARCHITECTURES)[number];

export const SUPPORT_LANGUAGE_CODES = ['ru', 'en', 'multi'] as const;

export type SupportLanguageCode = (typeof SUPPORT_LANGUAGE_CODES)[number];

export const SUPPORT_DISTRIBUTION_MODES = ['external', 'hosted'] as const;

export type SupportDistributionMode =
    (typeof SUPPORT_DISTRIBUTION_MODES)[number];

export const KNOWLEDGE_ARTICLE_TYPES = [
    'instruction',
    'setup',
    'troubleshooting',
    'faq',
    'compatibility',
    'service',
    'other',
] as const;

export type KnowledgeArticleType = (typeof KNOWLEDGE_ARTICLE_TYPES)[number];

export const CONTENT_PAGE_SIZE_DEFAULT = 20;
export const CONTENT_PAGE_SIZE_MAX = 100;
export const CONTENT_RELATION_LIMIT = 100;
export const CONTENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isSafeHttpsUrl(value: string) {
    if (value.length > 2048) return false;
    try {
        const url = new URL(value);
        return (
            url.protocol === 'https:' &&
            !url.username &&
            !url.password &&
            Boolean(url.hostname)
        );
    } catch {
        return false;
    }
}
