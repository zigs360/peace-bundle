# [OPEN] Profile Photo Upload

## Session
- Session ID: `profile-photo-upload`
- Started At: 2026-06-26
- Scope: Diagnose and fix profile picture upload failures across frontend → backend → storage → DB persistence.

## Symptoms
- Actual: Users cannot successfully upload profile photos (upload fails, no avatar update, or unclear error).
- Expected: Valid images (JPG/PNG/GIF/WebP, <= 5MB) upload successfully, are stored, and user profile points to the new image URL; invalid uploads fail with clear messages.

## Hypotheses (Falsifiable)
1. Frontend sends the wrong form field name / wrong content type, so backend multer never receives a file (req.file undefined).
2. Backend upload endpoint rejects due to auth/CORS/cookie issues (401/403) or because route middleware order blocks multipart parsing.
3. Multer/storage layer fails (size limit, fileFilter, temp path, disk permission), and error handling returns a generic failure without helpful detail.
4. Cloud storage integration fails (missing credentials, wrong bucket policy, connectivity), but errors are swallowed, so the client sees “failed” without trace.
5. DB update for `profilePicture`/`avatar` URL fails (validation, missing column, transaction rollback), so upload succeeds but profile never reflects it.

## Evidence Plan
- Add instrumentation at: frontend request build, backend upload controller entry, multer parsing result, storage upload result, and user DB update.
- Reproduce with: valid JPG/PNG, unsupported file, oversized file, and missing auth cookie.
- Compare pre-fix vs post-fix debug logs.

## Status
- Instrumentation completed.
- Root cause confirmed from runtime evidence.
- Fix implemented and verified with automated tests.

## Evidence
- Pre-fix: `image/webp` uploads were rejected by multer fileFilter as invalid.
- Debug log evidence:
  - `uploadMiddleware.js:checkFileType` rejected `image/webp` with message: `Invalid file type. Profile photos must be JPG, PNG, GIF, or WebP.`
- Post-fix: `image/webp` uploads are accepted and profile updates persist `uploads/<filename>.webp`.

## Root Cause
- The backend upload middleware allowed only `jpeg|jpg|png|gif` and rejected WebP, while the frontend allowed `image/*` (so WebP/other formats could be selected).

## Fix
- Backend:
  - Accept WebP for avatar uploads.
  - Enforce max avatar size of 5MB (413 response on limit).
  - Return clear JSON errors for invalid types/oversize with server-side logging.
- Frontend:
  - Restrict file input to `image/jpeg,image/png,image/gif,image/webp`.
  - Validate type + size (<= 5MB) before making the request.
  - Avoid overriding multipart `Content-Type` header so the browser sets the correct boundary.

## Verification
- Added/ran backend tests:
  - JPG upload success
  - WebP upload success
  - Unsupported file type returns 400 with clear message
  - Oversized file returns 413 with clear message
