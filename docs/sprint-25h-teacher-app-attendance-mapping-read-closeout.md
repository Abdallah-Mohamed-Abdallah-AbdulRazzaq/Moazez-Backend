# Sprint 25H - Teacher App Attendance Mapping Read Closeout

## 1. Executive Decision

Decision: PASS.

Teacher App attendance read mapping is implemented for explicit `unmarked` and `early_leave` app-facing statuses. The read-only `today` classroom attendance model was added under the existing singular Teacher App attendance route base.

The Attendance / Behavior / Discipline family remains PARTIAL. Teacher App read mapping is closed for 25H, but arrival/dismissal semantics, Teacher App early-leave write authority, Teacher App excuse authority, PERIOD/scheduleId attendance, and Dashboard Discipline KPI remain deferred.

## 2. Scope

Runtime files changed:

- `src/modules/teacher-app/classroom/attendance/application/get-teacher-classroom-attendance-today.use-case.ts`
- `src/modules/teacher-app/classroom/attendance/controller/teacher-classroom-attendance.controller.ts`
- `src/modules/teacher-app/classroom/attendance/dto/teacher-classroom-attendance.dto.ts`
- `src/modules/teacher-app/classroom/attendance/presenters/teacher-classroom-attendance.presenter.ts`
- `src/modules/teacher-app/teacher-app.module.ts`

Tests changed:

- `src/modules/teacher-app/classroom/attendance/tests/teacher-classroom-attendance.presenter.spec.ts`
- `src/modules/teacher-app/classroom/attendance/tests/teacher-classroom-attendance.use-case.spec.ts`
- `test/security/tenancy.teacher-app.spec.ts`
- `test/e2e/teacher-app-classroom-operations.e2e-spec.ts`

Docs changed:

- `docs/sprint-25h-teacher-app-attendance-mapping-read-closeout.md`

## 3. Route Contract

Existing Teacher App attendance routes are preserved:

| Method | Route | Status |
|---|---|---|
| GET | `/api/v1/teacher/classroom/:classId/attendance/roster` | Preserved |
| POST | `/api/v1/teacher/classroom/:classId/attendance/session/resolve` | Preserved |
| GET | `/api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId` | Preserved |
| PUT | `/api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/entries` | Preserved |
| POST | `/api/v1/teacher/classroom/:classId/attendance/sessions/:sessionId/submit` | Preserved |

New read-only route:

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/teacher/classroom/:classId/attendance/today?date=YYYY-MM-DD` | Owned classroom attendance screen model with session, summary counts, and student rows |

Routes intentionally not added:

- No plural `/api/v1/teacher/classrooms/*` aliases.
- No scheduleId attendance write route.
- No early_leave write route or DTO support.
- No excuse write route.
- No arrival or dismissal write route.
- No Teacher App unsubmit or submitted-entry correction wrapper.

## 4. Mapping Contract

Teacher App read mapping now uses:

| Core Attendance status | Teacher App read status |
|---|---|
| `PRESENT` | `present` |
| `ABSENT` | `absent` |
| `LATE` | `late` |
| `EXCUSED` | `excused` |
| `EARLY_LEAVE` | `early_leave` |
| `UNMARKED` | `unmarked` |
| Missing/no entry | `unmarked` |

The write DTO remains limited to `present`, `absent`, `late`, and `excused`. `early_leave` and `unmarked` are read-only mappings in 25H.

Teacher App attendance row responses now include safe incident detail fields:

- `lateMinutes`
- `earlyLeaveMinutes`
- `excuseReason`

No snake_case aliases were added.

## 5. Summary Contract

The new `today` response includes:

```ts
{
  classId: string;
  date: string;
  session: {
    id: string;
    status: 'draft' | 'submitted';
    mode: 'daily';
    submittedAt: string | null;
  } | null;
  summary: {
    totalCount: number;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    excusedCount: number;
    earlyLeaveCount: number;
    unmarkedCount: number;
    markedCount: number;
  };
  students: TeacherClassroomAttendanceRosterStudentDto[];
}
```

`markedCount` is the count of `present`, `absent`, `late`, `excused`, and `early_leave` rows. `unmarkedCount` includes missing entries and explicit core `UNMARKED` entries.

The route is read-only and returns `session: null` when no Attendance session exists for the allocation/date.

## 6. Source-of-Truth

Core Attendance remains the source of truth for `AttendanceSession` and `AttendanceEntry`.

Teacher App is an app-facing adapter/read presenter only for this sprint. The new `today` route uses the existing Teacher App allocation ownership check and existing core roll-call roster read. It does not resolve, create, submit, update, correct, or duplicate Attendance data.

No Teacher-specific attendance storage was added. No Prisma schema or migration changed. No Attendance lifecycle changed.

## 7. Security / No-Leak

The new read route and updated presenters preserve:

- Teacher actor and active membership enforcement through existing Teacher App access.
- Teacher-owned `TeacherSubjectAllocation.id` scope for `classId`.
- Same-school unowned allocation safe 404 behavior.
- Cross-school allocation safe 404 behavior.
- Cross-school guessed session id safe not-found behavior on the existing session-detail wrapper.
- Non-teacher denial.
- Closed-term reads remain allowed; writes remain unchanged and protected through core Attendance.

Teacher App attendance responses do not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `deletedAt`
- `passwordHash`
- `bucket`
- `objectKey`
- `signedUrl`
- raw metadata
- `submittedById`
- `markedById`
- `reviewedById`

## 8. Regression Notes

Existing Teacher App attendance write routes are unchanged and remain the canonical write surface.

No scheduleId write support was added. No PERIOD write support was added. No `early_leave` write support was added. No Teacher App excuse shortcut was added. No arrival or dismissal mapping was added.

Student App, Parent App, Discipline, Behavior, Parent Reports, dashboard/admin Attendance, Prisma schema, migrations, deployment config, `main.ts`, and realtime gateway were not changed.

## 9. Remaining Gaps

- Arrival/dismissal product semantics remain undecided.
- `lateMinutes` Teacher App write support remains deferred.
- Teacher early-leave write authority remains deferred.
- Teacher excuse authority remains deferred.
- PERIOD/scheduleId attendance remains deferred.
- Teacher App unsubmit/correction wrappers remain deferred.
- Dashboard Discipline KPI decision remains out of scope.

## 10. Final Decision

Sprint 25H passes.

Recommended next sprint: Teacher App Attendance Write Decision Audit if product wants arrival, dismissal, late-minutes, early-leave, excuse, PERIOD, or scheduleId writes. If product does not need Teacher write expansion next, the next safer decision sprint is Dashboard Discipline KPI Decision Audit.
