# STU-PROF-1D - Student Avatar Final Closeout / Profile Contract Audit

## 1. Executive Summary

STU-PROF-1D closes the Student avatar foundation track.

The STU-PROF-1B decision was implemented as locked in STU-PROF-1C:

- Student avatar media is Student-owned through nullable `Student.avatarFileId`.
- Avatar binary content uses existing private File/object-storage infrastructure.
- Student App exposes upload/replace and delete routes for the authenticated linked Student only.
- `GET /api/v1/student/profile` now returns safe avatar data when present.
- `student.userId` was removed from the Student App profile response.
- Official Student profile fields remain read-only from Student App.
- StudentDocument remains staff-managed and is not exposed to Student App or Parent App.
- Homework/task files remain academic workflow attachments, not profile/avatar documents.
- Storage internals and raw signed URLs are hidden from Student App profile/avatar JSON.

Final decision:

```text
STU-PROF avatar foundation is complete.
Close the STU-PROF-1 avatar foundation track.
Recommended next sprint: STU-PROF-2A - Student Profile Correction Request Decision Lock.
```

## 2. Source Evidence Reviewed

Decision and closeout documents reviewed:

- `docs/sprint-stu-prof-1a-student-profile-avatar-self-service-audit.md`
- `docs/sprint-stu-prof-1b-student-profile-avatar-self-service-decision-lock.md`
- `docs/sprint-stu-prof-1c-student-avatar-upload-foundation-closeout.md`
- `docs/sprint-adm-reg-1j-admissions-registration-flow-final-closeout-audit.md`
- `docs/sprint-adm-reg-doc-1c-admissions-document-import-final-closeout-audit.md`
- `docs/sprint-adm-reg-doc-1b-staff-confirmed-admissions-document-import-closeout.md`
- `docs/sprint-adm-reg-doc-1a-admissions-documents-to-student-documents-decision-lock.md`

Architecture and governance references reviewed:

- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE_DECISION.md`
- `SECURITY_MODEL.md`
- `PRISMA_CONVENTIONS.md`
- `ENGINEERING_RULES.md`
- `API_CONTRACT_RULES.md`
- `ERROR_CATALOG.md`
- `TESTING_STRATEGY.md`
- `MODULES.md`
- `USER_TYPES.md`
- `V1_SCOPE.md`
- `DOMAIN_GLOSSARY.md`
- `DIRECTORY_STRUCTURE_VISUAL.md`
- `adr/ADR-0001-multi-tenancy-enforcement.md`
- `adr/ADR-0002-behavior-core-module-boundary.md`
- `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`

Runtime evidence inspected without modification:

- `prisma/schema.prisma`
- `prisma/migrations/20260629130000_0048_stu_prof_1c_student_avatar_file/migration.sql`
- `src/modules/student-app/profile/**`
- `src/modules/student-app/access/**`
- `src/modules/student-app/home/**`
- `src/modules/student-app/**`
- `src/modules/students/students/**`
- `src/modules/students/documents/**`
- `src/modules/files/**`
- `src/infrastructure/storage/**`
- `src/modules/parent-app/**`
- `src/modules/applicant-portal/**`
- `src/modules/admissions/**`
- `src/modules/homework/**`
- `src/modules/academics/**`
- `src/modules/student-app/profile/tests/**`
- `test/e2e/student-avatar-upload.e2e-spec.ts`
- `test/security/tenancy.student-avatar.spec.ts`
- `test/e2e/student-app-final-closeout.e2e-spec.ts`
- `test/security/tenancy.student-app.spec.ts`
- `test/e2e/admissions-document-import-to-student-document.e2e-spec.ts`
- `test/security/tenancy.admissions-document-import.spec.ts`

## 3. Final STU-PROF Avatar Timeline

| Sprint | Type | Goal | Commit / Evidence | Final state |
| --- | --- | --- | --- | --- |
| STU-PROF-1A | Documentation audit | Audit Student profile/avatar/self-service reality. | `358c5eda docs: audit student profile self-service`; `docs/sprint-stu-prof-1a-student-profile-avatar-self-service-audit.md` | Found read-only Student App profile, no avatar field, `student.userId` exposure, staff-only StudentDocument, homework/task separation. |
| STU-PROF-1B | Documentation decision lock | Lock avatar/profile/self-service contract. | `6ab74f42 docs: lock student profile avatar decisions`; `docs/sprint-stu-prof-1b-student-profile-avatar-self-service-decision-lock.md` | Chose Student-owned File avatar, Student App upload/delete routes, no direct official profile edits, remove/deprecate profile `userId`, keep StudentDocument staff-only. |
| STU-PROF-1C | Focused implementation | Implement Student avatar upload foundation. | `f5dec700 feat: add student avatar upload foundation`; `docs/sprint-stu-prof-1c-student-avatar-upload-foundation-closeout.md` | Added schema/migration, upload/delete routes, safe profile avatar response, `userId` repair, audit, validation, tests. |
| STU-PROF-1D | Documentation final closeout | Audit and freeze final avatar/profile response contract. | This document. | Closes avatar foundation; recommends profile correction request decision lock next. |

## 4. Decision Locked in STU-PROF-1B

STU-PROF-1B locked these V1 decisions:

1. Implement avatar upload before official profile self-edit.
2. Store avatar as Student-owned profile media, preferably `Student.avatarFileId` referencing `File`.
3. Use existing File metadata and private object storage.
4. Do not store signed URLs or public avatar URLs as source of truth.
5. Do not expose bucket or object key.
6. Allow Student App user to upload/replace/delete only their own active linked Student avatar.
7. Keep official Student profile fields staff-only.
8. Future official field changes should use correction requests, not direct mutation.
9. Keep StudentDocument staff-only.
10. Keep homework/task attachments separate from profile/avatar/documents.
11. Remove or explicitly deprecate Student App profile `student.userId` before or during avatar implementation.

STU-PROF-1D finds that STU-PROF-1C implemented this contract without requiring a new owner decision.

## 5. Implementation Completed in STU-PROF-1C

STU-PROF-1C completed:

- Nullable Student avatar File reference.
- Prisma migration.
- `POST /api/v1/student/profile/avatar`.
- `DELETE /api/v1/student/profile/avatar`.
- Safe `avatarUrl` and top-level `avatar` object in Student App profile responses.
- Student App profile `student.userId` removal.
- Avatar MIME validation for JPEG, PNG, and WebP.
- Avatar size validation at 5 MB.
- Safe audit events for upload, replace, and delete.
- Focused unit, e2e, security, and regression coverage.

Implementation stayed inside the profile/avatar scope. It did not add profile field editing, StudentDocument app visibility, Parent App document visibility, staff avatar management, Applicant identity changes, Admissions changes, ADM-REG-DOC changes, homework/task behavior changes, or global guard/schoolScope changes.

## 6. Final Schema and Migration Contract

Migration:

```text
prisma/migrations/20260629130000_0048_stu_prof_1c_student_avatar_file/migration.sql
```

Migration behavior:

```text
ALTER TABLE students ADD COLUMN avatar_file_id UUID;
CREATE INDEX students_avatar_file_id_idx ON students(avatar_file_id);
ALTER TABLE students ADD CONSTRAINT students_avatar_file_id_fkey
  FOREIGN KEY (avatar_file_id)
  REFERENCES files(id)
  ON DELETE SET NULL
  ON UPDATE CASCADE;
```

Prisma final state:

- `Student.avatarFileId String? @map("avatar_file_id") @db.Uuid`
- `Student.avatarFile File? @relation("StudentAvatarFile", fields: [avatarFileId], references: [id], onDelete: SetNull)`
- `File.studentAvatars Student[] @relation("StudentAvatarFile")`
- `@@index([avatarFileId])`

No schema changes were made to:

- User avatar fields.
- Dedicated ProfileMedia model.
- StudentDocument avatar fields.
- Parent App schema.
- Applicant Portal schema.
- Admissions schema.
- Homework/task schema.

## 7. Final Route Contract

| Route | Method | Actor | Behavior | Response | Audit |
| --- | --- | --- | --- | --- | --- |
| `/api/v1/student/profile` | GET | Authenticated linked Student with active Enrollment | Reads safe Student App profile. | Student profile with `avatarUrl` path or null and top-level `avatar` object or null. | None; read-only. |
| `/api/v1/student/profile/avatar` | POST | Authenticated linked Student with active Enrollment | Multipart upload/replace using field `file`; validates MIME and size; saves private File; updates current Student `avatarFileId`. | Updated safe profile/avatar response. | `student.profile.avatar.upload` or `student.profile.avatar.replace`. |
| `/api/v1/student/profile/avatar` | DELETE | Authenticated linked Student with active Enrollment | Clears current Student `avatarFileId`; does not delete old File/binary; safe when already null. | Updated safe profile response with null avatar. | `student.profile.avatar.delete`. |

POST details:

- Content type: `multipart/form-data`.
- Field: `file`.
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`.
- Max size: `5 MB`.
- No route body accepts `studentId`, `userId`, `schoolId`, `organizationId`, `applicationId`, bucket, or object key.

## 8. Final Student App Profile Response Contract

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
    "studentNumber": null,
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

The profile presenter builds avatar URLs as:

```text
/api/v1/files/:fileId/download
```

The response contract keeps:

- `student.studentId`
- `student.displayName`
- `student.firstName`
- `student.lastName`
- `student.email`
- `student.phone`
- `student.avatarUrl`
- `avatar.fileId`
- `avatar.url`
- `avatar.mimeType`
- `avatar.sizeBytes`
- safe school summary
- safe enrollment summary

The response does not expose:

- `student.userId`
- `Student.applicationId`
- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `deletedAt`
- `passwordHash`
- `Guardian.userId`
- Applicant user ids
- bucket
- object key
- raw signed URL
- internal actor ids
- audit internals

`unsupported.avatarUpload` is now `false` in the Student App profile presenter, reflecting that avatar upload is implemented. `unsupported.preferences` and `unsupported.seatNumber` remain `true`.

Student App home still has its own avatar placeholder behavior and was not broadened as part of the final profile contract.

## 9. userId Exposure Repair Confirmation

STU-PROF-1A identified `student.userId` in `GET /api/v1/student/profile` as a no-leak contract gap.

STU-PROF-1B locked removal/deprecation.

STU-PROF-1C removed `student.userId` from the Student App profile DTO and presenter. The read adapter still uses `Student.userId` internally to resolve ownership, but it does not select or present that id in the Student App profile response.

Tests now assert:

- profile response keeps `studentId`,
- profile response does not have `student.userId`,
- avatar responses do not expose `userId`.

This repair is scoped to Student App profile/avatar responses. Existing communication/message contracts that intentionally expose sender `userId` were not changed by STU-PROF-1C.

## 10. Avatar File / Storage Boundary

Avatar storage uses existing File and object-storage infrastructure:

- File metadata is stored in the `files` table.
- Avatar current-state pointer is `Student.avatarFileId`.
- Binary content is stored externally through object storage.
- `FileVisibility.PRIVATE` is used for avatar uploads.
- The profile response returns an authorized backend path, not a signed URL.
- Raw signed URLs are generated only by the existing file download flow.
- Bucket and object key remain internal storage metadata.

Replace/delete behavior:

- Replace uploads a new File and points `Student.avatarFileId` to it.
- Delete clears `Student.avatarFileId`.
- Neither replace nor delete physically deletes old File rows or binary objects in this sprint.

## 11. Official Profile Field Boundary

No profile field edit endpoint was added.

Confirmed absent or unsupported:

- No `PATCH /api/v1/student/profile`.
- Student cannot edit legal name fields.
- Student cannot edit Arabic name fields.
- Student cannot edit gender.
- Student cannot edit birth date.
- Student cannot edit nationality.
- Student cannot edit contact/address fields.
- Student cannot edit medical profile.
- Student cannot edit guardian/emergency contacts.
- Student cannot edit `Student.userId`.
- Student cannot edit `Student.applicationId`.

Official Student profile data remains school-staff managed. Future official field changes should use a correction request workflow, not direct Student App mutation.

## 12. StudentDocument Boundary

StudentDocument remains a Students-owned, staff-managed operational record document.

Confirmed final boundary:

- No Student App StudentDocument visibility was added.
- No Parent App StudentDocument visibility was added.
- No Student App StudentDocument upload route was added.
- Imported Admissions documents remain staff-managed StudentDocuments.
- Avatar media is not a StudentDocument.
- StudentDocument import behavior from ADM-REG-DOC remains unchanged.

## 13. Homework / Task File Boundary

Homework/task attachments remain academic workflow files.

They are not:

- avatar media,
- StudentDocument records,
- Student profile documents,
- evidence that profile documents are Student App-visible.

STU-PROF-1C did not change homework/task upload, attachment, submission, or proof behavior.

## 14. Audit and Observability

Implemented audit actions:

```text
student.profile.avatar.upload
student.profile.avatar.replace
student.profile.avatar.delete
```

Safe audit payload fields:

- `studentId`
- `fileId`
- `previousFileId`
- `mimeType`
- `sizeBytes`
- `source: student_app`

Audit payload forbidden fields:

- bucket
- object key
- raw signed URL
- file binary
- passwords
- tokens
- `Student.applicationId`
- Applicant ids
- `Guardian.userId`
- membership internals
- role internals

Audit logs are historical evidence. The current avatar state is derived from `Student.avatarFileId`, not from audit logs.

## 15. Security, Tenancy, and No-Leak Review

The avatar routes rely on the existing Student App access chain:

1. authenticated actor,
2. `UserType.STUDENT`,
3. active membership/school context,
4. linked active `Student.userId`,
5. active Student,
6. active Enrollment.

Repository writes use scoped Prisma through `StudentAvatarRepository`. Controllers delegate to use cases and do not use Prisma directly. No global guard or schoolScope behavior was changed.

| Boundary | Final behavior | Evidence | Decision |
| --- | --- | --- | --- |
| Student actor own avatar | Allowed for linked active Student with active Enrollment. | `StudentAppAccessService`; `StudentAvatarRepository`; avatar e2e/security tests. | Locked. |
| Parent actor | Cannot use Student App avatar routes. | `test/security/tenancy.student-avatar.spec.ts`. | Blocked. |
| Applicant actor | Cannot use Student App avatar routes. | `test/security/tenancy.student-avatar.spec.ts`; ADR-0003 boundary. | Blocked. |
| Staff actor using Student App route | Cannot use Student App avatar route unless also valid Student App actor. | `test/security/tenancy.student-avatar.spec.ts`. | Blocked. |
| Unlinked Student | Rejected. | `StudentAppAccessService`; security tests. | Blocked. |
| Student without active enrollment | Rejected. | `StudentAppAccessService`; security tests. | Blocked. |
| Cross-student mutation | No target student id is accepted; route resolves current Student from actor context. | Controller route shape; security tests with two Students. | Prevented. |
| Cross-school guessing | No target school/student id accepted; scoped access chain applies. | Access service and scoped repository. | Prevented. |
| Storage internals | Not returned by profile/avatar presenter. | Presenter and no-leak tests. | Hidden. |
| Tenant ids | Not returned by profile/avatar presenter. | Profile tests and security tests. | Hidden. |
| userId exposure | Removed from Student App profile/avatar response. | DTO/presenter and tests. | Repaired. |
| applicationId exposure | Not selected/presented in Student App profile/avatar response. | Read adapter/presenter/tests. | Hidden. |
| audit payload | Safe fields only. | Avatar use cases. | Historical evidence only. |

## 16. Test and Verification Coverage

STU-PROF-1C reported these commands and results:

| Command | Result |
| --- | --- |
| `npx prisma validate` | Passed. |
| `npx prisma generate` | Passed. |
| `npx prisma migrate status` | Initially reported the new migration pending; after deploy, reported database schema up to date. |
| `npx prisma migrate deploy` | Applied `20260629130000_0048_stu_prof_1c_student_avatar_file` locally for e2e/security verification. |
| `npm run build` | Passed after clearing a stale `dist` directory left by a timed-out build process. |
| `npm test -- --runInBand src/modules/student-app/profile/tests` | 4 suites passed, 20 tests passed. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-avatar-upload.e2e-spec.ts` | 1 suite passed, 4 tests passed. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-avatar.spec.ts` | 1 suite passed, 4 tests passed. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-app-final-closeout.e2e-spec.ts` | 1 suite passed, 17 tests passed. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts` | 1 suite passed, 24 tests passed. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-document-import-to-student-document.e2e-spec.ts` | 1 suite passed, 1 test passed. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.admissions-document-import.spec.ts` | 1 suite passed, 7 tests passed. |

Command nuance:

```text
npm test -- --runInBand test/e2e/student-avatar-upload.e2e-spec.ts
npm test -- --runInBand test/security/tenancy.student-avatar.spec.ts
```

do not discover `test/e2e` and `test/security` specs under the normal Jest unit configuration. The correct command is:

```text
npx jest --config ./test/jest-e2e.json --runInBand <spec>
```

No build/tests were required or run for STU-PROF-1D because it is documentation-only.

## 17. Known Limitations

- Staff avatar management is not implemented.
- Student profile field self-edit is not implemented.
- Profile correction request workflow is not implemented.
- Old avatar File rows and binary objects are retained when replaced or cleared.
- Avatar moderation/review workflow is not implemented.
- Avatar cleanup/retention policy is not implemented.
- Student App home/dashboard avatar propagation was not broadened beyond existing profile response behavior.
- StudentDocument remains staff-managed and is not exposed to Student App or Parent App.
- Parent App child/profile avatar behavior remains separate and was not changed.
- Medical profile app visibility remains deferred.
- Guardian/emergency contact update behavior remains deferred.

## 18. Deferred Backlog

| Backlog item | Why deferred | Recommended owner sprint | Priority | Risk |
| --- | --- | --- | --- | --- |
| Staff avatar management | STU-PROF-1C scoped first avatar mutation to Student App self-service. | STU-PROF Staff Avatar Management Decision | Low | Low/Medium operational risk. |
| Avatar cleanup/retention policy | Replace/delete intentionally retain old File rows/binaries. | Avatar Cleanup / Retention Policy | Medium | Medium storage/retention risk. |
| Avatar moderation/review workflow | Product policy for profile media moderation is not locked. | STU-PROF Avatar Moderation Decision | Medium | Medium content risk. |
| Profile correction request workflow | Official fields remain staff-only; direct self-edit rejected for V1. | STU-PROF-2A Student Profile Correction Request Decision Lock | High | High data-integrity risk. |
| Direct non-official profile preferences | Preferences need separate field/source policy. | STU-PROF Preferences Decision | Medium | Medium contract risk. |
| Student contact source-of-truth cleanup | Student contact fields and User contact fields can diverge. | Student Contact Source-of-Truth Audit | Medium | Medium consistency risk. |
| StudentDocument Student App visibility | Staff-managed documents may contain sensitive records. | STU-DOC App Visibility Decision | Medium | High privacy risk. |
| Parent App StudentDocument visibility | Parent visibility needs document type/redaction/consent policy. | STU-DOC Parent Visibility Decision | Medium | High privacy risk. |
| Medical profile app visibility | Medical data is sensitive and staff-managed today. | STU-MED App Visibility Decision | Medium | High privacy risk. |
| Guardian/emergency contact update policy | Guardian/emergency data is not solely Student-owned. | STU-PROF Guardian Contact Correction Policy | Medium | High ownership risk. |

## 19. Recommended Next Sprint Decision

Recommended next sprint:

```text
STU-PROF-2A - Student Profile Correction Request Decision Lock
```

Reason:

- Avatar foundation is complete.
- The next meaningful profile problem is official profile data changes.
- STU-PROF-1B rejected broad direct self-edit for official fields.
- A correction request workflow is safer than direct mutation for names, birth date, gender, nationality, contact/address data, medical data, and guardian/emergency contact changes.

| Option | Name | Why | Risk | Recommended now? |
| --- | --- | --- | --- | --- |
| Option A | Close STU-PROF avatar foundation only | Avatar backend foundation is complete and tested. | Low | Yes, this document. |
| Option B | STU-PROF-2A Student Profile Correction Request Decision Lock | Next profile issue is official data change policy. | Low as decision sprint; high if skipped and direct edits are implemented. | Yes. |
| Option C | STU-PROF Staff Avatar Management Decision | Staff avatar mutation may be useful but is not urgent after Student self-service foundation. | Low/Medium. | Not now. |
| Option D | STU-DOC App Visibility Decision | StudentDocument visibility is separate and privacy-sensitive. | High. | Not now. |
| Option E | Student Contact Source-of-Truth Audit | Contact fields can diverge between Student and User. | Medium. | Good later or as input to 2A. |
| Option F | Avatar Cleanup / Retention Policy | Needed eventually for storage hygiene and retention. | Medium. | Later. |

Do not recommend direct profile field edit implementation as the immediate next sprint. Do not recommend Applicant identity, Admissions, ADM-REG-DOC, Parent App, or StudentDocument visibility changes as a side effect of profile work.

## 20. Explicit Do-Not-Do List

- Do not add `PATCH /api/v1/student/profile` as a side effect.
- Do not allow direct Student edits to official fields.
- Do not implement correction requests in STU-PROF-1D.
- Do not expose StudentDocument to Student App.
- Do not expose StudentDocument to Parent App.
- Do not add Student App StudentDocument upload.
- Do not treat homework/task submissions as profile documents.
- Do not expose bucket, objectKey, or raw signed URLs.
- Do not reintroduce `student.userId` into Student App profile response.
- Do not expose `Student.applicationId`.
- Do not mutate Applicant identity.
- Do not change Admissions registration behavior.
- Do not change ADM-REG-DOC import behavior.
- Do not change homework/task behavior.
- Do not add staff avatar management in this audit.
- Do not use audit logs as avatar current-state source.

## 21. Final Verdict

```text
STU_PROF_1D_STUDENT_AVATAR_FINAL_CLOSEOUT_READY
```

The avatar foundation and Student App profile contract are ready to close. The implemented backend matches the STU-PROF-1B decision lock and STU-PROF-1C closeout evidence: Student-owned File avatar, safe profile response, `student.userId` removal, upload/replace/delete routes, MIME/size validation, no storage internal exposure, safe audit events, and focused verification.

## Final Capability Matrix

| Capability | Implemented? | Evidence | Boundary / Limitation |
| --- | --- | --- | --- |
| Student-owned avatar File | Yes | `Student.avatarFileId`, `Student.avatarFile`, `File.studentAvatars`. | Current pointer only; old files retained. |
| avatar migration | Yes | `20260629130000_0048_stu_prof_1c_student_avatar_file`. | Nullable, non-destructive. |
| POST avatar upload/replace | Yes | `POST /api/v1/student/profile/avatar`. | Student App actor only. |
| DELETE avatar clear | Yes | `DELETE /api/v1/student/profile/avatar`. | Clears pointer, does not delete old binary. |
| GET profile avatar response | Yes | `StudentProfilePresenter`. | Profile route only; Student App home not broadened. |
| `student.userId` removed from profile | Yes | DTO/presenter/tests. | Communication sender `userId` contracts unchanged. |
| avatar MIME validation | Yes | `student-avatar.constraints.ts`; use-case tests. | JPEG, PNG, WebP only. |
| avatar size validation | Yes | `STUDENT_AVATAR_MAX_SIZE_BYTES = 5 MB`. | Avatar-specific limit. |
| avatar audit events | Yes | Upload/delete use cases. | Safe payload only. |
| authorized file download path | Yes | Presenter returns `/api/v1/files/:fileId/download`. | Raw signed URL not embedded. |
| no bucket/objectKey exposure | Yes | Presenter and no-leak tests. | Bucket/objectKey remain storage internals. |
| no raw signed URL exposure | Yes | Presenter and tests. | Download route generates signed URL on access. |
| official profile field edits | No | No `PATCH /api/v1/student/profile`; tests. | Future correction request decision. |
| profile correction requests | No | No route/model/workflow. | Recommended next sprint. |
| StudentDocument Student App visibility | No | Students document routes remain staff routes. | Separate STU-DOC decision. |
| Parent App StudentDocument visibility | No | Parent App unchanged. | Separate decision. |
| Student App StudentDocument upload | No | No Student App document route. | Staff-only StudentDocument remains. |
| staff avatar management | No | No staff avatar route. | Deferred. |
| homework/task file changes | No | Homework/task modules unchanged. | Academic attachments stay separate. |

## Profile Response Contract Matrix

| Field / Concept | Final behavior | Safe? | Decision |
| --- | --- | --- | --- |
| `student.studentId` | Returned as safe Student identifier. | Yes | Keep. |
| `student.userId` | Removed from Student App profile response. | Yes | Do not reintroduce. |
| `student.displayName` | Returned. | Yes | Keep read-only. |
| `student.firstName` | Returned. | Yes | Keep read-only. |
| `student.lastName` | Returned. | Yes | Keep read-only. |
| `student.email` | Returned from linked User email. | Yes, but source cleanup deferred. | Keep read-only; revisit contact source of truth later. |
| `student.phone` | Returned from linked User phone. | Yes, but source cleanup deferred. | Keep read-only; revisit contact source of truth later. |
| `student.avatarUrl` | `/api/v1/files/:fileId/download` or null. | Yes | Keep. |
| `avatar.fileId` | Returned when avatar exists. | Yes | Allowed safe File id. |
| `avatar.url` | `/api/v1/files/:fileId/download`. | Yes | Authorized backend path only. |
| `avatar.mimeType` | Returned from File metadata. | Yes | Keep. |
| `avatar.sizeBytes` | Returned as number. | Yes | Keep. |
| school summary | Returned with safe display fields. | Yes | Keep. |
| enrollment summary | Returned with safe academic placement fields. | Yes | Keep. |
| unsupported flags | `avatarUpload: false`; preferences/seat deferred. | Yes | Keep aligned with implemented capability. |
| `applicationId` | Not returned. | Yes | Keep hidden. |
| `schoolId` | Not returned. | Yes | Keep hidden. |
| `organizationId` | Not returned. | Yes | Keep hidden. |
| bucket/objectKey | Not returned. | Yes | Keep hidden. |
| raw signed URL | Not returned. | Yes | Keep hidden. |

## Avatar Route Contract Matrix

| Route | Method | Actor | Behavior | Response | Audit |
| --- | --- | --- | --- | --- | --- |
| `/api/v1/student/profile` | GET | Linked active Student with active Enrollment. | Read-only profile. | Safe profile with avatar object/path or null. | None. |
| `/api/v1/student/profile/avatar` | POST | Linked active Student with active Enrollment. | Uploads or replaces own avatar File; validates MIME/size. | Updated safe profile/avatar response. | `student.profile.avatar.upload` or `student.profile.avatar.replace`. |
| `/api/v1/student/profile/avatar` | DELETE | Linked active Student with active Enrollment. | Clears own avatar reference; no physical file deletion. | Updated safe profile with null avatar. | `student.profile.avatar.delete`. |
