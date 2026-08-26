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

export function publicUsableVersionExistsSql(resourceAlias: string) {
    return `EXISTS (
        SELECT 1
        FROM "support_resource_versions" fs1_usable_version
        LEFT JOIN "stored_files" fs1_usable_file
          ON fs1_usable_file."id" = fs1_usable_version."storedFileId"
        WHERE fs1_usable_version."resourceId" = ${resourceAlias}.id
          AND fs1_usable_version."isPublished" = true
          AND (
            (
              fs1_usable_version."distributionMode" = 'external'
              AND fs1_usable_version."externalUrl" LIKE 'https://%'
              AND fs1_usable_version."externalUrl" !~ '^https://[^/]*@'
            )
            OR
            (
              fs1_usable_version."distributionMode" = 'hosted'
              AND fs1_usable_file."status" = 'active'
              AND fs1_usable_file."purgedAt" IS NULL
              AND fs1_usable_file."metadata" ->> 'purpose' = 'support-resource'
              AND fs1_usable_file."metadata" ->> 'supportResourceId' = ${resourceAlias}.id::text
              AND fs1_usable_file."metadata" ->> 'supportResourceVersionId' = fs1_usable_version.id::text
              AND ${publicSupportKindCompatibilitySql(
                  resourceAlias,
                  'fs1_usable_file',
              )}
            )
          )
    )`;
}

export function publicSupportKindCompatibilitySql(
    resourceAlias: string,
    fileAlias: string,
) {
    const kind = `${fileAlias}."metadata" ->> 'detectedFileKind'`;
    return `(
        (${resourceAlias}.type IN ('manual','quick_start','datasheet','certificate') AND ${kind} = 'pdf')
        OR (${resourceAlias}.type = 'firmware' AND ${kind} IN ('zip','seven_zip','rar','cab','gzip'))
        OR (${resourceAlias}.type IN ('driver','utility','software','sdk') AND ${kind} IN ('zip','pe','msi','seven_zip','rar','cab','gzip'))
        OR (${resourceAlias}.type = 'other' AND ${kind} IN ('pdf','zip','pe','msi','seven_zip','rar','cab','gzip'))
    )`;
}
