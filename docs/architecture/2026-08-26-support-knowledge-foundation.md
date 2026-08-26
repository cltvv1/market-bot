# Support and Knowledge metadata foundation

## Package boundary

KB-1 adds PostgreSQL-backed metadata, relations, publication commands, and
read-only public APIs for equipment support and knowledge content. It does not
upload, store, proxy, stream, or render support binaries. It also does not add
frontend pages, SSR/SSG, sitemap generation, or redirect history.

Catalog identity remains canonical. Support pages use the existing product ID,
SKU, and stable product slug; no second support slug exists.

## Product support publication

`ProductSupportProfile` is an optional one-to-one record keyed by product ID.
Profiles are not created automatically. They hold bounded intro Markdown and
optional SEO title/description metadata.

Support publication is deliberately independent from commercial publication.
A retired, inactive, or commercially unpublished product may retain a published
support profile at `/support/:productSlug`. The catalog API continues to apply
its own active/product/category rules. The support API only exposes safe product
identity: ID, slug, SKU, name, and brand.

Publishing a support profile is explicit and requires non-empty intro content.
Unpublishing a profile hides the support page without changing the product or
deleting its resource/article relations.

## Resource and compatibility model

`SupportResource` represents one logical driver, utility, application,
firmware, manual, quick-start document, datasheet, certificate, SDK, or other
support resource. It stores provenance metadata such as manufacturer, official
status, source name, safe HTTPS source URL, and last verification time. The
backend never fetches source URLs.

`ProductSupportResource` is an explicit many-to-many junction with a bounded
compatibility note and deterministic sort order. One resource can therefore be
shared by multiple products without duplicating metadata or versions.

A resource is public only after an explicit publish command and only when at
least one of its versions is already published. Unpublishing a resource does
not mutate version publication flags. Republishing it can reveal the previously
published versions again. Public reads also require a currently published
version, so unpublishing the last version cannot leave an empty download page.

## Resource versions

`SupportResourceVersion` separates release metadata from the logical resource.
Platform, architecture, language, and distribution mode use bounded database
contracts. A PostgreSQL partial unique index permits at most one current version
per resource/platform/architecture/language scope. `make-current` serializes
concurrent switches and updates only that scope.

External versions expose a validated HTTPS vendor URL. URLs with credentials,
HTTP URLs, malformed URLs, and oversized URLs are rejected. VITMA does not
fetch, proxy, or redirect through these URLs.

Hosted versions reserve a nullable `storedFileId` foreign key to `stored_files`.
Generic admin DTOs cannot set that ID and public DTOs never return it. FS-1 now
provides the raw streaming upload, trusted pending-to-active attachment,
publication readiness, safe public metadata, and context-bound download path;
see `2026-08-26-file-lifecycle-support-hosting.md`.

## Knowledge model

`KnowledgeArticle` stores stable slug identity, title/excerpt, bounded Markdown,
article type, author reference, SEO metadata, and publication state. The backend
does not render HTML. A future frontend or SSR renderer must disable raw HTML in
Markdown or apply a separately reviewed sanitization policy.

`ProductKnowledgeArticle` links an article to any number of products.
`KnowledgeArticleSupportResource` links the same article to published download
resources for CTA cards. Relations are ordinary rows rather than IDs embedded
in Markdown or JSON and are replaced transactionally by admin commands.

Publishing an article is explicit and requires a slug, title, and non-empty
Markdown body. General articles do not require a product relation. Unpublishing
an article retains all relations while hiding it from public lists, details, and
product support pages.

## Public and admin contracts

Public endpoints are read-only, bounded, and return only published content:

- `/api/support/products`
- `/api/support/products/:productSlug`
- `/api/support/resources`
- `/api/support/resources/:slug`
- `/api/knowledge/articles`
- `/api/knowledge/articles/:slug`

Admin routes use the existing session, same-origin, and permission guards.
Support and Knowledge have separate `read`/`manage` permissions. The current
role decision grants them to `sales_manager` and to `superadmin` through the
existing all-permissions model; operator and engineer roles do not inherit them.

Mutations write compact audit events in the same transaction as the domain
change. Audit metadata contains IDs, slugs, types, platform, and version labels,
not full Markdown, descriptions, external URLs, files, or binary data.

## SEO identity

The stable future URL model remains:

- `/support/:productSlug`
- `/downloads/:resourceSlug`
- `/knowledge/:articleSlug`

KB-1 persists slugs, publication state, and optional SEO text only. SSR, SSG,
canonical tags, sitemap, robots directives, schema.org, and slug redirect
history remain deferred to a separate web/SEO package.

## Implemented FS-1 boundary

FS-1 provides the trusted file command and lifecycle needed by hosted versions:

- a dedicated support file purpose and MIME/content policy;
- streamed large-file upload without whole-file memory buffering;
- safe temporary-file cleanup and orphan reconciliation;
- physical retention and deletion rules;
- trusted `ResourceVersion -> StoredFile` attachment;
- authorized public download streaming and `Content-Disposition`;
- checksum metadata where useful;
- no range requests; those still require a demonstrated client need.

Frontend support pages, Orders, Cart backend, and 1C synchronization remain
outside KB-1 and FS-1.
