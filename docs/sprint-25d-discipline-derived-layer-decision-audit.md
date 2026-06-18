# Sprint 25D - Discipline Derived Layer Decision Audit

## 1. Executive Decision

Audit decision: **PASS**.

Recommended V1 contract option: **Option C - Hybrid/backward-compatible approach**.

Sprint 25E runtime implementation is allowed to start only under the contract in this document: read-only derived Discipline routes for Student App and Parent App, no Discipline writes, no Discipline Prisma model, no migrations, and no duplicated Attendance or Behavior source data.

The Attendance / Behavior / Discipline family remains **PARTIAL**. Attendance core source-of-truth gaps from Sprint 25B and Sprint 25C are closed, and core Behavior remains complete for reviewed positive/negative records, but the app-facing Discipline derived layer does not exist yet.

## 2. Decision Summary

Discipline is a **derived/read-only V1 layer**. It is not a new operational write source.

V1 must preserve these source-of-truth boundaries:

- Attendance remains the source of truth for submitted attendance states and incidents: present, absent, late, excused, early leave, unmarked, sessions, entries, and excuse workflows.
- Behavior remains the source of truth for manual positive/negative behavior records, review state, approved outcomes, categories, and behavior point ledger entries.
- Discipline combines submitted Attendance incidents and approved Behavior records into app-facing timelines, summaries, and future analytics.
- No Discipline Prisma model or migration is needed for V1.
- No AttendanceEntry or BehaviorRecord data should be copied into Discipline storage.
- Existing Student/Parent Behavior routes should remain positive/negative Behavior feeds unless product explicitly approves a compatibility mode.

## 3. Source-of-Truth Contract

| Source item | Owned by | Write source? | Read source? | App-facing safe? | Notes |
|---|---|---:|---:|---:|---|
| `AttendanceSession` / `AttendanceEntry` | Attendance | Yes | Yes | Only through app-safe presenters | Submitted sessions and entries are the source for attendance incidents. Draft/unsubmitted entries must not contribute to Discipline timelines. |
| Attendance absences/incidents | Attendance, derived from `AttendanceEntry` | No separate write source | Yes | Dashboard-safe today; app-safe presenter needed for 25E | Absence rows are derived from submitted entries. Sprint 25C correction endpoints mutate `AttendanceEntry` only. |
| `AttendanceExcuseRequest` | Attendance | Yes | Yes | Not automatically app-facing | Formal excuse lifecycle remains separate from direct absence corrections and Discipline timeline projection. |
| `BehaviorRecord` | Behavior | Yes | Yes | App-safe only through Student/Parent presenters | Only `APPROVED` records should contribute to app-facing Discipline. Draft, submitted, rejected, cancelled, and deleted records are excluded. |
| `BehaviorPointLedger` | Behavior | Yes, via Behavior approval/reversal logic | Yes | App-safe only as summarized deltas | Discipline can read point deltas; it must not create or repair ledger rows. |
| Parent Reports `disciplinePercentage` | Parent App Reports presenter | No | Yes | Yes, but semantics need clarification | Current formula is attendance-derived: present / (present + absence + lateness). Keep stable until Sprint 25F. |
| Future `DisciplineTimelineItem` / derived DTO only | Discipline derived read layer | No | Yes | Yes, if presenter is purpose-built | DTOs are computed from Attendance and Behavior at read time; no table, no migration, no duplicated source data. |

## 4. Existing Reality Summary

Core Attendance supports policies, roll-call sessions, entries, submitted-session incidents, formal excuse requests, reports, and the Sprint 25C direct absence correction endpoints. The 25C endpoints mutate only source `AttendanceEntry` rows.

Core Behavior supports categories, draft/submitted/approved/rejected/cancelled records, review queue, approve/reject workflow, dashboard summaries, and behavior point ledger creation on approval.

Student App Behavior currently exposes:

- `GET /api/v1/student/behavior`
- `GET /api/v1/student/behavior/summary`
- `GET /api/v1/student/behavior/:recordId`

Those routes list approved positive/negative Behavior records and include attendance counters in summaries, but they do not expose attendance/absence/lateness/early-leave/excused records as timeline items.

Parent App Behavior currently exposes:

- `GET /api/v1/parent/children/:studentId/behavior`
- `GET /api/v1/parent/children/:studentId/behavior/summary`
- `GET /api/v1/parent/children/:studentId/behavior/:recordId`

Those routes enforce linked-child ownership, list approved positive/negative Behavior records, and include attendance counters in summaries. They do not expose a mixed attendance plus behavior timeline.

Parent Reports currently exposes:

- `GET /api/v1/parent/children/:studentId/reports`
- `GET /api/v1/parent/children/:studentId/reports/summary`

Its `disciplinePercentage` is currently attendance-derived from present, absent, and late counts. It does not yet use approved Behavior records in the percentage formula.

No formal Discipline module, Discipline routes, Discipline Prisma models, Discipline enums, or Discipline write workflow currently exist.

## 5. Contract Options Evaluation

| Option | Pros | Cons | Implementation risk | Frontend impact | Backend architecture impact | Security/no-leak risk | Migration risk | Decision |
|---|---|---|---|---|---|---|---|---|
| Option A - Extend existing app Behavior feeds as mixed feeds | Matches Student/Parent ADR wording that used `behavior` records for attendance, absence, lateness, positive, and negative items. Fewer new URLs. | Overloads "Behavior" with Attendance incidents and encourages treating Discipline as Behavior. Existing positive/negative-only detail routes become semantically unclear. | Medium | Low if frontend already expects mixed behavior feeds; higher for existing screens that assume behavior-only records. | Weakens the Behavior module boundary accepted in ADR-0002. | Medium because app behavior presenters might accidentally grow from admin/core presenters or expose review internals. | None | **Rejected for default V1**. Usable only as explicit compatibility mode after product approval. |
| Option B - Create formal Discipline read routes | Clean semantics. Behavior routes stay Behavior-only. Discipline name clearly signals combined Attendance plus Behavior reads. | Frontend ADRs currently reference Behavior feeds, so frontend contract docs must be updated. | Low to medium | Medium because clients must call new routes. | Strong; preserves Attendance and Behavior source boundaries. | Low if purpose-built app presenters are used. | None | **Accepted as the primary route surface inside Option C**. |
| Option C - Formal derived service plus dedicated routes, optional compatibility later | Keeps the long-term architecture clean while leaving an escape hatch for frontend compatibility. Protects core Behavior purity and avoids new write storage. | Requires more explicit docs and frontend coordination. | Medium | Medium initially; low if frontend agrees to new Discipline routes. | Strongest fit with modular monolith and app-facing read-model rules. | Low with dedicated DTOs and ownership services. | None | **Recommended for V1**. |

## 6. Recommended V1 Contract

Sprint 25E should implement dedicated read-only Discipline routes:

- `GET /api/v1/student/discipline`
- `GET /api/v1/student/discipline/summary`
- `GET /api/v1/parent/children/:studentId/discipline`
- `GET /api/v1/parent/children/:studentId/discipline/summary`

The derived read model should combine:

- Attendance items from `AttendanceEntry` rows whose `AttendanceSession.status` is `SUBMITTED` and `AttendanceSession.deletedAt` is null.
- Behavior items from `BehaviorRecord` rows whose `status` is `APPROVED` and `deletedAt` is null.
- Behavior point deltas from approved record/ledger state, read-only.

Existing `/api/v1/student/behavior` stays positive/negative-only in Sprint 25E.

Existing `/api/v1/parent/children/:studentId/behavior` stays positive/negative-only in Sprint 25E.

No mixed behavior feed should be exposed by default. No `/behavior/records` aliases should be added in Sprint 25E. A compatibility query mode or alias can be considered only if product/frontend explicitly approves it after this decision. If compatibility is requested later, the preferred shape is an opt-in mode, not silently changing the default Behavior feed.

Frontend ADRs should be updated so mixed attendance/behavior record expectations point to Discipline routes rather than core Behavior routes.

## 7. Derived Timeline Item Contract

Recommended future timeline item DTO:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable derived id, preferably source-prefixed such as `attendance:{entryId}` or `behavior:{recordId}`. |
| `sourceType` | `attendance` or `behavior` | Identifies the source module. |
| `itemType` | `absence`, `lateness`, `early_leave`, `excused`, `positive`, `negative` | Attendance `PRESENT` and `UNMARKED` should not be timeline incidents by default. |
| `occurredAt` | ISO string | Attendance uses session date/time where available; Behavior uses `occurredAt`. |
| `title` | string | App-safe display title. |
| `description` | string or null | App-safe description; do not include teacher-only notes or review internals. |
| `severity` | `info`, `low`, `medium`, `high`, `critical` or null | Behavior can map from `BehaviorSeverity`; Attendance mapping should be product-defined and conservative. |
| `pointsDelta` | number | Behavior points/ledger amount. Attendance defaults to 0 unless product later defines attendance points. |
| `status` | `submitted`, `excused`, `approved` | Read status, not a new workflow state. |
| `date` | string | Optional date-only convenience for existing app UI. |
| `category` | object or null | Behavior category summary only: id/code/name/type. |
| `attendance` | object or null | Attendance-safe details such as lateMinutes, earlyLeaveMinutes, excuseReason if already app-safe. |

Avoid `termId` in the default app-facing item unless product confirms it is app-safe and useful. Prefer period/date labels over raw academic ids for Student/Parent screens.

The DTO must not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `deletedAt`
- `passwordHash`
- `reviewedById`
- `submittedById`
- `markedById`
- raw metadata
- `objectKey`
- `bucket`
- `signedUrl`
- teacher-only notes
- internal audit data

## 8. Derived Summary Contract

Recommended minimum Sprint 25E summary fields:

- `totalIncidents`
- `attendanceIncidentCount`
- `absenceCount`
- `lateCount`
- `earlyLeaveCount`
- `excusedCount`
- `positiveCount`
- `negativeCount`
- `behaviorPoints`
- `period`
- `dateText`

Use snake_case aliases only if the existing app contract style requires them for the specific route response.

Do not ship a new combined `disciplineScore` or `disciplinePercentage` in Sprint 25E unless product approves a formula first. Counting and timeline composition are clear; scoring is a product decision because it affects parent reports, dashboard KPIs, and student-facing interpretation.

If product approves a score later, the preferred field is a new explicit field such as `disciplineScore` or `combinedDisciplinePercentage`, not an overloaded reuse of the current Parent Reports `attendance.disciplinePercentage`.

## 9. Parent Reports Alignment Decision

Keep current Parent Reports response shape stable in Sprint 25E.

The existing `attendance.disciplinePercentage` and `attendance.discipline_percentage` fields should remain attendance-derived until Sprint 25F. Their current semantics are:

```text
present / (present + absence + lateness)
```

Sprint 25F should decide whether to:

- keep `disciplinePercentage` as a legacy attendance-derived percentage and document it clearly;
- add a new combined Discipline field or object, such as `disciplineSummary` or `combinedDisciplineScore`;
- migrate frontend copy away from "discipline percentage" if the field remains attendance-only;
- add a deprecation note only after a replacement field is available.

Do not break the existing Parent Reports response shape as part of Sprint 25E.

## 10. Security Requirements for Sprint 25E

Sprint 25E must include focused tests proving:

- Student can only see their own derived Discipline timeline and summary.
- Parent can only see linked-child derived Discipline timeline and summary.
- Only submitted Attendance sessions contribute.
- Draft/unsubmitted Attendance entries are excluded.
- Deleted Attendance sessions are excluded.
- Only approved Behavior records contribute.
- Draft, submitted, cancelled, rejected, and deleted Behavior records are excluded.
- Behavior point totals are derived from approved record/ledger state and are not confused with XP.
- Cross-school reads return safe 404 or empty responses according to the existing Student/Parent app access pattern.
- App-facing responses do not leak tenant, actor, review, storage, metadata, teacher-only note, or audit internals.
- Closed-term reads are allowed because Discipline is read-only.
- Dashboard/admin Behavior presenters are not reused for Student/Parent app Discipline routes.

Any implementation should use the existing Student App current-enrollment access service and Parent App linked-child access service. It should use scoped Prisma paths and repository/adapters only; no Prisma access belongs in controllers.

## 11. Implementation Plan for Sprint 25E

Recommended sequence:

1. Add a read-only derived Discipline read service/repository/adapter that queries Attendance and Behavior sources without writes.
2. Add Student App Discipline controller/use-cases/presenter for timeline and summary.
3. Add Parent App Discipline controller/use-cases/presenter for linked-child timeline and summary.
4. Implement deterministic merging and ordering of Attendance and Behavior timeline items.
5. Add app-safe DTOs and presenters rather than reusing dashboard/core Behavior presenters.
6. Add unit tests for item mapping, summary counts, approved/submitted filtering, and no-leak presentation.
7. Add Student App security/e2e coverage for current-student ownership.
8. Add Parent App security/e2e coverage for linked-child ownership and cross-school rejection.
9. Leave Parent Reports formula alignment for Sprint 25F unless product explicitly approves a small, non-breaking additive field.

Implementation may live as a shared read-only Discipline derived service plus app-specific controllers, or as duplicated app-local adapters if that keeps dependencies simpler. In either case, it must not become a core write module.

## 12. Non-Goals

- No Discipline writes.
- No Discipline Prisma models.
- No migrations.
- No Behavior source changes.
- No Attendance source duplication.
- No duplicate AttendanceEntry or BehaviorRecord storage.
- No Teacher App Discipline or Behavior wrapper in Sprint 25E.
- No Behavior route aliases unless product explicitly approves them.
- No default mixed `/student/behavior` or `/parent/.../behavior` feed in Sprint 25E.
- No Parent Reports formula change until Sprint 25F unless explicitly approved.
- No dashboard Discipline KPI route in Sprint 25E unless product scopes it separately.

## 13. Final Decision

Sprint 25D passes as a decision audit.

Sprint 25E should proceed with **Option C**:

- implement read-only Student/Parent Discipline timeline and summary routes;
- combine submitted Attendance incidents plus approved Behavior records;
- keep Behavior routes positive/negative-only;
- add no writes, no Prisma models, no migrations, and no aliases by default.

Remaining risks and product questions:

- Frontend ADRs still describe mixed records under Behavior routes and should be updated to the chosen Discipline routes.
- Product still needs to define any combined Discipline score formula before reports or dashboard KPIs use one.
- Parent Reports `disciplinePercentage` naming is semantically misleading while it remains attendance-derived.
- Attendance severity mapping for absence, lateness, early leave, and excused items needs product language before it becomes user-visible.
- If frontend requires backward compatibility under existing Behavior route names, that must be explicitly approved before implementation.
