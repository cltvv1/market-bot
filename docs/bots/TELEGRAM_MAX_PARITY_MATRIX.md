# Telegram and MAX Parity Matrix

B1 updated this matrix without claiming durable state or delivery guarantees.

The matrix separates business parity from identical presentation. Different
button layout is acceptable; loss of data, actions or media is not.

| Capability | Telegram | MAX | Classification | Evidence / gap |
|---|---|---|---|---|
| Start and user upsert | yes | yes | parity | both handle start |
| Main menu structure | submenu | flat list | partial | same core services, different navigation |
| Registration intro/consent | reply keyboard/callback | callback | partial | equivalent goal, partly legacy routing |
| Registration answers | yes | yes | parity | shared workflow |
| Registration photo/PDF | yes | yes | parity | shared storage/PDF path |
| Firmware request | yes | yes | parity | same simple flow |
| Remote KKT work | yes | yes | parity | same simple flow |
| FN replacement | yes | yes | parity | same request service |
| ATOL generation | yes | yes | parity | shared specialization |
| Signed ATOL upload | yes | yes | parity | shared stored-file path |
| ATOL cancellation | yes | yes | parity | shared workflow |
| New operator question | yes | yes | parity | shared ticket workflow |
| Continue question | yes | yes | parity | active-ticket fallback |
| Customer attachments | broader types | image/video/audio/file | partial | type support differs |
| Operator connection | yes | yes | parity | RBAC and stale-target checks |
| Operator text forwarding | yes | yes | parity | persistent transcript |
| Operator media forwarding | binary copy | image/document binary | partial | MAX fixed; audio/video explicitly rejected |
| Close operator chat | yes | yes | parity | same services |
| Admin chat binding | yes | yes | parity | one-use code |
| Admin client delivery | yes | yes | parity | messenger router |
| Marketplace page | yes | no | Telegram only | absent in MAX |
| OFD activation contact | operator ticket | operator ticket | parity | fixed in B1; dedicated workflow deferred |
| Legacy in-bot admin actions | secured | no | Telegram only | existing RBAC enforced in B1 |

## Numerical summary

Total inventoried capabilities: **23**.

- Parity: **17**
- Partial parity: **3**
- Telegram only: **2**
- MAX only: **0**
- Unknown: **0**
- Not implemented: **0**

A parity label does not mean the path is restart-safe, idempotent or durably
delivered.

## Highest-value parity work

1. Forward actual operator attachments in MAX with the same persistence and
   access rules as Telegram.
2. Define one media capability contract and explicitly map unsupported types.
3. Decide whether marketplace links belong in MAX.
4. Remove or implement the exposed OFD action in a separately approved package.
5. Retire or secure legacy Telegram administration after confirming web-admin
   replacement coverage.
