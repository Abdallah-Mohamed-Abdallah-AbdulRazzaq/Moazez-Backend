# Sprint 25F - Parent Reports Discipline Alignment Closeout

## 1. Executive Decision

Decision: **PASS**.

Parent Reports is now aligned with the Sprint 25E read-only Discipline derived layer in a non-breaking way. The existing `disciplinePercentage` and `discipline_percentage` fields remain unchanged and attendance-derived for backward compatibility.

The Attendance / Behavior / Discipline family remains **PARTIAL**. Parent Reports now exposes the derived Discipline summary counts, but Teacher App attendance mapping gaps and any Dashboard Discipline KPI contract remain deferred.

## 2. Scope

Runtime files changed:

- `src/modules/parent-app/reports/dto/parent-reports.dto.ts`
- `src/modules/parent-app/reports/infrastructure/parent-reports-read.adapter.ts`
- `src/modules/parent-app/reports/presenters/parent-reports.presenter.ts`

Tests changed:

- `src/modules/parent-app/reports/tests/parent-reports.presenter.spec.ts`
- `src/modules/parent-app/reports/tests/parent-reports-read.adapter.spec.ts`
- `src/modules/parent-app/reports/tests/parent-reports.use-case.spec.ts`
- `test/security/tenancy.parent-app.spec.ts`
- `test/e2e/parent-app-final-closeout.e2e-spec.ts`

Docs changed:

- `docs/sprint-25f-parent-reports-discipline-alignment-closeout.md`

No Prisma schema, migration, package, deployment, Docker, PM2, server config, `main.ts`, realtime gateway, Attendance lifecycle, Behavior lifecycle, Student App runtime, or Teacher App runtime files were changed.

## 3. Contract Decision

The existing `disciplinePercentage` contract is preserved:

- It remains in the report-card summary on `GET /api/v1/parent/children/:studentId/reports`.
- It remains in `attendance.disciplinePercentage` and `attendance.discipline_percentage` on `GET /api/v1/parent/children/:studentId/reports/summary`.
- Its formula remains attendance-derived: `present / (present + absence + lateness)`.
- It is documented in code as a backward-compatible legacy attendance present rate, not a combined Discipline score.

The new `discipline` object is additive and raw-count based. No `disciplineScore`, `combinedDisciplineScore`, `disciplinePercentage` replacement, or `combinedDisciplinePercentage` field was introduced.

## 4. Response Shape

Added `discipline` to:

- `reports[0].summary.discipline` on `GET /api/v1/parent/children/:studentId/reports`
- top-level `discipline` on `GET /api/v1/parent/children/:studentId/reports/summary`

Added object shape:

```ts
{
  totalIncidents: number;
  attendanceIncidentCount: number;
  absenceCount: number;
  lateCount: number;
  earlyLeaveCount: number;
  excusedCount: number;
  positiveCount: number;
  negativeCount: number;
  behaviorPoints: number;
  period: string;
  dateText: string;
  total_incidents: number;
  attendance_incident_count: number;
  absence_count: number;
  late_count: number;
  early_leave_count: number;
  excused_count: number;
  positive_count: number;
  negative_count: number;
  behavior_points: number;
  date_text: string;
}
```

Fields not changed:

- `disciplinePercentage`
- `discipline_percentage`
- `academic`
- `behavior`
- `attendance`
- `xp`
- `reports`
- `unavailable`
- child and period fields

## 5. Source-of-Truth

The new `discipline` object uses the Sprint 25E read-only derived rules through `DisciplineDerivedReadService.getSummary()`.

Source rules:

- Attendance remains the write source for attendance incidents.
- Behavior remains the write source for positive/negative behavior records and behavior points.
- Parent Reports reads the derived Discipline summary through the linked child scope: `studentId`, `enrollmentId`, `academicYearId`, and `termId`.
- Submitted Attendance sessions only.
- Included Attendance statuses: `ABSENT`, `LATE`, `EARLY_LEAVE`, `EXCUSED`.
- Excluded Attendance statuses: `PRESENT`, `UNMARKED`, draft/unsubmitted sessions, deleted sessions.
- Approved Behavior records only.
- Excluded Behavior records: `DRAFT`, `SUBMITTED`, `REJECTED`, `CANCELLED`, and deleted records.
- Behavior points come from the Behavior point ledger where available, falling back to approved record points as established in Sprint 25E.

No data is duplicated. No Discipline write source, Prisma model, enum, table, or migration was added.

## 6. Security / No-Leak

Parent Reports still resolves access through `ParentAppAccessService.assertParentOwnsStudent(studentId)` before the reports read adapter runs.

Security posture:

- Parent actor only.
- Active membership required.
- Linked child only.
- Active child enrollment required.
- Current school scope enforced.
- Cross-school and unlinked child access keeps existing safe not-found semantics.
- Reports remain read-only.

No app-facing responses expose `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, `passwordHash`, `reviewedById`, `submittedById`, `markedById`, `createdById`, `updatedById`, raw metadata, storage keys, signed URLs, teacher-only notes, or internal audit data.

## 7. Regression Notes

- Parent Reports old fields are stable.
- Parent Reports `disciplinePercentage` formula is unchanged.
- Parent Discipline routes from Sprint 25E are unchanged.
- Parent Behavior routes remain Behavior-only.
- Student App was not changed.
- Attendance and Behavior write lifecycles were not changed.

## 8. Remaining Gaps

- Teacher App DAILY/arrival/dismissal/early-leave mapping remains deferred.
- Dashboard Discipline KPI route remains out of scope unless product scopes it.
- Any future combined Discipline score or percentage formula remains a product decision.
- Optional Behavior-feed compatibility mode remains a product decision.

## 9. Final Decision

Sprint 25F **passes**.

The recommended next sprint is either Teacher App Attendance mapping cleanup or Dashboard Discipline KPI decision, depending on product priority. A combined Discipline score formula should not be implemented until product explicitly approves one.

Verification completed during implementation:

- `npm test -- --runInBand parent-app` - passed, 40 suites / 152 tests.
- `npm test -- --runInBand discipline` - passed, 4 suites / 11 tests.
- `npm run build` - passed.
- `npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.parent-app.spec.ts` - passed, 20 tests.
- `npx jest --config ./test/jest-e2e.json --runInBand test/e2e/parent-app-final-closeout.e2e-spec.ts` - passed, 18 tests.
