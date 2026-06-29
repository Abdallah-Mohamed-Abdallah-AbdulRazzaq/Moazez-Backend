# STU-PROF-1C — Student Avatar Upload Foundation Closeout

## 1. Implementation Summary

STU-PROF-1C implements the Student-owned avatar foundation locked in STU-PROF-1B.

The backend now supports a private File-backed avatar reference on `Student`, Student App upload/replace/delete routes, safe avatar data in `GET /api/v1/student/profile`, and removal of `student.userId` from the Student App profile response.

The sprint intentionally did not implement Student profile field editing, correction requests, StudentDocument app visibility, Parent App document visibility, staff avatar management, Admissions behavior changes, ADM-REG-DOC behavior changes, or homework/task file behavior changes.

## 2. Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260629130000_0048_stu_prof_1c_student_avatar_file/migration.sql`
- `src/modules/student-app/profile/application/delete-student-avatar.use-case.ts`
- `src/modules/student-app/profile/application/get-student-profile.use-case.ts`
- `src/modules/student-app/profile/application/student-profile-response.builder.ts`
- `src/modules/student-app/profile/application/upload-student-avatar.use-case.ts`
- `src/modules/student-app/profile/controller/student-profile.controller.ts`
- `src/modules/student-app/profile/domain/student-avatar.constraints.ts`
- `src/modules/student-app/profile/dto/student-profile.dto.ts`
- `src/modules/student-app/profile/infrastructure/student-avatar.repository.ts`
- `src/modules/student-app/profile/infrastructure/student-profile-read.adapter.ts`
- `src/modules/student-app/profile/presenters/student-profile.presenter.ts`
- `src/modules/student-app/profile/tests/get-student-profile.use-case.spec.ts`
- `src/modules/student-app/profile/tests/student-avatar.use-case.spec.ts`
- `src/modules/student-app/profile/tests/student-profile-read.adapter.spec.ts`
- `src/modules/student-app/profile/tests/student-profile.presenter.spec.ts`
- `src/modules/student-app/student-app.module.ts`
- `test/e2e/student-avatar-upload.e2e-spec.ts`
- `test/e2e/student-app-final-closeout.e2e-spec.ts`
- `test/security/tenancy.student-avatar.spec.ts`
- `test/security/tenancy.student-app.spec.ts`
- `docs/sprint-stu-prof-1c-student-avatar-upload-foundation-closeout.md`

## 3. Schema and Migration Summary

Migration:

```text
20260629130000_0048_stu_prof_1c_student_avatar_file
```

Schema changes:

- Added nullable `Student.avatarFileId`.
- Added `Student.avatarFile` relation to `File`.
- Added `File.studentAvatars` inverse relation.
- Added index on `Student.avatarFileId`.
- Added foreign key from `students.avatar_file_id` to `files.id` with `ON DELETE SET NULL`.

No User avatar field, public URL field, signed URL field, ProfileMedia model, Applicant schema change, Admissions schema change, Parent App schema change, or StudentDocument schema change was added.

## 4. Route Contract

### Upload or Replace Avatar

```http
POST /api/v1/student/profile/avatar
Content-Type: multipart/form-data
```

Request field:

```text
file
```

Behavior:

- Requires authenticated Student App actor.
- Resolves actor through the existing Student App active student + active enrollment chain.
- Accepts only `image/jpeg`, `image/png`, and `image/webp`.
- Rejects files over 5 MB.
- Creates private File metadata through existing storage/file infrastructure.
- Updates only the authenticated Student's `avatarFileId`.
- Replaces by pointing `avatarFileId` to the new File.
- Does not delete the previous File or binary object.

### Delete Avatar

```http
DELETE /api/v1/student/profile/avatar
```

Behavior:

- Requires authenticated Student App actor.
- Resolves actor through the same Student App active student + active enrollment chain.
- Sets the authenticated Student's `avatarFileId` to `null`.
- Does not delete the previous File or binary object.
- Is safe when the avatar is already null.

## 5. Response Contract

`GET /api/v1/student/profile`, `POST /api/v1/student/profile/avatar`, and `DELETE /api/v1/student/profile/avatar` return the safe Student App profile response.

Avatar present:

```json
{
  "student": {
    "studentId": "uuid",
    "displayName": "Student Name",
    "firstName": "Student",
    "lastName": "Name",
    "email": "student@example.com",
    "phone": null,
    "avatarUrl": "/api/v1/files/file-id/download",
    "status": "active"
  },
  "avatar": {
    "fileId": "file-id",
    "url": "/api/v1/files/file-id/download",
    "mimeType": "image/png",
    "sizeBytes": 12345
  }
}
```

Avatar absent:

```json
{
  "student": {
    "studentId": "uuid",
    "avatarUrl": null
  },
  "avatar": null
}
```

The response does not include `student.userId`, `Student.applicationId`, `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, bucket, object key, public URL, or raw signed URL.

## 6. Profile Response userId Repair

`student.userId` was removed from the Student App profile response.

The safe app-facing identifier remains `student.studentId`. Existing message sender contracts that intentionally use sender `userId` were not changed by this sprint; the user-id repair is scoped to Student App profile/avatar responses.

## 7. Avatar Storage Policy

Avatar media uses the existing File metadata and object storage path.

Locked behavior:

- Storage visibility is private.
- The database stores File metadata and `Student.avatarFileId`.
- The avatar display path is `/api/v1/files/:fileId/download`.
- Signed URLs remain generated by authorized file download flow, not stored in the profile response.
- Bucket and object key are never returned in Student App profile/avatar JSON.
- Replacing or deleting an avatar does not physically delete historical File rows or binary objects in this sprint.

## 8. Audit Events

Safe audit events are emitted:

- `student.profile.avatar.upload`
- `student.profile.avatar.replace`
- `student.profile.avatar.delete`

Audit payloads include safe fields such as `studentId`, `fileId`, `previousFileId`, `mimeType`, `sizeBytes`, and `source: student_app`.

Audit payloads do not include bucket, object key, signed URL, file binary, passwords, tokens, `Student.applicationId`, Applicant ids, Guardian user ids, membership internals, or role internals.

## 9. Security and No-Leak Boundaries

The avatar routes are Student App routes only.

Confirmed boundaries:

- Parent actors cannot use Student App avatar routes.
- Applicant actors cannot use Student App avatar routes.
- Staff actors cannot use Student App avatar routes unless they are also a valid Student App actor under existing rules.
- Unlinked Student actors cannot use avatar routes.
- Students without active enrollment cannot use avatar routes.
- One Student cannot mutate another Student's avatar because the route has no target id and resolves the target from the authenticated Student App context.
- No cross-school target id is accepted.
- Controllers stay thin and delegate to use cases.
- Controllers do not use Prisma directly.
- `schoolScope` and global guards were not changed.

## 10. Tests Run

Commands run and results:

```text
git status --short --untracked-files=all
git log --oneline -10
npx prisma validate
npm run build
npx prisma validate
npm test -- --runInBand src/modules/student-app/profile/tests
npm run build
npx prisma generate
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-avatar-upload.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-avatar.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-app-final-closeout.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-document-import-to-student-document.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.admissions-document-import.spec.ts
```

Results:

- `npx prisma validate`: passed.
- `npm run build`: passed after clearing a stale `dist` directory left by a timed-out build process.
- `npx prisma generate`: passed.
- `npx prisma migrate status`: initially reported the new migration pending; after `npx prisma migrate deploy`, status reported the database schema up to date.
- `src/modules/student-app/profile/tests`: 4 suites passed, 20 tests passed.
- `test/e2e/student-avatar-upload.e2e-spec.ts`: 1 suite passed, 4 tests passed.
- `test/security/tenancy.student-avatar.spec.ts`: 1 suite passed, 4 tests passed.
- `test/e2e/student-app-final-closeout.e2e-spec.ts`: 1 suite passed, 17 tests passed.
- `test/security/tenancy.student-app.spec.ts`: 1 suite passed, 24 tests passed.
- `test/e2e/admissions-document-import-to-student-document.e2e-spec.ts`: 1 suite passed, 1 test passed.
- `test/security/tenancy.admissions-document-import.spec.ts`: 1 suite passed, 7 tests passed.

## 11. Known Limitations

- Staff avatar management is not implemented.
- Student profile field self-edit is not implemented.
- Profile correction request workflow is not implemented.
- Old avatar File rows and binary objects are retained when replaced or cleared.
- Avatar display still depends on the existing authorized file download route.
- Student App home/dashboard avatar propagation was not broadened beyond existing low-risk profile response work.
- StudentDocument remains staff-managed and is not exposed to Student App or Parent App.

## 12. Deferred Backlog

- Staff avatar management decision and route, if required.
- Avatar retention cleanup policy for replaced/deleted avatars.
- Avatar moderation/review workflow.
- Profile correction request workflow.
- Direct non-official profile preferences update.
- StudentDocument Student App visibility decision.
- Parent App StudentDocument visibility decision.
- Medical profile app visibility decision.
- Guardian/emergency contact update policy.

## 13. Final Verdict

```text
STU_PROF_1C_STUDENT_AVATAR_UPLOAD_FOUNDATION_READY
```
