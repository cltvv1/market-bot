# Catalog and Support foundation

## Catalog responsibility

VITMA PostgreSQL is the local catalog read model and the home of enriched
commercial content. The catalog must remain usable when external systems are
unavailable.

A future 1C UT 11.5 integration will be authoritative for SKU/nomenclature,
price, stock, and assortment state. CO-1 only reserves nullable `oneCRef` and
`oneCSyncedAt` metadata. It does not define transport, credentials, scheduling,
retry, or import behavior and does not shape the domain around 1C tables.

## Product model

The foundation contains three domain records:

- `CatalogCategory` is a stable, URL-addressable hierarchy node. The database
  permits arbitrary depth, while the API returns a deterministic flat list with
  `parentId`. Parent changes reject self-parenting and obvious cycles.
- `CatalogProduct` represents ordinary physical/commercial equipment. It has a
  canonical SKU and slug, commercial descriptions, bounded JSONB content, a
  presentation availability state, and separate active/publication flags.
- `CatalogProductAlias` gives one product multiple deterministic search names.
  Aliases improve search but never become canonical URLs.

SKU values are trimmed, internal whitespace is collapsed, and values are stored
uppercase. Slugs are lowercase URL-safe identifiers and only change through an
explicit admin update. Product aliases use Unicode NFKC, uppercase, `Ё`/`Е`
folding, and punctuation/whitespace removal. A normalized alias is unique within
one product.

`displayPriceMinor` is an exact PostgreSQL `integer` in kopecks. Its supported
range is 0 through 2,147,483,647 kopecks (21,474,836.47 RUB), or `null` for
"price on request". This range is sufficient for the current VITMA equipment
catalog, remains exactly representable in JavaScript, and avoids string or float
money serialization. VAT is an integer basis-point value from the explicit set
`0`, `500`, `700`, `1000`, `2000`; for example, `2000` means 20%.

Availability is a commercial state, not an inventory ledger:

- `in_stock`
- `low_stock`
- `on_request`
- `unavailable`

New products are active but unpublished. A public product must be active,
published, and belong to a published category. Publishing requires an active
product, a published category, and the required canonical fields. Unpublishing
a category immediately hides its products without mutating their own
publication flags. There are no hard-delete catalog commands in CO-1; foreign
keys also restrict deleting referenced categories.

## Future Support domain

Support files do not belong in JSON arrays or direct file columns on Product.
The intended future model is separate and many-to-many:

- `SupportResource`
- `SupportResourceVersion`
- `ProductSupportResource`

Expected resource types include `driver`, `utility`, `software`, `firmware`,
`manual`, `quick_start`, `datasheet`, `certificate`, `sdk`, and `other`.
A resource version may later contain `storedFileId`, `externalUrl`, `version`,
`releaseDate`, `platform`, `architecture`, `language`, `isCurrent`, and explicit
source/provenance metadata.

These tables and file relations are intentionally not implemented in CO-1. They
can be added by append-only migrations without changing Product identity.

## Future Knowledge domain

Knowledge content is also separate:

- `KnowledgeArticle`
- `ProductKnowledgeArticle`

Articles can relate to multiple products and products to multiple articles.
Knowledge and Support can later offer Product, ServiceRequest, Catalog, and
Order calls to action without turning Product into a content container.

## SEO principle

Future SEO-critical pages need stable canonical URLs:

- `/catalog/:slug`
- `/support/:productSlug`
- `/downloads/:resourceSlug`
- `/knowledge/:articleSlug`

CO-1 does not choose SSR, SSG, or pre-rendering, but pure client-only rendering
is not the final SEO contract. Product aliases are search terms, not redirect
aliases; slug history and redirects require a separate design package.

## File lifecycle

Before bulk PDF, ZIP, EXE, firmware, driver, or manual ingestion, the project
needs the separate CH-R3 file-lifecycle package and a safe large-file streaming
strategy. CO-1 neither stores binaries in Product nor adds image/file relations.
A later `CatalogProductImage -> StoredFile` relation remains possible without
changing Product identity.

## Package boundaries

CO-1 leaves the current React demo catalog intact and does not connect it to the
new API. It also does not add backend Cart, Orders, OrderLine, payments,
warehouse state, stock reservations, digital products, 1C synchronization,
Support tables, Knowledge tables, or CH-R3.
