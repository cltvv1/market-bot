# Open questions

These answers cannot be derived from code and do not block local development of
the current baseline.

## Production operations

1. Where will the first public pilot run: host OS, reverse proxy, domains,
   persistent volume and secret store?
2. What are the required RPO/RTO, backup retention and second-copy destination?
3. What retention/encryption/antivirus rules apply to customer photos, videos,
   invoices, signed documents and generated PDFs?

## Catalog and orders

4. Are displayed prices VAT-inclusive, and when is "price on request" allowed?
5. Which availability vocabulary should the site expose without imitating 1C
   stock accounting?
6. Which employee permission owns catalog publication?
7. Which delivery methods and geography are in the first release?
8. What stable CSV/XLSX fields can 1C export for SKU, categories, prices and
   availability?
9. Which legal details and public contacts in `client-ui/src/data/company.ts`
   are approved for publication?

## Service operations

10. Which internal transitions may operator and engineer perform, and which
    transitions require a comment or payment proof?
11. What are the first approved required fields/conditions for each service
    type?
12. Are SLA rules needed for the pilot; if yes, what working calendar and
    escalation rules apply?

## Identity and notifications

13. Which SMS and email providers are approved for OTP/notifications?
14. What evidence may staff use to resolve a disputed customer-profile merge?
15. Which FN/OFD reminders are mandatory service messages versus marketing,
    and what warning intervals are approved?

## External systems

16. What official API access, contractual scope and data-processing rights are
    available for ATOL and OFD providers?
