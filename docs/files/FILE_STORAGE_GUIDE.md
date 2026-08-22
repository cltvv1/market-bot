# File Storage Guide

`StoredFile` is the only runtime file reference. It stores provider,
unpredictable relative object key, display name, verified MIME, size, SHA-256,
status, creator references and safe metadata. It never stores content, secrets
or an absolute local path.

`FileStoragePort` is implemented by `LocalFileStorageProvider`. Writes use a
temporary file, streaming size/hash validation and atomic rename. Absolute,
drive-prefixed and parent-traversal object keys are rejected both in code and by
the PostgreSQL constraint.

## Policies

| Purpose | Limit | Formats |
|---|---:|---|
| registration evidence | 12 MB | JPEG, PNG, WebP |
| ticket image | 12 MB | JPEG, PNG, WebP, GIF |
| ticket document | 20 MB | PDF, text, ZIP |
| ticket audio/voice | 30 MB | MP3, OGG, MP4 audio, WebM |
| ticket video/video note | 80 MB | MP4, WebM, MOV |
| service attachment | 20 MB | supported image/document formats |
| service invoice | 15 MB | PDF |
| generated PDF / ATOL consent | 15 MB | server-generated PDF |
| signed document | 20 MB | PDF, JPEG, PNG, WebP |

Common PDF/image/archive/audio/video signatures are checked. This layer is not
an antivirus scanner.

## Persistence rules

- registrations use `pdfFileId` and `registration_evidence.storedFileId`;
- service requests use typed file FKs plus `service_request_attachments`;
- ticket messages use `storedFileId`;
- generated PDF services return `Buffer`, which is immediately saved through
  `FilesService`;
- no runtime fallback reads path/name/provider URL columns;
- no file migration or backfill command exists in the clean baseline.

## Authorization

There is intentionally no public `GET /files/:id`. A domain endpoint first
authorizes the registration, ticket or service request and then asks
`FilesService` for a stream. Responses use verified MIME, safe
`Content-Disposition`, `nosniff` and `private, no-store`.

## Registration evidence path

1. Telegram/MAX/web materializes the upload into a bounded `Buffer`.
2. `ClientWorkflowService.submitRegistrationPhoto` calls the registration
   workflow.
3. `RegistrationReadinessService.uploadEvidence` validates ownership and the
   active requirement.
4. `FilesService` applies the `registration-photo` policy and writes through
   `FileStoragePort`.
5. `registration_evidence` links the requirement to `StoredFile` by FK.
6. Admin/client download endpoints re-check domain authorization before
   streaming.

Security coverage includes `local-file-storage.provider.spec.ts`,
`file-policies.spec.ts`, `registration-readiness.integration-spec.ts` and
`preproduction-baseline.integration-spec.ts`.
