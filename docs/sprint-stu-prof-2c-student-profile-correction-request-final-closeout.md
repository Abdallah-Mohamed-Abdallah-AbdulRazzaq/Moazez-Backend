# STU-PROF-2C - Student Profile Correction Request Final Closeout

## 1. Executive Summary

STU-PROF-2C closes the Student Profile / Avatar / Self-Service V1 backend track.

The implemented V1 state is now coherent:

1. Student App can read a safe Student profile.
2. Student App can upload, replace, and delete Student-owned avatar media.
3. Student App profile responses no longer expose `student.userId`.
4. Official Student profile fields are not directly editable through Student App.
5. Student App can submit, list, read, and cancel its own profile correction requests.
6. Correction request submission stores requested changes and current snapshot evidence, but does not mutate `Student`.
7. School staff can list, read, approve, and reject same-school correction requests.
8. Staff approval applies allowlisted Student changes and marks the request approved in one transaction.
9. Staff rejection and Student cancellation do not mutate `Student`.
10. Avatar, StudentDocument, medical, guardian/emergency, Applicant, Admissions, ADM-REG-DOC, homework, and task boundaries remain intact.

Final decision:

```text
Student Profile / Avatar / Self-Service V1 is complete.
Close the current STU-PROF track.
Recommended next: move to a new feature area unless product explicitly prioritizes profile follow-ups.
```

Final verdict:

```text
STU_PROF_2C_PROFILE_SELF_SERVICE_FINAL_CLOSEOUT_READY
```

## 2. Source Evidence Reviewed

Decision, implementation, and closeout documents reviewed:

- `docs/sprint-stu-prof-1a-student-profile-avatar-self-service-audit.md`
- `docs/sprint-stu-prof-1b-student-profile-avatar-self-service-decision-lock.md`
- `docs/sprint-stu-prof-1c-student-avatar-upload-foundation-closeout.md`
- `docs/sprint-stu-prof-1d-student-avatar-final-closeout-profile-contract-audit.md`
- `docs/sprint-stu-prof-2a-student-profile-correction-request-decision-lock.md`
- `docs/sprint-stu-prof-2b-student-profile-correction-request-foundation-closeout.md`
- `docs/sprint-adm-reg-1j-admissions-registration-flow-final-closeout-audit.md`
- `docs/sprint-adm-reg-doc-1c-admissions-document-import-final-closeout-audit.md`

Governance references reviewed:

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
- `AGENTS.md`
- `adr/ADR-0001-multi-tenancy-enforcement.md`
- `adr/ADR-0002-behavior-core-module-boundary.md`
- `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`

Runtime evidence inspected without modification:

- `prisma/schema.prisma`
- `prisma/migrations/20260629130000_0048_stu_prof_1c_student_avatar_file/migration.sql`
- `prisma/migrations/20260630100000_0049_stu_prof_2b_profile_correction_requests/migration.sql`
- `src/modules/student-app/profile/controller/student-profile.controller.ts`
- `src/modules/student-app/profile/application/upload-student-avatar.use-case.ts`
- `src/modules/student-app/profile/application/delete-student-avatar.use-case.ts`
- `src/modules/student-app/profile/application/student-profile-correction-requests.use-cases.ts`
- `src/modules/student-app/profile/domain/student-avatar.constraints.ts`
- `src/modules/student-app/profile/infrastructure/student-avatar.repository.ts`
- `src/modules/student-app/profile/infrastructure/student-profile-read.adapter.ts`
- `src/modules/student-app/profile/presenters/student-profile.presenter.ts`
- `src/modules/students/profile-correction-requests/**`
- `src/modules/students/documents/**`
- `src/modules/students/guardians/**`
- `src/modules/students/enrollments/**`
- `src/modules/students/medical/**`
- `src/modules/files/**`
- `src/modules/parent-app/**`
- `src/modules/applicant-portal/**`
- `src/modules/admissions/**`
- `src/modules/homework/**`
- `src/modules/academics/**`
- `src/infrastructure/audit/**`
- `src/infrastructure/prisma/**`

Test evidence inspected:

- `src/modules/student-app/profile/tests/**`
- `test/e2e/student-profile-correction-requests.e2e-spec.ts`
- `test/security/tenancy.student-profile-correction-requests.spec.ts`
- `test/e2e/student-avatar-upload.e2e-spec.ts`
- `test/security/tenancy.student-avatar.spec.ts`
- `test/e2e/student-app-final-closeout.e2e-spec.ts`
- `test/security/tenancy.student-app.spec.ts`
- `test/e2e/admissions-document-import-to-student-document.e2e-spec.ts`
- `test/security/tenancy.admissions-document-import.spec.ts`

## 3. Full STU-PROF Timeline

| Sprint | Type | Commit / Evidence | Goal | Final state |
| --- | --- | --- | --- | --- |
| STU-PROF-1A | Documentation audit | `358c5eda docs: audit student profile self-service`; `docs/sprint-stu-prof-1a-student-profile-avatar-self-service-audit.md` | Audit Student profile/avatar/self-service reality. | Found read-only Student App profile, no avatar field, `student.userId` exposure, staff-only StudentDocument, and homework/task separation. |
| STU-PROF-1B | Documentation decision lock | `6ab74f42 docs: lock student profile avatar decisions`; `docs/sprint-stu-prof-1b-student-profile-avatar-self-service-decision-lock.md` | Lock avatar/profile/self-service contract. | Chose Student-owned File avatar, Student App avatar routes, no direct official profile edits, profile `userId` removal, StudentDocument staff-only. |
| STU-PROF-1C | Focused implementation | `f5dec700 feat: add student avatar upload foundation`; `docs/sprint-stu-prof-1c-student-avatar-upload-foundation-closeout.md` | Implement Student avatar upload foundation. | Added `Student.avatarFileId`, upload/delete routes, safe avatar response, userId repair, audit, validation, tests. |
| STU-PROF-1D | Documentation final closeout | `9d859484 docs: close student avatar foundation`; `docs/sprint-stu-prof-1d-student-avatar-final-closeout-profile-contract-audit.md` | Close avatar foundation and freeze profile contract. | Avatar foundation closed; recommended correction request decision lock next. |
| STU-PROF-2A | Documentation decision lock | `a753cb2f docs: lock student profile correction requests`; `docs/sprint-stu-prof-2a-student-profile-correction-request-decision-lock.md` | Lock correction request workflow before implementation. | Chose Student App requests, staff review, transactional approval, no direct Student App mutation. |
| STU-PROF-2B | Focused implementation | `0f6caf79 feat: add student profile correction requests`; `docs/sprint-stu-prof-2b-student-profile-correction-request-foundation-closeout.md` | Implement correction request foundation. | Added model, migration, Student App submit/list/read/cancel, staff list/read/approve/reject, audit, tests. |
| STU-PROF-2C | Documentation final closeout | This document | Audit final STU-PROF V1 self-service state. | Closes Student Profile / Avatar / Self-Service V1 backend logic. |

## 4. Avatar Foundation Final State

The STU-PROF-1B avatar decision was implemented as locked.

Final avatar state:

- `Student.avatarFileId` exists as a nullable Student-owned File reference.
- `Student.avatarFile` relates to `File` through a named `StudentAvatarFile` relation.
- Avatar binary content uses existing private object storage.
- Avatar current state is the `Student.avatarFileId` pointer.
- `POST /api/v1/student/profile/avatar` uploads or replaces the authenticated Student's avatar.
- `DELETE /api/v1/student/profile/avatar` clears the authenticated Student's avatar.
- `GET /api/v1/student/profile` returns safe avatar data when present.
- Avatar display uses `/api/v1/files/:fileId/download`.
- No signed URL is stored or returned in profile/avatar JSON.
- No bucket or object key is returned in profile/avatar JSON.
- Old avatar File rows and binary objects are retained on replace/delete.
- Avatar is not part of profile correction requests.

Avatar validation:

- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`.
- Max size: `5 MB`.
- The upload field is multipart `file`.

Avatar audit events:

- `student.profile.avatar.upload`
- `student.profile.avatar.replace`
- `student.profile.avatar.delete`

## 5. Student App Profile Contract Final State

`GET /api/v1/student/profile` remains read-only.

Final safe profile response behavior:

- `student.studentId` remains the safe app-facing Student identifier.
- `student.userId` is removed.
- `Student.applicationId` is not exposed.
- `schoolId` and `organizationId` are not exposed.
- `avatarUrl` is `/api/v1/files/:fileId/download` or `null`.
- top-level `avatar` is safe File metadata or `null`.
- school and enrollment summaries remain safe display/read-model data.
- no `PATCH /api/v1/student/profile` route exists.
- official fields cannot be directly edited by Student App.

Safe avatar response concept:

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

No avatar response concept:

```json
{
  "student": {
    "studentId": "uuid",
    "avatarUrl": null
  },
  "avatar": null
}
```

## 6. Correction Request Foundation Final State

The STU-PROF-2A correction request decision was implemented as locked.

Student App routes:

- `POST /api/v1/student/profile/correction-requests`
- `GET /api/v1/student/profile/correction-requests`
- `GET /api/v1/student/profile/correction-requests/:requestId`
- `POST /api/v1/student/profile/correction-requests/:requestId/cancel`

Staff routes:

- `GET /api/v1/students-guardians/profile-correction-requests`
- `GET /api/v1/students-guardians/profile-correction-requests/:requestId`
- `POST /api/v1/students-guardians/profile-correction-requests/:requestId/approve`
- `POST /api/v1/students-guardians/profile-correction-requests/:requestId/reject`

Final behavior:

- Student can submit correction requests for allowlisted fields only.
- Student can list/read only own correction requests.
- Student can cancel only own `PENDING` requests.
- Parent and Applicant actors cannot use Student App correction routes.
- Unlinked Students and Students without active Enrollment are blocked by the existing Student App access chain.
- Staff can list/read same-school correction requests with `students.records.view`.
- Staff can approve/reject same-school correction requests with `students.records.manage`.
- Submission creates a request and current snapshot; it does not mutate `Student`.
- Approval checks same-school, pending status, and active target Student.
- Approval applies only allowlisted fields to `Student` and marks the request `APPROVED` in a Prisma transaction.
- Rejection marks the request `REJECTED` and does not mutate `Student`.
- Cancellation marks the request `CANCELLED` and does not mutate `Student`.

Student App response shape:

```json
{
  "id": "uuid",
  "status": "PENDING",
  "requestedChanges": {
    "firstName": "New"
  },
  "reason": "Please correct my profile information.",
  "reviewerNote": null,
  "submittedAt": "2026-06-30T00:00:00.000Z",
  "resolvedAt": null,
  "cancelledAt": null
}
```

Staff response includes the same request summary plus safe `student` summary and `currentSnapshot`.

## 7. Final Schema and Migration Contract

Avatar migration:

```text
prisma/migrations/20260629130000_0048_stu_prof_1c_student_avatar_file/migration.sql
```

Avatar schema/migration final state:

- adds nullable `students.avatar_file_id`;
- adds `students_avatar_file_id_idx`;
- adds FK to `files(id)` with `ON DELETE SET NULL` and `ON UPDATE CASCADE`;
- preserves existing Student rows.

Correction request migration:

```text
prisma/migrations/20260630100000_0049_stu_prof_2b_profile_correction_requests/migration.sql
```

Correction request status enum:

```text
PENDING
APPROVED
REJECTED
CANCELLED
```

`StudentProfileCorrectionRequest` model stores:

- `organizationId`
- `schoolId`
- `studentId`
- `requestedByUserId`
- `requestedByType`
- `status`
- `requestedChanges`
- `currentSnapshot`
- `reason`
- `reviewerNote`
- `approvedAt`
- `approvedBy`
- `rejectedAt`
- `rejectedBy`
- `cancelledAt`
- `cancelledBy`
- `createdAt`
- `updatedAt`
- `deletedAt`

Indexes and relations include:

- `schoolId + studentId + status + createdAt`
- `schoolId + status + createdAt`
- `requestedByUserId`
- `studentId`
- `deletedAt`
- unique `id + schoolId`
- FKs to `schools`, `organizations`, and same-school `students`

No schema changes were made to:

- `StudentDocument`
- Applicant Portal
- Admissions
- Parent App
- homework/task modules
- medical profile
- guardian/emergency contact modules

## 8. Allowed / Disallowed Field Policy

Allowed correction request fields:

- `firstName`
- `fatherNameEn`
- `grandfatherNameEn`
- `lastName`
- `firstNameAr`
- `fatherNameAr`
- `grandfatherNameAr`
- `familyNameAr`
- `gender`
- `birthDate`
- `nationality`
- `studentPhone`
- `studentEmail`
- `addressLine`
- `city`
- `district`

Rejected/disallowed categories:

- avatar/profile media
- medical profile
- guardian/emergency contact
- StudentDocument/document fields
- homework/task files
- preferences/display name fields
- `Student.userId`
- `Student.applicationId`
- `studentId` in body
- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `passwordHash`
- `deletedAt`
- `createdAt`
- `updatedAt`

Validation rejects:

- non-object `changes`;
- empty `changes`;
- unknown/disallowed fields;
- non-text values;
- overlong values;
- invalid email;
- invalid birth date format;
- clearing required `firstName`, `lastName`, `gender`, or `birthDate`.

## 9. Status Lifecycle

Allowed transitions:

```text
PENDING -> APPROVED
PENDING -> REJECTED
PENDING -> CANCELLED
```

Terminal statuses:

```text
APPROVED
REJECTED
CANCELLED
```

No reopen, revise, resubmit-from-same-request, or terminal-status mutation workflow exists in V1.

## 10. Route Contract Matrix

| Route | Actor | Purpose | Side effect | Final decision |
| --- | --- | --- | --- | --- |
| `GET /api/v1/student/profile` | Linked active Student with active Enrollment | Read safe Student App profile. | None. | Implemented; read-only. |
| `POST /api/v1/student/profile/avatar` | Linked active Student with active Enrollment | Upload/replace own avatar. | Creates File metadata/object; updates own `Student.avatarFileId`; writes audit. | Implemented; avatar-only. |
| `DELETE /api/v1/student/profile/avatar` | Linked active Student with active Enrollment | Clear own avatar. | Sets own `Student.avatarFileId` to null; writes audit. | Implemented; does not delete old file/binary. |
| `POST /api/v1/student/profile/correction-requests` | Linked active Student with active Enrollment | Submit allowed field correction request. | Creates `PENDING` request and current snapshot; writes audit. | Implemented; no Student mutation. |
| `GET /api/v1/student/profile/correction-requests` | Linked active Student with active Enrollment | List own correction requests. | None. | Implemented. |
| `GET /api/v1/student/profile/correction-requests/:requestId` | Linked active Student with active Enrollment | Read own correction request. | None. | Implemented; safe not-found for non-owned ids. |
| `POST /api/v1/student/profile/correction-requests/:requestId/cancel` | Linked active Student with active Enrollment | Cancel own pending request. | Sets request `CANCELLED`; writes audit. | Implemented; no Student mutation. |
| `GET /api/v1/students-guardians/profile-correction-requests` | School staff | List same-school requests. | None. | Implemented; `students.records.view`. |
| `GET /api/v1/students-guardians/profile-correction-requests/:requestId` | School staff | Read same-school request. | None. | Implemented; `students.records.view`. |
| `POST /api/v1/students-guardians/profile-correction-requests/:requestId/approve` | School staff | Approve and apply request. | Transactionally updates Student and request; writes audit. | Implemented; `students.records.manage`. |
| `POST /api/v1/students-guardians/profile-correction-requests/:requestId/reject` | School staff | Reject request. | Sets request `REJECTED`; writes audit. | Implemented; no Student mutation. |
| `PATCH /api/v1/student/profile` | Student App | Direct profile edit. | N/A. | Not implemented; must remain absent in V1. |

## 11. Response Contract and No-Leak Review

| Field / Concept | Student App profile response | Student App correction response | Staff correction response | Decision |
| --- | --- | --- | --- | --- |
| `studentId` | Returned as `student.studentId`. | Not needed except implicit ownership. | Returned in safe student summary. | Safe. |
| `requestId` | N/A. | Returned as `id`. | Returned as `id`. | Safe correction request id. |
| student display name | Returned as `student.displayName`. | N/A. | Returned in safe student summary. | Safe. |
| `requestedChanges` | N/A. | Returned for own requests. | Returned for review. | Safe after allowlist validation. |
| `currentSnapshot` | N/A. | Hidden. | Returned as safe snapshot. | Staff review only. |
| `reviewerNote` | N/A. | Returned when present. | Returned when present. | Safe, but should avoid sensitive unrelated data. |
| `schoolId` | Hidden. | Hidden. | Hidden in response. | Tenant internal. |
| `organizationId` | Hidden. | Hidden. | Hidden in response. | Tenant internal. |
| `membershipId` | Hidden. | Hidden. | Hidden. | Internal. |
| `roleId` | Hidden. | Hidden. | Hidden. | Internal. |
| `requestedByUserId` | Hidden. | Hidden. | Hidden. | Internal actor id. |
| `approvedBy/rejectedBy/cancelledBy` | Hidden. | Hidden. | Hidden. | Internal actor ids. |
| `Student.userId` | Hidden; removed from profile. | Hidden. | Hidden. | Do not reintroduce. |
| `Student.applicationId` | Hidden. | Hidden. | Hidden. | Internal Admissions source link. |
| bucket/objectKey | Hidden. | N/A. | Hidden. | Storage internals. |
| raw signed URL | Hidden. | N/A. | Hidden. | Use Files download route only. |
| audit internals | Hidden. | Hidden. | Hidden. | Audit logs are separate historical evidence. |
| medical details | Not included. | Not requestable. | Not included. | Deferred sensitive domain. |
| guardian sensitive details | Not included. | Not requestable. | Not included. | Deferred ownership domain. |

Student App responses must not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `requestedByUserId`
- `approvedBy`
- `rejectedBy`
- `cancelledBy`
- `Student.userId`
- `Student.applicationId`
- audit internals
- bucket
- objectKey
- raw signed URL

Staff responses must avoid:

- tenant internals unless already conventionally safe;
- `Student.userId`;
- `Student.applicationId`;
- unrelated medical details;
- guardian sensitive details;
- storage internals;
- audit internals.

## 12. Audit and Observability

Avatar audit events:

- `student.profile.avatar.upload`
- `student.profile.avatar.replace`
- `student.profile.avatar.delete`

Avatar audit payload may include:

- `studentId`
- `fileId`
- `previousFileId`
- `mimeType`
- `sizeBytes`
- `source: student_app`

Correction request audit events:

- `student.profile.correction.requested`
- `student.profile.correction.cancelled`
- `students.profile.correction.approved`
- `students.profile.correction.rejected`

Correction audit payload may include:

- `requestId`
- `studentId`
- `status`
- `changedFieldNames`
- `source: student_app`
- `source: school_staff`

Audit payloads must avoid:

- passwords;
- tokens;
- `Student.applicationId`;
- full sensitive before/after values unless a future audit policy explicitly permits them;
- medical details;
- guardian sensitive details;
- bucket/objectKey;
- raw signed URLs;
- raw actor internals in app-facing responses.

Audit logs are historical evidence only. Avatar current state comes from `Student.avatarFileId`; correction request current state comes from `StudentProfileCorrectionRequest` and `Student`.

## 13. Security and Tenancy Review

Student App profile/avatar/correction behavior uses the existing Student App access chain:

1. authenticated actor;
2. `UserType.STUDENT`;
3. active membership and current school scope;
4. linked active `Student.userId`;
5. active Student;
6. active Enrollment.

Staff correction review uses Students/Guardians admin routes and existing permission checks:

- list/read: `students.records.view`;
- approve/reject: `students.records.manage`.

Repository and scope behavior:

- Controllers are thin.
- Controllers do not use Prisma directly.
- Business logic lives in use cases/domain helpers/repositories.
- Presenters shape app/staff responses.
- Prisma access is repository/adapter-backed.
- Current school scope is used for staff list/read/approve/reject.
- Student App routes derive the target Student from the authenticated Student App context.
- No global guard changes were made.
- No `schoolScope` changes were made.
- Cross-school/cross-student guesses use safe not-found or existing Student App forbidden/unauthorized behavior.

## 14. Regression Boundary Review

| Boundary | Changed by STU-PROF? | Final state | Evidence |
| --- | --- | --- | --- |
| Applicant identity | No | Applicant remains pre-admission `UserType.APPLICANT`; no membership/conversion. | ADR-0003; ADM-REG 1J; no STU-PROF Applicant changes. |
| Admissions registration | No | Registration submit, `registrationState`, and `Application.status` behavior remain unchanged. | ADM-REG closeouts; STU-PROF touched Student App/profile areas only. |
| ADM-REG-DOC import | No | Staff-confirmed Admissions document import remains unchanged. | ADM-REG-DOC 1C; regression tests reported in 2B. |
| StudentDocument app visibility | No | StudentDocument remains staff-only. | Students documents routes; ADM-REG-DOC boundary; no Student App document route. |
| Parent App document visibility | No | Parent App StudentDocument visibility remains absent. | Parent App unchanged for STU-PROF 2B. |
| Homework/task files | No | Academic workflow attachments remain separate. | Homework Student App routes remain homework/submission routes. |
| Medical profile | No | Staff-managed medical profile remains outside correction request V1. | Disallowed field policy; no medical route changes. |
| Guardian/emergency contacts | No | Guardian/emergency contact correction remains deferred. | Disallowed field policy; no guardian route changes. |
| Avatar route | Yes, intentionally | Separate avatar upload/delete route remains outside correction requests. | `POST/DELETE /api/v1/student/profile/avatar`. |
| Student profile direct edit | No | `PATCH /api/v1/student/profile` remains absent. | Controller and e2e/security tests. |
| schoolScope/global guards | No | Existing scope/guard behavior preserved. | ADR-0001; controllers/use cases do not change guards/scope extension. |

## 15. Test and Verification Coverage

STU-PROF-1C and STU-PROF-2B reported these commands and results:

| Command | Reported result |
| --- | --- |
| `npx prisma validate` | Passed. |
| `npx prisma generate` | Passed. |
| `npx prisma migrate deploy` | Passed; applied pending local migrations before e2e/security verification. |
| `npx prisma migrate status` | Passed after deploy; database schema up to date. |
| `npm run build` | Passed. |
| `npm test -- --runInBand src/modules/student-app/profile/tests` | Passed; 2B reported 5 suites / 25 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-avatar-upload.e2e-spec.ts` | Passed; 1 suite / 4 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-avatar.spec.ts` | Passed; 1 suite / 4 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-profile-correction-requests.e2e-spec.ts` | Passed; 1 suite. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-profile-correction-requests.spec.ts` | Passed; 3 focused security tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-app-final-closeout.e2e-spec.ts` | Passed; 1 suite / 17 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts` | Passed; 1 suite / 24 tests. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-document-import-to-student-document.e2e-spec.ts` | Passed; 1 suite / 1 test. |
| `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.admissions-document-import.spec.ts` | Passed; 1 suite / 7 tests. |

Coverage verified by current tests includes:

- profile response no longer exposes `student.userId`;
- profile response returns safe avatar null/path/object;
- avatar upload/replace/delete behavior;
- avatar invalid MIME and oversize rejection;
- avatar wrong actor boundaries;
- profile correction valid submit;
- profile correction disallowed field rejection;
- profile correction submit does not mutate Student;
- Student list/read ownership;
- Student pending cancellation;
- staff same-school read/approve/reject;
- transactional approval apply;
- rejection/cancellation leave Student unchanged;
- `PATCH /api/v1/student/profile` remains absent/unsupported;
- no tenant, actor, application, storage, or raw signed URL leaks in app-facing responses.

Known test command nuance:

```text
test/e2e and test/security specs require:
npx jest --config ./test/jest-e2e.json --runInBand <spec>
```

No build or tests were required for STU-PROF-2C because it is documentation-only.

## 16. Known Limitations

- No Parent/Guardian correction request submission.
- No medical profile correction workflow.
- No guardian/emergency contact correction workflow.
- No correction request attachments/evidence.
- No notifications to staff or student on request lifecycle changes.
- No reopen/revise lifecycle.
- No direct Student App profile field edit endpoint.
- No direct non-official preferences edit endpoint.
- No Student contact source-of-truth cleanup between Student fields and User account fields.
- No avatar cleanup/retention job.
- No staff avatar management route.
- No StudentDocument Student App visibility.
- No Parent App StudentDocument visibility.
- No bulk/admin repair tooling for profile data drift.

## 17. Deferred Backlog

| Backlog item | Why deferred | Recommended owner sprint | Priority | Risk |
| --- | --- | --- | --- | --- |
| Parent/Guardian correction submission | Parent consent, guardianship ownership, and actor policy differ from Student self-service. | Parent/Guardian Correction Request Decision | Medium | High if mixed into Student App flow. |
| Medical profile correction workflow | Medical data is sensitive and currently staff-managed. | STU-MED App Visibility / Correction Decision | Medium | High privacy/safety risk. |
| Guardian/emergency contact correction workflow | Guardian/emergency data is not solely Student-owned. | Guardian Contact Correction Decision | Medium | High ownership risk. |
| Profile correction attachments/evidence | File evidence requires storage, visibility, retention, and review rules. | Profile Correction Evidence Decision | Medium | Medium/High file privacy risk. |
| Notifications to staff/student | Notification templates, recipients, and delivery policy are separate concerns. | Notifications for Correction Requests | Medium | Low/Medium operational risk. |
| Reopen/revise lifecycle | V1 has terminal states only. | Correction Request Lifecycle Expansion | Low | Medium state-machine risk. |
| Student contact source-of-truth cleanup | Profile response uses User email/phone while correction requests target Student contact fields. | STU-PROF-3 Student Contact Source-of-Truth Audit | High | Medium consistency risk. |
| Direct non-official preferences edit | Preferences need durable fields and source-of-truth policy. | STU-PROF Preferences Decision | Low | Medium contract risk. |
| Avatar cleanup/retention policy | Replace/delete retain old File rows/binaries. | Avatar Cleanup / Retention Policy | Medium | Medium storage/retention risk. |
| Staff avatar management | First avatar implementation is Student App self-service only. | STU-PROF Staff Avatar Management Decision | Low | Low/Medium operational risk. |
| StudentDocument Student App visibility | StudentDocument may include sensitive staff-managed records. | STU-DOC App Visibility Decision | Medium | High privacy risk. |
| Parent App StudentDocument visibility | Parent visibility needs document type, redaction, and consent policy. | STU-DOC Parent Visibility Decision | Medium | High privacy risk. |
| Bulk/admin repair tools | Data repair is separate from self-service request workflow. | Admin Data Repair Sprint | Low | Medium if automated casually. |

## 18. Student Profile / Avatar / Self-Service V1 Completion Decision

The Student Profile / Avatar / Self-Service V1 backend track is complete.

Completion criteria satisfied:

- Student App profile read contract is safe.
- `student.userId` has been removed from Student App profile responses.
- Avatar is Student-owned and File-backed.
- Avatar upload/replace/delete routes exist and are audited.
- Avatar storage internals are hidden.
- Direct official profile mutation remains prohibited.
- Correction request submit/list/read/cancel exists for Student App.
- Staff correction request list/read/approve/reject exists for same-school school staff.
- Submission, rejection, and cancellation do not mutate Student.
- Approval applies allowlisted fields transactionally.
- StudentDocument, medical, guardian/emergency, Parent, Applicant, Admissions, ADM-REG-DOC, homework, and task boundaries remain intact.

Do not continue expanding STU-PROF immediately unless product explicitly prioritizes one of the deferred profile follow-ups.

## 19. Recommended Next Feature Area

Recommended next decision:

```text
Move to a new non-profile feature area.
```

Reason:

STU-PROF V1 now covers the core Student App profile self-service backend: read-safe profile, avatar media, and official data correction requests. The remaining profile work is either policy-heavy, privacy-sensitive, or operational refinement. It should not be treated as automatic continuation work.

| Option | Feature area | Why | Risk | Recommended now? |
| --- | --- | --- | --- | --- |
| Option A | STU-PROF-3 Student Contact Source-of-Truth Audit | Useful if the team wants to continue cleaning profile data consistency. | Medium; contact fields cross Student/User boundaries. | Optional, not default. |
| Option B | STU-DOC App Visibility Decision | Needed if product wants Student/Parent visibility into StudentDocument records. | High privacy/access risk. | No automatic continuation; separate decision only. |
| Option C | Notifications for Correction Requests | Useful workflow polish after correction requests. | Low/Medium; needs recipient/template policy. | Optional later. |
| Option D | Parent/Guardian Correction Request Decision | Expands requesters beyond Student App. | High consent/ownership risk. | Not now unless product prioritizes. |
| Option E | Medical Profile App Visibility / Correction Decision | Addresses sensitive medical self-service. | High privacy/safety risk. | Not now without product/privacy decision. |
| Option F | New non-profile feature area | STU-PROF V1 backend is closed; broader product work can move on. | Depends on selected feature. | Yes, default recommendation. |

If the team chooses to stay in profile work, the safest next profile-specific option is:

```text
STU-PROF-3 - Student Contact Source-of-Truth Audit
```

Do not recommend direct Student profile edit implementation. Do not treat StudentDocument visibility as an automatic continuation of STU-PROF.

## 20. Explicit Do-Not-Do List

- Do not add `PATCH /api/v1/student/profile`.
- Do not allow direct Student edits to official profile fields.
- Do not add runtime behavior in STU-PROF-2C.
- Do not add schema or migrations in STU-PROF-2C.
- Do not add tests in STU-PROF-2C.
- Do not change avatar routes.
- Do not include avatar in correction requests.
- Do not expose StudentDocument to Student App.
- Do not expose StudentDocument to Parent App.
- Do not add Parent/Guardian correction request submission without a separate decision.
- Do not add medical profile correction workflow without a separate decision.
- Do not add guardian/emergency contact correction workflow without a separate decision.
- Do not expose `schoolId` or `organizationId` in Student App responses.
- Do not expose `Student.userId`.
- Do not expose `Student.applicationId`.
- Do not expose storage internals or raw signed URLs.
- Do not mutate Applicant identity.
- Do not change Admissions registration behavior.
- Do not change ADM-REG-DOC import behavior.
- Do not change homework/task behavior.
- Do not change global guards.
- Do not change `schoolScope` behavior.

## 21. Final Verdict

```text
STU_PROF_2C_PROFILE_SELF_SERVICE_FINAL_CLOSEOUT_READY
```

The STU-PROF profile/avatar/self-service V1 backend track is ready to close. Runtime evidence matches the STU-PROF-1B and STU-PROF-2A decision locks, the STU-PROF-1C and STU-PROF-2B implementations, and the no-leak/security boundaries required by the project architecture.

## Final Capability Matrix

| Capability | Implemented? | Evidence | Boundary / Limitation |
| --- | --- | --- | --- |
| Student App profile read | Yes | `GET /api/v1/student/profile`; `StudentProfilePresenter`. | Read-only official fields. |
| `student.userId` removal | Yes | Profile DTO/presenter/tests. | Do not reintroduce. |
| Student avatar upload | Yes | `POST /api/v1/student/profile/avatar`. | Student App actor only; avatar-specific validation. |
| Student avatar delete | Yes | `DELETE /api/v1/student/profile/avatar`. | Clears pointer; old File/binary retained. |
| safe avatar response | Yes | `avatarUrl` and `avatar` object use `/api/v1/files/:fileId/download`. | No raw signed URL. |
| Student App correction request submit | Yes | `POST /api/v1/student/profile/correction-requests`. | No Student mutation. |
| Student App correction request list/read | Yes | Student App correction GET routes. | Own requests only. |
| Student App correction request cancel | Yes | `POST /api/v1/student/profile/correction-requests/:requestId/cancel`. | Pending own requests only. |
| Staff correction request list/read | Yes | `GET /api/v1/students-guardians/profile-correction-requests`. | Same-school; view permission. |
| Staff correction request approve/reject | Yes | Staff approve/reject POST routes. | Same-school; manage permission. |
| transactional approval apply | Yes | Repository `$transaction` updates Student and request. | Pending active target only. |
| correction request audit | Yes | Four correction audit actions. | Safe metadata only. |
| avatar audit | Yes | Three avatar audit actions. | Safe metadata only. |
| direct profile self-edit | No | No `PATCH /api/v1/student/profile`. | Intentionally unsupported. |
| `PATCH /api/v1/student/profile` | No | Controller route set and tests. | Must remain absent. |
| StudentDocument Student App visibility | No | No Student App StudentDocument route. | Separate STU-DOC decision. |
| Parent App StudentDocument visibility | No | Parent App unchanged. | Separate STU-DOC decision. |
| medical correction workflow | No | Medical fields disallowed. | Deferred. |
| guardian/emergency correction workflow | No | Guardian/emergency fields disallowed. | Deferred. |
| Parent/Guardian correction submission | No | Student App requester only. | Deferred. |
| notifications | No | Not part of 2B implementation. | Deferred. |
| attachments/evidence | No | Correction request body is JSON changes/reason only. | Deferred. |

## Final Route Matrix

| Route | Actor | Purpose | Side effect | Final decision |
| --- | --- | --- | --- | --- |
| `GET /api/v1/student/profile` | Student App Student | Read safe profile. | None. | Implemented and read-only. |
| `POST /api/v1/student/profile/avatar` | Student App Student | Upload/replace avatar. | Updates `Student.avatarFileId`; audit. | Implemented. |
| `DELETE /api/v1/student/profile/avatar` | Student App Student | Clear avatar. | Sets `Student.avatarFileId = null`; audit. | Implemented. |
| `POST /api/v1/student/profile/correction-requests` | Student App Student | Submit correction request. | Creates pending request; audit. | Implemented. |
| `GET /api/v1/student/profile/correction-requests` | Student App Student | List own requests. | None. | Implemented. |
| `GET /api/v1/student/profile/correction-requests/:requestId` | Student App Student | Read own request. | None. | Implemented. |
| `POST /api/v1/student/profile/correction-requests/:requestId/cancel` | Student App Student | Cancel own pending request. | Sets request cancelled; audit. | Implemented. |
| `GET /api/v1/students-guardians/profile-correction-requests` | Staff | List same-school requests. | None. | Implemented. |
| `GET /api/v1/students-guardians/profile-correction-requests/:requestId` | Staff | Read same-school request. | None. | Implemented. |
| `POST /api/v1/students-guardians/profile-correction-requests/:requestId/approve` | Staff | Approve and apply. | Transactional Student/request update; audit. | Implemented. |
| `POST /api/v1/students-guardians/profile-correction-requests/:requestId/reject` | Staff | Reject request. | Sets rejected; audit. | Implemented. |
| `PATCH /api/v1/student/profile` | Student App Student | Direct edit. | N/A. | Not implemented. |

## Profile and Correction Field Matrix

| Field / Group | Profile response? | Avatar route? | Correction request? | Directly editable? | Decision |
| --- | --- | --- | --- | --- | --- |
| `studentId` | Yes, safe id. | Context-derived only. | Not accepted in body. | No. | Safe identifier. |
| `student.userId` | No. | No. | No. | No. | Internal account link; removed. |
| `applicationId` | No. | No. | No. | No. | Internal Admissions link. |
| `schoolId` | No. | No. | No. | No. | Tenant internal. |
| `organizationId` | No. | No. | No. | No. | Tenant internal. |
| legal English name fields | Partially: first/last/display only. | No. | Yes. | No. | Staff-approved correction only. |
| Arabic name fields | No. | No. | Yes. | No. | Staff-approved correction only. |
| `gender` | No. | No. | Yes. | No. | Staff-approved correction only. |
| `birthDate` | No. | No. | Yes. | No. | Staff-approved correction only. |
| `nationality` | No. | No. | Yes. | No. | Staff-approved correction only. |
| `studentPhone` | Not as Student field; profile uses linked User phone. | No. | Yes. | No. | Contact source cleanup deferred. |
| `studentEmail` | Not as Student field; profile uses linked User email. | No. | Yes. | No. | Contact source cleanup deferred. |
| addressLine/city/district | No. | No. | Yes. | No. | Staff-approved correction only. |
| avatar/profile image | Yes as `avatarUrl`/`avatar`. | Yes. | No. | Only through avatar route. | Separate from correction requests. |
| medical profile | No. | No. | No. | No. | Deferred sensitive workflow. |
| guardian/emergency contact | No. | No. | No. | No. | Deferred ownership workflow. |
| StudentDocument | No. | No. | No. | No. | Staff-only documents. |
| homework/task files | No profile document semantics. | No. | No. | Not profile. | Academic workflow only. |
| preferences/display name | Limited displayName derived from name. | No. | No. | No. | Durable preferences/display-name policy deferred. |

## Status Lifecycle Matrix

| Status | Entered by | Allowed next statuses | Student mutation? | Terminal? |
| --- | --- | --- | --- | --- |
| `PENDING` | Student submit. | `APPROVED`, `REJECTED`, `CANCELLED`. | No on entry. | No. |
| `APPROVED` | Staff approve. | None. | Yes, approval applies allowlisted changes transactionally. | Yes. |
| `REJECTED` | Staff reject. | None. | No. | Yes. |
| `CANCELLED` | Student cancel. | None. | No. | Yes. |

## No-Leak Matrix

| Field / Concept | Student App profile response | Student App correction response | Staff correction response | Decision |
| --- | --- | --- | --- | --- |
| `studentId` | Exposed. | Not needed except ownership. | Exposed in safe summary. | Safe. |
| `requestId` | N/A. | Exposed as `id`. | Exposed as `id`. | Safe. |
| student display name | Exposed. | N/A. | Exposed in safe summary. | Safe. |
| `requestedChanges` | N/A. | Exposed for own request. | Exposed for review. | Safe after allowlist. |
| `currentSnapshot` | N/A. | Hidden. | Exposed for review. | Staff-only. |
| `reviewerNote` | N/A. | Exposed. | Exposed/editable during review. | Safe if reviewer keeps it relevant. |
| `schoolId` | Hidden. | Hidden. | Hidden. | Tenant internal. |
| `organizationId` | Hidden. | Hidden. | Hidden. | Tenant internal. |
| `membershipId` | Hidden. | Hidden. | Hidden. | Internal. |
| `roleId` | Hidden. | Hidden. | Hidden. | Internal. |
| `requestedByUserId` | Hidden. | Hidden. | Hidden. | Internal actor id. |
| `approvedBy/rejectedBy/cancelledBy` | Hidden. | Hidden. | Hidden. | Internal actor ids. |
| `Student.userId` | Hidden. | Hidden. | Hidden. | Internal account link. |
| `Student.applicationId` | Hidden. | Hidden. | Hidden. | Internal Admissions source link. |
| bucket/objectKey | Hidden. | N/A. | Hidden. | Storage internal. |
| raw signed URL | Hidden. | N/A. | Hidden. | Use download route only. |
| audit internals | Hidden. | Hidden. | Hidden. | Separate audit system. |
| medical details | Not included. | Not requestable. | Not included. | Deferred. |
| guardian sensitive details | Not included. | Not requestable. | Not included. | Deferred. |

## Regression Boundary Matrix

| Boundary | Changed by STU-PROF? | Final state | Evidence |
| --- | --- | --- | --- |
| Applicant identity | No | Applicant remains separate pre-admission identity. | ADR-0003; ADM-REG closeout. |
| Admissions registration | No | Accepted application registration behavior unchanged. | ADM-REG closeout; no Admissions runtime changes in STU-PROF 2B. |
| ADM-REG-DOC import | No | Staff-confirmed import remains unchanged. | ADM-REG-DOC closeout and regression tests. |
| StudentDocument app visibility | No | StudentDocument remains staff-only. | No Student App document routes. |
| Parent App document visibility | No | Parent App StudentDocument visibility remains absent. | Parent App unchanged. |
| Homework/task files | No | Academic attachments remain separate. | Homework routes remain under homework workflows. |
| Medical profile | No | Staff-managed; no correction workflow. | Medical fields disallowed. |
| Guardian/emergency contacts | No | Staff/guardian workflow deferred. | Guardian fields disallowed. |
| Avatar route | Yes, intentional | Avatar has separate upload/delete routes. | STU-PROF-1C implementation. |
| Student profile direct edit | No | Direct PATCH remains absent. | Controller/tests. |
| schoolScope/global guards | No | Existing guard/scope behavior preserved. | No guard/scope files changed by closeout track. |

## Deferred Backlog Matrix

| Backlog item | Why deferred | Recommended owner sprint | Priority | Risk |
| --- | --- | --- | --- | --- |
| Parent/Guardian correction submission | Different consent and ownership policy. | Parent/Guardian Correction Decision | Medium | High. |
| Medical profile correction workflow | Sensitive medical data. | STU-MED App Visibility / Correction Decision | Medium | High. |
| Guardian/emergency contact correction workflow | Not solely Student-owned. | Guardian Contact Correction Decision | Medium | High. |
| Profile correction attachments/evidence | Requires file retention/visibility policy. | Correction Evidence Decision | Medium | Medium/High. |
| Notifications to staff/student | Requires notification/template/recipient policy. | Notifications Sprint | Medium | Low/Medium. |
| Reopen/revise lifecycle | V1 status model is terminal after resolution. | Correction Lifecycle Expansion | Low | Medium. |
| Student contact source-of-truth cleanup | User email/phone and Student contact fields differ. | STU-PROF-3 Contact Source Audit | High | Medium. |
| Direct non-official preferences edit | Needs durable preference fields and policy. | STU-PROF Preferences Decision | Low | Medium. |
| Avatar cleanup/retention policy | Old files retained. | Avatar Retention Policy | Medium | Medium. |
| Staff avatar management | Student App self-service was first scope. | Staff Avatar Management Decision | Low | Low/Medium. |
| StudentDocument Student App visibility | Sensitive staff-managed documents. | STU-DOC App Visibility Decision | Medium | High. |
| Parent App StudentDocument visibility | Requires consent/redaction/type policy. | STU-DOC Parent Visibility Decision | Medium | High. |
| Bulk/admin repair tools | Separate data quality concern. | Admin Repair Sprint | Low | Medium. |

## Next Feature Options Matrix

| Option | Feature area | Why | Risk | Recommended now? |
| --- | --- | --- | --- | --- |
| Option A | STU-PROF-3 Student Contact Source-of-Truth Audit | Best profile-specific next step if continuing profile work. | Medium consistency risk. | Optional. |
| Option B | STU-DOC App Visibility Decision | Needed before exposing StudentDocuments to Student/Parent apps. | High privacy risk. | Not automatic. |
| Option C | Notifications for Correction Requests | Useful workflow polish. | Low/Medium operational risk. | Later. |
| Option D | Parent/Guardian Correction Request Decision | Expands requester set. | High ownership/consent risk. | Not now unless prioritized. |
| Option E | Medical Profile App Visibility / Correction Decision | Sensitive profile domain. | High privacy/safety risk. | Not now. |
| Option F | New non-profile feature area | STU-PROF V1 is complete. | Depends on chosen feature. | Yes. |
