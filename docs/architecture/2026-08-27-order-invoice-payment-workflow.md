# CO-3B Order invoice and payment workflow

> CO-3C continuation: fulfillment and completion are now implemented as the
> later explicit transitions `paid -> fulfilled -> completed`. Invoice,
> payment-proof, full-payment, and physical-file-availability semantics in this
> document are unchanged.

## 1. Baseline

CO-3B starts from `c7b069b99a4eef21e670cfbbad99816b92fc788f`, the
merged CO-3A sales workspace. CO-3A already provides immutable customer order
lines, manager assignment, a reviewed and confirmed commercial quote,
`expectedVersion`, PostgreSQL row locking, customer-safe projections, events,
and transactional Audit Log writes.

## 2. CO-3B scope

This package adds manually uploaded invoices, customer payment proofs, and a
manager-confirmed full-payment transition. It extends the existing Order
aggregate and does not reuse the service-request invoice or payment columns.

## 3. Manual 1C-era business workflow

The sales manager prepares an invoice outside VITMA, currently in 1C, and
uploads the finished PDF. The customer may attach one or more payment proofs.
The assigned manager checks the bank or another trusted source and records the
actual receipt of funds. VITMA stores the commercial and document history but
does not call 1C, a bank, acquiring, or a messenger provider in CO-3B.

## 4. State machine

The new transitions are:

```text
confirmed --first invoice--> waiting_payment
waiting_payment --replacement invoice--> waiting_payment
waiting_payment --payment proof--> waiting_payment
waiting_payment --manual full-payment confirmation--> paid
```

All other states reject these commands. Payment proof never changes the order
to `paid`.

## 5. OrderDocument model

`order_documents` owns the durable relation between an Order and a
`StoredFile`. A row contains type, status, backend revision, uploader identity,
customer visibility, invoice commercial snapshots, supersession time, and
creation time. The database constrains actor shape, status shape, commercial
shape, positive revision, and supported values.

## 6. Invoice revisions

Invoice revision starts at one and increases under the locked Order row. A
replacement creates a new row and marks the former current row `superseded`.
Neither the old document nor its file is overwritten or deleted.

## 7. Current invoice invariant

The partial unique index `UQ_order_documents_active_invoice` permits at most
one active invoice for each Order. The service also rejects inconsistent
domain states, while the index remains the final concurrent-write authority.

## 8. Payment-proof semantics

Payment proofs are evidence supplied by the customer, not proof that money was
received. Multiple active proofs are allowed and each gets its own increasing
revision. Duplicate names or hashes are not silently collapsed.

## 9. Manual payment confirmation

Only the assigned manager with `orders.payment` can confirm payment. The
transaction requires `waiting_payment`, a confirmed and fully priced Quote,
and a current invoice domain row. A payment proof is optional.

## 10. Full-payment-only rule

CO-3B models one full-payment fact. It has no amount input, partial allocation,
refund, overpayment, split tender, payment schedule, or reconciliation ledger.

## 11. Payment source model

The fixed sources are `bank_statement`, `payment_order`,
`customer_confirmation`, and `other`. `paymentReceivedAt` is optional and
defaults to command time. An explicit value must be a full RFC3339-style
timestamp with seconds and an uppercase `T` plus either `Z` or a numeric
`+/-HH:mm` offset. Date-only and timezone-less values are rejected. The value
uses a four-digit year in `0001..9999`; year `0000`, BC dates, signed years,
and extended years are rejected. It is normalized to one absolute instant
before applying the five-minute future clock tolerance.

## 12. Order fields

Order now stores `invoiceIssuedAt`, `paymentReceivedAt`,
`paymentConfirmedAt`, `paymentConfirmedByStaffId`,
`paymentConfirmationSource`, and `paymentConfirmationComment`. Database checks
require the payment confirmation fields to be absent together or to form one
complete confirmation record.

## 13. StoredFile purposes

Order documents use isolated purposes:

| Purpose               |  Limit | Content                 |
| --------------------- | -----: | ----------------------- |
| `order-invoice`       | 15 MiB | PDF only                |
| `order-payment-proof` | 20 MiB | PDF, JPEG, PNG, or WebP |

They do not reuse `service-invoice` or `payment-proof`.

## 14. Strict content validation

Allowed content is determined by file signature. A supplied MIME must match
the detected canonical MIME, except that `application/octet-stream` is
accepted as an untrusted generic declaration. The filename extension must
match the detected format. Random bytes, mismatched MIME, and disguised
extensions are rejected before storage metadata is created.

## 15. Pending to active attachment

The bounded upload is written physically, then represented by a pending
`StoredFile`. The Order transaction locks and validates the Order and pending
file, creates `OrderDocument`, records event and audit facts, increments Order
version once, adds trusted binding metadata, and changes the file to active.

## 16. Failed attachment cleanup

If attachment fails after the pending save, the pending row becomes
`rejected`, receives logical deletion and purge timestamps, and remains under
FS-1 cleanup. A cleanup failure is logged without hiding the original command
failure. A failed command cannot leave an active unreferenced Order file.

## 17. Preflight before Multer

Invoice and payment-proof routes run lightweight authorization before
`FileInterceptor`. Invoice preflight checks state and assigned manager after
admin session and permission checks. Payment-proof preflight checks owner and
state after web-session and same-origin checks. The final transaction repeats
all decisions because preflight is not a concurrency guarantee.

## 18. ExpectedVersion

Both multipart routes accept exactly one text field, `expectedVersion`, and
the confirm-payment JSON command requires the same value. It is a PostgreSQL
integer from one through 2,147,483,647. Clients cannot submit file IDs,
revision, amount, actor, status, type, or Order ID in the body.

## 19. Concurrency

Commands lock the Order row and then check expected version. Concurrent
uploads with the same version produce one committed domain mutation; a losing
pending file is rejected. The partial invoice index and unique revision index
remain database-level defenses. No database lock is held while bytes are
being received or written.

## 20. Download authorization

Downloads are context-bound to both Order and document ID. A customer must own
the Order and may access only customer-visible active documents, which excludes
superseded invoices. An authenticated administrator needs `orders.read.all`
and may access current invoices, superseded invoices, and payment proofs.
Trusted file metadata must match the OrderDocument relation in both cases.

## 21. Download headers

Successful responses stream the file with exact canonical `Content-Type` and
`Content-Length`, attachment-only RFC 5987 content disposition, `nosniff`, and
`Cache-Control: private, no-store`. There is no generic StoredFile endpoint,
public URL, inline rendering, range response, object key, or filesystem path.

## 22. Client projection

Client detail adds `documents.currentInvoice`, `documents.paymentProofs`, and,
after confirmation, `payment.receivedAt` and `payment.confirmedAt`. Safe file
fields include the document ID, type, revision, original name, canonical MIME,
size, checksum, creation time, availability, and a context-bound download URL.
Internal file identity, provider data, uploader IDs, superseded invoices, and
payment source/comment are absent.

## 23. Admin projection

Admin detail includes all invoice revisions, all payment proofs, safe uploader
identity, commercial invoice snapshots, supersession time, and full payment
confirmation. Admin list uses only compact `hasCurrentInvoice`,
`invoiceRevision`, `paymentProofCount`, and `paymentConfirmedAt` fields.

## 24. Event and Audit model

Customer-visible Order events are `invoice_issued`, `invoice_replaced`,
`payment_proof_received`, and `payment_confirmed`. Transactional audit actions
are `order.invoice.issued`, `order.invoice.replaced`,
`order.payment_proof.uploaded`, and `order.payment.confirmed`. Audit metadata
contains bounded domain identifiers and commercial facts, never bytes,
object keys, cookies, tokens, or provider URLs.

## 25. File lifecycle and FK retention

`order_documents.storedFileId` is a restrictive PostgreSQL FK and is discovered
by the generic FS-1 catalog inspector. Current invoices, superseded invoices,
and payment proofs block physical purge while their domain rows exist, even if
a file has reached a terminal lifecycle status.

## 26. Physical missing invoice versus payment truth

Payment confirmation requires the invoice domain row, not currently readable
bytes. A later missing or corrupt PDF makes download fail closed but does not
erase the historical issue of the invoice or prevent recording money actually
seen in a bank statement.

## 27. Migration and upgrade

Append-only migration `1788268800000-AddOrderInvoicePaymentWorkflow.ts`
follows CO-3A, adds nullable Order fields for existing rows, creates the new
table and constraints, and expands the append-only OrderEvent type check. It
does not synthesize documents or payment facts for old orders.

`migration:revert` is supported only for a disposable test database. Once
Order documents, invoice revisions, payment proofs, or paid Orders exist, an
automatic production revert is data-destructive. Existing `invoice_replaced`
events can also prevent restoration of the former OrderEvent check unless a
separate data-preserving rollback procedure handles them first. The migration
`down()` method is therefore not an operational production rollback plan.

## 28. Future 1C adapter

A later adapter may create invoices from the confirmed Quote and attach the
result through the same trusted document command. CO-3B stores no 1C GUID and
does not prescribe transport, retry, reconciliation, or accounting ownership.

## 29. Deferred notifications, fulfillment, and frontend

Outbound customer/staff notification, messenger delivery, frontend controls,
warehouse reservation, shipment, realization, fulfillment, completion, and
UPD remain separate packages.

## 30. Explicit exclusions

CO-3B adds no invoice generation, partial payments, acquiring, bank API,
refunds, generic file endpoint, admin payment-proof upload, late-proof flow,
provider call, dependency update, scheduler, 1C integration, frontend switch,
or Order fulfillment transition.

## 31. Acceptance verdict

The implemented aggregate preserves invoice history, separates customer proof
from payment truth, and performs every business mutation with current RBAC,
ownership or assignment checks, expected version, row locking, transactional
events/audits, and FK-backed file ownership. Acceptance requires the focused
and full local suites, clean migration/repeat/upgrade/schema checks, production
builds, offline smoke, and hosted CI to remain green for the final PR head.
