# ATT-POL-2C - Timetable Period Existence Validation Reality Audit

## 1. Title and status

Sprint: ATT-POL-2C - Timetable Period Existence Validation Reality Audit

Status: DOCUMENTATION_ONLY_DECISION_LOCK

Current verdict: READY_FOR_ATT_POL_2D_IMPLEMENTATION

This sprint audits how strict school-scoped timetable period existence validation should be implemented after ATT-POL-2B introduced selected-period membership gating for new PERIOD roll-call sessions. It does not implement runtime behavior.

## 2. Baseline

Baseline requested: `65cb85b fix: gate period roll-call by attendance policy`

Repository HEAD verified during audit: `65cb85b`

ATT-POL lineage:

- ATT-POL-1 persisted `AttendancePolicy.selectedPeriodIds` and related advanced policy contract fields.
- ATT-POL-2A decided that `selectedPeriodIds` represents `TimetablePeriod.id`, while roll-call `periodKey` remains the uniqueness/idempotency key.
- ATT-POL-2B implemented only selected-period membership gating for new PERIOD roll-call session creation.
- ATT-POL-2B deliberately did not validate whether a selected or requested period exists in the timetable.

## 3. Scope and non-goals

In scope for this audit:

- Timetable period data model and ownership truth.
- Existing timetable repositories, services, and validation patterns.
- Whether validation belongs in AttendancePolicy create/update, roll-call resolve, both, or neither.
- The safest academic context matching rule for V1.
- Backward compatibility and idempotency rules.
- Error behavior and no-leak requirements.
- Dependency boundary between Attendance and Academics Timetable.
- ATT-POL-2D implementation and test plan.

Non-goals:

- No source code changes.
- No Prisma schema changes.
- No migrations.
- No test changes.
- No package or lockfile changes.
- No route/controller contract changes.
- No threshold mutation.
- No automatic late or early-leave classification.
- No `autoAbsentAfterMinutes` behavior.
- No derived DAILY attendance computation.
- No notifications.
- No timetable period existence backfill or cleanup.

## 4. Sources reviewed

Required governance and architecture sources reviewed:

- `AGENT_CONTEXT_PRIMER.md`
- `CLAUDE.md`
- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE_DECISION.md`
- `SECURITY_MODEL.md`
- `DOMAIN_GLOSSARY.md`
- `DIRECTORY_STRUCTURE_VISUAL.md`
- `MODULES.md`
- `USER_TYPES.md`
- `V1_SCOPE.md`
- `PRISMA_CONVENTIONS.md`
- `ENGINEERING_RULES.md`
- `API_CONTRACT_RULES.md`
- `ERROR_CATALOG.md`
- `TESTING_STRATEGY.md`
- `OBSERVABILITY.md`
- `adr/ADR-0001-multi-tenancy-enforcement.md`
- `adr/School-Dashboard/sis_dashboard-attendance_backend_handoff_spec.md`
- `docs/sprint-att-pol-1-attendance-policy-contract-persistence-repair-closeout.md`
- `docs/sprint-att-pol-2a-attendance-policy-rule-application-reality-audit.md`
- `docs/sprint-att-pol-2b-selected-period-roll-call-gating-closeout.md`

All required listed documents were present.

Runtime files and areas inspected:

- `prisma/schema.prisma`
- `src/modules/attendance/policies/**`
- `src/modules/attendance/roll-call/**`
- `src/modules/academics/timetable/**`
- `src/modules/academics/**`
- `src/modules/dashboard/**` where timetable/schedule adapters were relevant through tests and presenters
- `test/e2e/attendance-foundation.e2e-spec.ts`
- `test/e2e/academics-timetable-dashboard-workflows.e2e-spec.ts`
- `test/e2e/schedule-timetable-final-closeout.e2e-spec.ts`
- `test/security/tenancy.attendance.spec.ts`
- `test/security/tenancy.academics-timetable-dashboard-workflows.spec.ts`
- `src/modules/academics/timetable/tests/timetable.use-case.spec.ts`

## 5. Timetable data model truth

Timetable periods are represented by `TimetablePeriod`.

Relevant `TimetablePeriod` fields:

- `id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`
- `schoolId String @map("school_id") @db.Uuid`
- `timetableConfigId String @map("timetable_config_id") @db.Uuid`
- `periodIndex Int @map("period_index")`
- `label String`
- `startTime String @map("start_time")`
- `endTime String @map("end_time")`
- `type TimetablePeriodType @default(CLASS)`
- `isInstructional Boolean @default(true) @map("is_instructional")`
- `createdAt`
- `updatedAt`

`TimetablePeriod` is school-scoped directly through `schoolId` and indirectly through its relation to `TimetableConfig`:

- `timetableConfig TimetableConfig @relation(fields: [timetableConfigId, schoolId], references: [id, schoolId], onDelete: Cascade)`
- `@@unique([id, schoolId])`
- `@@unique([schoolId, timetableConfigId, periodIndex])`
- indexes on `schoolId`, `timetableConfigId`, and `[schoolId, timetableConfigId]`

`TimetablePeriod` is not soft-deletable. There is no `deletedAt` on `TimetablePeriod`. Deletion is physical, with current timetable code blocking deletion when entries reference the period.

Periods are not global per school. They belong to a timetable config. The owning config carries the academic and scope context:

- `TimetableConfig.schoolId`
- `TimetableConfig.academicYearId`
- `TimetableConfig.termId`
- `TimetableConfig.scopeType`
- `TimetableConfig.scopeKey`
- optional `gradeId`, `sectionId`, `classroomId`
- `status TimetableConfigStatus @default(DRAFT)`

`TimetableConfigStatus` values are:

- `DRAFT`
- `ACTIVE`
- `ARCHIVED`

The config has useful constraints and indexes:

- `@@unique([id, schoolId])`
- `@@unique([schoolId, termId, scopeType, scopeKey])`
- `@@index([schoolId, academicYearId, termId, status])`
- `@@index([schoolId, termId, scopeType, scopeKey])`

`TimetableEntry` references both the period and the config:

- `periodId String @map("period_id") @db.Uuid`
- `timetableConfigId String @map("timetable_config_id") @db.Uuid`
- `academicYearId`
- `termId`
- `gradeId`
- `sectionId`
- `classroomId`
- `teacherUserId`
- `teacherSubjectAllocationId`
- `status TimetableEntryStatus @default(DRAFT)`

`TimetableEntry` enforces period ownership through:

- `period TimetablePeriod @relation(fields: [periodId, schoolId], references: [id, schoolId], onDelete: Restrict)`

Conclusion: strict existence validation does not need a schema change. The model supports school-scoped lookup by period id and supports same academic year and term checks through the period's timetable config.

## 6. Timetable repository/service truth

`TimetableRepository` is the main infrastructure gateway for timetable data.

Important existing methods:

- `findConfigById(timetableConfigId)`
- `findConfigByScope({ academicYearId, termId, scopeType, scopeKey })`
- `listConfigsByTerm(termId)`
- `listPeriods(timetableConfigId)`
- `listPeriodsByConfigIds(timetableConfigIds)`
- `findPeriodById(periodId)`
- `findPeriodByIndex({ timetableConfigId, periodIndex })`
- `createPeriod(data)`
- `updatePeriod(periodId, data)`
- `deletePeriod(periodId)`
- timetable entry list/create/update/bulk methods

The repository uses `this.prisma.scoped` for normal reads and updates. Transactional delete explicitly reads the active school from `RequestContext` and filters by `schoolId`. This matches tenancy rules and is the pattern ATT-POL-2D should preserve.

There is currently no purpose-built bulk lookup for:

- "Which of these period ids exist in the active school, academic year, and term?"
- "Does this one period id exist in the active school, academic year, and term?"

Existing entry validation proves the timetable module already validates period existence safely:

- `resolveTimetableEntryWrite` calls `repository.findPeriodById(command.periodId)`.
- It throws `TimetablePeriodNotFoundException` when no scoped period is found.
- It then verifies `period.timetableConfigId === config.id` and throws `TimetablePeriodNotInConfigException` if not.

Bulk timetable scheduling also validates period context:

- `resolveTimetableBulkItem` calls `repository.findPeriodById(item.periodId)`.
- It loads the period's config.
- It checks that the config term matches the selected term.

Timetable-to-attendance compatibility already exists:

- `TimetableAttendanceCompatibilityService.deriveForEntry(timetableEntryId, date)`
- `deriveTimetableAttendanceCompatibilityKey(entry, date)`

That compatibility service maps:

- `periodId: entry.periodId`
- `periodKey: timetable-entry:<entry.id>`
- `periodLabel: entry.period.label`
- `academicYearId`, `termId`, `classroomId`, and timing fields

This confirms the ATT-POL-2A contract:

- `selectedPeriodIds` stores `TimetablePeriod.id`.
- roll-call request `periodId` carries `TimetablePeriod.id` when timetable-backed.
- `periodKey` remains the roll-call uniqueness key and must not be reinterpreted.

`TimetableModule` exports both `TimetableRepository` and `TimetableAttendanceCompatibilityService`. Attendance modules do not currently import `TimetableModule`.

## 7. Validation location decision

Decision: implement strict validation in both AttendancePolicy create/update and roll-call resolve, with different triggers.

Policy create:

- Validate `selectedPeriodIds` after existing structural normalization.
- If the normalized array is empty, allow it.
- If the normalized array is non-empty, verify every id exists under the active school and the policy academic year and term.
- Reject any invalid, cross-school, wrong-year, wrong-term, or archived-config period id.

Policy update:

- Validate `selectedPeriodIds` only when the request body supplies `selectedPeriodIds`.
- Treat update as full replacement of the selected periods, as ATT-POL-1 already does.
- Do not revalidate existing stored `selectedPeriodIds` when the field is omitted.
- Do not reject an update solely because an old policy already contains invalid selected ids and the field was not modified.
- If `academicYearId` or `termId` changes while `selectedPeriodIds` is omitted, do not add a new ATT-POL-2D behavior change. This is an existing policy-edit edge case and can be handled later if product wants to restrict policy academic context moves.

Roll-call resolve:

- Validate only when creating a new PERIOD session.
- Preserve ATT-POL-2B idempotency: existing session lookup happens first and returns before policy resolution, selected-period membership validation, or timetable existence validation.
- DAILY sessions remain unchanged and do not validate `periodId`.
- If no effective policy exists and no `periodId` is supplied, preserve legacy behavior.
- If an effective policy has empty `selectedPeriodIds` and no `periodId` is supplied, preserve legacy behavior.
- If a PERIOD request supplies `periodId`, validate it when creating a new session.
- If the effective policy has non-empty `selectedPeriodIds`, run the ATT-POL-2B membership gate before the existence lookup. This avoids a needless timetable query for obviously disallowed values.

Rejected option: validation only in policy create/update. That would not protect a roll-call request carrying an arbitrary period id when no policy exists or when an old invalid policy is present.

Rejected option: validation only in roll-call. That would allow the dashboard to save invalid policy contracts and defer all failures to operational roll-call time.

Rejected option: neither. That would leave the ATT-POL-2B membership gate vulnerable to selected ids that look valid structurally but are not school-owned timetable periods.

## 8. Academic context matching decision

Decision: validate by same active school plus same academic year and same term through the period's timetable config.

Required match:

- `TimetablePeriod.id` equals the selected/requested id.
- The period is visible through active school scope.
- `TimetablePeriod.timetableConfig.academicYearId` equals the policy/roll-call academic year id.
- `TimetablePeriod.timetableConfig.termId` equals the policy/roll-call term id.
- `TimetablePeriod.timetableConfig.status` is `DRAFT` or `ACTIVE`.

Do not require in ATT-POL-2D:

- same timetable config id,
- same timetable scope type,
- same timetable scope key,
- same grade,
- same section,
- same classroom,
- same stage,
- existence of an active timetable entry,
- timetable publication,
- day-of-week compatibility.

Rationale:

- `TimetablePeriod` is config-owned, and `TimetableConfig` carries academic year and term.
- AttendancePolicy is not linked to a timetable config.
- Roll-call does not currently carry timetable config id.
- Existing ATT-POL-2A/2B contract says `periodKey` remains separate from `periodId`.
- Same config/scope/classroom validation would add product assumptions not encoded in the current attendance contract.
- Requiring publication would break legitimate setup flows where a school configures attendance policy against draft timetable periods before publishing the timetable.
- Allowing `DRAFT` and `ACTIVE` while rejecting `ARCHIVED` keeps setup workflows possible without permitting obsolete archived configs for new policy/session creation.

## 9. Legacy/backward compatibility decision

Existing `AttendancePolicy` rows:

- Leave them as-is.
- No migration.
- No backfill.
- No automatic cleanup.
- No automatic clearing of invalid `selectedPeriodIds`.

Policy update behavior:

- If `selectedPeriodIds` is omitted, do not validate old stored values.
- If `selectedPeriodIds` is supplied, validate the full replacement array.
- Empty replacement remains valid and preserves legacy behavior.

Roll-call behavior:

- Existing sessions remain idempotent and are not revalidated.
- Existing session lookup must stay before effective policy resolution and before timetable period validation.
- A policy that contains invalid selected ids may block new PERIOD session creation only when a request tries to use an invalid id under the strict ATT-POL-2D rules.
- DAILY behavior remains unchanged.
- PERIOD behavior with no policy and no supplied `periodId` remains unchanged.
- PERIOD behavior with an empty policy selection and no supplied `periodId` remains unchanged.

Policies that try to store provisional ids before timetable periods exist:

- Strict validation intentionally rejects those ids once ATT-POL-2D is implemented.
- The safer V1 contract is: create timetable periods first, then reference their ids from attendance policy.
- If product requires provisional policy drafting before timetable periods exist, ATT-POL-2D should not enforce policy-level strict validation yet. Based on current model and prior sprint decisions, strict validation is feasible and recommended.

## 10. Security/no-leak impact

Risk without strict validation:

- `AttendancePolicy` is school-scoped, but `selectedPeriodIds` is currently just a string array.
- A policy could store a UUID for a period from another school if it was inserted before validation or through a bug.
- ATT-POL-2B membership gating alone would allow a roll-call request when the request `periodId` matches that stored cross-school value.
- That would not expose the other school's timetable record directly, but it would let a foreign identifier authorize a session in the active school. That is a tenancy correctness issue.

ATT-POL-2D must ensure:

- Period lookup uses active `RequestContext` and scoped repository/service behavior.
- A period id from School A cannot validate policy or roll-call behavior in School B.
- Wrong-school, nonexistent, wrong-year, wrong-term, and archived-config periods are all treated as invalid for Attendance.
- Validation errors do not reveal whether the id belongs to another school.

No-leak fields for validation responses:

- Do not expose `schoolId`.
- Do not expose `organizationId`.
- Do not expose `membershipId`.
- Do not expose `roleId`.
- Do not expose `deletedAt`.
- Do not expose internal actor ids.
- Do not expose raw Prisma payloads.
- Do not expose timetable internals not already part of the relevant API contract.

Safe validation details:

- `field`
- `mode`
- `periodId` when it is the user-supplied request value or accepted contract id
- `invalidPeriodIds` for policy validation
- `policyId` only where ATT-POL-2B already safely includes it and the policy is in the active school context

## 11. Error behavior decision

Decision: use attendance-side validation errors for Attendance policy and roll-call validation.

Recommended policy create/update error:

- Exception: `ValidationDomainException`
- Code: `validation.failed`
- HTTP status: 400
- Message: `Attendance policy selected periods must reference timetable periods in the policy academic context`
- Safe details:
  - `field: "selectedPeriodIds"`
  - `invalidPeriodIds: [...]`
  - optionally `reason: "not_found_or_outside_context"`

Recommended roll-call missing period error:

- Preserve ATT-POL-2B behavior:
  - `ValidationDomainException`
  - code `validation.failed`
  - HTTP 400
  - details include `field`, `mode`, and safe `policyId` when applicable.

Recommended roll-call disallowed membership error:

- Preserve ATT-POL-2B behavior:
  - `ValidationDomainException`
  - code `validation.failed`
  - HTTP 400
  - details include `field`, `mode`, safe `policyId`, and supplied `periodId`.

Recommended roll-call unknown/outside-context period error:

- Exception: `ValidationDomainException`
- Code: `validation.failed`
- HTTP status: 400
- Message: `Attendance roll-call periodId must reference a timetable period in the academic context`
- Safe details:
  - `field: "periodId"`
  - `mode: "PERIOD"`
  - `periodId`
  - optionally `reason: "not_found_or_outside_context"`

Do not use `academics.timetable.period_not_found` directly in Attendance responses for this sprint. Timetable module routes can keep their own cataloged timetable errors, but Attendance validation should not reveal whether an id exists in another school or another academic context. No new error catalog entry is required for ATT-POL-2D.

## 12. Dependency boundary decision

Decision: Attendance should depend on a narrow timetable validation service or port, not on raw Prisma and preferably not on the full timetable repository.

Recommended shape:

- Add a small exported timetable application service, for example `TimetableAttendancePeriodReferenceService`, or extend `TimetableAttendanceCompatibilityService` with narrowly named validation methods.
- Keep the implementation inside `src/modules/academics/timetable/application`.
- Use `TimetableRepository` internally from the timetable module.
- Export the service from `TimetableModule`.
- Import `TimetableModule` into `PoliciesModule` and `RollCallModule`, or expose a provider token that both attendance submodules can inject.

Recommended methods:

- `findValidPeriodIdsForAttendanceContext(input: { academicYearId: string; termId: string; periodIds: string[] }): Promise<Set<string>>`
- `isPeriodValidForAttendanceContext(input: { academicYearId: string; termId: string; periodId: string }): Promise<boolean>`

The implementation can be backed by a new repository method such as:

- `findPeriodsByIdsForAcademicContext({ academicYearId, termId, periodIds, allowedConfigStatuses })`

Avoid:

- Direct Prisma access from Attendance use-cases.
- Timetable queries in controllers.
- Returning timetable records to Attendance when only boolean/set validation is needed.
- Circular imports between Attendance and Academics. `TimetableModule` currently does not import Attendance, so importing `TimetableModule` from attendance submodules should be acceptable if kept narrow.

## 13. Performance considerations

Policy create/update:

- Use one bulk lookup for all unique selected ids.
- Do not run one query per selected id.
- Structural normalization already rejects empty strings and duplicates before persistence.
- Compare normalized ids with the returned valid id set.

Roll-call resolve:

- Preserve existing session lookup first.
- Run selected-period membership before existence lookup when the effective policy has non-empty `selectedPeriodIds`.
- Use at most one timetable existence query for a supplied `periodId`.
- Do not query timetable for DAILY sessions.
- Do not query timetable for PERIOD sessions when `periodId` is omitted and legacy behavior allows omission.

Indexes:

- `TimetablePeriod.id` primary key supports direct lookup.
- `@@unique([id, schoolId])` supports tenant-safe identity.
- `@@index([schoolId])` and `@@index([schoolId, timetableConfigId])` support school/config filters.
- `TimetableConfig` has `@@index([schoolId, academicYearId, termId, status])`.
- No schema/index migration is needed for ATT-POL-2D based on current expected query volume.

If selected period arrays become large, cap or validate request size through DTO/application validation in a future sprint. That is not required for ATT-POL-2D.

## 14. Recommended ATT-POL-2D implementation plan

Scope:

- Implement strict timetable period existence validation for `AttendancePolicy.selectedPeriodIds`.
- Implement strict timetable period existence validation for roll-call request `periodId` when creating a new PERIOD session and `periodId` is supplied or required by the effective policy.
- Preserve ATT-POL-2B selected-period membership gating.
- Preserve existing idempotency and DAILY behavior.
- No schema changes.
- No migrations.
- No route changes.
- No presenter envelope changes.

Likely files to change:

- `src/modules/academics/timetable/infrastructure/timetable.repository.ts`
- `src/modules/academics/timetable/application/timetable-attendance-compatibility.service.ts` or a new narrow timetable attendance period reference service
- `src/modules/academics/timetable/timetable.module.ts`
- `src/modules/attendance/policies/policies.module.ts`
- `src/modules/attendance/policies/application/create-attendance-policy.use-case.ts`
- `src/modules/attendance/policies/application/update-attendance-policy.use-case.ts`
- `src/modules/attendance/policies/application/policy-use-case.helpers.ts`
- `src/modules/attendance/policies/domain/policy-contract.validation.ts` if a pure helper is needed
- `src/modules/attendance/roll-call/roll-call.module.ts`
- `src/modules/attendance/roll-call/application/resolve-roll-call-session.use-case.ts`
- `src/modules/attendance/roll-call/domain/policy-period-selection.ts` or a new roll-call period reference helper
- focused unit tests under attendance policies, roll-call, and timetable tests
- E2E/security tests listed below

Migration:

- No.

Repository/service algorithm:

1. Add a timetable repository method that returns valid period ids for a supplied id list in the active school scope.
2. Filter by period ids and relation to `timetableConfig`:
   - same `academicYearId`,
   - same `termId`,
   - config status in `DRAFT` or `ACTIVE`.
3. Return only ids, not tenant fields or raw records.
4. Add a timetable application service method that uses this repository method and returns a `Set<string>` or boolean.

Policy create algorithm:

1. Resolve active attendance scope.
2. Resolve and validate academic year and term as today.
3. Resolve policy scope as today.
4. Normalize policy names and conflict checks as today.
5. Normalize/validate advanced contract structure as today.
6. If normalized `selectedPeriodIds` is non-empty, call timetable validation service with the policy academic year and term.
7. If any ids are not returned, throw `ValidationDomainException` with safe details.
8. Persist exactly as ATT-POL-1 does.

Policy update algorithm:

1. Load existing policy as today.
2. Resolve next academic year and term as today.
3. Resolve next scope as today.
4. Run existing conflict checks.
5. If and only if the request body owns `selectedPeriodIds`, normalize the supplied replacement list and validate every id through timetable service using the next academic year and term.
6. Do not validate existing stored selected ids when the field is omitted.
7. Persist partial update as today.

Roll-call resolve algorithm:

1. Resolve attendance scope, academic context, date, roll-call scope, and periodKey as today.
2. Look up existing session by the current uniqueness key.
3. If existing session is found, return it immediately with no timetable validation.
4. Assert term writable as today.
5. Resolve effective policy as today.
6. If mode is DAILY, do not validate timetable period existence.
7. If mode is PERIOD and effective policy has non-empty `selectedPeriodIds`, run ATT-POL-2B missing/membership validation first.
8. If mode is PERIOD and a normalized `periodId` is present after the membership gate, call timetable validation service using roll-call academic year and term.
9. If the timetable service rejects the id, throw `ValidationDomainException` with safe details.
10. Create the session as today, preserving `policyId` and normalized `periodId`.

Idempotency rules:

- Existing sessions are never revalidated.
- Existing sessions are never mutated by the new validation.
- The database uniqueness key remains `[schoolId, academicYearId, termId, date, scopeType, scopeKey, mode, periodKey]`.
- Race fallback on unique constraint keeps returning the existing session.

Security coverage:

- Add a security test where School A tries to save a policy with School B's `TimetablePeriod.id`.
- Add a security test where an unsafe School A policy is manually seeded with School B's period id, then School A tries to create a PERIOD session using it; the request must be rejected and no session created.
- Ensure error bodies do not include `schoolId`, `organizationId`, `membershipId`, `roleId`, `deletedAt`, internal actor ids, or raw Prisma data.

Risk mitigations:

- Keep validation service return type minimal.
- Keep controllers unchanged.
- Keep all Prisma access in repositories.
- Keep timetable existence validation independent from timetable entry existence.
- Do not require publication.
- Use real timetable period ids in E2E tests after ATT-POL-2D.

## 15. Tests required for ATT-POL-2D

Unit tests:

- Policy create accepts valid `selectedPeriodIds` from same school, academic year, and term.
- Policy create rejects nonexistent `selectedPeriodIds`.
- Policy create rejects a period id from a different term.
- Policy create rejects a period id from an archived config.
- Policy update validates replacement `selectedPeriodIds` when supplied.
- Policy update does not validate stored `selectedPeriodIds` when omitted.
- Policy update can clear `selectedPeriodIds` with `[]`.
- Roll-call existing session idempotency returns before timetable validation.
- Roll-call DAILY ignores `periodId` existence validation.
- Roll-call PERIOD with no effective policy and omitted `periodId` preserves legacy behavior.
- Roll-call PERIOD with empty selected ids and omitted `periodId` preserves legacy behavior.
- Roll-call PERIOD with supplied invalid `periodId` rejects when creating a new session.
- Roll-call PERIOD with non-empty selected ids still rejects missing `periodId`.
- Roll-call PERIOD with non-empty selected ids still rejects disallowed `periodId` before timetable lookup.
- Roll-call PERIOD with non-empty selected ids and allowed valid `periodId` creates the session and stores `policyId`.

E2E tests:

- Create a timetable config and real timetable period, then create an AttendancePolicy with that real `selectedPeriodIds` value.
- Create policy with nonexistent `selectedPeriodIds` and expect 400 `validation.failed`.
- Update policy with invalid `selectedPeriodIds` and expect 400 `validation.failed`.
- Resolve a PERIOD roll-call session with a valid selected timetable period id and normal `periodKey`.
- Resolve a PERIOD roll-call session with a selected but nonexistent/foreign-context period id and expect 400 `validation.failed`.
- Preserve existing attendance foundation flow after changing ATT-POL-2B symbolic period ids to real timetable period ids where strict validation applies.
- Preserve DAILY roll-call behavior.
- Preserve empty `selectedPeriodIds` legacy behavior.
- Preserve existing-session idempotency if policy or timetable validation would reject a new session.

Security tests:

- School A cannot save School B's `TimetablePeriod.id` in `selectedPeriodIds`.
- School A cannot use School B's period id to authorize a new PERIOD roll-call session.
- Validation errors do not leak tenant/internal fields.
- Existing `test/security/tenancy.attendance.spec.ts` remains green.
- Existing `test/security/tenancy.academics-timetable-dashboard-workflows.spec.ts` remains green.

Regression suites to run in ATT-POL-2D:

- `npm run test -- attendance-policy --runInBand`
- `npm run test -- roll-call --runInBand`
- `npm run test -- timetable --runInBand`
- `npm run test -- attendance --runInBand`
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/attendance-foundation.e2e-spec.ts`
- `npm run test:e2e -- --runInBand --runTestsByPath test/e2e/academics-timetable-dashboard-workflows.e2e-spec.ts`
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.attendance.spec.ts`
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.academics-timetable-dashboard-workflows.spec.ts`

## 16. Deferred items

Explicitly deferred from ATT-POL-2D:

- Threshold mutation.
- Automatic PRESENT to LATE conversion.
- Automatic PRESENT to EARLY_LEAVE conversion.
- Threshold warning/rejection response contracts.
- `autoAbsentAfterMinutes` runtime behavior.
- Derived daily attendance from periods.
- Persisted derived DAILY sessions.
- Report-only derived daily computation.
- Notification dispatch.
- Communication notification enqueueing.
- Teacher App behavior changes.
- Parent App behavior changes.
- Student App behavior changes.
- Dashboard/report behavior changes.
- Timetable entry existence validation for roll-call.
- Same timetable config validation.
- Same timetable scope/classroom/section/grade/stage validation.
- Timetable publication validation.
- Historical session mutation.
- Backfill or cleanup of existing invalid policy rows.
- Schema/index migrations unless future profiling shows a real need.

## 17. Verification evidence

Required lightweight checks:

- `git status --short --untracked-files=all`: PASS
  - Output: `?? docs/sprint-att-pol-2c-timetable-period-validation-reality-audit.md`
- `git diff --name-only`: PASS
  - Output: empty. The only repository change is a new untracked documentation file, so plain `git diff` has no tracked-file diff to report.
- `git diff --stat`: PASS
  - Output: empty for the same reason.
- `git diff --check`: PASS
  - Output: empty.

Optional read-only checks:

- `npm run build`: NOT_RUN - documentation-only audit, no runtime files changed.
- `npm run test -- attendance --runInBand`: NOT_RUN - documentation-only audit, no runtime files changed.
- `npm run test -- timetable --runInBand`: NOT_RUN - documentation-only audit, no runtime files changed.

No migrations were run. `npx prisma generate` was not run.

## 18. Final verdict

READY_FOR_ATT_POL_2D_IMPLEMENTATION

Strict timetable period existence validation is feasible without schema changes. The safest ATT-POL-2D implementation is a narrow validation service owned by Academics Timetable and consumed by Attendance policy and roll-call use-cases. It should validate same-school, same-academic-year, same-term timetable periods, allow DRAFT and ACTIVE config periods, reject ARCHIVED config periods, preserve ATT-POL-2B idempotency, and avoid broader rule application.
