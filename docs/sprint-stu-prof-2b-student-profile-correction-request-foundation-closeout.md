# STU-PROF-2B - Student Profile Correction Request Foundation Closeout

## Sprint Summary

STU-PROF-2B implements the Student profile correction request foundation locked in STU-PROF-2A.

The backend now supports a safe request/review workflow:

- Student App users can submit profile correction requests for allowlisted official profile fields.
- Submission stores requested changes and a current Student snapshot, but does not mutate `Student`.
- Student App users can list/read only their own requests.
- Student App users can cancel only their own `PENDING` requests.
- School staff can list/read same-school requests.
- School staff can approve/reject only same-school `PENDING` requests.
- Approval applies allowed changes to `Student` and updates the request in one transaction.
- Rejection leaves `Student` unchanged.
- Direct `PATCH /api/v1/student/profile` remains unsupported.

## Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260630100000_0049_stu_prof_2b_profile_correction_requests/migration.sql`
- `src/modules/student-app/profile/controller/student-profile.controller.ts`
- `src/modules/student-app/profile/application/student-profile-correction-requests.use-cases.ts`
- `src/modules/student-app/profile/tests/student-profile-correction-requests.use-case.spec.ts`
- `src/modules/student-app/student-app.module.ts`
- `src/modules/students/students.module.ts`
- `src/modules/students/profile-correction-requests/**`
- `test/e2e/student-profile-correction-requests.e2e-spec.ts`
- `test/security/tenancy.student-profile-correction-requests.spec.ts`
- `test/e2e/student-app-final-closeout.e2e-spec.ts`
- `docs/sprint-stu-prof-2b-student-profile-correction-request-foundation-closeout.md`

## Schema / Migration Summary

Added `StudentProfileCorrectionRequestStatus`:

- `PENDING`
- `APPROVED`
- `REJECTED`
- `CANCELLED`

Added `StudentProfileCorrectionRequest` with:

- tenant scope: `organizationId`, `schoolId`
- target: `studentId`
- internal actors: `requestedByUserId`, `approvedBy`, `rejectedBy`, `cancelledBy`
- lifecycle fields: `status`, `approvedAt`, `rejectedAt`, `cancelledAt`
- review data: `requestedChanges`, `currentSnapshot`, `reason`, `reviewerNote`
- soft-delete and timestamps

Indexes:

- `schoolId + studentId + status + createdAt`
- `schoolId + status + createdAt`
- `requestedByUserId`
- `studentId`
- `deletedAt`
- `id + schoolId` unique school-scope convention

No avatar, StudentDocument, Applicant, Admissions, Parent App, Student App document visibility, homework, or guardian/medical schema changed.

## Route Contract

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

Staff permissions:

- list/read: `students.records.view`
- approve/reject: `students.records.manage`

## Request / Response Examples

Student App submit:

```json
{
  "changes": {
    "firstName": "New",
    "studentEmail": "student@example.com"
  },
  "reason": "Please correct my profile information."
}
```

Student App response:

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

## Allowed / Disallowed Field Policy

Allowed request fields:

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

Rejected as unknown/disallowed:

- avatar/profile media fields
- medical profile fields
- guardian/emergency contact fields
- StudentDocument/document fields
- preferences/display name fields
- `userId`, `studentId`, `applicationId`
- tenant, membership, role, password, deleted/timestamp fields

Validation rejects empty `changes`, non-object `changes`, unknown fields, disallowed fields, invalid dates, invalid email values, overlong text, and attempts to clear required `firstName`, `lastName`, `gender`, or `birthDate`.

## Status Lifecycle

Allowed transitions:

- `PENDING -> APPROVED`
- `PENDING -> REJECTED`
- `PENDING -> CANCELLED`

Terminal states:

- `APPROVED`
- `REJECTED`
- `CANCELLED`

No reopen or revise behavior was implemented.

## Approval Transaction Behavior

Approval revalidates stored `requestedChanges`, applies only the allowlisted fields to the target active same-school `Student`, and updates the request to `APPROVED` in a single Prisma transaction.

If the request is missing, cross-school, not pending, or the Student target is unavailable, no partial Student update is committed.

Rejection and cancellation update only the correction request. They do not mutate `Student`.

## Security / No-Leak Boundaries

Student App responses do not expose:

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

Staff responses include safe request details, safe `currentSnapshot`, and safe Student summary only.

Cross-student and cross-school guesses return safe not-found behavior. Parent, Applicant, unlinked Student, and Student-without-active-enrollment actors are blocked by existing Student App access rules.

## Audit Events

Added safe audit events:

- `student.profile.correction.requested`
- `student.profile.correction.cancelled`
- `students.profile.correction.approved`
- `students.profile.correction.rejected`

Audit payloads include safe metadata:

- `requestId`
- `studentId`
- `status`
- `changedFieldNames`
- `source`

Audit payloads do not include full sensitive before/after values, medical details, guardian details, passwords, tokens, `Student.applicationId`, or raw actor internals in app-facing responses.

## Tests Run

Passed:

- `npx prisma validate`
- `npx prisma generate`
- `npx prisma migrate deploy`
- `npx prisma migrate status`
- `npm run build`
- `npm test -- --runInBand src/modules/student-app/profile/tests`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-profile-correction-requests.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-profile-correction-requests.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-app-final-closeout.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-avatar-upload.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-avatar.spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-document-import-to-student-document.e2e-spec.ts`
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.admissions-document-import.spec.ts`

Note: `npx prisma migrate status` initially reported the new migration as pending in the local `moazez_dev` database. `npx prisma migrate deploy` was run to apply it before e2e/security verification.

## Known Limitations

- No Parent/Guardian correction request submission.
- No medical profile correction workflow.
- No guardian/emergency contact correction workflow.
- No correction-request attachments/evidence.
- No notifications to staff or students.
- No reopen/revise lifecycle.
- No bulk/admin repair tooling.
- No direct Student App profile field edit endpoint.

## Deferred Backlog

- Parent/Guardian profile correction request flow.
- Medical profile correction workflow.
- Guardian/emergency contact correction workflow.
- Profile correction attachments/evidence.
- Staff/student notification on request lifecycle changes.
- Direct non-official profile preference editing.
- Student contact source-of-truth cleanup.
- Bulk/admin repair tools.

## Final Verdict

`STU_PROF_2B_PROFILE_CORRECTION_REQUEST_FOUNDATION_READY`
