# STU-PROF-1A — Student Profile / Avatar / Self-Service Audit

## 1. Executive Summary

STU-PROF-1A is complete as a documentation-only audit.

Current backend reality:

1. Core Student profile data is stored on the `Student` model and was repaired by ADM-REG-1C for durable English/Arabic name parts, gender, nationality, birth date, and contact/address fields.
2. School staff can create and update Student profile fields through `POST /api/v1/students-guardians/students`, `PATCH /api/v1/students-guardians/students/:studentId`, and the school registration wizard.
3. Student App exposes a read-only profile endpoint at `GET /api/v1/student/profile`.
4. Student App profile does not support profile edits, avatar upload, avatar replacement, avatar deletion, StudentDocument upload, or StudentDocument visibility.
5. No durable Student avatar/profile image field exists on `Student`.
6. `StudentDocument` is a Students-owned, school-managed operational record document. It is not a Student avatar, not a Student self-service document, and not a homework/task submission file.
7. Homework and task files exist in academic/reinforcement workflows and are intentionally separate from Student profile documents.
8. Parent App exposes child summaries with `avatarUrl: null`; it does not expose StudentDocument visibility or profile mutation.

Important current contract gap:

`GET /api/v1/student/profile` currently returns `student.userId`, and existing Student App tests assert that behavior. This audit does not change runtime behavior. Future STU-PROF decision work should decide whether to preserve, rename, or remove this app-facing user id exposure. No new user id, application id, tenant id, or storage internal exposure should be added.

Recommended next sprint:

`STU-PROF-1B — Student Profile / Avatar Self-Service Decision Lock`

That sprint should decide field-level self-service policy, avatar storage model, audit requirements, approval workflow, and whether Student App profile's current `userId` response field should be repaired.

## 2. Source Evidence Reviewed

Required decision and closeout documents reviewed:

- `docs/sprint-adm-reg-1j-admissions-registration-flow-final-closeout-audit.md`
- `docs/sprint-adm-reg-doc-1c-admissions-document-import-final-closeout-audit.md`
- `docs/sprint-adm-reg-doc-1b-staff-confirmed-admissions-document-import-closeout.md`
- `docs/sprint-adm-reg-doc-1a-admissions-documents-to-student-documents-decision-lock.md`
- `docs/sprint-adm-reg-1c-student-guardian-profile-persistence-repair-closeout.md`
- `docs/sprint-adm-reg-1d-school-registration-wizard-foundation-closeout.md`
- `docs/sprint-adm-reg-1i-admissions-registered-state-exposure-closeout.md`

Required architecture and project references reviewed:

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

Runtime evidence inspected:

- `prisma/schema.prisma`
- `src/modules/students/students/**`
- `src/modules/students/registration/**`
- `src/modules/students/enrollments/**`
- `src/modules/students/guardians/**`
- `src/modules/students/documents/**`
- `src/modules/students/account/**`
- `src/modules/students/medical/**`
- `src/modules/student-app/profile/**`
- `src/modules/student-app/access/**`
- `src/modules/student-app/**`
- `src/modules/parent-app/**`
- `src/modules/files/**`
- `src/infrastructure/storage/**`
- `src/modules/homework/**`
- `src/modules/academics/**`
- `test/e2e/**`
- `test/security/**`
- `src/modules/students/**/tests/**`
- `src/modules/student-app/**/tests/**`

Missing inspected paths:

- `src/modules/tasks/**` does not exist as a standalone module. Task-like behavior appears under `src/modules/student-app/tasks/**` and `src/modules/parent-app/tasks/**`.
- `src/modules/classrooms/**` does not exist as a standalone module. Classroom structure appears under Academics structure and related modules.

## 3. Current Student Profile Data Model

The durable Student model stores identity/profile and operational links in `prisma/schema.prisma`.

Stored profile fields:

- `id`
- `firstName`
- `fatherNameEn`
- `grandfatherNameEn`
- `lastName`
- `firstNameAr`
- `fatherNameAr`
- `grandfatherNameAr`
- `familyNameAr`
- `birthDate`
- `gender`
- `nationality`
- `addressLine`
- `city`
- `district`
- `studentPhone`
- `studentEmail`
- `status`
- `createdAt`
- `updatedAt`
- `deletedAt`

Internal operational links:

- `schoolId`
- `organizationId`
- `applicationId`
- `userId`

Related operational records:

- `guardians`
- `enrollments`
- `documents`
- `medicalProfile`
- `notes`
- attendance, grades, homework, rewards, behavior, hero journey, and communication relations.

There is no Student-owned avatar/profile image field today. The schema does not include `avatarFileId`, `profilePhotoId`, `profileImageId`, `profileImageUrl`, or equivalent on `Student`.

There is a `communicationConversationAvatars` relation from `File` to communication conversations, but that is not a Student profile avatar model.

Medical profile exists as a separate school-managed Student subresource:

- `GET /api/v1/students-guardians/students/:studentId/medical-profile`
- `PATCH /api/v1/students-guardians/students/:studentId/medical-profile`

It stores blood type, allergies, notes, conditions, and medications in `StudentMedicalProfile`. It is not exposed through Student App profile today.

## 4. School Staff Student Profile Management

School staff Student profile routes:

- `GET /api/v1/students-guardians/students`
- `POST /api/v1/students-guardians/students`
- `GET /api/v1/students-guardians/students/:studentId`
- `PATCH /api/v1/students-guardians/students/:studentId`
- `GET /api/v1/students-guardians/students/:studentId/timeline`
- `POST /api/v1/students-guardians/students/:studentId/account`

Permissions:

- Read routes use `students.records.view`.
- Create/update/account-link routes use `students.records.manage`.

`CreateStudentDto` and `UpdateStudentDto` support:

- `name`
- `first_name_en`
- `father_name_en`
- `grandfather_name_en`
- `family_name_en`
- `first_name_ar`
- `father_name_ar`
- `grandfather_name_ar`
- `family_name_ar`
- `full_name_en`
- `full_name_ar`
- `dateOfBirth`
- `date_of_birth`
- `gender`
- `nationality`
- `status`
- `contact.address_line`
- `contact.city`
- `contact.district`
- `contact.student_phone`
- `contact.student_email`

Staff routes do not accept avatar/profile image fields. Staff can manage `StudentDocument` records separately, but that is document management, not avatar/profile image management.

The school registration wizard also creates Student profile records through:

```text
POST /api/v1/students-guardians/registrations
```

That route accepts Student profile fields and creates Student, Guardian(s), StudentGuardian link(s), Enrollment, and optional Parent/Student accounts. Normal manual wizard registration keeps `Student.applicationId = null`; Admissions source-bound registration sets it internally through the Admissions route, not through public Student input.

## 5. Student App Profile Read Model

Student App profile route:

```text
GET /api/v1/student/profile
```

Controller:

- `src/modules/student-app/profile/controller/student-profile.controller.ts`

Use case:

- `src/modules/student-app/profile/application/get-student-profile.use-case.ts`

Read adapter:

- `src/modules/student-app/profile/infrastructure/student-profile-read.adapter.ts`

Presenter:

- `src/modules/student-app/profile/presenters/student-profile.presenter.ts`

The Student App profile read model returns:

- `student.studentId`
- `student.userId`
- `student.displayName`
- `student.firstName`
- `student.lastName`
- `student.email`
- `student.phone`
- `student.avatarUrl: null`
- `student.studentNumber: null`
- `student.status: active`
- school display name and `logoUrl: null`
- active enrollment/classroom/stage/grade/section
- unsupported flags
- legacy/adapter-backed `student_profile` summary
- empty badge/top-student/leaderboard arrays

Student App profile requires:

- authenticated Student actor,
- `UserType.STUDENT`,
- active user,
- linked `Student.userId`,
- active Student,
- active Enrollment.

The profile endpoint is read-only. The use case performs no mutations, and tests assert that mutation methods are not called.

## 6. Student App Self-Service Capability

Implemented Student self-service:

- Student can view their own profile through `GET /api/v1/student/profile`.
- Student can read app-facing academic/home/progress/etc. slices through Student App modules.
- Student can perform academic workflow actions such as homework submissions and task-stage submissions where those modules allow it.

Not implemented:

- Student profile field update.
- Student contact info update.
- Student address update.
- Student preferences update, except notification preferences under Student App notifications, which are not Student profile preferences.
- Student avatar upload.
- Student avatar replace/delete.
- StudentDocument upload from Student App.
- StudentDocument list/detail visibility from Student App.
- Student profile document upload.

Route tests explicitly keep the following absent:

- `PATCH /api/v1/student/profile`
- `POST /api/v1/student/profile/avatar`

The profile response marks unsupported capabilities:

```json
{
  "avatarUpload": true,
  "preferences": true,
  "seatNumber": true
}
```

In this contract, `true` means the capability is unsupported/deferred, not enabled.

## 7. Avatar / Profile Image Capability

There is no Student avatar/profile image capability today.

Schema:

- No Student avatar/profile image field exists.
- No `Student` to `File` avatar relation exists.
- No Student profile media model exists.

Student App:

- `avatarUrl` is always `null` in Student profile and home/profile-like presenters.
- `POST /api/v1/student/profile/avatar` is absent.
- `PATCH /api/v1/student/profile` is absent.

Parent App:

- child summaries return `avatarUrl: null`.
- Parent App profile similarly marks avatar upload as unsupported for parent profile behavior.

Files:

- Generic file upload exists at `POST /api/v1/files`.
- Secure download exists at `GET /api/v1/files/:id/download`.
- Private file download generates short-lived signed URLs after authorization.
- Presenters return safe metadata and secure download paths, not bucket/object key.

Decision implication:

Avatar support requires a future product/backend decision on storage model, ownership, visibility, moderation, file size/type policy, and whether it belongs to `Student`, `User`, or a dedicated profile media model.

## 8. StudentDocument Boundary

`StudentDocument` is a Students-owned operational student record document.

School staff StudentDocument routes:

- `GET /api/v1/students-guardians/students/:studentId/documents`
- `GET /api/v1/students-guardians/students/:studentId/documents/missing`
- `POST /api/v1/students-guardians/students/:studentId/documents`
- `POST /api/v1/students-guardians/students/:studentId/documents/import-from-application`
- `PATCH /api/v1/students-guardians/documents/:documentId`
- `DELETE /api/v1/students-guardians/documents/:documentId`

Permissions:

- `students.documents.view`
- `students.documents.manage`
- the import route also requires `admissions.documents.view`.

StudentDocument response contains:

- document id,
- student id,
- file id,
- type,
- file name,
- status,
- uploaded date,
- secure download URL path,
- file type,
- notes.

The presenter builds:

```text
/api/v1/files/:fileId/download
```

It does not return bucket, object key, raw signed URL, or storage provider internals.

ADM-REG-DOC-1B added staff-confirmed post-registration import from Admissions `ApplicationDocument` into `StudentDocument`, with source metadata and idempotency. That import is not automatic during registration and is not exposed to Student App or Parent App.

StudentDocument is not:

- Student avatar/profile image,
- Student self-service upload,
- homework/task proof,
- Admissions evidence until imported,
- app-visible by default.

## 9. Homework / Task / Academic File Boundary

Homework and task files are academic workflow attachments.

Examples:

- `POST /api/v1/student/homeworks/:homeworkId/submission/attachments`
- `PATCH /api/v1/student/homeworks/:homeworkId/submission/attachments/:attachmentId`
- `DELETE /api/v1/student/homeworks/:homeworkId/submission/attachments/:attachmentId`
- `POST /api/v1/student/tasks/:taskId/stages/:stageId/submit` with proof text/file support.

These files are not Student profile documents. They are scoped to homework submissions, homework assignments, reinforcement/task proof, teacher review, or parent child task views.

The task/homework presenters return safe file metadata and download paths where appropriate. They do not prove or imply a Student profile document upload capability.

Important distinction:

- StudentDocument: school-managed student record document.
- Homework/task attachment: academic workflow evidence.
- Avatar/profile image: not implemented today.

## 10. Parent App and Student App Visibility Boundary

Student App visibility still requires:

1. `UserType.STUDENT`,
2. active user,
3. active membership/school scope,
4. `Student.userId` linked to that user,
5. active Student,
6. active Enrollment.

Parent App visibility still requires:

1. `UserType.PARENT`,
2. active user,
3. active membership/school scope,
4. `Guardian.userId` linked to that user,
5. `StudentGuardian` link,
6. active Student,
7. active Enrollment.

Student App currently exposes profile read behavior, but not profile mutation.

Parent App currently exposes child summaries/detail with `avatarUrl: null`, but not StudentDocument visibility or child profile mutation.

Imported Admissions documents remain school-staff StudentDocument records. ADM-REG-DOC does not make them visible to Parent App or Student App.

## 11. Security, Tenancy, and No-Leak Review

School staff Student profile/document routes use permission decorators and application-layer use cases. Controllers are thin and do not use Prisma directly.

Student App profile access is resolved through `StudentAppAccessService`, which requires a current linked active Student and active Enrollment for the authenticated Student user. Reads use scoped Prisma adapters.

File security:

- Database stores file metadata.
- Object storage stores binary content.
- Private downloads go through `/api/v1/files/:id/download`.
- Download use case checks file scope before generating a short-lived signed URL.
- Presenters do not return bucket/object key.

Known no-leak posture:

- Staff Student presenter hides `schoolId`, `organizationId`, `applicationId`, `userId`, and `deletedAt`.
- Student App profile tests assert no `schoolId`, `organizationId`, `applicationId`, document, medical, note, password, session, token, bucket, or object key strings.
- Student App profile currently returns `student.userId`; this is a current contract exposure and should be explicitly decided in STU-PROF-1B. Do not add new internal-id exposure while that decision is pending.

No runtime evidence was found for:

- Student App profile write,
- Student App avatar upload,
- Student App StudentDocument upload/list,
- Parent App StudentDocument visibility,
- Student avatar File relation,
- signed URL storage in profile records.

## 12. Current Test Coverage

Student App profile unit tests:

- `src/modules/student-app/profile/tests/student-profile.presenter.spec.ts`
- `src/modules/student-app/profile/tests/get-student-profile.use-case.spec.ts`
- `src/modules/student-app/profile/tests/student-profile-read.adapter.spec.ts`

They verify:

- basic profile presentation,
- `avatarUrl: null`,
- unsupported flags,
- read-only behavior/no mutations,
- scoped Prisma adapter behavior,
- no tenant/storage/security internals in the profile payload, except the currently asserted `userId`.

Student App e2e/security tests:

- `test/e2e/student-app-final-closeout.e2e-spec.ts`
- `test/security/tenancy.student-app.spec.ts`

They verify:

- `GET /api/v1/student/profile` exists,
- linked Student can read own profile,
- unlinked Student and Student without active enrollment are rejected,
- `PATCH /api/v1/student/profile` is absent,
- `POST /api/v1/student/profile/avatar` is absent.

Students documents tests:

- `src/modules/students/documents/tests/student-documents.use-case.spec.ts`
- `src/modules/students/documents/tests/student-document.presenter.spec.ts`
- `test/e2e/admissions-document-import-to-student-document.e2e-spec.ts`
- `test/security/tenancy.admissions-document-import.spec.ts`

They verify:

- staff-managed StudentDocument creation,
- Admissions document import to StudentDocument,
- idempotency,
- source metadata,
- no storage internals,
- actor/tenancy boundaries.

Homework/task file tests:

- Student App homework/task tests cover homework submissions and reinforcement task proof files.
- These tests verify academic workflow attachments, not Student profile document capability.

No build or test suite was run for STU-PROF-1A because this sprint is documentation-only.

## 13. Capability Matrix

### Student Profile Field Matrix

| Field / Concept | Exists today? | Stored on | School staff can set? | Student can view? | Student can edit? | Internal-only? | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| student id | Yes | `Student.id` | Created by backend | Yes, staff and Student App as `studentId` | No | No | Safe public Student identifier. |
| student_id / public student code | Deferred | Presenter returns null | No | Student App returns `studentNumber: null` / `student_code: null` | No | No | ADM-REG-1C left this null-only/deferred. |
| firstName | Yes | `Student.firstName` | Yes | Yes | No | No | Student App profile reads `firstName`. |
| middleName | Partially | `fatherNameEn`, `grandfatherNameEn` | Yes | No in Student App profile | No | No | Core model stores name parts; Student App profile only reads first/last. |
| lastName | Yes | `Student.lastName` | Yes | Yes | No | No | Staff presenter maps as `family_name_en`. |
| arabicFirstName | Yes | `Student.firstNameAr` | Yes | No in Student App profile | No | No | Staff response only today. |
| arabicMiddleName | Yes | `fatherNameAr`, `grandfatherNameAr` | Yes | No in Student App profile | No | No | Staff response only today. |
| arabicLastName | Yes | `Student.familyNameAr` | Yes | No in Student App profile | No | No | Staff response only today. |
| preferredName | No | N/A | No | No | No | N/A | No current field. |
| gender | Yes | `Student.gender` | Yes | No in Student App profile | No | No | Staff response only today. |
| dateOfBirth | Yes | `Student.birthDate` | Yes | No in Student App profile | No | No | Staff response only today. |
| nationality | Yes | `Student.nationality` | Yes | No in Student App profile | No | No | Staff response only today. |
| nationalId | No on Student | N/A | No | No | No | N/A | Guardian has `nationalId`; Student does not. |
| phone | Yes | `Student.studentPhone`, `User.phone` | Staff can set Student contact phone; account phone is IAM/user data | Student App reads `User.phone` | No | Mixed | Future policy must decide source of truth. |
| email | Yes | `Student.studentEmail`, `User.email` | Staff can set Student contact email; account email is IAM/user data | Student App reads `User.email` | No | Mixed | Future policy must decide source of truth. |
| address | Yes | `addressLine`, `city`, `district` | Yes | No in Student App profile | No | No | Staff response only today. |
| medical notes / medical summary | Yes | `StudentMedicalProfile` | Yes through medical route | No | No | School-managed subresource. |
| emergency contact | Not as Student field | Guardian/relationship data | Guardians can be linked | No direct Student App profile exposure | No | Mixed | Emergency contact policy is not a Student self-service feature today. |
| userId | Yes | `Student.userId` | Staff can link account | Yes in Student App profile today | No | Should be treated as internal | Current app contract exposes it; decision/repair needed. |
| applicationId | Yes | `Student.applicationId` | Set internally by Admissions source-bound registration | No | No | Yes | Idempotency anchor; hidden by presenters. |
| schoolId | Yes | `Student.schoolId` | Backend scope only | No | No | Yes | Tenant field. |
| organizationId | Yes | `Student.organizationId` | Backend scope only | No | No | Yes | Tenant field. |
| avatar/profile image | No | N/A | No | `avatarUrl: null` only | No | N/A | Requires future avatar decision. |
| profile preferences | No as Student profile | Notification preferences exist separately | No Student profile support | Unsupported flag only | No | N/A | Future self-service decision. |

### Route Capability Matrix

| Route / Flow | Module | Actor | Read / Write | Profile fields? | Avatar? | Documents? | Current behavior |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `POST /api/v1/students-guardians/students` | Students records | School staff | Write | Yes | No | No | Creates Student profile. |
| `PATCH /api/v1/students-guardians/students/:studentId` | Students records | School staff | Write | Yes | No | No | Updates Student profile fields. |
| `GET /api/v1/students-guardians/students/:studentId` | Students records | School staff | Read | Yes | No | No | Returns rich Student profile, hides internal links. |
| `POST /api/v1/students-guardians/registrations` | Students registration | School staff | Write | Yes | No | No | Creates Student/Guardian/Enrollment; no document/avatar import. |
| `GET /api/v1/student/profile` | Student App profile | Linked Student | Read | Basic profile only | `avatarUrl: null` | No | Read-only profile. |
| `PATCH /api/v1/student/profile` | Student App profile | Student | Write | N/A | N/A | N/A | Not implemented; tests expect absent route. |
| `POST /api/v1/student/profile/avatar` | Student App profile | Student | Write | N/A | N/A | N/A | Not implemented; tests expect absent route. |
| Student App StudentDocument upload | Student App | Student | Write | N/A | No | N/A | Not implemented. |
| Students documents CRUD | Students documents | School staff | Read/write | No | No | Yes | Staff-managed StudentDocument records. |
| Files upload/download | Files | School staff with permission | Read/write | No | Generic | Generic | Generic file storage metadata and secure downloads. |
| Homework/task submission files | Student App / Homework / Tasks | Student | Read/write in academic contexts | No | No | Academic attachments only | Not Student profile documents. |
| Parent App child overview/profile-like views | Parent App | Linked Parent | Read | Child summary only | `avatarUrl: null` | No StudentDocument | No mutation; no documents. |

### Self-Service Capability Matrix

| Capability | Implemented today? | Allowed actor | Evidence | Decision |
| --- | --- | --- | --- | --- |
| Student view own profile | Yes | Linked active Student user | `GET /api/v1/student/profile` | Keep as read-only until decision. |
| Student edit own profile | No | N/A | Route absent | Decide in STU-PROF-1B. |
| Student edit contact info | No | N/A | No DTO/use case/controller | Decide source of truth and approval. |
| Student edit address | No | N/A | No DTO/use case/controller | Decide approval and audit policy. |
| Student edit preferences | Partially unrelated | Student notification prefs only | Student notifications routes | Do not treat as Student profile preferences. |
| Student upload avatar | No | N/A | `POST /student/profile/avatar` absent | Decide in STU-PROF-1B. |
| Student replace avatar | No | N/A | No avatar model/route | Decide storage lifecycle. |
| Student delete avatar | No | N/A | No avatar model/route | Decide storage lifecycle. |
| Student upload profile document | No | N/A | No Student App StudentDocument routes | Defer to StudentDocument app visibility decision. |
| Student view StudentDocument | No | N/A | No Student App documents route | Separate visibility decision required. |
| Parent view StudentDocument | No | N/A | Parent child views hide document data | Separate visibility decision required. |
| School staff upload StudentDocument | Yes | School staff | Students documents routes | Existing school-managed record behavior. |
| School staff import Admissions documents | Yes | School staff | ADM-REG-DOC import route | Post-registration, selected, idempotent. |

### Avatar / File Boundary Matrix

| Concept | Current support | Storage behavior | Visibility | Decision |
| --- | --- | --- | --- | --- |
| Student avatar/profile image | Not implemented | No Student/File relation | `avatarUrl: null` | Decide model in STU-PROF-1B. |
| StudentDocument file | Implemented for staff | Reuses `File` metadata and secure download path | Staff routes only | Keep separate from avatar. |
| Admissions imported document file | Implemented as StudentDocument import | Reuses source `File.id`; no binary copy | Staff import response/Student docs | Not app-visible by default. |
| Homework submission file | Implemented | `File` plus homework submission attachment relation | Academic workflows | Not profile document. |
| Task attachment/proof file | Implemented | `File` relation to task proof | Task/reinforcement workflows | Not profile document. |
| Generic File | Implemented | Object storage + DB metadata | Permission-scoped | Do not expose storage internals. |
| Signed URL | Generated on demand | Not stored in profile models | Redirect only | Keep via authorized download routes. |
| Public URL | Only for public asset strategy | Not used for Student avatar today | N/A | Future avatar decision required. |

### Security Boundary Matrix

| Boundary | Current behavior | Risk | Decision |
| --- | --- | --- | --- |
| Student accesses own profile | Allowed through Student App access chain | Low | Keep read-only. |
| Student accesses another student profile | Blocked by Student App ownership/access adapter | Low | Keep ownership checks. |
| Parent accesses Student App profile route | Not allowed; Parent App has separate routes | Low | Do not cross app surfaces. |
| Applicant accesses Student profile | Not part of Student App or staff routes | Low | Preserve Applicant boundary. |
| School staff cross-school profile access | Controlled by guards/scope and scoped Prisma | Medium if bypassed | Do not bypass `schoolScope`. |
| `schoolId` exposure | Hidden in Student/staff/app presenters reviewed | Low | Keep hidden. |
| `organizationId` exposure | Hidden in Student/staff/app presenters reviewed | Low | Keep hidden. |
| `userId` exposure | Student App profile currently returns `student.userId` | Medium contract/no-leak risk | Decide/repair in STU-PROF-1B; do not expand. |
| `applicationId` exposure | Hidden from Student/staff/app presenters reviewed | Low | Keep hidden. |
| bucket/objectKey exposure | Hidden; file download generates signed URL after auth | Low | Keep hidden. |
| raw signed URL exposure | Only redirect response from download use case | Low | Do not store or embed in profile. |

### Backlog Matrix

| Backlog item | Why deferred | Recommended owner sprint | Priority | Risk |
| --- | --- | --- | --- | --- |
| Student profile update decision | Field-level edit policy is not locked | STU-PROF-1B | High | Medium: data integrity and approval rules. |
| Student avatar upload decision | No storage model or ownership policy exists | STU-PROF-1B | High | Medium/High: file privacy and moderation. |
| Student profile image storage model | Must decide `Student` vs `User` vs profile media table | STU-PROF-1B | High | Medium: schema/API churn. |
| Student self-service contact/preferences update | Contact fields have Student and User sources | STU-PROF-1B | Medium | Medium: source-of-truth conflict. |
| StudentDocument app visibility decision | Imported/staff docs are not app-visible | STU-DOC App Visibility Decision | Medium | High privacy/access risk. |
| Parent/guardian approval workflow | Student edits may require guardian/staff review | Parent/Guardian approval audit | Medium | Medium/High. |
| Profile change audit logging | Sensitive profile changes require audit | STU-PROF implementation sprint | High if edits allowed | Medium. |
| Profile field-level permissions | Staff/student ownership differs by field | STU-PROF-1B | High | Medium. |
| Student profile source-of-truth cleanup | Student App profile reads `User.email/phone`, staff profile stores `studentEmail/studentPhone` | STU-PROF-1B | Medium | Medium. |
| Avatar moderation/size/type policy | File upload rules need avatar-specific constraints | STU-PROF avatar implementation | Medium | Medium/High. |
| Student App `userId` response decision | Current profile response exposes `userId` | STU-PROF-1B or read contract repair | High | Medium no-leak/API compatibility risk. |

### Next Sprint Options Matrix

| Option | Name | Why | Risk | Recommended now? |
| --- | --- | --- | --- | --- |
| Option A | `STU-PROF-1B Student Profile Self-Service Decision Lock` | Locks editable fields, source of truth, audit, approval, and no-leak rules. | Low as documentation/decision. | Yes, combined with avatar decision. |
| Option B | `STU-PROF-1B Student Avatar Upload Decision Lock` | Avatar has no schema or route today and needs a storage/visibility policy. | Low as documentation/decision. | Yes, include in same profile decision lock. |
| Option C | `STU-PROF-1B Student Profile Read Contract Repair` | Current Student App profile returns `userId` and only a narrow profile read model. | Medium API compatibility risk. | Consider inside the decision lock, not immediate code. |
| Option D | `STU-DOC App Visibility Decision` | Determines Parent/Student App document visibility. | High privacy risk. | Not before profile/avatar decision unless product prioritizes documents. |
| Option E | Parent/Guardian Profile Approval Workflow Audit | Needed if Student edits require guardian/staff approval. | Medium. | Later, after editable field policy. |

## 14. Known Limitations

- Student App profile is read-only and narrow.
- Student App profile returns `userId` today; this is test-asserted and should be addressed by a future contract decision.
- Student App profile does not return full rich Student profile fields such as Arabic name parts, gender, birth date, nationality, or contact/address fields.
- Student staff routes support rich profile fields, but not avatar/profile image fields.
- No Student avatar/profile image storage model exists.
- No Student profile preferences model exists.
- No Student App StudentDocument visibility or upload exists.
- Parent App child summaries do not show StudentDocuments.
- StudentDocument imported source metadata is primarily staff/document import oriented, not app-visible.
- Homework/task attachments are implemented but intentionally unrelated to Student profile documents.
- Medical profile exists as a school-managed subresource and is not part of Student App profile today.

## 15. Deferred Backlog

Deferred out of STU-PROF-1A:

- Student profile update endpoint.
- Student avatar upload endpoint.
- Student avatar/profile media schema.
- Student self-service document upload.
- Parent App document visibility.
- Student App document visibility.
- Student profile approval workflow.
- Profile change audit implementation.
- Profile field-level permissions.
- Student profile no-leak read contract repair.
- Student profile source-of-truth cleanup for Student contact fields vs User contact fields.
- Avatar image moderation, size, mime, and retention policy.
- Any Applicant identity, Admissions registration, or ADM-REG-DOC import change.

## 16. Recommended Next Sprint Decision

Recommended next sprint:

```text
STU-PROF-1B — Student Profile / Avatar Self-Service Decision Lock
```

STU-PROF-1B should decide:

1. Which Student fields, if any, Student App users may edit.
2. Which fields remain school-staff-only.
3. Whether Student contact fields or User contact fields are the app-facing source of truth.
4. Whether avatar upload is allowed.
5. Whether avatar media belongs to `Student`, `User`, or a dedicated profile media model.
6. Whether profile changes require staff or guardian approval.
7. What audit events are required for profile changes.
8. Whether Student App may view or upload StudentDocuments.
9. Whether the current Student App profile `userId` field should be preserved, removed, or replaced with a safer public identifier.
10. What tests and e2e/security coverage must protect the chosen contract.

Do not proceed directly to implementation unless STU-PROF-1B first locks the profile/avatar contract.

## 17. Explicit Do-Not-Do List

- Do not implement Student profile edits in STU-PROF-1A.
- Do not implement avatar upload in STU-PROF-1A.
- Do not add Student profile File fields in STU-PROF-1A.
- Do not expose StudentDocument to Student App without a decision.
- Do not expose StudentDocument to Parent App without a decision.
- Do not treat homework/task submissions as Student profile documents.
- Do not expose bucket, objectKey, or raw signed URLs.
- Do not add new `schoolId`, `organizationId`, `userId`, or `applicationId` exposure to app-facing responses.
- Do not rely on the current Student App `userId` exposure as the long-term no-leak contract until STU-PROF-1B decides it.
- Do not mutate Applicant identity.
- Do not change Admissions registration behavior.
- Do not change ADM-REG-DOC import behavior.
- Do not use audit logs as profile current-state source.
- Do not add Parent/Student App document visibility as a side effect of profile work.

## 18. Final Verdict

```text
STU_PROF_1A_STUDENT_PROFILE_SELF_SERVICE_AUDIT_READY
```

The audit is ready for review. Current backend behavior is clear: school staff manage durable Student profile fields and StudentDocuments; Student App profile is read-only; avatar/profile image support is absent; StudentDocument and homework/task files are separate concepts; and future self-service work needs a decision lock before implementation. No runtime change is required to complete STU-PROF-1A.
