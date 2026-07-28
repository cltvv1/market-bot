# Legacy File Inventory

Inventory date: 2026-07-27. Storage root: `storage/`.

| Scenario | Source | Legacy field/path | Download | Access before E0-08 | Existing formats/sizes | Migration |
|---|---|---|---|---|---|---|
| KKT registration photo | Telegram/MAX/web upload | `registration_requests.equipmentPhotoPath`, `storage/registration-media` | `/admin/api/registrations/:id/equipment-photo` | `registrations.read` | JPEG observed, under 1 MB | `equipmentPhotoFileId`; legacy fallback retained |
| Registration PDF | server pdfmake | `registration_requests.pdfPath`, `storage/registrations` | `/admin/api/registrations/:id/pdf` | `registrations.read` | PDF, about 21-24 KB | `pdfFileId`; legacy fallback retained |
| Ticket media | bot remote reference or web/admin upload | `ticket_messages.localPath`, `fileId`, `externalUrl`; `storage/ticket-media` | admin/client ticket-message endpoints | ticket permission or owning web session | image, PDF, HTML legacy; duplicate PDF found | `storedFileId` for local uploads; remote messenger references remain remote |
| Service invoice | admin upload/manual reference | `service_requests.invoiceFileId` | `/admin/api/service-requests/:id/invoice` | `serviceRequests.read.all` | PDF | `invoiceStoredFileId`; legacy fallback retained |
| Generated ATOL consent | server pdfmake | `answers.generatedPdfPath`, `storage/consents` | delivered by bot/internal workflow | owning workflow/admin | PDF | `generatedConsentFileId`; legacy fallback retained |
| Signed ATOL consent | customer upload | `answers.signedConsentPath`, `storage/consents/:id` | `/admin/api/service-requests/:id/signed-consent` | `serviceRequests.read.all` | JPEG/PNG/PDF | `signedConsentFileId`; legacy fallback retained |
| React/static assets | build process/repository | `admin-ui/dist`, `client-ui/dist`, `src/site/assets` | `/admin`, `/site` | public application assets | JS/CSS/PNG | Not business uploads; excluded from StoredFile |

Direct `fs` use remains only for legacy fallback, static application assets, PDF compatibility output, messenger delivery streams, maintenance scripts and backfill. New local user uploads use `FilesService`.

Risks:

- Legacy absolute paths are machine-specific and remain only for compatibility.
- Remote Telegram/MAX media is not copied locally unless the scenario already downloads it.
- Legacy orphan files are reported, not deleted.
- Existing audio/video Range behavior is unchanged for remote messenger media; local endpoints currently use normal streaming.
