# STU-PROF-1B — Student Profile / Avatar Self-Service Decision Lock

## 1. Executive Summary

STU-PROF-1B locks the backend/product contract for Student profile self-service before any runtime implementation.

The locked V1 direction is:

1. Implement Student avatar upload before any official Student profile field self-edit.
2. Store avatar/profile image metadata as Student-owned profile media, preferably with a nullable `Student.avatarFileId` reference to existing `File` metadata.
3. Use existing private object storage and authorized file download patterns.
4. Do not store public URLs, signed URLs, bucket names, object keys, or raw storage internals.
5. Keep official Student profile fields staff-managed in V1.
6. Use a future correction-request workflow for official/sensitive profile changes instead of direct Student mutation.
7. Remove or explicitly deprecate the current Student App profile `student.userId` exposure as part of the next read-contract/avatar work.
8. Keep `StudentDocument` staff-only for now.
9. Keep homework/task attachments separate from profile media and StudentDocument policy.

Recommended next sprint:

```text
STU-PROF-1C — Student Avatar Upload Foundation
```

That sprint should include the avatar schema/migration, Student App avatar upload/replace/delete routes, safe avatar presentation, audit logging, and focused tests. It should also repair or intentionally deprecate the existing Student App profile `userId` exposure before or during the avatar response contract change.

## 2. Source Evidence Reviewed

Documentation reviewed:

- `docs/sprint-stu-prof-1a-student-profile-avatar-self-service-audit.md`
- `docs/sprint-adm-reg-1j-admissions-registration-flow-final-closeout-audit.md`
- `docs/sprint-adm-reg-doc-1c-admissions-document-import-final-closeout-audit.md`
- `docs/sprint-adm-reg-doc-1b-staff-confirmed-admissions-document-import-closeout.md`
- `docs/sprint-adm-reg-doc-1a-admissions-documents-to-student-documents-decision-lock.md`
- `docs/sprint-adm-reg-1c-student-guardian-profile-persistence-repair-closeout.md`
- `docs/sprint-adm-reg-1d-school-registration-wizard-foundation-closeout.md`
- `docs/sprint-adm-reg-1i-admissions-registered-state-exposure-closeout.md`
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

Runtime evidence inspected without modification:

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
- `src/modules/student-app/home/**`
- `src/modules/student-app/tasks/**`
- `src/modules/student-app/homeworks/**`
- `src/modules/student-app/notifications/**`
- `src/modules/parent-app/**`
- `src/modules/files/**`
- `src/infrastructure/storage/**`
- `src/modules/homework/**`
- `src/modules/academics/**`
- `test/e2e/student-app-final-closeout.e2e-spec.ts`
- `test/security/tenancy.student-app.spec.ts`
- `src/modules/student-app/profile/tests/**`
- `src/modules/students/**/tests/**`
- `package.json`

## 3. Current Runtime Constraints

The current runtime constraints are clear:

- `Student` has no avatar/profile image field or `File` relation.
- `File` metadata and object storage already exist.
- Files are downloaded through `GET /api/v1/files/:id/download`, which redirects to a short-lived signed URL after authorization.
- Current generic file upload allows `image/jpeg` and `image/png`, among other non-avatar file types, and enforces a 10 MB generic limit.
- `GET /api/v1/student/profile` is read-only and returns `avatarUrl: null`.
- Student App profile currently exposes `student.userId`.
- Student App profile tests assert unsupported flags for avatar upload and preferences.
- `PATCH /api/v1/student/profile` and `POST /api/v1/student/profile/avatar` are absent today.
- `StudentAppAccessService` resolves the authenticated Student through `Student.userId`, active Student status, and active Enrollment.
- `StudentDocument` routes are school-staff routes under Students/Guardians, not Student App routes.
- Imported Admissions documents remain `StudentDocument` records managed by school staff and are not app-visible.
- Homework/task files are academic workflow attachments, not profile media or StudentDocument visibility evidence.

These constraints do not block a future avatar implementation, but they require a narrow schema and response contract.

## 4. Decision Area 1 — Avatar / Profile Image Ownership

### Locked Decision

Use Avatar Option B:

```text
Student-owned Avatar File
```

Future avatar/profile image metadata should live on `Student`, preferably as a nullable File reference:

```prisma
avatarFileId String? @map("avatar_file_id") @db.Uuid
avatarFile File? @relation(...)
```

This is a future planning shape only. STU-PROF-1B does not add schema.

### Rationale

Student App access is school-scoped and resolves through the operational `Student` record. A Student-owned avatar is narrower and safer than a global `User` avatar because one user/account identity can be conceptually different from school-specific Student profile identity. A dedicated profile media model is more flexible, but it is too broad for the first V1 avatar capability.

Student-owned media also keeps app-facing profile presentation close to the Student module while still reusing existing Files infrastructure for storage and download authorization.

### Rejected Options

Avatar Option A, no avatar in V1, is too conservative now that the current profile contract already reserves `avatarUrl: null` and unsupported avatar behavior.

Avatar Option C, User-owned avatar, risks ambiguity across roles and schools.

Avatar Option D, dedicated profile media model, is broader than the immediate need and should be deferred unless moderation/history/versioning requirements become explicit.

## 5. Decision Area 2 — Avatar Routes and File Policy

### Locked Student App Routes

Future Student App avatar routes:

```text
POST /api/v1/student/profile/avatar
DELETE /api/v1/student/profile/avatar
```

`POST` should upload or replace the authenticated Student's avatar. `DELETE` should clear the authenticated Student's avatar reference.

### Staff Route Decision

Staff avatar management is deferred:

```text
PATCH /api/v1/students-guardians/students/:studentId/avatar
```

Do not include the staff route in the first avatar implementation unless product explicitly requires school staff avatar management. Staff should be able to view safe avatar media through Student profile responses once implemented, but upload/replace/delete starts with Student App self-service only.

### Locked File Policy

Future avatar implementation must:

- Use existing `File` metadata and object storage.
- Store objects privately.
- Never store signed URLs.
- Never store public external URLs as the durable avatar source.
- Never expose bucket or object key.
- Generate display/download access through authorized backend routes.
- Restrict avatar uploads to safe image MIME types.
- Enforce an avatar-specific size limit.
- Prefer replacement by updating `Student.avatarFileId` to a new File rather than immediately deleting historical File metadata or binary objects.

Recommended V1 avatar file validation:

```text
Allowed MIME types: image/jpeg, image/png, image/webp
Max size: 5 MB
```

Current generic file upload constraints allow `image/jpeg` and `image/png` and use a 10 MB generic file limit. The future avatar route should use avatar-specific validation so that it does not accidentally inherit non-image generic file allowances. If `image/webp` support requires a small Files validation extension, that should be implemented deliberately in the avatar sprint and covered by tests.

## 6. Decision Area 3 — Student Profile Self-Edit Policy

### Locked Decision

Official Student profile fields remain school-staff-only in V1.

Do not allow direct Student App edits for:

- legal name fields
- Arabic name fields
- gender
- birth date
- nationality
- official contact data
- address/city/district
- medical profile
- guardian or emergency contact data
- `Student.userId`
- `Student.applicationId`
- tenant fields

### Future Path

Sensitive/official changes should use a correction-request workflow:

```text
Student submits requested changes -> school staff reviews -> staff applies or rejects.
```

This should be designed in a separate sprint. It may include field-level policies, staff review states, audit events, and optional guardian/parent approval rules.

### Non-Official Preferences

Direct Student App preferences may be considered later for non-official app settings, but notification preferences already live under Student App notifications and are not Student profile source-of-truth fields.

Avatar/profile image is the one self-service capability approved for first implementation because it is contained profile media and does not mutate official identity fields.

## 7. Decision Area 4 — Student App Profile userId Exposure

### Current Behavior

`GET /api/v1/student/profile` currently returns `student.userId`, and existing Student App tests assert that behavior.

### Locked Target Decision

Use userId Option C:

```text
Remove Student.userId from Student App profile in a future read-contract repair.
```

`Student.userId` is an internal account-link field. The safe app-facing identifier should be `studentId`. No replacement raw `accountId` should be introduced unless the platform creates a deliberate public account reference contract.

### Transition Decision

Because this is an existing response field, the next implementation sprint must handle it deliberately:

1. Prefer removing `student.userId` from the Student App profile response during STU-PROF-1C if current client compatibility allows.
2. If compatibility risk is high, document a short deprecation window and add a safe replacement only if a product-backed public account reference exists.
3. Do not add avatar responses while leaving `userId` unexamined as a long-term no-leak contract.

STU-PROF-1B does not implement this removal.

## 8. Decision Area 5 — StudentDocument App Visibility

### Locked Decision

Keep `StudentDocument` staff-only for now.

Do not expose `StudentDocument` records to Student App or Parent App as part of profile/avatar work.

### Rationale

`StudentDocument` records may include administrative records, imported Admissions evidence, medical or compliance documents, and other sensitive school-managed files. Document visibility has different privacy, retention, review, and guardian-consent risks than avatar upload.

Imported Admissions documents were explicitly kept out of Student App and Parent App visibility in ADM-REG-DOC. STU-PROF must not reopen that boundary as a side effect.

### Future Path

If product wants app-facing document visibility, create a separate decision sprint:

```text
STU-DOC App Visibility Decision
```

That sprint should decide document types, actor visibility, redaction, download authorization, parent/student differences, and audit behavior.

## 9. Decision Area 6 — Homework / Task File Boundary

Homework/task submission files are academic workflow attachments.

They are not:

- Student avatar/profile media
- StudentDocument records
- Admissions evidence
- proof that Student App profile document upload exists
- a basis for Parent/Student StudentDocument visibility

Keep homework/task file behavior owned by Homework/Tasks/Academics modules. Do not mix those files with profile/avatar implementation or StudentDocument visibility decisions.

## 10. Locked V1 Contract

The V1 Student profile/avatar contract is locked as follows:

1. Implement avatar upload before official profile field self-edit.
2. Store avatar as Student-owned profile media, preferably `Student.avatarFileId` referencing `File`.
3. Reuse existing File metadata and object storage.
4. Do not store signed URLs.
5. Do not expose bucket or object key.
6. Allow a Student App user to upload/replace/delete only their own active linked Student avatar.
7. Keep official Student profile fields staff-only for now.
8. Do not allow direct edits of legal name, Arabic name, gender, birth date, nationality, address, medical profile, guardian/emergency contact, `Student.userId`, `Student.applicationId`, `schoolId`, or `organizationId`.
9. Future official field changes should use a correction-request workflow, not direct mutation.
10. Keep `StudentDocument` staff-only for now.
11. Do not expose imported Admissions documents to Student App or Parent App as part of profile work.
12. Keep homework/task attachments separate from profile/avatar/documents.
13. Repair or explicitly deprecate Student App profile `userId` exposure before or during avatar implementation.

## 11. Future Implementation Contract

Recommended next sprint:

```text
STU-PROF-1C — Student Avatar Upload Foundation
```

Allowed future STU-PROF-1C scope:

- nullable Student avatar File reference
- Prisma migration
- Student App avatar upload/replace route
- Student App avatar delete route
- safe avatar response on `GET /api/v1/student/profile`
- safe avatar response on Student App home/profile-like summaries if shared presenter support is low-risk
- authorized file access through existing Files route
- avatar-specific MIME and size validation
- safe audit logging
- focused unit/e2e/security tests
- closeout document
- Student App profile `userId` removal/deprecation as a deliberate read-contract repair

Explicitly out of STU-PROF-1C scope:

- official profile field self-edit
- profile correction request workflow
- StudentDocument Student App visibility
- StudentDocument Parent App visibility
- Parent App child profile mutation
- Applicant behavior changes
- Admissions behavior changes
- ADM-REG-DOC import changes
- homework/task file changes
- staff avatar management unless separately approved

Alternative next sprint only if the `userId` exposure is deemed more urgent:

```text
STU-PROF-1C — Student App Profile Read Contract Repair
```

Use that alternative only if client/API owners require the `userId` removal to land before avatar work.

## 12. Security, Tenancy, and No-Leak Rules

Future Student App profile/avatar responses must not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `deletedAt`
- `passwordHash`
- `Student.userId`, except during a documented short deprecation window
- `Student.applicationId`
- `Guardian.userId`
- Applicant user ids
- storage bucket
- storage object key
- raw signed URLs
- internal actor ids
- audit internals

Allowed where appropriate:

- safe `studentId`
- display name
- safe read-only profile fields
- safe avatar file id if required by the client contract
- safe avatar download path such as `/api/v1/files/:id/download`
- safe school and enrollment summaries
- safe unsupported capability flags

Authorization rules for future avatar routes:

- Authenticated Student App actor only.
- Actor must resolve to an active linked `Student`.
- Student must have active Enrollment through existing Student App access chain.
- Student can only mutate their own avatar.
- Parent users cannot call Student App avatar routes.
- Applicant users cannot call Student App avatar routes.
- Other Student users cannot mutate the target Student avatar.
- Cross-school or cross-student guesses must return safe not-found/forbidden behavior according to existing Student App conventions.

No global guard or `schoolScope` changes are required or allowed for this decision.

## 13. Audit and Observability Requirements

Future avatar changes must be audited.

Recommended audit actions:

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

Audit payload must not include:

- bucket
- object key
- raw signed URL
- file binary
- passwords
- tokens
- `Student.applicationId`
- Applicant ids
- membership internals
- role internals

Profile correction requests, if implemented later, must use separate audit events. Do not overload avatar audit actions for official data corrections.

## 14. Test Strategy For Future Implementation

Future avatar implementation must add focused tests.

### Unit / Use-Case Tests

- Student uploads own avatar.
- Student replaces own avatar.
- Student deletes own avatar.
- Student cannot update official fields through avatar/profile routes.
- Student cannot upload invalid MIME type.
- Student cannot upload oversized image.
- Student cannot update another Student's avatar.
- Missing active Student link is rejected.
- Missing active Enrollment is rejected.
- Presenter returns safe avatar fields and no storage internals.
- Profile response no longer exposes `userId`, or explicitly follows the documented deprecation contract.

### E2E Tests

- `POST /api/v1/student/profile/avatar` uploads a valid image.
- Replacing an avatar updates the profile response.
- `DELETE /api/v1/student/profile/avatar` clears the profile avatar.
- `GET /api/v1/student/profile` returns safe avatar data.
- `GET /api/v1/student/home` remains backward-compatible if avatar is exposed there.
- Official fields remain read-only.
- Invalid file type and oversized image are rejected.
- File download route remains the only signed URL path.

### Security Tests

- Student cannot mutate another Student avatar.
- Parent cannot update avatar through Student App route.
- Applicant cannot access Student App avatar route.
- Staff-only routes still hide internal ids.
- `schoolId`, `organizationId`, `userId`, `applicationId`, bucket, object key, and raw signed URL are not exposed.
- Cross-school guesses do not leak existence.

## 15. Deferred Backlog

| Backlog item | Why deferred | Recommended owner sprint | Priority | Risk |
| --- | --- | --- | --- | --- |
| profile correction request workflow | Official profile data should not be mutated directly by Student App. | STU-PROF-2A Profile Correction Request Decision Lock | High | High data-integrity risk if skipped. |
| direct profile preferences update | Preferences are separate from official Student records and need source-of-truth rules. | STU-PROF Preferences Decision | Medium | Medium contract risk. |
| student contact source-of-truth cleanup | Staff Student contact fields and account email/phone differ today. | STU-PROF Contact Source Audit | Medium | Medium consistency risk. |
| Student App profile userId contract repair | Current profile response exposes `Student.userId`. | STU-PROF-1C or dedicated read-contract repair | High | Medium no-leak/compatibility risk. |
| StudentDocument Student App visibility | StudentDocument may include sensitive staff-managed documents. | STU-DOC App Visibility Decision | Medium | High privacy risk. |
| Parent App StudentDocument visibility | Parent visibility needs separate document type, consent, and redaction decisions. | STU-DOC Parent Visibility Decision | Medium | High privacy risk. |
| staff avatar management | First avatar scope is Student self-service only. | STU-PROF Staff Avatar Management | Low | Low/Medium operational risk. |
| avatar moderation/review workflow | V1 can store profile media, but moderation policy is product-specific. | STU-PROF Avatar Moderation Policy | Medium | Medium content risk. |
| medical profile app visibility | Medical profile is sensitive and school-managed today. | STU-MED App Visibility Decision | Medium | High privacy risk. |
| guardian/emergency contact update policy | Guardian and emergency contact data is not a Student-only profile field. | STU-PROF Guardian Contact Correction Policy | Medium | High data-ownership risk. |

## 16. Recommended Next Sprint

Recommended next sprint:

```text
STU-PROF-1C — Student Avatar Upload Foundation
```

Why this is the safest next sprint:

- Avatar is already represented as `avatarUrl: null` in Student App read models.
- Avatar upload is user-visible but narrower than official profile field mutation.
- It can reuse existing File storage and download infrastructure.
- It does not require Applicant, Admissions, Parent App, StudentDocument, homework, or task changes.
- It creates a natural point to repair the `student.userId` response exposure.

Implementation should stay narrow: schema, Student App avatar routes, safe presenter, audit, file validation, and focused tests.

## 17. Explicit Do-Not-Do List

Do not:

- implement Student profile edits in STU-PROF-1B.
- implement avatar upload in STU-PROF-1B.
- add Student profile File fields in STU-PROF-1B.
- expose StudentDocument to Student App without a separate decision.
- expose StudentDocument to Parent App without a separate decision.
- treat homework/task submissions as Student profile documents.
- expose bucket, object key, or raw signed URLs.
- expose `schoolId`, `organizationId`, `userId`, or `applicationId` in app-facing responses as a long-term contract.
- mutate Applicant identity.
- change Admissions registration behavior.
- change ADM-REG-DOC import behavior.
- use audit logs as profile current-state source.
- add staff avatar management as a side effect of Student App avatar work.
- implement official profile correction requests inside the avatar foundation sprint.

## 18. Final Verdict

```text
STU_PROF_1B_PROFILE_AVATAR_SELF_SERVICE_DECISION_LOCKED
```

The backend/product contract is locked for V1 planning. The next safe implementation is a narrow Student-owned avatar foundation with File-backed storage, strict no-leak behavior, audit logging, and focused tests. Official Student profile fields remain school-staff-managed, StudentDocument remains staff-only, homework/task files remain academic attachments, and Student App profile `userId` exposure must be repaired or explicitly deprecated before or during avatar implementation.

## Decision Matrix

| Decision Area | Options Considered | Locked Decision | Reason | Future Sprint |
| --- | --- | --- | --- | --- |
| Avatar ownership | No avatar, Student-owned File, User-owned File, dedicated ProfileMedia | Student-owned File | School-scoped profile media belongs with operational Student identity. | STU-PROF-1C |
| Avatar route shape | No route, Student App route, staff route, both | Student App `POST /student/profile/avatar` and `DELETE /student/profile/avatar`; staff route deferred | Starts with self-service and avoids staff workflow expansion. | STU-PROF-1C |
| Avatar file policy | Raw URL, signed URL storage, existing File, dedicated storage copy | Existing File metadata and private object storage; no stored signed URLs | Reuses safe Files infrastructure and avoids storage internals. | STU-PROF-1C |
| Official profile field edits | No direct edit, narrow edit, correction request, broad edit | No direct edit for official fields | Preserves school record integrity. | Future correction request sprint |
| Correction request workflow | Do nothing, direct edit, correction request | Future correction request workflow | Safer path for official/sensitive data changes. | STU-PROF-2A |
| Student App profile userId | Keep, rename, remove, replace with public reference | Remove/deprecate in future read-contract repair | `Student.userId` is an internal account-link id. | STU-PROF-1C or read-contract repair |
| StudentDocument Student App visibility | Expose all, expose selected, keep staff-only | Keep staff-only | Sensitive administrative document policy is separate. | STU-DOC visibility decision |
| StudentDocument Parent App visibility | Expose all, expose selected, keep staff-only | Keep staff-only | Parent visibility needs redaction/consent rules. | STU-DOC visibility decision |
| Homework/task file boundary | Treat as profile docs, treat as StudentDocuments, keep separate | Keep separate academic attachments | Owned by academic workflows, not profile. | None in STU-PROF |

## Avatar Option Matrix

| Option | Description | Pros | Cons | Decision |
| --- | --- | --- | --- | --- |
| A | No Avatar in V1 | No schema or storage change. | Leaves reserved `avatarUrl: null` unresolved and no visible profile media path. | Rejected |
| B | Student-owned Avatar File | School-scoped, narrow, reuses Files, avoids User role ambiguity. | Requires migration and avatar-specific file validation. | Locked |
| C | User-owned Avatar File | Could share avatar across app surfaces. | Ambiguous across roles/schools and risks global identity leakage. | Rejected |
| D | Dedicated ProfileMedia Model | Flexible for lifecycle/moderation/history. | Too broad for first V1 avatar; more schema and policy surface. | Deferred |

## Profile Self-Edit Field Matrix

| Field / Group | Direct student edit? | Correction request? | Staff-only? | Reason |
| --- | --- | --- | --- | --- |
| legal name fields | No | Yes, future | Yes | Official school record identity. |
| Arabic name fields | No | Yes, future | Yes | Official school record identity. |
| preferred/display name | Not in current schema; no direct edit now | Optional future | Staff/currently unsupported | Needs field and policy before mutation. |
| gender | No | Yes, future | Yes | Sensitive official data. |
| birth date | No | Yes, future | Yes | Sensitive official data. |
| nationality | No | Yes, future | Yes | Official profile data. |
| student phone | No | Yes, future | Yes | Source of truth differs between Student and User today. |
| student email | No | Yes, future | Yes | Source of truth differs between Student and User today. |
| address/city/district | No | Yes, future | Yes | School record data; may require staff verification. |
| medical profile | No | Future medical/guardian workflow only | Yes | Sensitive data and not Student App profile today. |
| guardian/emergency contact | No | Yes, future with guardian/staff ownership | Yes | Not solely Student-owned. |
| avatar/profile image | Yes, future avatar route | No | No for Student-owned avatar; staff route deferred | Contained profile media, not official identity fields. |
| preferences | Not as Student profile fields today | No | N/A | App preferences need separate source-of-truth policy. |

## Student App Profile Response Decision Matrix

| Field / Concept | Current behavior | Decision | Reason | Future action |
| --- | --- | --- | --- | --- |
| studentId | Returned as safe Student id | Keep | Primary safe app-facing Student identifier. | Keep in STU-PROF-1C |
| userId | Returned today | Remove/deprecate | Internal account-link id; no-leak issue. | Repair before/during avatar implementation |
| displayName | Returned | Keep | Safe presentation field. | Keep |
| firstName | Returned | Keep read-only | Safe basic profile read field. | Keep read-only |
| lastName | Returned | Keep read-only | Safe basic profile read field. | Keep read-only |
| email | Returned from User email | Keep read-only for now, review source later | Useful but source-of-truth cleanup needed. | Contact source audit later |
| phone | Returned from User phone | Keep read-only for now, review source later | Useful but source-of-truth cleanup needed. | Contact source audit later |
| avatarUrl | `null` | Replace with safe avatar path/object after implementation | Current placeholder should become real safe media response. | STU-PROF-1C |
| studentNumber/student_code | `null` | Keep null until student code is implemented | No durable public code source today. | Future student code sprint |
| school summary | Returned safely | Keep | Needed for Student App context. | Keep |
| enrollment summary | Returned safely | Keep | Needed for Student App context. | Keep |
| unsupported flags | Avatar/profile mutation marked unsupported | Update when avatar is implemented | Flags should match actual capabilities. | STU-PROF-1C |
| internal ids | Mostly hidden, except `userId` | Keep hidden; retire `userId` | Prevent tenant/account internals in app-facing contract. | Presenter no-leak tests |

## File / Storage Policy Matrix

| Policy Area | Locked Decision | Reason | Future implementation note |
| --- | --- | --- | --- |
| File model | Use existing `File` metadata via `Student.avatarFileId` | Reuses normalized Files/storage system. | Add nullable Student relation by migration. |
| Storage visibility | Private/internal | Student avatar is not public storage. | Follow existing Files visibility conventions. |
| MIME types | `image/jpeg`, `image/png`, `image/webp` | Restricts avatar to safe image formats. | Add avatar-specific validation; current generic list may need WebP support. |
| Size limit | 5 MB | Narrower than current 10 MB generic file limit. | Enforce in avatar use case/interceptor. |
| Download/display URL | Authorized `/api/v1/files/:id/download` path or safe avatar object | Signed URLs are generated only on access. | Do not return raw signed URL from profile presenter. |
| Replace behavior | Upload/register new File and update `Student.avatarFileId` | Avoids destructive object deletion in profile request. | Old file retention handled by Files policy. |
| Delete behavior | Clear `Student.avatarFileId` | Deletes profile association, not necessarily binary object. | Physical deletion/cleanup is separate policy. |
| Audit payload | `studentId`, `fileId`, `previousFileId`, `mimeType`, `sizeBytes`, `source` | Enough observability without secrets. | No bucket/objectKey/signed URL. |
| No-leak fields | Hide tenant ids, account ids, application ids, bucket/objectKey, raw signed URL | Preserves app-facing safety. | Add presenter/security tests. |

## Future Test Matrix

| Test area | Required scenario | Expected result |
| --- | --- | --- |
| student uploads own avatar | Linked active Student uploads valid image | Avatar is saved and profile returns safe avatar field. |
| student replaces own avatar | Student uploads second valid image | `avatarFileId` changes; previous file not destructively deleted by default. |
| student deletes own avatar | Student calls delete route | Avatar reference is cleared and profile returns null avatar. |
| student cannot update official fields | Student tries profile field mutation | Request is rejected or route remains absent. |
| student cannot upload invalid MIME type | Upload text/PDF/video | Validation rejects the request. |
| student cannot upload oversized image | Upload image over avatar limit | Validation rejects the request. |
| student cannot update another student's avatar | Cross-student guess | Safe forbidden/not-found behavior. |
| Parent cannot update avatar through Student App | Parent actor calls Student route | Unauthorized/forbidden according to app auth behavior. |
| Applicant cannot access Student App avatar route | Applicant actor calls route | Unauthorized/forbidden. |
| staff routes still hide internal ids | Staff views Student with avatar | No `userId`, `applicationId`, tenant ids, or storage internals. |
| profile response no longer exposes userId if repair is implemented | Fetch profile after read-contract repair | `student.userId` absent; `studentId` remains. |
| bucket/objectKey/raw signed URL not exposed | Fetch profile/home after avatar | No storage internals or raw signed URL in JSON. |
