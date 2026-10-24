# ADR-0018: Homework and Grades asset relations foundation

## Status and authority

ST-05 implementation authorized by the Planning Authority on 2026-10-24;
proposed for independent Backend review. Source base is
`0d89519008879e393822a22f246224c5388a3cb0`. This Mini-ADR is written **before
Prisma schema changes**. ADR-0013 retains File lifecycle authority; ADR-0017
retains the disabled Assessment Media release boundary. No API, binding workflow,
Production migration, scanner, physical deletion, or ST-06 authority is inferred.

## Source findings and classification

| Issue | Classification | Source / resolution |
| --- | --- | --- |
| Exact parent identities and School keys | RESOLVED_BY_EXISTING_SCHEMA | HomeworkQuestion, GradeAssessmentQuestion, GradeAssessment, HomeworkSubmissionAnswer and GradeSubmissionAnswer already expose unique (id, schoolId) |
| Managed File School key | RESOLVED_BY_EXISTING_SCHEMA | File has unique (id, schoolId); nullable File.schoolId stays unchanged |
| Five consumer families | ADDITIVE_CHANGE | New separate domain tables, inverse relations, school/soft-delete registrations |
| Conflicting source combinations | DATABASE_CONSTRAINT | Explicit source CHECKs, required exact parent, composite File FK |
| Reparenting/source identity | DATABASE_CONSTRAINT | New-table binding identity is immutable; replacements create a new row and soft-delete the old row, preserving its File reference |
| Live File linking | RESOLVED_BY_EXISTING_SCHEMA | Reuse public.enforce_live_file_reference('file_id') in five additional triggers; do not change the historical function |
| Retained reference inventory | ADDITIVE_CHANGE | Five globally checked consumers; no soft-delete exclusion; upload session remains provenance only |
| Existing rows and public behavior | RESOLVED_BY_EXISTING_SCHEMA | No DML/backfill, no new required legacy columns, no HTTP/controller/presenter changes |
| Runtime privileges | DATABASE_CONSTRAINT | Existing migration owner/default privileges; no new grants, no SECURITY DEFINER or PUBLIC function EXECUTE |
| Actor/student authorization and upload eligibility | RESOLVED_BY_EXISTING_SCHEMA | Outside the FK claim; future domain binder must prove them using existing authorization and ST-03 evidence |

There is no unresolved DECISION_REQUIRED issue. A later need for a wider URL
representation, new privileges, destructive lifecycle or different binding
identity policy requires its own authorized change; this ADR does not grant it.

## Entity relationship matrix

| Asset family / physical table | Exact parent / scalar | School FK | Managed File FK | Source contract | Retention |
| --- | --- | --- | --- | --- | --- |
| HomeworkQuestionAsset / homework_question_assets | HomeworkQuestion / homeworkQuestionId | (parentId, schoolId) -> parent(id, schoolId), plus School(id) | (fileId, schoolId) -> File(id, schoolId) | MANAGED_FILE or EXTERNAL_HTTPS | Any persisted File reference, including soft-deleted row |
| GradeAssessmentQuestionAsset / grade_assessment_question_assets | GradeAssessmentQuestion / questionId | Composite, plus School(id) | Composite | MANAGED_FILE or EXTERNAL_HTTPS | Same conservative rule |
| GradeAssessmentAsset / grade_assessment_assets | GradeAssessment / assessmentId | Composite, plus School(id) | Composite | MANAGED_FILE or EXTERNAL_HTTPS | Same conservative rule |
| HomeworkAnswerAsset / homework_answer_assets | HomeworkSubmissionAnswer / homeworkSubmissionAnswerId | Composite, plus School(id) | Composite, required | MANAGED_FILE only | Same rule, including historical answers |
| GradeSubmissionAnswerAsset / grade_submission_answer_assets | GradeSubmissionAnswer / answerId | Composite, plus School(id) | Composite, required | MANAGED_FILE only | Same rule, including historical answers |

All parent/File/School/creator delete and key-update actions are Restrict.
HomeworkAnswerAsset never refers to a fictitious HomeworkAnswer model. An answer
asset cannot become an assignment-wide attachment or a Grades answer asset.
The exact answer supplies its ancestry; no duplicate assignment, target,
assessment, question, submission or student IDs are added. A same-school FK is
structural identity, **not proof of student authorization**. Existing parent
ancestry rules are neither rewritten nor newly claimed as this stage's work.

## Row shape and indexes

Each row has a generated UUID, non-null School and exact parent, createdByUserId,
sourceType, category, optional bounded title/description, nonnegative sortOrder,
createdAt/updatedAt, and deletedAt. Category records IMAGE/AUDIO/VIDEO/DOCUMENT/
OTHER as descriptive classification; it does not attest detected MIME, malware
safety, READY status or upload purpose. No storage coordinates or verification
claims are copied into the consumer row. The stable File UUID remains the
retained physical identity; authoritative File/upload provenance stays separate.

Use nonunique (schoolId, parentId, deletedAt, sortOrder, id) for scoped stable
parent lists, (fileId, schoolId) for physical FK/global retention lookup and a
creator index. These cover the actual FKs without redundant standalone School
indexes. Duplicate historical links and tied display order are permitted; id
breaks ties. No speculative partial/natural uniqueness or redundant (id,schoolId)
index is added to these new leaf tables.

## Managed Files and external references

Shared new enums describe source and resource category. A managed row requires
fileId and forbids externalUrl. An external row requires externalUrl and null
fileId. Managed-only answer tables have no externalUrl field and CHECK their
sourceType to MANAGED_FILE. Neither/both combinations fail at the database.
A global File with null schoolId cannot satisfy the non-null composite FK.
An external link never creates a fake File or contributes consumer retention.

The database's external representation is deliberately conservative: bounded
canonical ASCII HTTPS URL, ordinary DNS hostname, no userinfo, IP literal,
nonpublic/reserved host suffix, port, query, fragment, percent encoding, whitespace or backslash;
reject known GCS/S3/MinIO provider host forms and generic protected File-download
paths. Query-free representation rejects signed capability parameters, including
encoded query-key tricks, without pretending to parse arbitrary remote policy.
This is a storage invariant, not approval of remote content. It performs no DNS
lookup/fetch and cannot identify every custom provider hostname or secret in an
opaque URL path. Future binders must reuse ST-02's existing content/URL policy,
including configured provider endpoints, and impose domain/resource approval.
No new application URL validator or weaker public write path is introduced.
Wider external URL support can be separately reviewed before a binding API ships.
Existing ST-04 MEDIA metadata/text semantics are untouched and are not converted.

## Binding identity, provenance, soft deletion and lifetime

Row ID/creation time, School, exact parent, creator and source identity (sourceType/File/external URL)
are immutable for the lifetime of a new asset row. A new SECURITY INVOKER,
pg_catalog-search-path trigger compares only these new-table identity columns;
it does not read or guess Homework/Grades submission enums or implement runtime
lifecycle authorization. Display metadata/order and deletedAt remain mutable.
This prevents coordinated School/parent/File moves and silent retargeting of a
historical reference. Replacement is append-and-soft-delete; the old managed
File remains retained. It also preserves creation provenance. CreatedBy is a
global User FK and does not prove School membership or permission.

Register all five models in SCHOOL_SCOPED_MODELS and SOFT_DELETE_MODELS because
all five actually contain deletedAt. Keep the retained-reference helper globally
keyed by File UUID, including unexpected corrupt cross-school references. Add no
School filter, no soft-delete exclusion and no cleanup worker. Preserve all 21
existing consumer predicates byte-for-byte; FileUploadSession remains excluded.
Prisma DMMF and actual FK catalogs should derive 27 physical relations, of which
26 are retained consumers and one is upload provenance, if these are the only
five additions. Tests must prove the totals rather than assume them.

Reuse five BEFORE INSERT OR UPDATE OF file_id live-reference triggers. Existing
cleanup uses the File serialization lock plus a current retained-reference
check; test both lock orderings with real PostgreSQL barriers. The existing
function and all 22 historical triggers remain unchanged. Linking to a retired
File fails; identity retargeting also fails. These are not general authority to
retire Files or delete objects. Direct fixture teardown on an owned disposable
DB is distinct from any future product retention/deletion policy.

## Future binder and authorization boundary

Before any future public binding, the owning Homework/Grades use case must prove
actor, live membership, School, operation permission, allocation/target/student,
exact parent ancestry, mutable domain state and authoritative upload purpose,
creator, private File identity, technical/security evidence and READY eligibility.
A File FK proves none of these. Final transaction validation/locking must be
used. Immutable asset identity does not stop metadata edits after submission;
that lifecycle policy remains future application work. Historical review and
Parent visibility likewise require resource authorization, not general Files
permissions. No endpoint, signed capability or release switch is added here.

## Migration ordering, privileges and compatibility

Prefer one Prisma-generated additive migration: new enums/tables/indexes/FKs,
then the CHECKs, immutable-binding function/triggers and five live-File triggers.
Enums are new and consumed in newly created tables; no existing enum is extended.
Review every generated/custom statement before its first application. Use the
repository migration creator's real timestamp. Update the exact-byte artifact
manifest and PostgreSQL custom-SQL inventory. Do not edit any of the 30 merged
migration SQL files. No backfill, UPDATE/DELETE of old data, old index/key change,
new required legacy column or preexisting File mutation is needed.

New tables/functions are owned by the established migration role in the governed
role harness. Existing runtime DML/default privileges apply; do not add grants,
DDL, ownership, role membership or SECURITY DEFINER. Revoke PUBLIC execution on
the new trigger function; installation/invocation uses existing PostgreSQL
trigger semantics, not runtime trigger-creation authority. Update the privilege
harness's exact function inventory narrowly and verify ownership, fixed search
path, invoker semantics and absence of direct PUBLIC/runtime execution grants.

Full empty disposable PostgreSQL replay, status, seed, second no-op deploy,
old-row preservation fingerprints, catalog tests and role-harness checks are
mandatory. Capture historical SQL/schema hashes before edits. No shared,
retired Staging or Production database is an implementation target. Deployment
requires a later Owner-approved migration job/artifact/backup/data-authority
checkpoint and operator review of FK lock acquisition; this stage performs none.

## Rejected alternatives and recovery

- Generic polymorphic entityType/entityId: loses actual parent and tenant FKs.
- Bare File UUID: permits cross-school/unscoped File links.
- Duplicated ancestry: creates disagreement without a needed query benefit.
- Cascade deletion or soft-delete reference exclusion: loses historical evidence.
- Mutable binding identity: silently erases retained provenance or reparents data.
- Guessing submission state in SQL: breaks differing Homework/Grades lifecycles.
- Fake external-link Files, copied READY/scanning claims or URL fetch: wrong trust.
- Activating endpoints/uploads/scanning/physical cleanup: exceeds ST-05 authority.
- Destructive rollback/backfill/history rewrite: violates migration governance.

An unused source migration may be adjusted only before first application. After
application, preserve its bytes and use an approved compatible forward fix or
isolated restore; never reset/resolve drift, rewrite history or drop existing
records to recover. Any drift, checksum mismatch, reset request, P3009, data-loss
warning, unexpected history, high-impact lock concern or new privilege need is
a hard stop requiring specific evidence and Owner decision.

## Verification plan

For each family prove valid parent/File/creator/timestamps/order/category,
cross-school and null-School File denial, nonexistent/wrong-family parent and
File denial, source combinations, owner/source reparent denial, soft-delete
retention and parent/File Restrict. Assert exact migrated FKs/checks/indexes,
27 live-reference triggers and invoker/privilege metadata. Cover global retained
reference SQL/DMMF parity, upload provenance exclusion, existing consumers and
both deterministic cleanup/link schedules. Record before/after legacy rows and
replay/no-op evidence. Preserve ST-01/02/03/04, Generic Files/Academic Content,
School scope and soft-delete regressions. Run build/postbuild, exact-base
non-fixing lint comparison and complete exact-head CI. No independent reviewer
receipt or subsequent-stage approval is self-issued.
