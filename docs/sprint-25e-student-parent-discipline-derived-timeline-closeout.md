# Sprint 25E - Student/Parent Discipline Derived Timeline Closeout

## 1. Executive Decision

Decision: **PASS**.

Sprint 25E implements the Student App and Parent App read-only Discipline derived timeline and summary layer from the Sprint 25D Option C decision.

The feature family remains **PARTIAL**. Student/Parent Discipline read routes now exist, but Parent Reports discipline alignment is still deferred to Sprint 25F, Teacher App attendance contract gaps remain deferred, and no Dashboard Discipline KPI route is in scope yet.

## 2. Scope

Runtime files changed:

- `src/modules/discipline/discipline.module.ts`
- `src/modules/discipline/application/discipline-derived-read.service.ts`
- `src/modules/discipline/dto/discipline-derived.dto.ts`
- `src/modules/discipline/infrastructure/discipline-derived.repository.ts`
- `src/modules/discipline/presenters/discipline-derived.presenter.ts`
- `src/modules/student-app/discipline/application/get-student-discipline-summary.use-case.ts`
- `src/modules/student-app/discipline/application/list-student-discipline.use-case.ts`
- `src/modules/student-app/discipline/controller/student-discipline.controller.ts`
- `src/modules/student-app/student-app.module.ts`
- `src/modules/parent-app/discipline/application/get-parent-child-discipline-summary.use-case.ts`
- `src/modules/parent-app/discipline/application/list-parent-child-discipline.use-case.ts`
- `src/modules/parent-app/discipline/controller/parent-discipline.controller.ts`
- `src/modules/parent-app/parent-app.module.ts`

Tests changed:

- `src/modules/discipline/tests/discipline-derived.presenter.spec.ts`
- `src/modules/discipline/tests/discipline-derived.repository.spec.ts`
- `src/modules/student-app/discipline/tests/student-discipline.use-case.spec.ts`
- `src/modules/parent-app/discipline/tests/parent-discipline.use-case.spec.ts`
- `test/security/tenancy.student-app.spec.ts`
- `test/security/tenancy.parent-app.spec.ts`
- `test/e2e/student-app-final-closeout.e2e-spec.ts`
- `test/e2e/parent-app-final-closeout.e2e-spec.ts`

Docs changed:

- `docs/sprint-25e-student-parent-discipline-derived-timeline-closeout.md`

No Prisma schema, migration, package, deployment, Docker, PM2, server config, `main.ts`, realtime gateway, Attendance lifecycle, Behavior lifecycle, Parent Reports formula, or Teacher App runtime files were changed.

## 3. Route Contract

Added read-only routes:

| Surface | Method | Route | Purpose |
|---|---|---|---|
| Student App | GET | `/api/v1/student/discipline` | Current student's derived Discipline timeline. |
| Student App | GET | `/api/v1/student/discipline/summary` | Current student's derived Discipline summary. |
| Parent App | GET | `/api/v1/parent/children/:studentId/discipline` | Linked child's derived Discipline timeline. |
| Parent App | GET | `/api/v1/parent/children/:studentId/discipline/summary` | Linked child's derived Discipline summary. |

Not added:

- No Discipline write endpoints.
- No Behavior mixed-feed default.
- No Behavior route aliases.
- No `/behavior/records` aliases.
- No Parent Reports formula change.
- No Teacher App discipline wrapper.

Existing `/api/v1/student/behavior` and `/api/v1/parent/children/:studentId/behavior` remain approved positive/negative Behavior feeds only.

## 4. Source-of-Truth Implementation

Discipline is implemented as a computed read model only.

Attendance items come from `AttendanceEntry` rows whose parent `AttendanceSession` is `SUBMITTED`, scoped to the current enrollment, and not deleted. Included attendance statuses are `ABSENT`, `LATE`, `EARLY_LEAVE`, and `EXCUSED`. `PRESENT`, `UNMARKED`, draft sessions, unsubmitted sessions, and deleted sessions are excluded.

Behavior items come from `BehaviorRecord` rows scoped to the current student/enrollment/year whose status is `APPROVED` and `deletedAt` is null. Draft, submitted, rejected, cancelled, and deleted behavior records are excluded. Behavior point deltas are read from `BehaviorPointLedger` where available, with `BehaviorRecord.points` as the read fallback for approved records.

No data is duplicated. No Discipline Prisma model, enum, table, or migration was created. The new repository uses scoped Prisma reads and select clauses, and controllers do not call Prisma directly.

## 5. Timeline Contract

Final item shape:

```ts
{
  id: string;
  sourceType: 'attendance' | 'behavior';
  source_type: 'attendance' | 'behavior';
  itemType: 'absence' | 'lateness' | 'early_leave' | 'excused' | 'positive' | 'negative';
  item_type: 'absence' | 'lateness' | 'early_leave' | 'excused' | 'positive' | 'negative';
  occurredAt: string;
  occurred_at: string;
  date: string;
  title: string;
  description: string | null;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical' | null;
  pointsDelta: number;
  points_delta: number;
  status: 'submitted' | 'excused' | 'approved';
  category: DisciplineTimelineCategoryDto | null;
  attendance: DisciplineTimelineAttendanceDto | null;
}
```

Attendance mapping:

| Source status | `itemType` | `status` | `severity` | `pointsDelta` |
|---|---|---|---:|
| `ABSENT` | `absence` | `submitted` | `medium` | 0 |
| `LATE` | `lateness` | `submitted` | `low` | 0 |
| `EARLY_LEAVE` | `early_leave` | `submitted` | `low` | 0 |
| `EXCUSED` | `excused` | `excused` | `info` | 0 |

Behavior mapping:

| Source type | `itemType` | `status` | `severity` | `pointsDelta` |
|---|---|---|---|---:|
| `POSITIVE` | `positive` | `approved` | Lowercase `BehaviorSeverity` | Ledger delta or approved record points |
| `NEGATIVE` | `negative` | `approved` | Lowercase `BehaviorSeverity` | Ledger delta or approved record points |

Ordering and filtering:

- Default order is `occurredAt` descending.
- Tie-breaker order is `sourceType`, then source id.
- Pagination uses existing app conventions: `page`, `limit`, and `pagination.total`.
- Supported filters: `sourceType`, `itemType`, `type`, `fromDate`, `toDate`, `page`, and `limit`.

The derived ids are source-prefixed: `attendance:{attendanceEntryId}` and `behavior:{behaviorRecordId}`.

## 6. Summary Contract

Final summary fields:

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

Snake-case aliases are included where existing Student/Parent app DTOs use them.

Formulas:

- `attendanceIncidentCount = absenceCount + lateCount + earlyLeaveCount + excusedCount`
- `totalIncidents = attendanceIncidentCount + positiveCount + negativeCount`
- `behaviorPoints = sum of approved behavior ledger deltas, falling back to approved record points when ledger rows are absent`

Sprint 25E does not introduce `disciplineScore` or `disciplinePercentage`. No scoring formula was invented.

## 7. Security / No-Leak Notes

Student routes use `StudentAppAccessService.getCurrentStudentWithEnrollment()` and therefore require a current student actor, active membership, linked active student, and active enrollment.

Parent routes use `ParentAppAccessService.assertParentOwnsStudent(studentId)` and therefore require a parent actor, active membership, linked-child ownership, active child enrollment, and current-school scope.

Security posture:

- Submitted Attendance sessions only.
- Approved Behavior records only.
- Draft/unsubmitted Attendance entries excluded.
- Draft/unapproved Behavior records excluded.
- Cross-school access remains handled by scoped Prisma and app ownership services.
- Parent unlinked/cross-school children return safe not-found semantics through existing Parent App access.
- Closed-term reads are allowed because Discipline is read-only.
- No writes, audit mutations, or source repairs occur.

No app-facing responses expose `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, `passwordHash`, `reviewedById`, `submittedById`, `markedById`, `createdById`, `updatedById`, raw metadata, storage keys, signed URLs, teacher-only notes, or internal audit data.

## 8. Behavior Route Regression

The existing Behavior routes remain Behavior-only:

- `/api/v1/student/behavior`
- `/api/v1/student/behavior/summary`
- `/api/v1/student/behavior/:recordId`
- `/api/v1/parent/children/:studentId/behavior`
- `/api/v1/parent/children/:studentId/behavior/summary`
- `/api/v1/parent/children/:studentId/behavior/:recordId`

Tests assert that these routes still expose approved positive/negative Behavior records and do not emit Discipline `attendance:` timeline ids.

## 9. Remaining Gaps

- Parent Reports `disciplinePercentage` alignment remains deferred to Sprint 25F.
- Teacher App DAILY-only behavior remains deferred.
- Teacher arrival/dismissal/early-leave mapping remains deferred.
- Optional frontend compatibility mode for existing Behavior feeds remains a product decision.
- Dashboard Discipline KPI/read route remains out of scope unless product scopes it.
- Parent Reports formula was intentionally not changed in Sprint 25E.

## 10. Final Decision

Sprint 25E **passes**.

Sprint 25F should proceed as **Parent Reports Discipline Alignment**, unless product decides a short security closeout is needed first.

The exact implemented 25E contract is dedicated Student/Parent read-only Discipline routes backed by Attendance and Behavior source data. Discipline remains derived/read-only, and the system still must not add Discipline writes, Discipline Prisma models, or duplicated Attendance/Behavior storage.

Verification completed during implementation:

- `npm test -- --runInBand discipline` - passed, 4 suites / 11 tests.
- `npm test -- --runInBand student-app` - passed, 45 suites / 195 tests.
- `npm test -- --runInBand parent-app` - passed, 40 suites / 151 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.student-app.spec.ts` - passed, 21 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts` - passed, 20 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/student-app-final-closeout.e2e-spec.ts` - passed, 17 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-app-final-closeout.e2e-spec.ts` - passed, 18 tests.
- `npm run build` - passed after clearing generated `dist` output from a Windows `ENOTEMPTY` cleanup failure.
