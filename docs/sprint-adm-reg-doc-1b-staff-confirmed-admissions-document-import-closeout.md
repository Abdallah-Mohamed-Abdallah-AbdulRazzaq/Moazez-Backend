# ADM-REG-DOC-1B — Staff-Confirmed Admissions Document Import Closeout

## Sprint Summary

ADM-REG-DOC-1B implemented the ADM-REG-DOC-1A locked decision: selected Admissions `ApplicationDocument` records can be explicitly imported into Students-owned `StudentDocument` records after source-bound registration.

The import is staff-confirmed, school-scoped, post-registration only, source-idempotent, audited, and no-leak. It does not run during Admissions handoff preview or source-bound registration submit.

## Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260629120000_0047_adm_reg_doc_1b_student_document_source_metadata/migration.sql`
- `src/modules/students/documents/application/import-application-documents.use-case.ts`
- `src/modules/students/documents/controller/student-documents.controller.ts`
- `src/modules/students/documents/documents.module.ts`
- `src/modules/students/documents/dto/student-document.dto.ts`
- `src/modules/students/documents/infrastructure/student-documents.repository.ts`
- `src/modules/students/documents/presenters/student-document-import.presenter.ts`
- `src/modules/students/documents/tests/student-documents.use-case.spec.ts`
- `test/e2e/admissions-document-import-to-student-document.e2e-spec.ts`
- `test/security/tenancy.admissions-document-import.spec.ts`
- `docs/sprint-adm-reg-doc-1b-staff-confirmed-admissions-document-import-closeout.md`

## Schema / Migration Changes

Migration:

`20260629120000_0047_adm_reg_doc_1b_student_document_source_metadata`

Added nullable lineage fields to `StudentDocument`:

- `sourceApplicationId`
- `sourceApplicationDocumentId`
- `sourceApplicantRequestDocumentId`
- `importedAt`
- `importedBy`
- `sourceDocumentType`
- `sourceReviewStatus`
- `sourceNotes`
- `sourceFileId`

Indexes were added for source lookup fields, and a source-idempotency unique index was added for:

`schoolId + studentId + sourceApplicationDocumentId`

No Applicant, Admissions Application, File, Parent App, or Student App schema was changed.

## Route Added

```text
POST /api/v1/students-guardians/students/:studentId/documents/import-from-application
```

Permissions:

```text
students.documents.manage
admissions.documents.view
```

The route is school-staff-only through the existing authenticated, school-scoped guard and permission stack.

## Request / Response Contract

Request body:

```json
{
  "applicationId": "uuid",
  "applicationDocumentIds": ["uuid"]
}
```

Rules:

- `studentId` comes from the route only.
- `applicationId` is required.
- `applicationDocumentIds` is required, non-empty, UUID-only, de-duplicated after normalization, and capped at 25.
- File ids and ApplicantAdmissionRequestDocument ids are not accepted.

Response:

```json
{
  "studentId": "uuid",
  "applicationId": "uuid",
  "imported": [
    {
      "applicationDocumentId": "uuid",
      "studentDocument": {},
      "source": {
        "sourceApplicationId": "uuid",
        "sourceApplicationDocumentId": "uuid",
        "sourceApplicantRequestDocumentId": null
      }
    }
  ],
  "skipped": [],
  "warnings": []
}
```

`studentDocument` uses the existing safe StudentDocument presenter with the authorized Files download route.

## Validation Behavior

The import transaction validates:

- target Student exists in current school scope and is active / not deleted;
- source Application exists in current school scope;
- target `Student.applicationId` equals request `applicationId`;
- every selected `ApplicationDocument` belongs to the same school and application;
- every selected source document has an available same-school File;
- cross-school source/target guesses return safe not-found behavior;
- invalid source state fails the whole request.

Already-imported source documents are returned in `skipped` with `reason: "already_imported"`.

## Idempotency Behavior

Source idempotency is anchored by:

`schoolId + studentId + sourceApplicationDocumentId`

Repeated import of the same source document does not create duplicate `StudentDocument` records. The response returns the existing source as skipped.

Manual `StudentDocument` records can still coexist with imported records unless a future product policy changes document-type duplicate behavior.

## File Reuse / Copy Behavior

The import reuses the existing `File.id` from `ApplicationDocument.fileId`.

No binary object is copied.

No new File row is created.

No signed URL is stored.

Downloads continue through the existing authorized Files route:

```text
/api/v1/files/:id/download
```

## Audit Behavior

The import writes:

```text
students.document.import_from_admissions
```

Safe audit payload includes:

- `studentId`
- `applicationId`
- selected `applicationDocumentIds`
- resolved `studentDocumentIds`
- `importedCount`
- `skippedCount`
- `source: admissions_application`

Audit payload does not include notes, bucket, objectKey, signed URLs, applicant internals, credentials, or storage provider internals.

## Security / No-Leak Confirmation

The implementation does not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `deletedAt`
- `passwordHash`
- `bucket`
- `objectKey`
- raw signed URLs
- storage provider internals
- Applicant user id
- ApplicantProfile id
- RequestContext actor internals

Allowed staff-facing ids are limited to safe dashboard context:

- `studentId`
- `applicationId`
- `applicationDocumentId`
- `studentDocumentId`
- `fileId`

## Applicant Boundary Confirmation

No Applicant identity behavior changed.

The import does not:

- mutate `UserType.APPLICANT`;
- create Applicant membership;
- link Applicant user to `Guardian.userId`;
- link Applicant user to `Student.userId`;
- change Applicant Portal behavior.

## Application.status / registrationState Confirmation

The import does not mutate `Application.status`.

The import does not mutate or store `registrationState`.

`registrationState` remains derived from `Student.applicationId + schoolId`.

## Parent / Student App Boundary Confirmation

No Parent App or Student App behavior changed.

Document import does not activate Parent App or Student App visibility.

Parent App visibility still depends on the existing operational chain:

`Parent user + membership + Guardian.userId + StudentGuardian + active Student + active Enrollment`

Student App visibility still depends on:

`Student user + membership + Student.userId + active Student + active Enrollment`

## Tests Run

```text
npx prisma validate
npx prisma generate
npm run build
npm test -- --runInBand src/modules/students/documents/tests
npx prisma migrate status
npx prisma migrate deploy
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-document-import-to-student-document.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.admissions-document-import.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-flow.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/admissions-registration-submit.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/school-registration-wizard.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.admissions.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.admissions-registration-submit.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.school-registration.spec.ts
```

## Results

- Prisma schema validation passed.
- Prisma client generation passed.
- Local pending migration was applied successfully with `npx prisma migrate deploy`.
- Build passed after safely removing stale generated `dist` output that caused an initial `ENOTEMPTY` cleanup failure.
- Focused Students documents unit tests passed: 2 suites, 8 tests.
- New focused import e2e passed: 1 suite, 1 test.
- New focused import security suite passed: 1 suite, 7 tests.
- Admissions flow regression passed: 1 suite, 3 tests.
- Admissions registration submit regression passed: 1 suite, 3 tests.
- School registration wizard regression passed: 1 suite, 1 test.
- Admissions tenancy regression passed: 1 suite, 36 tests.
- Admissions registration submit tenancy regression passed: 1 suite, 6 tests.
- School registration tenancy regression passed: 1 suite, 6 tests.

## Tests Not Run

The broad full repository test suite was not run. The sprint ran the required focused and related regression suites for Admissions registration, school registration, Students documents, and tenancy boundaries.

## Known Limitations

- Import source metadata is stored on `StudentDocument`, but broad StudentDocument list/get responses still use the existing backward-compatible presenter and do not expose the extended source metadata outside the import response.
- Document type mapping is intentionally narrow: source `ApplicationDocument.documentType` becomes target `StudentDocument.documentType`.
- Source status mapping is conservative: `COMPLETE` becomes StudentDocument `COMPLETE`; other Admissions document statuses become StudentDocument `MISSING` while preserving the original source status in `sourceReviewStatus`.
- No binary object copy is implemented.
- No bulk historical import job is implemented.
- No Parent App or Student App document visibility is implemented.

## Deferred Items

- Broader staff UI contract for viewing imported-source metadata on StudentDocument list/detail.
- Product policy for duplicate manual StudentDocument records by document type.
- Optional copy-on-import storage policy if future retention rules require independent file copies.
- Parent/Student App document visibility decision.
- Bulk historical migration, only if separately approved.

## Final Verdict

`ADM_REG_DOC_1B_STAFF_CONFIRMED_DOCUMENT_IMPORT_READY`
