# Open questions

Only decisions not derivable from code, tests, Git or existing dated evidence are listed.

## Blocks canonical model selection

1. **Organization claim (решено для v1):** право подтверждает оператор вручную; pending не даёт доступа к защищённым данным. Это временный рабочий процесс, не окончательная юридическая идентификация.
2. **Service status:** which customer-facing states and messages are approved, separately from internal operator/engineer states?
3. **Location:** is a trading point shared across multiple KKT and organizations, and which minimum address/contact/timezone fields are required?
4. **Service relationship:** must every service request reference equipment/location, or are ad-hoc requests without an organization/equipment valid?

## Required before a specific backend package

1. **BKV1-1:** which service request attachments are allowed per type, who can read them after closure, and what retention applies?
2. **BKV1-1:** which existing service types are public on web, Telegram and MAX, and which are operator-only?
3. **BKV1-2:** is one equipment/FN barcode photo always mandatory for KKT registration, and what is the accepted substitute when the client cannot provide it?
4. **BKV1-3:** operator уже подтверждает обычный membership; отдельно требуется решить, кто и как исправляет ownership оборудования и назначает owner.
5. **BKV1-4:** who owns catalog content, publication, price and coarse availability; are prices VAT-inclusive and can checkout proceed without a final price?
6. **BKV1-4:** which contact/address/delivery fields are mandatory, and what is the first customer access channel for an order: web session, public token, linked messenger, or a combination?
7. **BKV1-4:** must the first release import catalog from 1C/CSV, or is manual admin entry acceptable for launch?

## Required before public pilot

1. What deployment topology, domain, TLS termination and number of application replicas will be used?
2. Which messages are delivery-critical and require retry/fallback; what is the operator escalation rule after permanent failure?
3. What are DB/file retention, off-host backup frequency, recovery point and recovery time requirements?
4. Is antivirus/malware scanning mandatory for uploaded documents?
5. Which production metrics and alert recipients are mandatory?
6. Are the ATOL/OFD private cabinet integrations contractually permitted, and how often may they run?

## Can be deferred

1. Whether and when to merge web/Telegram/MAX profiles, and what proof links channels.
2. Whether SMS OTP is required after messenger linking is available.
3. Exact 1C integration mechanism and ownership of reconciliation.
4. When local protected storage should move to S3-compatible storage.
5. Reminder timing for FN/OFD and marketing consent policy.
6. Whether Ticket should later evolve into a general Conversation linked to requests/orders; current product need does not require that decision now.
