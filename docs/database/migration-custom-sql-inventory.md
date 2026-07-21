# Migration Custom SQL Inventory

## Incident

`MIGRATION-RECOVERY-0A` — Canonical Prisma Migration Rebaseline and Permanent Governance.

This inventory was completed against commit `905d67c0` before removing any
directory from `prisma/migrations`. The legacy chain contains 61 committed
migration directories. Its immutable copy remains available through Git tag
`migration-history-pre-rebaseline-20260710`.

## Audit method and result

The audit read every committed `migration.sql` file, classified every DDL
statement, compared the resulting objects with `prisma/schema.prisma`, and
cross-checked a Prisma from-empty SQL rendering. The Prisma diff was supporting
evidence only; the legacy SQL was inspected independently.

The legacy chain contains:

- 139 `CREATE TABLE` statements matching the 139 Prisma models.
- 124 `CREATE TYPE` statements matching the 124 final Prisma enums.
- 16 historical enum-value additions already consolidated in the final enum
  definitions.
- 1,099 indexes, of which 1,085 are reproducible from Prisma schema index and
  uniqueness declarations and 14 are unsupported partial unique indexes.
- 589 foreign keys, including 295 composite foreign keys, all represented by
  Prisma relations and referential actions.
- 13 PostgreSQL `CHECK` constraints that Prisma cannot express in this schema.

The only still-required objects that a from-empty Prisma diff cannot reproduce
are the 14 partial unique indexes and 13 `CHECK` constraints below. All 27 must
be copied into the canonical baseline.

## Partial unique indexes — copy into baseline

All rows in this table have `Represented by schema.prisma = No` and
`Copy into baseline = Yes`. `unique_active_teacher_membership` is described by
a schema comment, but a comment is not executable schema representation.

| Source migration directory                                    | Object name                                              | Purpose / predicate                                                                                                                | Tests that protect the invariant                                                                                                                                                                      |
| ------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260416225721_0001_core_identity`                           | `unique_active_teacher_membership`                       | At most one active `TEACHER` membership per user: `status = 'ACTIVE' AND user_type = 'TEACHER'`.                                   | Broad IAM/teacher tenancy suites rely on it, but no direct database-constraint assertion exists. This is a documented test gap covered during this incident by catalog verification and fresh replay. |
| `20260419162438_0003_academic_structure`                      | `academic_years_one_active_per_school`                   | At most one non-deleted active academic year per school.                                                                           | `src/common/tests/demo-academics.seed.spec.ts`; `src/modules/academics/structure/tests/academic-years.repository.spec.ts`.                                                                            |
| `20260428165644_0010_reinforcement_foundation`                | `reinforcement_task_templates_school_name_en_active_key` | A non-null English template name is unique among non-deleted templates in a school.                                                | `src/modules/reinforcement/templates/tests/reinforcement-templates.use-case.spec.ts`; `test/e2e/reinforcement-foundation.e2e-spec.ts`. No direct duplicate-name database assertion exists.            |
| `20260428165644_0010_reinforcement_foundation`                | `xp_policies_active_scope_key`                           | One active, non-deleted XP policy for an exact school/year/term/scope tuple.                                                       | `src/modules/reinforcement/xp/tests/reinforcement-xp.use-case.spec.ts`; `test/security/tenancy.reinforcement.spec.ts`.                                                                                |
| `20260430120000_0012_rewards_foundation`                      | `reward_redemptions_one_open_per_student_item`           | One open (`REQUESTED` or `APPROVED`) redemption per school, catalog item, and student.                                             | `src/modules/reinforcement/rewards/tests/reward-redemptions.use-case.spec.ts`; `test/security/tenancy.rewards.spec.ts`; `test/e2e/rewards-foundation.e2e-spec.ts`.                                    |
| `20260430180000_0013_behavior_foundation`                     | `behavior_point_ledger_one_effective_entry_per_record`   | One effective `AWARD` or `PENALTY` row per behavior record while allowing reversals.                                               | `src/modules/behavior/tests/behavior-review.use-case.spec.ts`; `test/security/tenancy.behavior.spec.ts`.                                                                                              |
| `20260501120000_0014_communication_core_chat`                 | `communication_invites_one_pending_per_user`             | One pending invite per school, conversation, and invited user.                                                                     | `src/modules/communication/tests/communication-participant-domain.spec.ts`; communication participant use-case, e2e, and security suites.                                                             |
| `20260501120000_0014_communication_core_chat`                 | `communication_join_requests_one_pending_per_user`       | One pending join request per school, conversation, and requester.                                                                  | `src/modules/communication/tests/communication-participant-domain.spec.ts`; communication participant use-case, e2e, and security suites.                                                             |
| `20260501120000_0014_communication_core_chat`                 | `communication_user_blocks_one_active_pair`              | One active directional block pair until `unblocked_at` is set.                                                                     | `src/modules/communication/tests/communication-block-domain.spec.ts`; communication block use-case and core-chat e2e/security suites.                                                                 |
| `20260501120000_0014_communication_core_chat`                 | `communication_user_restrictions_one_active_type`        | One active restriction of each type per school and target user until lifted.                                                       | `src/modules/communication/tests/communication-restriction-domain.spec.ts`; communication restriction use-case and core-chat e2e/security suites.                                                     |
| `20260525150000_0026_curriculum_foundation`                   | `curricula_one_non_deleted_scope_key`                    | One non-deleted curriculum per exact school/year/term/grade/subject scope.                                                         | `src/modules/academics/curriculum/tests/curriculum.use-case.spec.ts`; `test/e2e/academics-curriculum-foundation.e2e-spec.ts`.                                                                         |
| `20260526130000_0028_lesson_plans_foundation`                 | `lesson_plans_school_allocation_week_active_key`         | One non-deleted lesson plan per school, teacher allocation, and week.                                                              | `src/modules/academics/lesson-plans/tests/lesson-plans.use-case.spec.ts`; lesson-plan e2e/security suites.                                                                                            |
| `20260526150000_0030_homework_answers_submission_attachments` | `hw_submission_answers_current_unique`                   | One non-deleted answer per homework submission and question while permitting soft-deleted history.                                 | `src/modules/homework/tests/homework-answers-attachments.use-case.spec.ts`; homework answer/attachment e2e/security suites. No direct concurrent uniqueness assertion exists.                         |
| `20260705054526_parent_pickup_request_creation`               | `dismissal_requests_one_active_per_student`              | One non-deleted active pickup request per school and student for `REQUESTED`, `QUEUED`, `CALLED`, `MOVING`, `AT_GATE`, or `READY`. | `test/e2e/parent-smart-pickup-request-creation.e2e-spec.ts`; dismissal golden-path suites.                                                                                                            |

## CHECK constraints — copy into baseline

All rows in this table have `Represented by schema.prisma = No` and
`Copy into baseline = Yes`.

| Source migration directory                                  | Object name                                               | Purpose / expression                                                                                                                                                         | Tests that protect the invariant                                                                                                                              |
| ----------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260416225721_0001_core_identity`                         | `memberships_ended_at_required_when_inactive_check`       | Historical origin: the baseline predicate is `status = 'ACTIVE' OR ended_at IS NOT NULL`; the active chain is corrected by `20260720182221_membership_suspended_open_state`. | `test/integration/membership-ended-at-constraint.integration.spec.ts` directly proves the corrected open/closed-state matrix after this correction.           |
| `20260609120000_0031_school_entitlements`                   | `school_entitlements_student_seat_limit_positive`         | Seat limit is either unlimited (`NULL`) or positive.                                                                                                                         | `src/modules/platform-admin/tests/platform-admin-entitlement.use-case.spec.ts`; seat-limit policy tests; platform-admin seat enforcement e2e/security suites. |
| `20260609130000_0032_school_feature_controls`               | `school_feature_controls_feature_key_snake_case`          | Feature keys match `^[a-z][a-z0-9_]*$`.                                                                                                                                      | `src/modules/platform-admin/tests/platform-admin-feature-registry.spec.ts`; platform-admin feature-control use-case tests.                                    |
| `20260609140000_0033_applicant_profiles`                    | `applicant_profiles_relationship_allowed`                 | Relationship is one of `father`, `mother`, `guardian`, or `relative`.                                                                                                        | `src/modules/applicant-portal/tests/applicant-portal-foundation.spec.ts`; applicant-account e2e/security suites.                                              |
| `20260609150000_0034_admission_required_documents`          | `admission_required_documents_title_not_blank`            | Reject a whitespace-only required-document title using `length(btrim(title)) > 0`.                                                                                           | Required-document unit/e2e/security suites exercise valid values; no direct blank-row database assertion exists.                                              |
| `20260609150000_0034_admission_required_documents`          | `admission_required_documents_max_files_positive`         | Require `max_files > 0`.                                                                                                                                                     | Required-document unit/e2e/security suites exercise positive values; no direct non-positive database assertion exists.                                        |
| `20260610170000_0035_applicant_admission_requests`          | `applicant_admission_requests_child_first_name_not_blank` | Reject a whitespace-only child first name.                                                                                                                                   | `src/modules/applicant-portal/tests/applicant-portal-requests.spec.ts`; applicant request e2e/security suites.                                                |
| `20260610170000_0035_applicant_admission_requests`          | `applicant_admission_requests_child_full_name_not_blank`  | Reject a whitespace-only derived child full name.                                                                                                                            | `src/modules/applicant-portal/tests/applicant-portal-requests.spec.ts`; applicant request e2e/security suites.                                                |
| `20260610170000_0035_applicant_admission_requests`          | `applicant_admission_requests_draft_not_submitted`        | A `DRAFT` request cannot have `submitted_at`.                                                                                                                                | `src/modules/applicant-portal/tests/applicant-portal-requests.spec.ts`; applicant request-submission e2e/security suites.                                     |
| `20260610190000_0036_applicant_admission_request_documents` | `applicant_admission_request_documents_title_not_blank`   | Reject a whitespace-only uploaded-document title.                                                                                                                            | `src/modules/applicant-portal/tests/applicant-portal-documents.spec.ts`; document e2e/security suites.                                                        |
| `20260610190000_0036_applicant_admission_request_documents` | `applicant_admission_request_documents_type_not_blank`    | Reject a whitespace-only document type.                                                                                                                                      | `src/modules/applicant-portal/tests/applicant-portal-documents.spec.ts`; document e2e/security suites.                                                        |
| `20260613120000_0038_academic_calendar_events`              | `academic_calendar_events_date_range_check`               | Require `start_date <= end_date`.                                                                                                                                            | `src/modules/academics/calendar/tests/calendar-events.use-case.spec.ts`; `test/e2e/academics-calendar-events.e2e-spec.ts`.                                    |
| `20260613120000_0038_academic_calendar_events`              | `academic_calendar_events_scope_consistency_check`        | Enforce the exact `scope_type`/`scope_key`/stage/grade/section nullable-field shape for `SCHOOL`, `STAGE`, `GRADE`, and `SECTION`.                                           | Calendar event use-case tests; `test/e2e/academics-calendar-events.e2e-spec.ts`; `test/security/tenancy.academics-calendar-events.spec.ts`.                   |

### Active-chain correction: Membership open and closed states

The constraint originates in the canonical baseline with the original
predicate `status = ACTIVE OR ended_at IS NOT NULL`. The incremental
`20260720182221_membership_suspended_open_state` migration keeps the same
constraint name and corrects the active-chain predicate to
`status IN (ACTIVE, SUSPENDED) OR ended_at IS NOT NULL`.

- Final purpose: `INACTIVE` and `TRANSFERRED` Memberships require `ended_at`;
  `ACTIVE` and `SUSPENDED` are open lifecycle states and may have
  `ended_at = NULL`.
- `schema.prisma` representation: none.
- Owner: custom PostgreSQL `CHECK` constraint.
- Direct database tests: present after this correction.

## Reviewed PostgreSQL-specific SQL that must not be copied

- The 16 raw enum additions are historical transition mechanics. The final
  enum values are present in `schema.prisma`, so the baseline's `CREATE TYPE`
  statements reproduce them directly. Re-appending `ALTER TYPE` statements
  would be incorrect.
- The 25 descending indexes are represented by `sort: Desc` declarations in
  `schema.prisma` and are reproduced by Prisma.
- The six indexes in
  `20260706153000_dismissal_operations_hardening_indexes` are semantically
  represented by current Prisma indexes. Their legacy names are not referenced
  by application code, so the baseline should use Prisma's canonical names and
  must not create duplicates.
- The 14 `RENAME CONSTRAINT` and eight `ALTER INDEX ... RENAME` operations in
  `20260428165644_0010_reinforcement_foundation` depend on names from the old
  chain and have no place in a from-empty baseline.
- Defaults, native arrays, JSON, decimals, normal unique indexes, composite
  keys, custom foreign-key names, composite foreign keys, and referential
  actions are all represented by the current Prisma schema.

## Negative inventory

No committed migration or current schema contains:

- extensions;
- functions or procedures;
- triggers;
- views or materialized views;
- expression indexes;
- GIN, GiST, BRIN, or hash indexes;
- exclusion constraints;
- row-level-security policies;
- custom collations;
- sequences outside Prisma-generated behavior;
- data backfills or other DML;
- `DashboardTodo`, Dashboard Todo tables, enums, indexes, permissions, or any
  equivalent persistence artifact.

`gen_random_uuid()` is used as the UUID default. No extension migration is
needed because the supported local/CI database is PostgreSQL 16, where this
function is built in.

## Baseline preservation rule

The canonical baseline must contain exactly the schema-generated from-empty SQL
plus the 27 objects identified above. Fresh replay verification must inspect
`pg_indexes` and `pg_constraint` by name, in addition to running Prisma status,
seed, build, and database-backed tests.
