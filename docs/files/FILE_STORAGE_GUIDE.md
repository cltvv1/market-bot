# File Storage Guide

`StoredFile` stores provider, unpredictable relative object key, display name, verified MIME, size, SHA-256, status, creator references and safe metadata. It never stores file content, secrets or an absolute local path.

`FileStoragePort` is implemented by `LocalFileStorageProvider`. Writes use a temporary file, a streaming size/hash transform and atomic rename. Object keys containing absolute roots, `.` or `..` are rejected.

## Policies

| Purpose | Limit | Formats |
|---|---:|---|
| registration photo | 12 MB | JPEG, PNG, WebP |
| ticket image | 12 MB | JPEG, PNG, WebP, GIF |
| ticket document | 20 MB | PDF, text, ZIP |
| ticket audio/voice | 30 MB | MP3, OGG, MP4 audio, WebM |
| ticket video/video note | 80 MB | MP4, WebM, MOV |
| service invoice | 15 MB | PDF |
| generated PDF / ATOL consent | 15 MB | server-generated PDF |
| signed document | 20 MB | PDF, JPEG, PNG, WebP |

Signatures are checked for common PDF/image/archive/audio/video formats. This is a foundation, not antivirus.

## Backfill

```powershell
npm run files:backfill -- --dry-run
npm run files:backfill
```

The command is idempotent, does not move/delete files, retains path columns and records missing/outside-root/orphan findings.

## Authorization

There is intentionally no public `GET /files/:id`. Domain endpoints first authorize the registration, ticket or service request, then ask `FilesService` for the stream. Responses use verified MIME, safe `Content-Disposition`, `nosniff` and `private, no-store`.

## Как проследить путь одного файла по коду

На примере фото регистрации ККТ:

1. MAX вход: `src/max/max.update.ts`, `handleMaxMedia`.
2. Общий workflow: `src/client/client-workflow.service.ts`, `submitRegistrationPhoto`.
3. Политика: `src/files/file-policies.ts`, `registration-photo`.
4. Доменная запись: `src/registrations/registrations.service.ts`, `saveEquipmentPhoto`.
5. Порт и local provider: `src/files/file-storage.types.ts` и `local-file-storage.provider.ts`.
6. Metadata/FK: `stored-file.entity.ts` и `RegistrationRequest.equipmentPhotoFileId`.
7. Проверка доступа: `AdminController.getRegistrationEquipmentPhoto` + `registrations.read`.
8. Stream response: `AdminController.sendStoredFile`.
9. Базовые security tests: `local-file-storage.provider.spec.ts` и `file-policies.spec.ts`.
