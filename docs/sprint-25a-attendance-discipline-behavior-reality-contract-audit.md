# Sprint 25A — Attendance / Discipline / Behavior Reality & Contract Audit

## 1. Executive Decision

Overall classification: PARTIAL.

Attendance classification: PARTIAL, with a strong normalized core already present. Policies, roll-call sessions, entries, derived absence incidents, excuse requests, and reports exist. The largest confirmed gaps are route drift from the dashboard ADR, missing convenience/context and absence-correction routes, Student/Parent attendance timelines, Teacher App DAILY-only mapping, and a security-relevant closed-term enforcement gap for mutations against already-created roll-call sessions.

Behavior classification: CORE COMPLETE, APP-FACING PARTIAL. Core Behavior has category lifecycle, record lifecycle, review queue, approve/reject workflow, point ledger creation, and dashboard summaries. Student and Parent app behavior read models are safe and useful, but they expose only approved positive/negative behavior records plus attendance counters; they do not yet provide the ADR mixed record feed containing attendance, absence, and lateness records.

Discipline classification: MISSING_FORMAL_LAYER and NEEDS_PRODUCT_DECISION. No Discipline module, routes, Prisma models, enums, or write source were found. Current Discipline language appears as dashboard/report intent, most visibly `disciplinePercentage` in Parent Reports. Discipline should not be implemented as a duplicate write source in V1.

Implementation sprints are required before this feature family can be closed. The safe next step is Sprint 25B, focused on Attendance Core Contract Closeout and the closed-term write-protection finding. Sprint 25C should follow for absence correction contracts if product confirms those dashboard flows. Student/Parent discipline timelines should wait for a product/backend contract decision.

Feature family safe to close now: No.

## 2. Architectural Separation Decision

Approved architectural split:

Attendance is the source of truth for attendance states and attendance incidents. It owns present, absent, late, excused, early leave, unmarked, roll-call sessions, attendance entries, absence/lateness/early-leave incidents derived from entries, excuse requests and approvals, policies, and reports.

Behavior is the source of truth for intentional/manual behavior records and points. It owns positive/negative records, behavior categories, draft/submitted/approved/rejected/cancelled state transitions, review queue, approve/reject workflow, point ledger entries, and app-safe behavior read models.

Discipline should be treated as a derived/read/analytics layer. In V1, it should combine Attendance incidents plus approved Behavior records when product needs a discipline timeline, discipline percentage, dashboard KPI, or app-facing discipline summary.

Discipline should not duplicate writes in V1 because:

- Attendance already owns absence, lateness, early-leave, excused/unexcused evidence.
- Behavior already owns intentional conduct records and reviewed point outcomes.
- A third write model would create conflicting sources of truth for the same student-facing consequence.
- V1 scope favors modular-monolith composition/read models over new parallel domains unless the product explicitly approves a new domain.

## 3. Source Material Reviewed

Governance and closeout docs reviewed:

- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE_DECISION.md`
- `SECURITY_MODEL.md`
- `DOMAIN_GLOSSARY.md`
- `DIRECTORY_STRUCTURE_VISUAL.md` as the available directory guide; `DIRECTORY_STRUCTURE.md` was not present.
- `MODULES.md`
- `USER_TYPES.md`
- `V1_SCOPE.md`
- `PRISMA_CONVENTIONS.md`
- `ENGINEERING_RULES.md`
- `API_CONTRACT_RULES.md`
- `ERROR_CATALOG.md`
- `TESTING_STRATEGY.md`
- `docs/sprint-24d-student-grades-exams-security-closeout.md`

ADR and frontend handoff docs reviewed:

- `adr/ADR-0001-multi-tenancy-enforcement.md`
- `adr/ADR-0002-behavior-core-module-boundary.md`
- `adr/ADR-0003-applicant-portal-pre-admission-account-boundary.md`
- `adr/School-Dashboard/sis_dashboard-attendance_backend_handoff_spec.md`
- `adr/School-Dashboard/sis_dashboard-school-dashboard-api-handoff.md`
- `adr/Teacher-App/teacher_CLASSROOM_BACKEND_MODELS.md`
- `adr/Student-App/student_BEHAVIOR_BACKEND_MODEL.md`
- `adr/Parent-App/parent_behavior.md`
- `adr/Parent-App/parent_reports.md`
- Additional repo docs found by search for attendance, absence, excuse, discipline, behavior, conduct, violations, incidents, parent reports, and teacher classroom attendance, especially prior sprint audits for Teacher App, Student App, Parent App, dashboard foundation, and final closeouts.

Backend modules and folders inspected:

- `src/modules/attendance/attendance.module.ts`
- `src/modules/attendance/attendance-context.ts`
- `src/modules/attendance/policies/**`
- `src/modules/attendance/roll-call/**`
- `src/modules/attendance/absences/**`
- `src/modules/attendance/excuses/**`
- `src/modules/attendance/reports/**`
- `src/modules/behavior/**`
- `src/modules/teacher-app/access/**`
- `src/modules/teacher-app/classroom/**`
- `src/modules/teacher-app/classroom/attendance/**`
- `src/modules/student-app/access/**`
- `src/modules/student-app/behavior/**`
- `src/modules/student-app/progress/**`
- `src/modules/student-app/home/**`
- `src/modules/parent-app/shared/**`
- `src/modules/parent-app/access/**`
- `src/modules/parent-app/behavior/**`
- `src/modules/parent-app/reports/**`
- `src/modules/parent-app/progress/**`
- `src/modules/parent-app/home/**`
- `src/modules/dashboard/**`

Prisma and tenant-scope material inspected:

- `prisma/schema.prisma`
- `src/infrastructure/database/school-scope.extension.ts`

Tests and security/e2e files inspected:

- Attendance unit tests under `src/modules/attendance/**/tests/**`
- Behavior unit tests under `src/modules/behavior/**/tests/**`
- Teacher classroom attendance tests under `src/modules/teacher-app/classroom/attendance/tests/**`
- Student behavior/progress/home/access tests under `src/modules/student-app/**/tests/**`
- Parent behavior/reports/progress/access tests under `src/modules/parent-app/**/tests/**`
- `test/security/tenancy.attendance.spec.ts`
- `test/security/tenancy.behavior.spec.ts`
- `test/security/tenancy.teacher-app.spec.ts`
- `test/security/tenancy.student-app.spec.ts`
- `test/security/tenancy.parent-app.spec.ts`
- `test/security/tenancy.dashboard.spec.ts`
- `test/e2e/attendance-foundation.e2e-spec.ts`
- `test/e2e/attendance-excuses-corrections.e2e-spec.ts`
- `test/e2e/behavior-foundation.e2e-spec.ts`
- `test/e2e/teacher-app-final-closeout.e2e-spec.ts`
- `test/e2e/teacher-app-classroom-operations.e2e-spec.ts`
- `test/e2e/student-app-final-closeout.e2e-spec.ts`
- `test/e2e/parent-app-final-closeout.e2e-spec.ts`
- Dashboard foundation e2e tests.

## 4. Prisma Reality Matrix

| Model/enum | Purpose | Source-of-truth area | Exists? | Key security/tenancy fields | Notes/gaps |
|---|---|---:|---:|---|---|
| `AttendanceScopeType` | SCHOOL/STAGE/GRADE/SECTION/CLASSROOM scope hierarchy. | Attendance | Yes | Scope is materialized through ids and keys on session/policy. | Matches dashboard ADR hierarchy. |
| `AttendanceMode` | DAILY/PERIOD session mode. | Attendance | Yes | Session mode with optional period fields. | Teacher App currently uses DAILY only. |
| `AttendanceStatus` | PRESENT/ABSENT/LATE/EXCUSED/EARLY_LEAVE/UNMARKED. | Attendance | Yes | Stored on `AttendanceEntry`. | Core supports EARLY_LEAVE; Teacher App does not expose it. |
| `AttendanceSessionStatus` | DRAFT/SUBMITTED. | Attendance | Yes | Stored on `AttendanceSession`. | Derived incidents/reports read submitted sessions only. |
| `AttendanceExcuseStatus` | PENDING/APPROVED/REJECTED/CANCELLED. | Attendance | Yes | Stored on `AttendanceExcuseRequest`. | Lifecycle present. |
| `AttendancePolicy` | Attendance policy by school/year/term/scope/mode/date range. | Attendance | Yes | `schoolId`, `academicYearId`, `termId`, scope ids, `deletedAt`. | Tenant-scoped and soft-deletable; policy writes guard closed terms. |
| `AttendanceSession` | Roll-call session for a date/scope/mode/period. | Attendance | Yes | `schoolId`, `academicYearId`, `termId`, scope ids, `submittedById`, `deletedAt`. | Unique natural key supports idempotent resolve. Existing-session writes need closed-term recheck. |
| `AttendanceEntry` | Per-student attendance status within a session. | Attendance | Yes | `schoolId`, `sessionId`, `studentId`, `enrollmentId`, `markedById`. | Normalized source for absence/late/early-leave incidents. No `deletedAt`, intentionally entry-state based. |
| `AttendanceExcuseRequest` | Excuse lifecycle and decision metadata. | Attendance | Yes | `schoolId`, `academicYearId`, `termId`, `studentId`, `createdById`, `decidedById`, `deletedAt`. | Approval applies matching submitted entries to EXCUSED. Attachments are external files. |
| `AttendanceExcuseRequestSession` | Join between excuse request and sessions it affects. | Attendance | Yes | `schoolId`, request id, session id. | Records linked sessions for approved excuses. |
| `BehaviorRecordType` | POSITIVE/NEGATIVE manual behavior type. | Behavior | Yes | Used by categories and records. | Does not include attendance/absence/lateness. That is correct for source-of-truth separation. |
| `BehaviorSeverity` | LOW/MEDIUM/HIGH/CRITICAL. | Behavior | Yes | Stored on categories/records. | Core behavior severity exists. |
| `BehaviorRecordStatus` | DRAFT/SUBMITTED/APPROVED/REJECTED/CANCELLED. | Behavior | Yes | Stored on `BehaviorRecord`. | Lifecycle implemented. |
| `BehaviorPointLedgerEntryType` | AWARD/PENALTY/REVERSAL point movement. | Behavior | Yes | Stored on `BehaviorPointLedger`. | Used for approved behavior outcomes. |
| `BehaviorCategory` | School-level behavior category defaults. | Behavior | Yes | `schoolId`, `createdById`, `metadata`, `deletedAt`. | Category lifecycle exists; no term dimension. |
| `BehaviorRecord` | Manual behavior record and review state. | Behavior | Yes | `schoolId`, `academicYearId`, `termId`, `studentId`, `enrollmentId`, actor ids, `metadata`, `deletedAt`. | Core presenter exposes review internals for admin/dashboard use. App presenters do not. |
| `BehaviorPointLedger` | Immutable-ish point movement for approved behavior. | Behavior | Yes | `schoolId`, `academicYearId`, `termId`, `studentId`, `enrollmentId`, `recordId`, `actorId`, `metadata`. | Approval transaction gates ledger creation through submitted-state transition; no separate Discipline ledger. |
| Discipline models/enums | Separate discipline write source. | Discipline-derived | No | None. | Correct absence for V1 unless product approves a new source. |
| Conduct/violation/sanction models | Possible duplicate discipline concepts. | Discipline-derived | No | None. | No duplicated write source found. |
| Report fields using `disciplinePercentage` | Parent-facing derived percentage. | Discipline-derived | Partial | Derived from child-owned attendance/behavior progress adapter. | Current formula is attendance-present percentage over present/absent/late, not a formal Discipline layer. |

All Attendance and Behavior models above are included in the school-scope extension. Soft-delete scope applies to `AttendancePolicy`, `AttendanceSession`, `AttendanceExcuseRequest`, `BehaviorCategory`, and `BehaviorRecord`.

## 5. School Dashboard / Core Attendance Audit

### Policies

Expected from ADR: policy CRUD, effective policy resolution, policy name validation, SCHOOL/STAGE/GRADE/SECTION/CLASSROOM hierarchy, date ranges, scope validation, and closed-term write rejection.

Actual backend routes:

- `GET /api/v1/attendance/policies`
- `GET /api/v1/attendance/policies/effective`
- `GET /api/v1/attendance/policies/validate-name`
- `POST /api/v1/attendance/policies`
- `PATCH /api/v1/attendance/policies/:id`
- `DELETE /api/v1/attendance/policies/:id`

Actual backend logic:

- Controllers are permission-gated with `attendance.policies.view` and `attendance.policies.manage`.
- Policy domain validates normalized scope and parent hierarchy.
- Effective policy resolution uses scope candidates and priority from CLASSROOM down to SCHOOL.
- Create/update/delete call term writability checks and reject closed terms.
- Repository uses `prisma.scoped` and soft delete.

Classification: COMPLETE.

Gaps: None material for V1. Route prefix is `/api/v1/` as required.

Security notes: Good tenancy posture, closed-term write protection present, permissions present, and no Prisma in controllers.

### Roll Call Sessions

Expected from ADR: roster, resolve-or-create session, list sessions, session detail, submit, unsubmit, idempotent session resolution, scope validation, roster generation, and closed-term write rejection.

Actual backend routes:

- `GET /api/v1/attendance/roll-call/roster`
- `POST /api/v1/attendance/roll-call/session/resolve`
- `GET /api/v1/attendance/roll-call/sessions`
- `GET /api/v1/attendance/roll-call/sessions/:id`
- `POST /api/v1/attendance/roll-call/sessions/:id/submit`
- `POST /api/v1/attendance/roll-call/sessions/:id/unsubmit`

Actual backend logic:

- Resolve validates context, academic year, term, date, scope, mode, period key, and parent hierarchy.
- Resolve returns existing sessions idempotently and creates new sessions through a unique natural key.
- Roster is generated from active enrollments for the selected attendance scope.
- Submit/unsubmit write audit logs.
- Absence/report readers consume only submitted sessions.

Classification: PARTIAL and ROUTE_DRIFT.

Gaps:

- ADR examples use `/attendance/roster`, `/attendance/sessions/resolve`, `/attendance/sessions/:id`, and similar routes; backend-native routes are nested under `/attendance/roll-call`.
- Closed-term write protection is enforced during new session resolution, but existing session mutations can proceed through save/submit/unsubmit/correct without a visible term-active recheck in the use cases inspected.

Security notes: Tenancy, permissions, scope validation, and safe session ownership are strong. Closed-term mutation protection should be fixed before closing Attendance.

### Roll Call Entries

Expected from ADR: bulk update, single update/upsert, correction on submitted entries, student/enrollment validation against roster, and status support for present/absent/late/excused/early leave/unmarked where applicable.

Actual backend routes:

- `PUT /api/v1/attendance/roll-call/sessions/:id/entries`
- `PUT /api/v1/attendance/roll-call/sessions/:id/entries/:studentId`
- `POST /api/v1/attendance/roll-call/sessions/:sessionId/entries/:studentId/correct`

Actual backend logic:

- Bulk save requires draft sessions and validates student/enrollment against the session roster.
- Submitted session correction is supported through the core entry correction endpoint.
- Correction rejects `UNMARKED`, requires minutes for LATE and EARLY_LEAVE, clears incident fields when correcting to PRESENT/ABSENT, and audits corrections.
- Teacher App maps only present/absent/late/excused to core status.

Classification: COMPLETE for core entry storage and validation, PARTIAL for contract convenience and closed-term recheck.

Gaps:

- ADR expected `PATCH /attendance/entries/upsert`; backend uses session-scoped `PUT`.
- No absence-row convenience correction endpoints exist.
- Existing-session entry mutations need closed-term enforcement.

Security notes: Student/enrollment roster validation is present. Direct dashboard entry writes are permission-gated. Closed-term gap remains.

### Absences/Incidents

Expected from ADR: absence/lateness/early-leave incidents derived from submitted attendance entries, list, summary, and dashboard correction endpoints for excuse and early leave.

Actual backend routes:

- `GET /api/v1/attendance/absences`
- `GET /api/v1/attendance/absences/summary`

Actual backend logic:

- Absence incidents are derived from `AttendanceEntry` rows in submitted sessions.
- Incident statuses include ABSENT, LATE, EARLY_LEAVE, and EXCUSED.
- PRESENT and UNMARKED are excluded.
- Repository filters by submitted sessions and tenant scope.

Classification: PARTIAL.

Gaps:

- `PATCH /api/v1/attendance/absences/:id/excuse` is missing.
- `PATCH /api/v1/attendance/absences/:id/early-leave` is missing.
- Corrections can be made through entry correction and excuse approval flows, but the absence dashboard contract convenience routes are not present.

Security notes: Read path is tenant-scoped and submitted-session-only. Missing write endpoints should update source AttendanceEntry/session, not create absence records.

### Excuse Requests

Expected from ADR: list, detail, create, update, delete/cancel, approve/reject, attachments, matching submitted entry application, and optional validation/KPI convenience routes.

Actual backend routes:

- `GET /api/v1/attendance/excuse-requests`
- `GET /api/v1/attendance/excuse-requests/:id`
- `GET /api/v1/attendance/excuse-requests/:id/attachments`
- `POST /api/v1/attendance/excuse-requests`
- `PATCH /api/v1/attendance/excuse-requests/:id`
- `POST /api/v1/attendance/excuse-requests/:id/attachments`
- `POST /api/v1/attendance/excuse-requests/:id/approve`
- `POST /api/v1/attendance/excuse-requests/:id/reject`
- `DELETE /api/v1/attendance/excuse-requests/:id/attachments/:attachmentId`
- `DELETE /api/v1/attendance/excuse-requests/:id`

Actual backend logic:

- Pending-only update/delete/review checks exist.
- Date range and term validation exist.
- LATE and EARLY_LEAVE request types require selected periods and positive minutes.
- Attachment requirement is enforced by policy when applicable.
- Approval applies matching submitted entries to EXCUSED and links sessions.
- Rejection does not mutate attendance entries.
- Audit logging exists for create/update/cancel/attachment/review flows.

Classification: COMPLETE with DEFERRED_OPTIONAL convenience gaps.

Gaps:

- Optional ADR routes such as `POST /attendance/excuse-requests/validate` and excuse KPI endpoints are not present.

Security notes: Strong tenancy, closed-term protection, attachment safety, and audit posture. Attachments expose safe file download references, not raw bucket/object key data.

### Reports

Expected from ADR: attendance summary, daily trend, scope breakdown, submitted-session-derived counts, incident counts.

Actual backend routes:

- `GET /api/v1/attendance/reports/summary`
- `GET /api/v1/attendance/reports/daily-trend`
- `GET /api/v1/attendance/reports/scope-breakdown`

Actual backend logic:

- Reports aggregate AttendanceEntry rows from submitted sessions.
- Counts include status totals and incident counts.
- Scope breakdown and daily trend are implemented and tested.

Classification: COMPLETE for current core reporting.

Gaps:

- ADR-mentioned dashboard-specific KPI shortcuts are not all present, but current report routes cover the normalized report needs.

Security notes: Report reads are tenant-scoped and permission-gated with `attendance.reports.view`.

### Context/Convenience APIs

Expected from ADR: optional `GET /api/v1/attendance/context` to share active year/term/readonly context.

Actual backend routes: none found.

Actual backend logic: `attendance-context.ts` resolves request context for use cases, but no public context endpoint exists.

Classification: MISSING but DEFERRED_OPTIONAL.

Gaps: `GET /api/v1/attendance/context` absent.

Security notes: If implemented, it should expose only app-safe academic/term/scope context and never raw membership/role internals.

## 6. School Dashboard / Core Behavior Audit

### Categories

Expected from scope/docs: behavior category lifecycle, active/inactive state, positive/negative compatibility, default severity/points.

Actual backend routes:

- `GET /api/v1/behavior/categories`
- `GET /api/v1/behavior/categories/:categoryId`
- `POST /api/v1/behavior/categories`
- `PATCH /api/v1/behavior/categories/:categoryId`
- `DELETE /api/v1/behavior/categories/:categoryId`

Actual backend logic:

- Category creation/update validate type/default points compatibility.
- Delete is soft-delete and blocks in-use categories.
- Controllers are permission-gated.
- Audit logging exists for create/update/delete.

Classification: COMPLETE.

Gaps: None found for V1.

Security notes: Tenant-scoped repository; no Prisma in controller.

### Records

Expected from scope/docs/ADR-0002: core Behavior owns manual positive/negative records, not XP or attendance; lifecycle includes draft, submit, cancel, review later.

Actual backend routes:

- `GET /api/v1/behavior/records`
- `GET /api/v1/behavior/records/:recordId`
- `POST /api/v1/behavior/records`
- `PATCH /api/v1/behavior/records/:recordId`
- `POST /api/v1/behavior/records/:recordId/submit`
- `POST /api/v1/behavior/records/:recordId/cancel`

Actual backend logic:

- Create validates academic year, optional term/year match, student/enrollment ownership, active category, occurred date inside term, content, severity, and points/type compatibility.
- Update is draft-only and revalidates category/content/points/date.
- Submit is draft-only.
- Cancel supports draft/submitted and records cancellation metadata.
- Audit logs exist.

Classification: COMPLETE.

Gaps: No formal teacher-safe app wrapper exists; that is app-facing, not core.

Security notes: Dashboard/core presenters include internal actor ids, review notes, and metadata. That is acceptable for admin/dashboard use behind permissions, but these presenters must not be reused for Student/Parent Discipline feeds.

### Submit/Cancel

Expected: state transition enforcement and audit.

Actual backend logic: submit only from DRAFT; cancel from DRAFT/SUBMITTED; approved/rejected/cancelled transitions rejected.

Classification: COMPLETE.

Gaps: None found.

Security notes: Permission split is present: create permission for submit and manage permission for cancel.

### Review Queue

Expected: submitted-record review queue with reviewer authorization.

Actual backend routes:

- `GET /api/v1/behavior/review-queue`
- `GET /api/v1/behavior/review-queue/:recordId`

Actual backend logic:

- Defaults to submitted records unless reviewed records are explicitly included.
- Query validation covers term, enrollment, student, academic year, status, and date filters.

Classification: COMPLETE.

Gaps: None found.

Security notes: Permission-gated with behavior view permission.

### Approve/Reject

Expected: approved records create behavior point ledger entries; rejected records do not.

Actual backend routes:

- `POST /api/v1/behavior/records/:recordId/approve`
- `POST /api/v1/behavior/records/:recordId/reject`

Actual backend logic:

- Approve requires SUBMITTED status and active category.
- Points override is validated against positive/negative type.
- Approval updates the record to APPROVED and creates one BehaviorPointLedger entry in the same transaction.
- Reject updates the record to REJECTED and writes audit without creating ledger points.

Classification: COMPLETE.

Gaps: DB schema does not have a unique index on `BehaviorPointLedger.recordId`, but the submitted-state transition in the approval transaction prevents normal duplicate approval. Keep this as an integrity guardrail to remember if manual backfills or admin repair scripts are added.

Security notes: Review authorization is permission-gated with `behavior.records.review`.

### Behavior Point Ledger

Expected: points separated from XP and tied to approved behavior.

Actual backend logic:

- Ledger entries use AWARD/PENALTY/REVERSAL.
- Student and Parent app progress read from BehaviorPointLedger but keep it separate from XP.
- Tests explicitly assert behavior points are not treated as XP.

Classification: COMPLETE.

Gaps: No separate Discipline ledger should be added.

Security notes: Dashboard/core can inspect ledger-derived summaries; app-facing surfaces expose totals only.

### Dashboard Overview/Student/Classroom Summary

Expected: dashboard summary/read models over behavior records and points.

Actual backend routes:

- `GET /api/v1/behavior/overview`
- `GET /api/v1/behavior/students/:studentId/summary`
- `GET /api/v1/behavior/classrooms/:classroomId/summary`

Actual backend logic:

- Overview, student summary, classroom summary, status summary, point summary, and category rollups exist.
- Filters validate academic year, term, student, classroom, and date range.

Classification: COMPLETE for Behavior dashboard, CONTRACT_DRIFT only if a frontend expects Discipline-labeled KPI contracts here.

Gaps: No formal Discipline KPI contract.

Security notes: Permission-gated. Do not reuse admin response shapes directly in app-facing Discipline timelines.

## 7. Discipline Audit

No module, routes, Prisma models, or enums named Discipline were found. No conduct, violation, sanction, or discipline write model was found. Attendance uses incident language only for derived attendance incidents. Parent Reports exposes `disciplinePercentage`, and dashboard/frontend handoff docs mention violations/incidents as KPI intent, but there is no backend Discipline source of truth.

Current report usage:

- Parent Reports includes `disciplinePercentage` and `discipline_percentage`.
- Current calculation is attendance-present percentage over present/absent/late counts from the child behavior/progress read model.
- This is not yet a formal Discipline read model and does not include approved Behavior records in the percentage.

Where Discipline appears:

- School Dashboard handoff uses violations/incidents as dashboard intent.
- Parent Reports ADR expects a performance report with `discipline_percentage`.
- Student and Parent Behavior ADRs expect mixed behavior feed record types that include attendance, absence, and lateness.

Recommended direction:

- Implement Discipline, if product confirms it, as a derived read layer combining Attendance incidents and approved Behavior records.
- Source data should include submitted Attendance entries with ABSENT/LATE/EARLY_LEAVE/EXCUSED and approved Behavior records with points/review outcome.
- It may expose summaries, timelines, trend/KPI fields, and dashboard/app read models.

What should not be implemented:

- Do not create DisciplineRecord as a duplicate write source in V1.
- Do not copy attendance incidents into a discipline table.
- Do not copy approved behavior records into a discipline table.
- Do not create a separate discipline point ledger.

Classification: MISSING_FORMAL_LAYER and NEEDS_PRODUCT_DECISION.

## 8. Teacher App Audit

### 8.1 Teacher Attendance

Teacher ADR expectation: schedule/classroom attendance contract keyed by `scheduleId`, with a save attendance request supporting present/absent/late/excused and a summary including unmarked/present/absent/late/excused.

Actual backend routes:

- `GET /api/v1/teacher/classroom/:classId/attendance/roster`
- `POST /api/v1/teacher/classroom/:classId/attendance/session/resolve`
- `GET /api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId`
- `PUT /api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/entries`
- `POST /api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/submit`

Actual backend logic:

- `classId` is backed by `TeacherSubjectAllocation.id`, not a timetable schedule id.
- Teacher access validates current user type and owned allocation.
- Allocation relations must match the same school.
- Teacher attendance delegates to core Attendance roll-call use cases.
- Session scope is CLASSROOM and mode is DAILY.
- Roster and mutations validate students against the owned classroom roster.
- Response presenter intentionally omits `schoolId` and `scheduleId`.

Classification: PARTIAL, ROUTE_DRIFT, and CONTRACT_DRIFT.

Gaps:

- No durable `scheduleId` attendance contract exists yet.
- No period attendance through Teacher App.
- `early_leave` is not a Teacher App accepted status.
- `arrivalTime` and `dismissalTime` DTO fields exist on input/output, but adapter currently ignores them and presenter returns null.
- Teacher App inherits the core closed-term mutation gap when acting on existing Attendance sessions.

Security notes:

- Teacher allocation ownership is strong and tested for same-school unowned and cross-school allocation denial.
- Teacher cannot read a guessed cross-school attendance session through the owned-class wrapper.
- No leak tests assert absence of `schoolId` and `scheduleId`.

### 8.2 Teacher Behavior / Discipline

Teacher-safe Behavior/Discipline write/read wrappers were not found under Teacher App. Teacher-facing classes include behavior placeholders such as null behavior summaries/alerts, and XP/task modules explicitly avoid Behavior point mutation.

Classification: DEFERRED_OPTIONAL and NEEDS_PRODUCT_DECISION.

If Teacher App must create behavior records, it should be a teacher-safe wrapper around core Behavior records with allocation plus roster ownership. If Teacher App must expose discipline, it should read the future derived Discipline layer and not create separate discipline writes.

## 9. Student App Audit

### 9.1 Student Attendance

Independent Student App attendance routes were not found. Attendance appears through Student behavior/progress summaries, using submitted attendance entries for the current enrollment.

Actual related routes:

- `GET /api/v1/student/behavior`
- `GET /api/v1/student/behavior/summary`
- `GET /api/v1/student/progress/behavior`
- `GET /api/v1/student/home`

Classification: PARTIAL and MISSING for independent attendance timeline/read routes.

Security notes:

- `StudentAppAccessService` enforces current user type STUDENT, active membership, linked active student, active enrollment, and requested academic-year/term match.
- Reads use `prisma.scoped`.

### 9.2 Student Behavior

Student Behavior ADR expected records: attendance, absence, lateness, positive, negative.

Actual backend routes:

- `GET /api/v1/student/behavior`
- `GET /api/v1/student/behavior/summary`
- `GET /api/v1/student/behavior/:recordId`

Actual backend logic:

- Query type enum accepts only positive/negative.
- Visible status is only approved.
- List/detail read `BehaviorRecord` with `BehaviorRecordStatus.APPROVED`.
- Summary includes attendanceCount, absenceCount, latenessCount from submitted Attendance entries.
- Summary includes positive/negative counts and BehaviorPointLedger totals.
- Records are positive/negative behavior records only.

Classification: PARTIAL and CONTRACT_DRIFT.

Verified:

- Summary includes attendance counts.
- Records are positive/negative only.
- Attendance/absence/lateness records are missing from the record feed.
- Current-student ownership is enforced.
- Only approved behavior records are shown.
- No-leak posture is safe in tests and presenters: app responses omit school/organization/membership/role/deleted/storage/review internals.

Security notes:

- The app presenter does not expose `reviewedById`, review notes, metadata, school ids, organization ids, storage object keys, or raw file metadata.

### 9.3 Student Discipline

Recommended direction needs product decision:

- Option A: extend `/api/v1/student/behavior` into an ADR-compatible mixed feed while keeping core Behavior as positive/negative only.
- Option B: create `/api/v1/student/discipline` read routes as the derived Attendance + approved Behavior layer.

Classification: NEEDS_PRODUCT_DECISION.

Preferred backend posture: create a formal derived layer if product wants Discipline terminology. Do not overload core Behavior with attendance writes. If compatibility pressure is high, a mixed `/student/behavior` read model can be implemented as adapter-backed composition, but it must be documented as a read model.

## 10. Parent App Audit

### 10.1 Parent Attendance

Independent Parent App attendance routes were not found. Attendance appears through Parent Behavior summaries, Parent Progress behavior, Parent Reports attendance section, and Parent Home summaries.

Actual related routes:

- `GET /api/v1/parent/children/:studentId/behavior`
- `GET /api/v1/parent/children/:studentId/behavior/summary`
- `GET /api/v1/parent/children/:studentId/progress/behavior`
- `GET /api/v1/parent/children/:studentId/reports`
- `GET /api/v1/parent/children/:studentId/reports/summary`

Classification: PARTIAL and MISSING for independent child attendance timeline/read routes.

Security notes:

- Parent App is current-school only.
- `ParentAppAccessService` enforces current user type PARENT, active membership, guardian records in active school, linked active child, and active enrollment.

### 10.2 Parent Behavior

Parent Behavior ADR expected records: attendance, absence, lateness, positive, negative. ADR route examples include `/children/{child_id}/behavior/records`.

Actual backend routes:

- `GET /api/v1/parent/children/:studentId/behavior`
- `GET /api/v1/parent/children/:studentId/behavior/summary`
- `GET /api/v1/parent/children/:studentId/behavior/:recordId`

Actual backend logic:

- Query type enum accepts only positive/negative.
- Visible status is only approved.
- Reads require linked-child ownership before behavior queries.
- List/detail read approved Behavior records.
- Summary includes attendanceCount, absenceCount, latenessCount from submitted Attendance entries for the child enrollment.
- Records are positive/negative behavior records only.

Classification: PARTIAL, ROUTE_DRIFT, and CONTRACT_DRIFT.

Verified:

- Linked-child ownership is enforced.
- Only approved behavior records are exposed.
- Attendance summary exists.
- Mixed attendance/behavior records are missing.
- Route drift exists: backend-native list route is `/behavior`; ADR expected `/behavior/records`.
- App presenter omits `reviewedById`, review notes, metadata, tenant ids, and raw storage metadata.

### 10.3 Parent Reports

Parent Reports ADR expected: `GET /children/{child_id}/reports/performance`, performance report, behavior score/highlights, attendance fields, and `discipline_percentage`.

Actual backend routes:

- `GET /api/v1/parent/children/:studentId/reports`
- `GET /api/v1/parent/children/:studentId/reports/summary`

Actual backend logic:

- Reports compose child profile, academic progress, behavior progress, attendance counts, and XP.
- List returns a current-term performance card.
- Summary returns period, academic, behavior, attendance, XP, and unavailable sections.
- Attendance summary has present/absence/late counts.
- `disciplinePercentage` exists and is calculated as present / (present + absent + late).

Classification: PARTIAL and ROUTE_DRIFT.

Gaps:

- No `/reports/performance` route exists.
- `disciplinePercentage` is attendance-derived and does not represent a formal Discipline layer combining Attendance + approved Behavior.
- No product-approved source alignment for discipline score exists.

Security notes:

- Linked-child ownership is enforced before reports reads.
- Tests assert no school/organization/storage fields leak.

### 10.4 Parent Discipline

Recommended direction:

- Create a derived child discipline timeline/summary only after product chooses a contract.
- Combine Attendance incidents and approved Behavior records.
- Keep Parent Reports `disciplinePercentage` aligned with that chosen definition.
- Do not create duplicate Discipline writes.

Classification: NEEDS_PRODUCT_DECISION.

## 11. Route Inventory Matrix

| Surface | Module | Method | Route | Exists? | Backend-native purpose | Frontend/ADR expected route if different | Classification | Security owner model | Notes |
|---|---|---:|---|---:|---|---|---|---|---|
| Core/Dashboard | Attendance | GET | `/api/v1/attendance/policies` | Yes | List policies. | Same concept. | COMPLETE | Dashboard permission + school scope | `attendance.policies.view`. |
| Core/Dashboard | Attendance | GET | `/api/v1/attendance/policies/effective` | Yes | Resolve effective policy. | Same concept. | COMPLETE | Dashboard permission + school scope | Uses scope priority. |
| Core/Dashboard | Attendance | GET | `/api/v1/attendance/policies/validate-name` | Yes | Policy name availability. | Same concept. | COMPLETE | Dashboard permission + school scope | Read-only helper. |
| Core/Dashboard | Attendance | POST | `/api/v1/attendance/policies` | Yes | Create policy. | Same concept. | COMPLETE | Dashboard permission + school scope | Closed-term guarded. |
| Core/Dashboard | Attendance | PATCH | `/api/v1/attendance/policies/:id` | Yes | Update policy. | Same concept. | COMPLETE | Dashboard permission + school scope | Closed-term guarded. |
| Core/Dashboard | Attendance | DELETE | `/api/v1/attendance/policies/:id` | Yes | Soft-delete policy. | Same concept. | COMPLETE | Dashboard permission + school scope | Closed-term guarded. |
| Core/Dashboard | Attendance | GET | `/api/v1/attendance/roll-call/roster` | Yes | Roster for scope/date. | `/api/v1/attendance/roster` | ROUTE_DRIFT | Dashboard permission + school scope | Backend-native route is stable. |
| Core/Dashboard | Attendance | POST | `/api/v1/attendance/roll-call/session/resolve` | Yes | Resolve/create idempotent session. | `/api/v1/attendance/sessions/resolve` | ROUTE_DRIFT | Dashboard permission + school scope | New session closed-term guarded. |
| Core/Dashboard | Attendance | GET | `/api/v1/attendance/roll-call/sessions` | Yes | List sessions. | `/api/v1/attendance/sessions` | ROUTE_DRIFT | Dashboard permission + school scope | Read path. |
| Core/Dashboard | Attendance | GET | `/api/v1/attendance/roll-call/sessions/:id` | Yes | Session detail and entries. | `/api/v1/attendance/sessions/:id` and `/entries` | ROUTE_DRIFT | Dashboard permission + school scope | Read path. |
| Core/Dashboard | Attendance | PUT | `/api/v1/attendance/roll-call/sessions/:id/entries` | Yes | Bulk save draft entries. | `/api/v1/attendance/sessions/:id/entries` | ROUTE_DRIFT, SECURITY_GAP | Dashboard permission + roster validation | Needs closed-term recheck. |
| Core/Dashboard | Attendance | PUT | `/api/v1/attendance/roll-call/sessions/:id/entries/:studentId` | Yes | Single entry upsert. | `/api/v1/attendance/entries/upsert` | ROUTE_DRIFT, SECURITY_GAP | Dashboard permission + roster validation | Needs closed-term recheck. |
| Core/Dashboard | Attendance | POST | `/api/v1/attendance/roll-call/sessions/:sessionId/entries/:studentId/correct` | Yes | Correct submitted entry. | Absence correction routes | PARTIAL, SECURITY_GAP | Dashboard permission + school scope | Needs closed-term recheck. |
| Core/Dashboard | Attendance | POST | `/api/v1/attendance/roll-call/sessions/:id/submit` | Yes | Submit draft session. | `/api/v1/attendance/sessions/:id/submit` | ROUTE_DRIFT, SECURITY_GAP | Dashboard permission + school scope | Needs closed-term recheck. |
| Core/Dashboard | Attendance | POST | `/api/v1/attendance/roll-call/sessions/:id/unsubmit` | Yes | Reopen submitted session. | `/api/v1/attendance/sessions/:id/unsubmit` | ROUTE_DRIFT, SECURITY_GAP | Dashboard permission + school scope | Needs closed-term recheck. |
| Core/Dashboard | Attendance | GET | `/api/v1/attendance/absences` | Yes | Derived incident list. | Same concept. | COMPLETE | Dashboard permission + school scope | Submitted sessions only. |
| Core/Dashboard | Attendance | GET | `/api/v1/attendance/absences/summary` | Yes | Derived incident summary. | Similar to KPI. | COMPLETE | Dashboard permission + school scope | Submitted sessions only. |
| Core/Dashboard | Attendance | PATCH | `/api/v1/attendance/absences/:id/excuse` | No | Convenience absence correction. | Expected by attendance ADR. | MISSING | Would be dashboard permission + source entry | Use source AttendanceEntry. |
| Core/Dashboard | Attendance | PATCH | `/api/v1/attendance/absences/:id/early-leave` | No | Convenience early-leave correction. | Expected by attendance ADR. | MISSING | Would be dashboard permission + source entry | Use source AttendanceEntry. |
| Core/Dashboard | Attendance | GET | `/api/v1/attendance/excuse-requests` | Yes | List excuses. | Same concept. | COMPLETE | Dashboard permission + school scope | Read path. |
| Core/Dashboard | Attendance | GET | `/api/v1/attendance/excuse-requests/:id` | Yes | Excuse detail. | Same concept. | COMPLETE | Dashboard permission + school scope | Safe attachment metadata. |
| Core/Dashboard | Attendance | POST | `/api/v1/attendance/excuse-requests` | Yes | Create excuse. | Same concept. | COMPLETE | Dashboard permission + school scope | Closed-term guarded. |
| Core/Dashboard | Attendance | PATCH | `/api/v1/attendance/excuse-requests/:id` | Yes | Update pending excuse. | Same concept. | COMPLETE | Dashboard permission + school scope | Closed-term guarded. |
| Core/Dashboard | Attendance | POST | `/api/v1/attendance/excuse-requests/:id/approve` | Yes | Approve and apply entries. | Same concept. | COMPLETE | Review permission + school scope | Applies matching submitted entries. |
| Core/Dashboard | Attendance | POST | `/api/v1/attendance/excuse-requests/:id/reject` | Yes | Reject. | Same concept. | COMPLETE | Review permission + school scope | No entry mutation. |
| Core/Dashboard | Attendance | POST | `/api/v1/attendance/excuse-requests/:id/attachments` | Yes | Link uploaded files. | Same concept. | COMPLETE | Manage permission + school scope | External storage metadata not exposed raw. |
| Core/Dashboard | Attendance | DELETE | `/api/v1/attendance/excuse-requests/:id/attachments/:attachmentId` | Yes | Remove attachment link. | Same concept. | COMPLETE | Manage permission + school scope | Audited. |
| Core/Dashboard | Attendance | DELETE | `/api/v1/attendance/excuse-requests/:id` | Yes | Cancel/delete pending excuse. | Same concept. | COMPLETE | Manage permission + school scope | Closed-term guarded. |
| Core/Dashboard | Attendance | GET | `/api/v1/attendance/reports/summary` | Yes | Summary report. | Same concept. | COMPLETE | Report permission + school scope | Submitted sessions only. |
| Core/Dashboard | Attendance | GET | `/api/v1/attendance/reports/daily-trend` | Yes | Daily trend. | Same concept. | COMPLETE | Report permission + school scope | Submitted sessions only. |
| Core/Dashboard | Attendance | GET | `/api/v1/attendance/reports/scope-breakdown` | Yes | Scope breakdown. | Same concept. | COMPLETE | Report permission + school scope | Submitted sessions only. |
| Core/Dashboard | Attendance | GET | `/api/v1/attendance/context` | No | Convenience term/scope context. | Expected optional ADR route. | MISSING, DEFERRED_OPTIONAL | Would be dashboard permission + request context | Do only if frontend needs it. |
| Core/Dashboard | Behavior | GET | `/api/v1/behavior/categories` | Yes | List categories. | N/A | COMPLETE | Dashboard permission + school scope | Core source. |
| Core/Dashboard | Behavior | POST | `/api/v1/behavior/categories` | Yes | Create category. | N/A | COMPLETE | Dashboard permission + school scope | Audited. |
| Core/Dashboard | Behavior | PATCH | `/api/v1/behavior/categories/:categoryId` | Yes | Update category. | N/A | COMPLETE | Dashboard permission + school scope | Audited. |
| Core/Dashboard | Behavior | DELETE | `/api/v1/behavior/categories/:categoryId` | Yes | Soft-delete category. | N/A | COMPLETE | Dashboard permission + school scope | Blocks in-use category. |
| Core/Dashboard | Behavior | GET | `/api/v1/behavior/records` | Yes | List records. | N/A | COMPLETE | Dashboard permission + school scope | Admin shape includes internals. |
| Core/Dashboard | Behavior | POST | `/api/v1/behavior/records` | Yes | Create draft record. | N/A | COMPLETE | Dashboard permission + school scope | Validates student/enrollment/term/date. |
| Core/Dashboard | Behavior | PATCH | `/api/v1/behavior/records/:recordId` | Yes | Update draft. | N/A | COMPLETE | Dashboard permission + school scope | Draft-only. |
| Core/Dashboard | Behavior | POST | `/api/v1/behavior/records/:recordId/submit` | Yes | Submit for review. | N/A | COMPLETE | Dashboard permission + school scope | Audited. |
| Core/Dashboard | Behavior | POST | `/api/v1/behavior/records/:recordId/cancel` | Yes | Cancel draft/submitted. | N/A | COMPLETE | Dashboard permission + school scope | Audited. |
| Core/Dashboard | Behavior | GET | `/api/v1/behavior/review-queue` | Yes | Review queue. | N/A | COMPLETE | Dashboard permission + school scope | Submitted by default. |
| Core/Dashboard | Behavior | POST | `/api/v1/behavior/records/:recordId/approve` | Yes | Approve and ledger. | N/A | COMPLETE | Review permission + school scope | Creates BehaviorPointLedger. |
| Core/Dashboard | Behavior | POST | `/api/v1/behavior/records/:recordId/reject` | Yes | Reject. | N/A | COMPLETE | Review permission + school scope | No ledger. |
| Core/Dashboard | Behavior | GET | `/api/v1/behavior/overview` | Yes | Behavior dashboard overview. | N/A | COMPLETE | Dashboard permission + school scope | Core Behavior dashboard. |
| Core/Dashboard | Behavior | GET | `/api/v1/behavior/students/:studentId/summary` | Yes | Student summary. | N/A | COMPLETE | Dashboard permission + school scope | Core dashboard read. |
| Core/Dashboard | Behavior | GET | `/api/v1/behavior/classrooms/:classroomId/summary` | Yes | Classroom summary. | N/A | COMPLETE | Dashboard permission + school scope | Core dashboard read. |
| Core/Dashboard | Discipline | Any | `/api/v1/discipline/*` | No | Formal derived layer. | Dashboard discipline/violations intent. | MISSING_FORMAL_LAYER | Would compose Attendance + Behavior | Needs product decision. |
| Core/Dashboard | Dashboard | GET | `/api/v1/dashboard/summary` | Yes | Dashboard aggregate. | ADR proposed `/dashboard/overview`. | ROUTE_DRIFT | Dashboard permission + school scope | Existing backend-native route is read-only. |
| Core/Dashboard | Dashboard | GET | `/api/v1/dashboard/alerts` | Yes | Dashboard alerts. | N/A | COMPLETE | Dashboard permission + school scope | Attendance alerts include absent entries. |
| Core/Dashboard | Dashboard | GET | `/api/v1/dashboard/activity-feed` | Yes | Audit/activity feed. | N/A | COMPLETE | Dashboard permission + school scope | Includes attendance/behavior events. |
| Teacher App | Attendance | GET | `/api/v1/teacher/classroom/:classId/attendance/roster` | Yes | Owned allocation attendance roster. | Schedule/classroom contract. | ROUTE_DRIFT | Teacher allocation ownership | DAILY only. |
| Teacher App | Attendance | POST | `/api/v1/teacher/classroom/:classId/attendance/session/resolve` | Yes | Resolve DAILY classroom session. | `scheduleId` contract. | CONTRACT_DRIFT | Teacher allocation ownership | No durable schedule id. |
| Teacher App | Attendance | GET | `/api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId` | Yes | Owned session detail. | Schedule attendance detail. | CONTRACT_DRIFT | Teacher allocation ownership | Safe not-found for wrong session. |
| Teacher App | Attendance | PUT | `/api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/entries` | Yes | Update entries. | Save attendance by schedule. | PARTIAL | Teacher allocation + roster ownership | Ignores arrival/dismissal, no early_leave. |
| Teacher App | Attendance | POST | `/api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/submit` | Yes | Submit owned session. | Save/submit schedule attendance. | PARTIAL | Teacher allocation ownership | Inherits core closed-term gap. |
| Teacher App | Behavior | Any | Teacher behavior wrapper | No | Teacher-safe behavior create/read. | Not clearly required in Teacher ADR. | DEFERRED_OPTIONAL | Would need allocation + roster ownership | Product decision. |
| Teacher App | Discipline | Any | Teacher discipline wrapper | No | Teacher-safe derived discipline read/write. | Not clearly required. | NEEDS_PRODUCT_DECISION | Derived read only unless product approves behavior wrapper | No duplicate writes. |
| Student App | Attendance | Any | `/api/v1/student/attendance/*` | No | Independent attendance timeline. | Student ADR expects attendance record types in behavior feed. | MISSING | Current student ownership | Derived counts only today. |
| Student App | Behavior | GET | `/api/v1/student/behavior` | Yes | Approved positive/negative behavior list + summary. | Mixed records in Student ADR. | CONTRACT_DRIFT | Current student ownership | Missing attendance/absence/lateness records. |
| Student App | Behavior | GET | `/api/v1/student/behavior/summary` | Yes | Behavior + attendance counters. | Same concept. | PARTIAL | Current student ownership | Counters present. |
| Student App | Behavior | GET | `/api/v1/student/behavior/:recordId` | Yes | Approved behavior detail. | N/A | COMPLETE for current model | Current student ownership | Safe not-found for other student. |
| Student App | Discipline | Any | `/api/v1/student/discipline/*` | No | Derived discipline timeline/summary. | Alternative to mixed behavior feed. | NEEDS_PRODUCT_DECISION | Current student ownership | Do not duplicate writes. |
| Parent App | Attendance | Any | `/api/v1/parent/children/:studentId/attendance/*` | No | Child attendance timeline. | Parent ADR expects attendance record types in behavior feed. | MISSING | Linked-child ownership | Derived counts only today. |
| Parent App | Behavior | GET | `/api/v1/parent/children/:studentId/behavior` | Yes | Approved child behavior list + summary. | `/behavior/records` | ROUTE_DRIFT, CONTRACT_DRIFT | Linked-child ownership | Missing attendance/absence/lateness records. |
| Parent App | Behavior | GET | `/api/v1/parent/children/:studentId/behavior/summary` | Yes | Behavior + attendance counters. | Same concept. | PARTIAL | Linked-child ownership | Counters present. |
| Parent App | Behavior | GET | `/api/v1/parent/children/:studentId/behavior/:recordId` | Yes | Approved behavior detail. | `/behavior/records/:id` | ROUTE_DRIFT | Linked-child ownership | Safe app presenter. |
| Parent App | Reports | GET | `/api/v1/parent/children/:studentId/reports` | Yes | Current-term performance report card list. | `/reports/performance` | ROUTE_DRIFT | Linked-child ownership | Includes disciplinePercentage summary. |
| Parent App | Reports | GET | `/api/v1/parent/children/:studentId/reports/summary` | Yes | Detailed report summary. | `/reports/performance` | ROUTE_DRIFT, PARTIAL | Linked-child ownership | Discipline source needs alignment. |
| Parent App | Discipline | Any | `/api/v1/parent/children/:studentId/discipline/*` | No | Derived child discipline timeline/summary. | Alternative future contract. | NEEDS_PRODUCT_DECISION | Linked-child ownership | No duplicate writes. |

## 12. Gap Register

### Attendance gaps

| Gap | Severity | Classification | Affected surface | Recommended sprint | Implementation risk |
|---|---|---|---|---|---|
| Existing roll-call session writes do not visibly re-check closed term status. | HIGH | SECURITY_GAP | Core/Dashboard, Teacher App | 25B | Medium; narrow use-case change but must avoid breaking legitimate existing-session reads. |
| Core route names are backend-native `/attendance/roll-call/*` instead of ADR `/attendance/sessions/*`. | MEDIUM | ROUTE_DRIFT | School Dashboard | 25B | Low if documented; medium if aliases are demanded. |
| `GET /attendance/context` missing. | LOW | MISSING, DEFERRED_OPTIONAL | School Dashboard | 25B only if frontend needs it | Low. |
| `PATCH /attendance/absences/:id/excuse` missing. | MEDIUM | MISSING | School Dashboard absences | 25C | Medium; must mutate source AttendanceEntry and respect closed term. |
| `PATCH /attendance/absences/:id/early-leave` missing. | MEDIUM | MISSING | School Dashboard absences | 25C | Medium; must mutate source AttendanceEntry and require minutes. |
| Teacher App is DAILY-only. | MEDIUM | CONTRACT_DRIFT | Teacher App | 25G | Medium/high if period/timetable occurrence identity is still absent. |
| Teacher App does not map EARLY_LEAVE. | MEDIUM | CONTRACT_DRIFT | Teacher App | 25G | Medium; requires product UX and core status mapping. |
| Teacher App ignores arrivalTime/dismissalTime. | MEDIUM | CONTRACT_DRIFT | Teacher App | 25G | Medium; decide whether these become minutes, timestamps, or display-only. |
| Student/Parent attendance timeline routes or mixed attendance records are missing. | MEDIUM | MISSING, CONTRACT_DRIFT | Student App, Parent App | 25D/25E | Medium; derived composition is straightforward but contract choice matters. |

### Behavior gaps

| Gap | Severity | Classification | Affected surface | Recommended sprint | Implementation risk |
|---|---|---|---|---|---|
| Student Behavior feed lacks attendance/absence/lateness record types. | HIGH | CONTRACT_DRIFT | Student App | 25D/25E | Medium; derive from Attendance entries without changing core Behavior. |
| Parent Behavior feed lacks attendance/absence/lateness record types. | HIGH | CONTRACT_DRIFT | Parent App | 25D/25E | Medium; derive from Attendance entries with linked-child ownership. |
| Parent Behavior route is `/behavior` not ADR `/behavior/records`. | MEDIUM | ROUTE_DRIFT | Parent App | 25D | Low if documented; medium if alias required. |
| Teacher behavior wrapper missing. | LOW | DEFERRED_OPTIONAL | Teacher App | 25H | Medium; must enforce allocation + roster ownership. |
| Core Behavior presenters include admin review internals. | LOW | SECURITY_GAP if reused app-facing | Future app Discipline | 25E/25I | Low; ensure derived app presenters are separate and safe. |

### Discipline gaps

| Gap | Severity | Classification | Affected surface | Recommended sprint | Implementation risk |
|---|---|---|---|---|---|
| No formal derived Discipline layer. | HIGH | MISSING_FORMAL_LAYER, NEEDS_PRODUCT_DECISION | Dashboard, Student App, Parent App | 25D | Medium; product semantics must be chosen first. |
| No unified discipline timeline. | HIGH | MISSING | Student App, Parent App | 25E | Medium; combine Attendance incidents + approved Behavior records. |
| No dashboard discipline KPI contract. | MEDIUM | NEEDS_PRODUCT_DECISION | School Dashboard | 25D | Medium; define source and formula. |
| Parent Reports `disciplinePercentage` source is attendance-only. | MEDIUM | CONTRACT_DRIFT | Parent App Reports | 25F | Low/medium after Discipline definition. |

## 13. Security Risk Register

| Risk | Current controls | Needed controls / residual risk |
|---|---|---|
| Cross-school attendance reads/writes | `prisma.scoped`, `schoolId` compound references, attendance security/e2e tests, permission guards. | Maintain; add any new derived routes through scoped repositories. |
| Closed-term attendance writes | Policies, excuse requests, and new session resolve guard closed terms. | Recheck term writability for existing-session save/upsert/submit/unsubmit/correct, including Teacher App wrapper paths. |
| Wrong scope session mutation | Session scope is materialized; roster validation checks student/enrollment; Teacher wrapper verifies classroom/term/year allocation match. | Preserve checks in absence correction endpoints. |
| Teacher outside allocation | `TeacherAppAccessService` and allocation adapter validate teacher user, school, allocation, subject/classroom/term relations. | Maintain safe not-found behavior for guessed/cross-school ids. |
| Student sees another student | `StudentAppAccessService` resolves current linked student and active enrollment; app reads filter by current student/enrollment. | Any Student Discipline route must use the same access service. |
| Parent sees unlinked child | `ParentAppAccessService` resolves guardians, linked students, and active current-school enrollments. | Any Parent Discipline/Attendance route must use the same child ownership path. |
| Behavior review authorization | Review routes require `behavior.records.review`; list/detail review queue is permission-gated. | Keep app-facing feeds approved-only. |
| Behavior point ledger duplication | Approval transaction updates record only from SUBMITTED then creates ledger; second approval is blocked by status transition. | Consider DB uniqueness on `(schoolId, recordId)` only if future scripts/imports can bypass normal review flow. Not required for docs-only 25A. |
| Attendance excuse approving wrong entries | Excuse validation and approval require matching submitted attendance entries and link affected sessions. | Preserve matching logic if absence convenience endpoints are added. |
| Discipline duplicate source-of-truth | No Discipline write model exists today. | Explicitly forbid Discipline write source in V1 unless product approves a new domain. |
| App-facing no-leak | Student/Parent presenters and security tests omit schoolId, organizationId, membershipId, roleId, deletedAt, passwordHash, objectKey, bucket, signedUrl, reviewedById, review notes, and raw metadata. | Future derived Discipline presenters must not reuse core admin Behavior presenters. |
| Dashboard/admin response leakage | Core Behavior presenter returns reviewer ids, review notes, and metadata under dashboard permissions. | Acceptable for admin/dashboard context; do not expose it through Student/Parent/Teacher app routes. |

## 14. Recommended Implementation Plan

### Sprint 25B — Attendance Core Contract Closeout

- Document backend-native attendance route contract versus ADR examples.
- Decide whether route aliases are required or whether frontend should adapt to `/attendance/roll-call/*`.
- Fix/verify closed-term write protection for existing session save/upsert/submit/unsubmit/correct.
- Consider `GET /api/v1/attendance/context` only if frontend needs it.
- Avoid broad runtime changes unless they close the confirmed security gap or a tiny accepted convenience endpoint.

### Sprint 25C — Attendance Absence Corrections

- Implement absence correction endpoints if product confirms dashboard dependency:
  - `PATCH /api/v1/attendance/absences/:id/excuse`
  - `PATCH /api/v1/attendance/absences/:id/early-leave`
- Apply changes to source `AttendanceEntry` and session state, not duplicated absence records.
- Enforce closed-term, tenancy, submitted-session rules, and audit logging.

### Sprint 25D — Discipline Derived Layer Decision Audit

- Decide if Student/Parent should use:
  - A) extended `/student/behavior` and `/parent/children/:studentId/behavior` feeds.
  - B) new `/student/discipline` and `/parent/children/:studentId/discipline` read routes.
- Define dashboard Discipline KPI semantics.
- Define whether Parent Reports `disciplinePercentage` should be attendance-only, behavior-only, or combined.
- Document final product/backend contract before implementation.

### Sprint 25E — Student/Parent Discipline Timeline Implementation

- Implement derived timeline and summary safely.
- Combine Attendance incidents from submitted sessions plus approved Behavior records.
- Include attendance, absence, lateness, early leave, excused, positive, and negative read items as product approves.
- No duplicate writes.
- No app-facing leaks.

### Sprint 25F — Parent Reports Discipline Alignment

- Ensure reports summary/performance fields derive consistently from the chosen Discipline definition.
- Decide whether `/reports/performance` alias is needed.
- Keep current `/reports` and `/reports/summary` stable unless product requires aliases.

### Sprint 25G — Teacher Attendance Contract Gap

- Decide/implement `early_leave`.
- Decide arrivalTime/dismissalTime mapping.
- Decide period attendance after timetable/schedule occurrence identity is ready.
- Add scheduleId alias only if product/frontend requires it.

### Sprint 25H — Teacher Behavior / Discipline Wrapper

- Optional unless Teacher App must record behavior/discipline.
- Implement a teacher-safe wrapper around core Behavior records.
- Enforce allocation and roster ownership.
- Keep Discipline read-derived if exposed.

### Sprint 25I — Security Closeout

- Add/extend tests for closed-term attendance writes, derived discipline no-leak, parent linked-child ownership, student current enrollment ownership, teacher allocation ownership, and no cross-school reads/writes.
- Publish a closeout doc once implementation sprints pass.

## 15. Acceptance / Non-Acceptance Decision

Sprint 25A passes as a docs-only audit if this document is the only file changed and verification passes.

The feature family does not pass final acceptance. Attendance is not safe to close because existing-session closed-term mutation protection needs remediation and route/contract gaps remain. Behavior core can be considered complete, but app-facing behavior/discipline contracts are partial. Discipline cannot be accepted because the formal derived layer does not exist and product has not chosen the contract.

Runtime implementation is safe to start only for narrowly scoped, confirmed items after 25A:

- First: Sprint 25B closed-term Attendance write protection and route-contract decision.
- Then: Sprint 25C absence correction endpoints if dashboard product confirms them.

What must not be done yet:

- Do not create Discipline writes.
- Do not add Discipline Prisma models or migrations without product approval.
- Do not add aliases solely because ADR examples differ from stable backend-native routes.
- Do not reuse core/admin Behavior presenters in Student/Parent app-facing feeds.
- Do not treat Behavior and Discipline as identical.

Recommended next sprint: Sprint 25B.

## 16. Terminal Verification Commands

Required commands for this docs-only sprint:

```powershell
git status --short --untracked-files=all
git diff --name-only
git diff --stat
git diff --check
npm run build
```

Full unit/e2e/security suites are not required for 25A because no runtime TypeScript, Prisma schema, migrations, or tests changed.
