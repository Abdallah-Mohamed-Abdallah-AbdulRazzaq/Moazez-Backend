# ADM-REG-DOC-1A — Admissions Documents to Student Documents Decision Lock

## 1. Executive Summary

ADM-REG-DOC-1A locks the V1 document boundary after Admissions source-bound registration.

Current runtime behavior keeps three document concepts separate:

- `ApplicantAdmissionRequestDocument` is Applicant Portal intake evidence.
- `ApplicationDocument` is school-side Admissions evidence attached to an Admissions Application.
- `StudentDocument` is an operational Students module record attached to a Student.

Accepted application registration does not create `StudentDocument` rows today. The handoff preview only returns safe `ApplicationDocument` summaries. Source-bound registration creates Student, Guardian, StudentGuardian, Enrollment, and optional account links through the school registration wizard, but it does not import or copy Applicant/Application documents.

Locked V1 decision:

```text
Option B — Staff-Confirmed Import After Registration
```

Do not import documents during registration submit. Do not import documents during handoff preview. A future staff-only, post-registration action may import selected `ApplicationDocument` records into `StudentDocument`, after the application is registered and the same-school `Student.applicationId` link exists.

The future import must be school-scoped, staff-confirmed, source-idempotent, audited, and no-leak. It must preserve source metadata and must not affect Applicant identity, `Application.status`, `registrationState`, Parent App visibility, Student App visibility, or storage access rules.

Recommended next sprint:

```text
ADM-REG-DOC-1B — Staff-Confirmed Admissions Document Import to StudentDocument
```

## 2. Source Evidence Reviewed

Decision and closeout documents:

- `docs/sprint-adm-reg-1e-accepted-applicant-conversion-audit-handoff-expansion.md`
- `docs/sprint-adm-reg-1f-accepted-application-handoff-to-wizard-implementation-closeout.md`
- `docs/sprint-adm-reg-1g-accepted-application-source-bound-registration-submit-closeout.md`
- `docs/sprint-adm-reg-1h-post-registration-admissions-closure-audit-decision-lock.md`
- `docs/sprint-adm-reg-1i-admissions-registered-state-exposure-closeout.md`
- `docs/sprint-adm-reg-1j-admissions-registration-flow-final-closeout-audit.md`
- `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`

Governance documents:

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

Runtime evidence:

- `prisma/schema.prisma`
- `src/modules/files/**`
- `src/infrastructure/storage/**`
- `src/modules/applicant-portal/**`
- `src/modules/admissions/documents/**`
- `src/modules/admissions/applications/**`
- `src/modules/admissions/applications/presenters/application-registration-handoff.presenter.ts`
- `src/modules/students/documents/**`
- `src/modules/students/students/**`
- `src/modules/students/registration/**`
- `src/modules/parent-app/**`
- `src/modules/student-app/**`

Test evidence:

- `test/e2e/admissions-flow.e2e-spec.ts`
- `test/e2e/admissions-registration-submit.e2e-spec.ts`
- `test/e2e/school-registration-wizard.e2e-spec.ts`
- `test/e2e/files-upload-download.e2e-spec.ts`
- `test/e2e/files-attachments-preview.e2e-spec.ts`
- `test/security/tenancy.admissions.spec.ts`
- `test/security/tenancy.admissions-registration-submit.spec.ts`
- `test/security/tenancy.school-registration.spec.ts`
- `src/modules/admissions/applications/tests/application-registration-handoff.use-case.spec.ts`
- `src/modules/admissions/documents/tests/application-documents.use-case.spec.ts`
- `src/modules/admissions/documents/tests/application-document-review.use-case.spec.ts`
- `src/modules/students/documents/tests/student-documents.use-case.spec.ts`
- `src/modules/students/documents/tests/student-document.presenter.spec.ts`
- `src/modules/files/uploads/tests/file-record.presenter.spec.ts`

## 3. Current Document Model Map

`prisma/schema.prisma` defines separate models for Applicant Portal documents, Admissions documents, Student documents, shared file metadata, and generic attachments.

`ApplicantAdmissionRequestDocument` stores applicant-owned intake document metadata. It belongs to an applicant admission request, applicant user, school, organization, optional required document, optional bridged `ApplicationDocument`, and a `File`.

`ApplicationDocument` stores Admissions application document evidence. It belongs to school, application, file, and may have linked applicant request documents.

`StudentDocument` stores operational student record documents. It belongs to school, student, file, document type, status, and notes. It currently has no source lineage fields such as `sourceApplicationDocumentId`, `importedAt`, or `importedBy`.

`File` stores object storage metadata. The binary lives in S3/MinIO-compatible object storage; the database stores bucket, object key, name, MIME type, size, checksum, visibility, and ownership metadata.

`Attachment` is a generic resource/file link. It is not a StudentDocument and should not be confused with Admissions document migration.

| Model / Concept | Module owner | Current purpose | Created by | Visible to | Can become StudentDocument today? | Decision |
|---|---|---|---|---|---:|---|
| `ApplicantAdmissionRequestDocument` | Applicant Portal | Pre-admission intake evidence uploaded by applicant. | Applicant Portal upload/replace flows. | Owning Applicant through Applicant Portal; school staff indirectly after bridging. | No | Keep as applicant-owned source evidence. |
| `ApplicationDocument` | Admissions | School-side document evidence attached to an application. | Admissions document routes or Applicant Portal submit bridge. | School staff with Admissions document/handoff access. | No | Eligible future import source after registration. |
| `StudentDocument` | Students | Durable operational student record document. | Students document CRUD. | School staff with Students document access. | N/A | Remains Students-owned target record. |
| `File` | Files | Object storage metadata and secure download anchor. | File upload and domain-specific upload flows. | Only through authorized module presenters/download routes. | Not itself | Future import may reuse `File.id` if retention/access rules are safe. |
| `Attachment` | Files | Generic file link to a resource. | Files attachments routes. | Staff routes with file attachment permissions. | No | Not a StudentDocument migration mechanism. |
| Homework submission attachment | Homework / Student App | Academic workflow proof or submission attachment. | Homework/student app flows. | Student/teacher/parent academic contexts as implemented. | No | Out of ADM-REG-DOC import scope. |
| Student avatar/profile media | Student Profile future scope | Profile or self-service media. | Not implemented as ADM-REG behavior. | Not applicable in this sprint. | No | Separate Student Profile policy, not StudentDocument import. |

## 4. Current Runtime Behavior

Applicant Portal document routes are in `src/modules/applicant-portal/controller/applicant-portal.controller.ts`:

- `POST /api/v1/applicant-portal/requests/:requestId/documents`
- `GET /api/v1/applicant-portal/requests/:requestId/documents`
- `GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId`
- `GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId/download`
- `POST /api/v1/applicant-portal/requests/:requestId/documents/:documentId/replacements`
- `DELETE /api/v1/applicant-portal/requests/:requestId/documents/:documentId`

These routes use route-local Applicant Portal access, applicant ownership checks, and signed download URL generation. Applicant document presenters expose safe file metadata, not storage internals.

Admissions document routes are in `src/modules/admissions/documents/controller/application-documents.controller.ts`:

- `GET /api/v1/admissions/applications/:applicationId/documents`
- `POST /api/v1/admissions/applications/:applicationId/documents`
- `POST /api/v1/admissions/applications/:applicationId/documents/:documentId/accept`
- `POST /api/v1/admissions/applications/:applicationId/documents/:documentId/reject`
- `POST /api/v1/admissions/applications/:applicationId/documents/:documentId/request-replacement`
- `DELETE /api/v1/admissions/applications/:applicationId/documents/:documentId`

Admissions document creation validates the application and scoped file, then creates or updates an `ApplicationDocument`. Applicant Portal submit bridges applicant documents into `ApplicationDocument` records. Applicant documents with `UPLOADED` status bridge to `PENDING_REVIEW`; accepted applicant documents bridge to `COMPLETE`, as documented in ADM-REG-1E.

Registration handoff preview is in `src/modules/admissions/applications/presenters/application-registration-handoff.presenter.ts`. It returns safe `ApplicationDocument` summaries:

- `applicationDocumentId`
- `documentType`
- `status`
- `notes`
- `source`
- `file.id`
- `file.originalName`
- `file.mimeType`
- `file.sizeBytes`

It does not return bucket, object key, signed URL, or download URL.

Students document routes are in `src/modules/students/documents/**`:

- `GET /api/v1/students-guardians/students/:studentId/documents`
- `GET /api/v1/students-guardians/students/:studentId/documents/missing`
- `POST /api/v1/students-guardians/students/:studentId/documents`
- `PATCH /api/v1/students-guardians/documents/:documentId`
- `DELETE /api/v1/students-guardians/documents/:documentId`

StudentDocument creation validates the Student, validates or uploads a file, then creates or updates a `StudentDocument` by student/document type. It does not consume `ApplicationDocument` or `ApplicantAdmissionRequestDocument` source ids.

Files download behavior is in `src/modules/files/uploads/controller/uploads.controller.ts` and `src/modules/files/uploads/application/get-file-download-url.use-case.ts`. The API route is:

```text
GET /api/v1/files/:id/download
```

It authorizes through file scope, loads scoped file metadata, and returns a short-lived signed URL. Signed URLs are generated on demand and are not stored in document records.

| Route / Flow | Module | Document type touched | Side effects | Storage internals exposed? | Decision |
|---|---|---|---|---:|---|
| Applicant Portal document upload/list/download/replace/delete | Applicant Portal | `ApplicantAdmissionRequestDocument` + `File` | Upload/replace can create files; delete soft-deletes applicant doc. | No | Remains applicant-owned intake flow. |
| Admissions application documents | Admissions | `ApplicationDocument` + `File` | Create/update/review/delete Admissions evidence. | No | Remains Admissions evidence flow. |
| Registration handoff preview | Admissions Applications | `ApplicationDocument` summaries | Read-only; no document mutation. | No | Evidence summary only. |
| Admissions source-bound register submit | Admissions Applications / Students Registration | None directly | Creates operational registration records, not documents. | No | Must remain document-import-free. |
| School registration wizard | Students Registration | None directly | Creates Student/Guardian/Enrollment and optional accounts. | No | Must remain document-import-free. |
| Student documents CRUD | Students Documents | `StudentDocument` + `File` | Creates/updates/deletes StudentDocument records. | No | Current operational student document flow. |
| File download | Files | `File` | Generates short-lived signed download URL after auth. | Redirect only; no bucket/object key in API body | Future import must continue using authorized download paths. |

## 5. Registration Boundary Findings

Current registration behavior:

- Handoff preview does not create `StudentDocument`.
- Source-bound register submit does not create `StudentDocument`.
- School registration wizard does not create `StudentDocument`.
- Applicant request documents are not copied to Student documents.
- Application documents are not copied to Student documents.
- No object storage copy occurs during registration.
- No file metadata duplication occurs during registration.

ADM-REG-1G deliberately limits registration submit to the school-controlled wizard flow. The only source-bound registration marker is `Student.applicationId`, set internally from the trusted route application id. ADM-REG-1H and 1I then derive `registrationState` from that link. None of these steps alter document ownership.

This separation is correct. Document import requires its own policy for classification, source metadata, idempotency, deletion, retention, and access. It should not be smuggled into registration submit.

## 6. Security and File Access Boundary

Document visibility today:

- Applicant users can access their own applicant request documents only through Applicant Portal ownership checks.
- School staff can access `ApplicationDocument` through Admissions document routes and handoff summaries when authorized.
- School staff can access `StudentDocument` through Students document routes when authorized.
- Parent App does not receive Admissions documents or StudentDocuments through ADM-REG.
- Student App does not receive Admissions documents or StudentDocuments through ADM-REG.
- Applicant Portal cannot access StudentDocument.

File access today:

- `File` contains bucket and object key internally.
- Presenters return safe metadata, such as file id, original name, MIME type, size, checksum where appropriate, and visibility where already part of staff contracts.
- Download URLs are regenerated per authorized request.
- Signed URLs are not stored in document rows.
- Bucket and object key are not returned by document presenters or handoff.

Future import must require current school scope. It must validate:

- the application belongs to current school scope;
- `registrationState.registered = true`, or equivalently a same-school Student exists with `Student.applicationId = Application.id`;
- the selected `ApplicationDocument` belongs to the same application and school;
- the target Student is the same source-bound registered Student;
- the source file is still scoped, present, and not deleted;
- the actor has Students document management permission, and any required Admissions source permission if the use case reads Admissions evidence directly.

## 7. Decision Options

| Option | Summary | Pros | Cons | Decision |
|---|---|---|---|---|
| Option A | No migration; `ApplicationDocument` remains Admissions evidence forever and `StudentDocument` stays manual. | Safest; no schema change; no storage ambiguity; clean module boundary. | Staff may re-upload documents already collected during Admissions. | Rejected as too manual for V1 usefulness, but acceptable fallback if import is not prioritized. |
| Option B | Staff-confirmed import after registration. Staff selects `ApplicationDocument` records to import into `StudentDocument`. | Best balance; explicit staff control; keeps registration focused; supports idempotency and audit. | Requires future endpoint, schema metadata, duplicate handling, and UI. | Locked V1 decision. |
| Option C | Automatic import during registration submit. | Fastest UX; Student record immediately has admission docs. | High risk: implicit classification, pending evidence import, duplicates, module boundary blur, broader register transaction. | Rejected. |
| Option D | Link-only derived Student UI shows Admissions docs via `Student.applicationId`, without StudentDocument rows. | No duplication; preserves evidence source. | Blurs module boundaries; risky for Parent/Student visibility; confusing retention/deletion. | Rejected. |
| Option E | Snapshot copy with new File row and storage object copy. | Strong separation and independent retention. | Storage duplication, object copy complexity, background job needs, cost/audit overhead. | Deferred; not V1 default. |

## 8. Locked V1 Decision

ADM-REG-DOC-1A locks Option B:

```text
Staff-Confirmed Import After Registration
```

Locked rules:

1. No automatic `StudentDocument` creation during registration submit.
2. No `StudentDocument` creation during handoff preview.
3. `ApplicationDocument` remains Admissions evidence until staff explicitly imports it.
4. `StudentDocument` remains owned by the Students module.
5. Future import must be staff-confirmed and post-registration only.
6. Future import must require `registrationState.registered = true`, or the equivalent same-school `Student.applicationId` link.
7. Future import must be source-idempotent.
8. Future import must preserve source metadata.
9. Future import must not copy binary objects by default.
10. Future import may reuse existing `File` metadata only after validating same-school scope, file availability, and retention safety.
11. Future import must not expose bucket, object key, raw signed URL, or storage internals.
12. Future import must not affect Applicant identity, `Application.status`, `registrationState`, Parent App visibility, or Student App visibility.

The safer owner is the Students module because the durable target record is `StudentDocument`. Admissions provides source evidence; Students owns student records. A future implementation may use a small cross-module application service if needed, but the resulting StudentDocument creation contract should remain Students-owned.

## 9. Future Contract Shape

Recommended future route:

```text
POST /api/v1/students-guardians/students/:studentId/documents/import-from-application
```

Recommended request shape:

```json
{
  "applicationId": "uuid",
  "applicationDocumentIds": ["uuid"],
  "mode": "selected"
}
```

Recommended response shape:

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
        "type": "birth_certificate",
        "status": "complete",
        "uploadedDate": "iso-date",
        "url": "/api/v1/files/{fileId}/download",
        "fileType": "pdf",
        "notes": "..."
      },
      "source": {
        "sourceApplicationId": "uuid",
        "sourceApplicationDocumentId": "uuid",
        "sourceApplicantRequestDocumentId": "uuid-or-null"
      }
    }
  ],
  "skipped": [
    {
      "applicationDocumentId": "uuid",
      "reason": "already_imported"
    }
  ],
  "warnings": []
}
```

Alternative Admissions-launched route:

```text
POST /api/v1/admissions/applications/:id/documents/import-to-student
```

This is not the preferred owner for V1 because it makes Admissions appear to own StudentDocument creation. It may be acceptable later only as a thin orchestration endpoint that delegates to Students-owned import logic.

| Contract area | Locked decision | Reason | Future implementation note |
|---|---|---|---|
| Owner module | Students owns durable `StudentDocument` creation. | StudentDocument is an operational student record. | Use Students documents service/use case; Admissions repository may provide source evidence. |
| Route shape | Prefer `POST /students-guardians/students/:studentId/documents/import-from-application`. | Target resource is StudentDocument for a specific Student. | Body carries `applicationId` and selected `applicationDocumentIds`. |
| Trigger timing | Post-registration only. | Requires source-bound Student link. | Validate `Student.applicationId = applicationId` in same school. |
| Source documents | Selected `ApplicationDocument` rows only. | Admissions evidence is staff-reviewed source. | Applicant request document lineage may be captured through linked source. |
| Target documents | `StudentDocument` rows. | Student documents are the durable operational record. | Preserve current StudentDocument presenter shape. |
| File reuse vs copy | Reuse existing `File` by default if safe; no binary copy. | Avoid storage duplication and object-copy complexity. | Copy-on-import is deferred unless retention rules require it. |
| Source metadata | Required. | Needed for audit, idempotency, and staff traceability. | Requires schema change in future implementation sprint. |
| Idempotency | Source-idempotent by application document and target student. | Repeat import must not create duplicates. | Add unique policy/constraint after schema decision. |
| Permissions | Students document manage plus source read authority. | Operation creates StudentDocument and reads Admissions evidence. | Recommended: `students.documents.manage`; include Admissions view/manage if implementation reads source directly. |
| Audit | Required. | Sensitive student records and file linkage. | Recommended action: `students.document.import_from_admissions`. |
| Parent/Student/App visibility | No change in V1. | Import is school staff record management only. | Do not expose imported docs to Parent/Student apps without separate decision. |
| Deletion/retention | Imports are snapshots of metadata link, not live coupled records. | Source and target lifecycles differ. | Deleting one record must not delete the other by default. |

## 10. Metadata and Idempotency Requirements

Future import requires source metadata not currently present on `StudentDocument`.

| Metadata | Required? | Why | Schema needed later? |
|---|---:|---|---:|
| `sourceApplicationId` | Yes | Identifies the registered Admissions source. | Yes |
| `sourceApplicationDocumentId` | Yes | Primary idempotency and traceability anchor. | Yes |
| `sourceApplicantRequestDocumentId` | Optional | Preserves applicant-upload lineage when the ApplicationDocument came from Applicant Portal. | Yes, nullable |
| `importedAt` | Yes | Staff/audit traceability and UI clarity. | Yes |
| `importedBy` | Yes | Shows which staff actor performed the import. | Yes |
| `sourceDocumentType` | Yes | Captures source classification even if StudentDocument type is edited later. | Yes |
| `sourceReviewStatus` | Recommended | Preserves Admissions review status at import time. | Yes, nullable |
| `sourceNotes` | Optional | Preserves review/import context when safe. | Yes, nullable |
| `originalFileId` | Yes if file reuse is used | Shows the original reused file metadata. | Yes |
| `copiedFileId` | No for V1 default | No binary copy by default. | Only if copy-on-import is chosen later |

Idempotency policy:

- Repeating import for the same `studentId + sourceApplicationDocumentId` must not create a duplicate.
- If a matching imported StudentDocument already exists, return it in `skipped` or `existing`.
- Manual StudentDocument records may coexist with imported records unless a future product decision forbids duplicate document types.
- Duplicate document types should not block source-idempotent import by default; staff may intentionally preserve both a manual student document and imported Admissions evidence.
- A future unique constraint should use source lineage, not only `studentId + documentType`, because multiple sources can share the same type.

Deletion and retention policy:

- Deleting an imported StudentDocument must not delete the source ApplicationDocument.
- Deleting an ApplicationDocument must not delete an imported StudentDocument.
- Deleting either record must not delete the shared `File` by default while another record references it.
- Imported StudentDocument should be treated as a snapshot/link to evidence at import time, not a live view of Admissions state.
- Application evidence retention and Student record retention may diverge; future retention policy must be explicit.

## 11. Audit and Observability Requirements

Future import must write a safe audit event.

Recommended action:

```text
students.document.import_from_admissions
```

Recommended module/resource:

```text
module: students
resourceType: student_document_import
resourceId: target student id or import batch id
```

Allowed audit payload fields:

- `studentId`
- `applicationId`
- `applicationDocumentIds`
- `studentDocumentIds`
- `importedCount`
- `skippedCount`
- `source: admissions_application`

Do not audit:

- bucket
- object key
- signed URL
- raw applicant user id unless a future audit policy explicitly requires it
- password or credential data
- full document notes if they may contain sensitive PII

Audit logs are historical evidence. They must not become the primary current-state source for whether a document was imported; source metadata on StudentDocument should be the query source.

## 12. No-Leak Rules

Future import responses must not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `deletedAt`
- `passwordHash`
- `bucket`
- `objectKey`
- raw signed URL
- storage provider internals
- applicant user internals
- raw RequestContext actor ids

Allowed for authorized school staff:

- `applicationId`
- `applicationDocumentId`
- `studentId`
- `studentDocumentId`
- `fileId`
- file original name
- MIME type
- size
- document type
- document status
- safe source markers
- authorized download path such as `/api/v1/files/:id/download`

Signed URLs must continue to be generated per authorized download request. They must not be stored in StudentDocument, ApplicationDocument, or import metadata.

## 13. Test Strategy For Future Implementation

| Test area | Required scenario | Expected result |
|---|---|---|
| Staff import | Staff can import selected docs after registration. | Creates StudentDocument rows with safe response. |
| Registration gate | Unregistered application cannot import. | Safe conflict/not-found response; no StudentDocument created. |
| Tenancy | Cross-school import returns safe not-found. | No source/target details leak. |
| Idempotency | Repeat import is idempotent. | No duplicates; existing/skipped result returned. |
| No leak | Storage internals not exposed. | Response omits bucket/objectKey/raw signed URL. |
| Applicant access | Applicant cannot import. | Forbidden/unauthorized; no side effects. |
| Parent access | Parent cannot import. | Forbidden; no side effects. |
| Student access | Student cannot import. | Forbidden; no side effects. |
| Application lifecycle | `Application.status` remains accepted. | No status mutation. |
| Source metadata | StudentDocument source metadata preserved. | Source ids/importedAt/importedBy are queryable. |
| Delete target | Deleting StudentDocument does not delete ApplicationDocument. | Source evidence remains. |
| Delete source | Deleting ApplicationDocument does not break imported StudentDocument. | Imported record remains safe and readable. |

Additional regression tests:

- Handoff preview remains read-only.
- Source-bound register submit remains document-import-free.
- Public school registration wizard remains document-import-free.
- Parent App and Student App do not gain document visibility through import unless separately scoped.
- Shared `File` record cannot be imported across school boundaries.

## 14. Deferred Backlog

- Implement staff-confirmed import endpoint/use case.
- Add source metadata fields to `StudentDocument` or a dedicated StudentDocument source table.
- Decide exact unique constraint for source-idempotent import.
- Decide whether imported document notes should copy Admissions review notes or use import notes only.
- Decide whether document type mapping needs a controlled vocabulary.
- Decide whether accepted application documents must be accepted before import.
- Decide copy-on-import policy if retention/legal requirements demand independent file objects.
- Decide Parent App / Student App visibility for StudentDocument records.
- Decide historical backfill/import of already registered applications.
- Decide admin repair tooling for imported document source drift.

## 15. Explicit Do-Not-Do List

- Do not create StudentDocument during registration submit.
- Do not create StudentDocument during handoff preview.
- Do not make the school registration wizard consume documents.
- Do not automatically copy ApplicantAdmissionRequestDocument into StudentDocument.
- Do not automatically copy ApplicationDocument into StudentDocument.
- Do not copy binary objects in storage by default.
- Do not add source metadata fields without a migration sprint.
- Do not use `Attachment` as a substitute for StudentDocument import.
- Do not expose bucket, objectKey, raw signed URLs, or storage internals.
- Do not make document import available to Applicant, Parent, or Student users.
- Do not change Applicant identity.
- Do not create Applicant membership.
- Do not mutate `Application.status`.
- Do not mutate `registrationState`.
- Do not change Parent App or Student App visibility.
- Do not bulk migrate historical documents without a separate approved scope.

## 16. Recommended Next Sprint

Recommended next sprint:

```text
ADM-REG-DOC-1B — Staff-Confirmed Admissions Document Import to StudentDocument
```

Type:

```text
Focused implementation sprint
```

Scope:

- Add staff-only post-registration import action.
- Accept selected `ApplicationDocument` ids.
- Validate same-school application, registered Student, selected source documents, and scoped file metadata.
- Create Students-owned `StudentDocument` records.
- Persist source metadata.
- Enforce source-idempotency.
- Return safe StudentDocument response.
- Write safe audit event.
- Add focused unit/e2e/security tests.
- Add closeout document.

Non-goals:

- No Applicant-to-Parent conversion.
- No Applicant membership creation.
- No automatic import during registration submit.
- No handoff-preview side effects.
- No Student avatar upload.
- No Parent/Student App document visibility.
- No `Application.status` mutation.
- No storage internals exposure.
- No broad historical bulk migration.
- No document acceptance blocking policy unless explicitly locked before implementation.

Dependency:

ADM-REG-DOC-1B should include or be preceded by a schema decision for source metadata. Current `StudentDocument` does not have enough lineage fields to implement traceable, idempotent import safely.

## 17. Final Verdict

```text
ADM_REG_DOC_1A_DOCUMENT_DECISION_LOCK_READY
```

The current runtime matches the intended boundary: Admissions documents are evidence, StudentDocuments are operational student records, and registration does not import or copy documents. V1 should implement staff-confirmed post-registration import later, with Students owning the durable StudentDocument creation contract and Admissions supplying source evidence. Automatic import during registration is rejected.
