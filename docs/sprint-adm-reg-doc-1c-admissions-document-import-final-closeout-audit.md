# ADM-REG-DOC-1C - Admissions Document Import Final Closeout Audit

## 1. Executive Summary

ADM-REG-DOC is ready to close for V1 backend purposes.

ADM-REG-DOC-1A locked the product/backend decision:

```text
Option B - Staff-Confirmed Import After Registration
```

ADM-REG-DOC-1B implemented that decision with a Students-owned, staff-only import route:

```text
POST /api/v1/students-guardians/students/:studentId/documents/import-from-application
```

The final state is intentionally narrow and safe:

- Admissions `ApplicationDocument` remains Admissions evidence until staff explicitly imports it.
- Students `StudentDocument` remains the operational student-record document.
- Import is post-registration only and bound to `Student.applicationId = applicationId`.
- Import is source-idempotent by `schoolId + studentId + sourceApplicationDocumentId`.
- File binaries are not copied; existing `File.id` is reused after same-school availability validation.
- `Application.status`, `registrationState`, Applicant identity, Parent App visibility, and Student App visibility are unchanged.
- Storage internals and raw signed URLs are not exposed.

Recommended next step:

```text
Close ADM-REG-DOC.
Move next to STU-PROF-1A - Student Profile / Avatar / Self-Service Audit.
```

Do not continue expanding Admissions document import immediately. Remaining document work is either UI/source metadata exposure, visibility policy, retention policy, or bulk migration policy and should not be mixed into the closed ADM-REG-DOC track.

## 2. Source Evidence Reviewed

Decision and closeout documents:

- `docs/sprint-adm-reg-1j-admissions-registration-flow-final-closeout-audit.md`
- `docs/sprint-adm-reg-doc-1a-admissions-documents-to-student-documents-decision-lock.md`
- `docs/sprint-adm-reg-doc-1b-staff-confirmed-admissions-document-import-closeout.md`
- `docs/sprint-adm-reg-1e-accepted-applicant-conversion-audit-handoff-expansion.md`
- `docs/sprint-adm-reg-1f-accepted-application-handoff-to-wizard-implementation-closeout.md`
- `docs/sprint-adm-reg-1g-accepted-application-source-bound-registration-submit-closeout.md`
- `docs/sprint-adm-reg-1h-post-registration-admissions-closure-audit-decision-lock.md`
- `docs/sprint-adm-reg-1i-admissions-registered-state-exposure-closeout.md`
- `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`

Governance:

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

Runtime evidence:

- `prisma/schema.prisma`
- `prisma/migrations/20260629120000_0047_adm_reg_doc_1b_student_document_source_metadata/migration.sql`
- `src/modules/students/documents/application/import-application-documents.use-case.ts`
- `src/modules/students/documents/controller/student-documents.controller.ts`
- `src/modules/students/documents/documents.module.ts`
- `src/modules/students/documents/dto/student-document.dto.ts`
- `src/modules/students/documents/infrastructure/student-documents.repository.ts`
- `src/modules/students/documents/presenters/student-document-import.presenter.ts`
- `src/modules/admissions/documents/**`
- `src/modules/admissions/applications/**`
- `src/modules/files/**`
- `src/infrastructure/storage/**`
- `src/modules/applicant-portal/**`
- `src/modules/parent-app/**`
- `src/modules/student-app/**`

Test evidence:

- `src/modules/students/documents/tests/student-documents.use-case.spec.ts`
- `test/e2e/admissions-document-import-to-student-document.e2e-spec.ts`
- `test/security/tenancy.admissions-document-import.spec.ts`
- `test/e2e/admissions-flow.e2e-spec.ts`
- `test/e2e/admissions-registration-submit.e2e-spec.ts`
- `test/e2e/school-registration-wizard.e2e-spec.ts`
- `test/security/tenancy.admissions.spec.ts`
- `test/security/tenancy.admissions-registration-submit.spec.ts`
- `test/security/tenancy.school-registration.spec.ts`

## 3. Final Track Timeline

| Sprint | Type | Goal | Commit / Evidence | Final state |
|---|---|---|---|---|
| ADM-REG-DOC-1A | Documentation audit / decision lock | Decide how Admissions documents relate to StudentDocument after registration. | `23cc891e`; `docs/sprint-adm-reg-doc-1a-admissions-documents-to-student-documents-decision-lock.md` | Locked Option B: staff-confirmed import after registration; no automatic import. |
| ADM-REG-DOC-1B | Focused implementation | Implement selected `ApplicationDocument` import into `StudentDocument`. | `55ad3ff9`; `docs/sprint-adm-reg-doc-1b-staff-confirmed-admissions-document-import-closeout.md`; Students documents runtime files | Implemented route, schema lineage metadata, idempotency, audit, focused e2e/security coverage. |
| ADM-REG-DOC-1C | Documentation final closeout | Audit final track state and prevent scope drift. | This document | Closes ADM-REG-DOC for V1 backend purposes. |

## 4. Decision Locked in ADM-REG-DOC-1A

ADM-REG-DOC-1A selected:

```text
Option B - Staff-Confirmed Import After Registration
```

Locked decision points:

- No automatic `StudentDocument` creation during Admissions registration submit.
- No `StudentDocument` creation during handoff preview.
- `ApplicationDocument` remains Admissions evidence until staff explicitly imports it.
- `StudentDocument` remains owned by the Students module.
- Import must be post-registration only.
- Import must be staff-confirmed and selected-document based.
- Import must be school-scoped.
- Import must be source-idempotent.
- Import must preserve source metadata.
- Import must be audited.
- Import must not copy binary objects by default.
- Import must not expose bucket, object key, raw signed URL, or storage internals.
- Import must not affect Applicant identity, `Application.status`, `registrationState`, Parent App visibility, or Student App visibility.

This decision is aligned with ADR-0003: Applicant accounts remain pre-admission `UserType.APPLICANT`, membershipless before acceptance, and are not automatically converted into operational Parent or Student identities.

## 5. Implementation Completed in ADM-REG-DOC-1B

ADM-REG-DOC-1B implemented:

```text
POST /api/v1/students-guardians/students/:studentId/documents/import-from-application
```

Implementation evidence:

- Controller: `src/modules/students/documents/controller/student-documents.controller.ts`
- Use case: `src/modules/students/documents/application/import-application-documents.use-case.ts`
- DTOs: `src/modules/students/documents/dto/student-document.dto.ts`
- Repository transaction: `src/modules/students/documents/infrastructure/student-documents.repository.ts`
- Presenter: `src/modules/students/documents/presenters/student-document-import.presenter.ts`
- Module wiring: `src/modules/students/documents/documents.module.ts`
- Schema/migration: `prisma/schema.prisma`, migration `20260629120000_0047_adm_reg_doc_1b_student_document_source_metadata`

Final implemented behavior:

- Staff-only route under the Students documents area.
- Requires `students.documents.manage` and `admissions.documents.view`.
- Uses the route `studentId` as target Student.
- Accepts source `applicationId` and selected `applicationDocumentIds`.
- Requires the Student to be active, not deleted, same-school, and source-bound to the requested Application through `Student.applicationId`.
- Requires selected `ApplicationDocument` rows to belong to the same Application and same school.
- Requires every selected source document to have an available same-school `File`.
- Creates `StudentDocument` rows with source metadata.
- Reuses existing `File.id`.
- Returns already imported source documents as `skipped`.
- Writes `students.document.import_from_admissions`.

## 6. Final Route Contract

Route:

```text
POST /api/v1/students-guardians/students/:studentId/documents/import-from-application
```

Permissions:

```text
students.documents.manage
admissions.documents.view
```

Request:

```json
{
  "applicationId": "uuid",
  "applicationDocumentIds": ["uuid"]
}
```

Request rules:

- `studentId` comes from the route only.
- `applicationId` is required.
- `applicationDocumentIds` is required.
- `applicationDocumentIds` must be non-empty.
- `applicationDocumentIds` must contain UUID values only.
- `applicationDocumentIds` are de-duplicated after normalization.
- The selected document list is capped at 25.
- File ids are not accepted.
- ApplicantAdmissionRequestDocument ids are not accepted.

Response concept:

```json
{
  "studentId": "uuid",
  "applicationId": "uuid",
  "imported": [
    {
      "applicationDocumentId": "uuid",
      "studentDocument": {
        "id": "uuid",
        "studentId": "uuid",
        "fileId": "uuid",
        "type": "Birth Certificate",
        "name": "birth-certificate.pdf",
        "status": "complete",
        "uploadedDate": "iso-date",
        "url": "/api/v1/files/file-id/download",
        "fileType": "pdf",
        "notes": "Reviewed by admissions"
      },
      "source": {
        "sourceApplicationId": "uuid",
        "sourceApplicationDocumentId": "uuid",
        "sourceApplicantRequestDocumentId": null
      }
    }
  ],
  "skipped": [
    {
      "applicationDocumentId": "uuid",
      "reason": "already_imported",
      "studentDocumentId": "uuid"
    }
  ],
  "warnings": []
}
```

| Contract area | Final behavior | Notes |
|---|---|---|
| Route | `POST /api/v1/students-guardians/students/:studentId/documents/import-from-application` | Students-owned target resource. |
| Permissions | `students.documents.manage` and `admissions.documents.view` | Staff-only, school-scoped. |
| Request body | `applicationId`, `applicationDocumentIds` | No `studentId`, file ids, or applicant document ids in body. |
| Max selected documents | 25 | Enforced by DTO and use-case normalization. |
| Student binding | Route `studentId`; target must be same-school active Student. | Student must be source-bound to the Application. |
| Application binding | Body `applicationId`; must exist in same school. | `Application.status` is not mutated. |
| Source documents | Selected `ApplicationDocument` ids only. | Must belong to same Application and school. |
| Response imported | Safe StudentDocument presenter plus source ids. | No tenant/storage internals. |
| Response skipped | Already imported source documents only. | Reason is `already_imported`. |
| Warnings | Empty array today. | Reserved for future safe warnings. |
| Errors | Safe not-found for missing/cross-school source or target; conflict for inactive/unregistered target or unavailable file. | Error details do not expose storage internals. |

## 7. Final Schema and Idempotency Model

Migration:

```text
20260629120000_0047_adm_reg_doc_1b_student_document_source_metadata
```

Fields added to `StudentDocument`:

- `sourceApplicationId`
- `sourceApplicationDocumentId`
- `sourceApplicantRequestDocumentId`
- `importedAt`
- `importedBy`
- `sourceDocumentType`
- `sourceReviewStatus`
- `sourceNotes`
- `sourceFileId`

Indexes added:

- `sourceApplicationId`
- `sourceApplicationDocumentId`
- `sourceApplicantRequestDocumentId`
- `sourceFileId`

Source-idempotency unique constraint:

```text
schoolId + studentId + sourceApplicationDocumentId
```

No schema changes were made to:

- Applicant Portal models
- Admissions Application
- ApplicationDocument
- File
- Parent App models
- Student App models

| Field / Index | Purpose | Nullable? | Current exposure | Decision |
|---|---|---:|---|---|
| `sourceApplicationId` | Links imported StudentDocument to source Admissions Application. | Yes | Import response source object; DB lineage. | Keep as source lineage. |
| `sourceApplicationDocumentId` | Primary source document idempotency anchor. | Yes | Import response source object; DB lineage. | Keep as source lineage. |
| `sourceApplicantRequestDocumentId` | Preserves applicant-upload lineage when source was bridged. | Yes | Import response source object. | Keep nullable; not accepted directly in request. |
| `importedAt` | Timestamp of staff-confirmed import. | Yes | DB only today. | Keep for traceability; not broad response yet. |
| `importedBy` | Actor who performed import. | Yes | DB/audit only; not response. | Keep internal; do not expose actor id broadly. |
| `sourceDocumentType` | Captures Admissions document type at import. | Yes | DB only today. | Keep source metadata. |
| `sourceReviewStatus` | Captures Admissions review status at import. | Yes | DB only today. | Keep source metadata. |
| `sourceNotes` | Captures safe source notes at import. | Yes | DB only today. | Keep internal/source metadata; avoid audit payload. |
| `sourceFileId` | Captures reused source File id. | Yes | DB only today. | Keep source metadata; file id is safe in StudentDocument response. |
| `student_documents_source_import_key` | Prevents duplicate imported source rows for the same school/student/source document. | N/A | DB constraint. | Keep as source-idempotency guarantee. |

## 8. Validation and Transaction Behavior

`StudentDocumentsRepository.importApplicationDocumentsFromApplication` wraps validation and creation in a Prisma transaction.

Final validation behavior:

- Target Student must exist in current school.
- Target Student must be active and not deleted.
- Target `Student.applicationId` must equal request `applicationId`.
- Source Application must exist in current school.
- Every selected `ApplicationDocument` must belong to request `applicationId`.
- Every selected `ApplicationDocument` must belong to current school.
- Every selected source document must have an available same-school File.
- Invalid source states fail the whole request.
- Already imported source documents are returned as skipped, not treated as failure.

Idempotency behavior:

- Anchor: `schoolId + studentId + sourceApplicationDocumentId`.
- Same ApplicationDocument imported twice creates no duplicate.
- Duplicate imported source is not allowed.
- Manual StudentDocument records can coexist with imported StudentDocument records.
- Idempotency does not depend on `documentType` only.
- Source document identity, not document type, is the idempotency anchor.

Status and type mapping:

- `ApplicationDocument.documentType` is copied to `StudentDocument.documentType`.
- Source `AdmissionDocumentStatus.COMPLETE` maps to `StudentDocumentStatus.COMPLETE`.
- Other Admissions document statuses map to `StudentDocumentStatus.MISSING`.
- Original source status is preserved as `sourceReviewStatus`.

## 9. File Reuse and Storage Boundary

Final file behavior:

- Import does not copy binary objects.
- Import does not create a new File row.
- Import reuses `ApplicationDocument.fileId` as `StudentDocument.fileId`.
- Import stores `sourceFileId` for lineage.
- Signed URLs are not stored.
- Downloads continue through:

```text
/api/v1/files/:id/download
```

Storage internals remain hidden:

- No bucket in response.
- No objectKey in response.
- No raw signed URL in response.
- No storage provider internals in response.

This matches `SECURITY_MODEL.md`, `ARCHITECTURE_DECISION.md`, and `ENGINEERING_RULES.md`: binary files live in object storage, DB stores metadata, and private downloads are authorized through the Files route.

## 10. Audit and Observability

Audit action:

```text
students.document.import_from_admissions
```

Implementation evidence:

- `src/modules/students/documents/application/import-application-documents.use-case.ts`

Safe audit payload includes:

- `studentId`
- `applicationId`
- selected `applicationDocumentIds`
- resolved `studentDocumentIds`
- `importedCount`
- `skippedCount`
- `source: admissions_application`

Forbidden from audit payload:

- bucket
- objectKey
- raw signed URL
- storage provider internals
- credentials/passwords
- full applicant internals
- sensitive notes as audit content

Audit logs are historical evidence. They are not the current-state source for imported document state. Current import state is queryable from `StudentDocument.sourceApplicationDocumentId` and related source metadata.

## 11. Security, Tenancy, and No-Leak Review

| Boundary | Final behavior | Evidence |
|---|---|---|
| School scope | Target Student, Application, ApplicationDocument, and File must all be same-school. | Repository transaction filters by `schoolId`; security tests cover cross-school ids. |
| Staff-only access | Route requires authenticated school scope and permissions. | `StudentDocumentsController.importFromApplication`; `@RequiredPermissions('students.documents.manage', 'admissions.documents.view')`. |
| Applicant access | Blocked. | `test/security/tenancy.admissions-document-import.spec.ts`. |
| Parent access | Blocked. | `test/security/tenancy.admissions-document-import.spec.ts`. |
| Student access | Blocked. | `test/security/tenancy.admissions-document-import.spec.ts`. |
| Cross-school student id | Safe not-found behavior. | Security test: cross-school student id cannot import. |
| Cross-school application id | Safe not-found behavior. | Security test: cross-school application id cannot import. |
| Cross-school application document id | Safe not-found behavior. | Security test: cross-school ApplicationDocument id cannot import. |
| Storage internals | Not exposed. | Presenter returns safe StudentDocument output; tests assert no bucket/objectKey/raw signed URL. |
| Signed URLs | Not returned or stored by import. | Response uses `/api/v1/files/:id/download`; Files module generates signed URL on authorized download. |
| Audit payload | Safe summary only. | Import use case audit payload excludes notes/storage/applicant internals. |

No global guard changes were made.

No `schoolScope` changes were made.

No Applicant Portal, Parent App, or Student App files were changed for this feature.

## 12. Applicant / Parent / Student Boundary

Final identity boundary:

- Applicant remains `UserType.APPLICANT`.
- Applicant does not receive a school membership.
- Applicant is not linked to `Guardian.userId`.
- Applicant is not linked to `Student.userId`.
- Applicant Portal behavior is unchanged.
- Parent App visibility is unchanged.
- Student App visibility is unchanged.

Import does not mutate:

- Applicant identity
- Applicant membership
- `Application.status`
- `registrationState`
- Parent App access chain
- Student App access chain

Parent App visibility still requires the existing operational chain:

```text
Parent user + active membership + Guardian.userId + StudentGuardian + active Student + active Enrollment
```

Student App visibility still requires:

```text
Student user + active membership + Student.userId + active Student + active Enrollment
```

Imported StudentDocuments are not exposed to Parent App or Student App by ADM-REG-DOC-1B.

## 13. Test and Verification Coverage

Unit coverage:

- `src/modules/students/documents/tests/student-documents.use-case.spec.ts`

Verified behaviors:

- import selected ApplicationDocument into StudentDocument;
- duplicate selected ids are normalized;
- already imported source returns skipped;
- unregistered target rejects import;
- missing/mismatched source rejects safely;
- unavailable source file rejects;
- audit event is written safely;
- response does not expose storage internals.

Focused e2e:

- `test/e2e/admissions-document-import-to-student-document.e2e-spec.ts`

Verified behaviors:

- staff registers an accepted application;
- handoff preview remains read-only and does not import documents;
- staff imports a selected ApplicationDocument;
- response includes imported StudentDocument and source metadata;
- source metadata is persisted;
- repeat import is idempotent;
- `Application.status` remains `ACCEPTED`;
- `registrationState` remains derived and registered;
- response does not expose storage internals.

Focused security:

- `test/security/tenancy.admissions-document-import.spec.ts`

Verified behaviors:

- cross-school application id cannot import;
- cross-school student id cannot import;
- cross-school ApplicationDocument id cannot import;
- missing `students.documents.manage` is forbidden;
- Applicant actor cannot import;
- Parent actor cannot import;
- Student actor cannot import.

Regression suites reported passing in ADM-REG-DOC-1B closeout:

- `test/e2e/admissions-flow.e2e-spec.ts`
- `test/e2e/admissions-registration-submit.e2e-spec.ts`
- `test/e2e/school-registration-wizard.e2e-spec.ts`
- `test/security/tenancy.admissions.spec.ts`
- `test/security/tenancy.admissions-registration-submit.spec.ts`
- `test/security/tenancy.school-registration.spec.ts`

Verification reported in ADM-REG-DOC-1B:

- `npx prisma validate` passed.
- `npx prisma generate` passed.
- `npx prisma migrate deploy` applied migration `20260629120000_0047_adm_reg_doc_1b_student_document_source_metadata`.
- `npm run build` passed.
- Focused Students documents unit tests passed: 2 suites / 8 tests.
- New import e2e passed: 1 suite / 1 test.
- New import security suite passed: 1 suite / 7 tests.
- Admissions flow regression passed: 1 suite / 3 tests.
- Admissions registration submit regression passed: 1 suite / 3 tests.
- School registration wizard regression passed: 1 suite / 1 test.
- Admissions tenancy regression passed: 1 suite / 36 tests.
- Admissions registration submit tenancy regression passed: 1 suite / 6 tests.
- School registration tenancy regression passed: 1 suite / 6 tests.

Full repository test suite was not run for ADM-REG-DOC-1B and is not required for ADM-REG-DOC-1C because this sprint is documentation-only.

## 14. Known Limitations

- Imported source metadata is persisted but not exposed on all StudentDocument list/detail responses.
- Import response exposes the minimum safe source object; broad source metadata UI exposure remains deferred.
- Document type mapping is narrow: source `ApplicationDocument.documentType` becomes target `StudentDocument.documentType`.
- Source review status mapping is conservative: `COMPLETE` becomes StudentDocument `COMPLETE`; other statuses become `MISSING`, while the original source status is preserved.
- Document acceptance is not a new blocking rule for import or registration.
- No binary copy / snapshot copy is implemented.
- No bulk historical import job is implemented.
- No Parent App document visibility is implemented.
- No Student App document visibility is implemented.
- No admin repair tooling exists for source document drift.

## 15. Deferred Backlog

| Backlog item | Why deferred | Recommended owner sprint | Priority | Risk |
|---|---|---|---|---|
| Expose imported-source metadata on StudentDocument list/detail | Import response has source metadata, but regular StudentDocument presenter remains backward-compatible. | `STU-DOC-1A - StudentDocument Source Metadata Exposure` | Medium | Low/Medium: staff may need traceability outside the import result. |
| Duplicate manual StudentDocument policy by document type | Manual docs can coexist with imported docs; no product rule blocks same type. | Students documents policy sprint | Low | Medium if UI assumes one document per type. |
| Document type mapping refinement | Current mapping copies source type directly. | Admissions/Students document taxonomy sprint | Low | Medium if controlled document taxonomy becomes required. |
| Document acceptance blocking policy | Current implementation does not require accepted/complete documents only. | Admissions document review policy sprint | Low | Medium if schools expect only accepted evidence to import. |
| Copy-on-import storage policy | Current policy reuses `File.id`; independent file snapshots need retention/legal decision. | Files retention/legal policy sprint | Low | High if implemented casually. |
| Parent/Student App document visibility | Imported docs remain school staff records only. | Parent/Student document visibility decision sprint | Medium | High for privacy if exposed without rules. |
| Bulk historical import | Current feature is selected, staff-confirmed, per registered student. | Data migration decision sprint | Low | High if automated without source/idempotency review. |
| Admin repair tools for document source drift | No automated repair for missing source files or deleted evidence after import. | Admin data repair sprint | Low | Medium for edge cases. |

## 16. Recommended Next Sprint Decision

| Option | Name | Why | Risk | Recommended now? |
|---|---|---|---|---:|
| Option A | Close ADM-REG-DOC track only | The V1 backend document import boundary is implemented and verified. | Low | Yes, as the closeout decision. |
| Option B | StudentDocument source metadata UI exposure | Useful if staff needs source metadata beyond the import response. | Low/Medium | Not immediately; only after frontend/staff need is confirmed. |
| Option C | Parent/Student App document visibility decision | Determines whether imported documents become app-visible. | High privacy/access risk. | No; requires separate decision. |
| Option D | `STU-PROF-1A - Student Profile / Avatar / Self-Service Audit` | Student profile/avatar/self-service was repeatedly deferred and is outside ADM-REG-DOC. | Low as audit. | Yes, as safest next feature/audit track. |
| Option E | Post-registration decision mutation guard | Useful Admissions workflow hardening. | Medium workflow risk. | Not before Student profile/self-service audit unless product prioritizes Admissions policy. |

Final recommendation:

```text
ADM-REG-DOC track is complete for V1 backend purposes.
Do not continue expanding Admissions document import immediately.
Recommended next sprint: STU-PROF-1A - Student Profile / Avatar / Self-Service Audit.
```

Reason:

ADM-REG and ADM-REG-DOC now cover the complete staff-controlled path from accepted application to operational student registration and optional selected document import. Remaining work is either UI traceability, visibility policy, retention policy, bulk migration, or unrelated Student self-service/profile behavior. Student profile/avatar/self-service should be audited as its own module track.

## 17. Explicit Do-Not-Do List

- Do not add automatic import during registration submit.
- Do not add import side effects to handoff preview.
- Do not bulk migrate historical documents without separate approval.
- Do not expose bucket, objectKey, or raw signed URLs.
- Do not make Applicant users able to import StudentDocument records.
- Do not make Parent users able to import StudentDocument records.
- Do not make Student users able to import StudentDocument records.
- Do not infer document visibility from `Application.status`.
- Do not mutate `Application.status` because documents were imported.
- Do not mutate `registrationState` because documents were imported.
- Do not convert Applicant to Parent.
- Do not convert Applicant to Student.
- Do not create Applicant membership.
- Do not automatically link Applicant user to `Guardian.userId`.
- Do not automatically link Applicant user to `Student.userId`.
- Do not expose imported StudentDocuments to Parent/Student Apps without a dedicated decision.
- Do not copy binary files by default without retention/legal decision.
- Do not use audit logs as the primary current-state source for imported documents.

## 18. Final Verdict

```text
ADM_REG_DOC_1C_DOCUMENT_IMPORT_FINAL_CLOSEOUT_READY
```

The ADM-REG-DOC track is complete for V1 backend purposes. The locked decision was implemented, verified with focused unit/e2e/security coverage, and bounded by clear no-leak, tenancy, identity, storage, and lifecycle rules. No unresolved product decision blocks closing this track.
