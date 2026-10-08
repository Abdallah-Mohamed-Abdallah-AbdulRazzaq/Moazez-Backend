# ACC-10F — Consolidated Recipient Access Remediation and Final Closeout

## Authority and candidate

Authoritative base: `7cf4f8322099ad009c7d4798db6ec8ffa88c0ecf`. Original ACC-10 base:
`ee76002b05c169ff3823832e00ffa09877ce5268`.
Branch: `agent/acc-10f-security-regression-final-closeout`.
The clean existing task worktree was reused at the exact base with zero feature
commits. Fresh entry fetch verified unchanged local/fetched/remote main. Retained
ignored evidence from the stopped attempt was preserved.

The earlier stopped run independently verified GitHub merged state and ancestry
for the following accepted history. This continuation reuses that verification
as directed by the consolidated brief; it did not repeat the history audit.

| Slice | Accepted PR | Verified merge |
| --- | --- | --- |
| ACC-10A | #188 | `4ae44b9356dc12b63fc8fa8f3375aa8f867ba50e` |
| ACC-10B | #189 | `a7a0ba7e58f7ce91ae1acf393c152b302760372e` |
| ACC-10C | #190 | `e58c59bea28751a08efb94f7d4bc379888f9a5c8` |
| ACC-10D | #191 | `410177390fb970825d3fb4c50724bd943aa23736` |
| ACC-10E | #192 | `7cf4f8322099ad009c7d4798db6ec8ffa88c0ecf` |

One final normal candidate commit contains one production file, two test files,
and this document. Its exact commit/tree and Draft PR identity are bound in
retained final evidence and the PR. The document describes the candidate source;
it does not predict an exact-head CI run or claim ACC-10 merged.

## D10F-01: confirmed defect and remediation

Classification: **REAL_PRODUCT_DEFECT**. Affected contract:
**STUDENT_VISIBILITY_AND_FINAL_SENSITIVE_READ_FENCE**.

The stopped reproduction used real Student/Parent use cases, adapters, Core,
presenters and PostgreSQL queries. Identity authorization succeeded at T0; a
controlled Date advanced to visibleUntil before the final read. Student detail
returned with the earlier predicate time; Parent and a fresh Student request
returned not_found. The original proof, scripts, redacted logs, source hash and
verified disposable cleanup remain in ignored `coverage/acc10f/`.

Root cause: `getCurrentStudentContent` evaluated its default Date once and
reused it across both read phases. The existing SQL predicates were correct.
The correction changes the optional clock to `now?: Date` and supplies
`now ?? new Date()` separately at identity authorization and final sensitive
read. An explicit clock remains the same as-of instant in both phases.

The only production file is
`src/modules/academics/academic-content/application/academic-content-current-access.service.ts`.
There is no recipient repository, Parent, controller, presenter, signer, schema,
permission, runtime or CI implementation change.

The new default-clock unit case failed against the exact baseline (1 failed,
6 passed) while the explicit-clock case passed. After correction, the focused
Student/Parent unit run passed 12 cases. The final broad unit run includes both
clock contracts. The real PostgreSQL final suite passed 10 cases with zero skips
and verified cleanup. The visibility case advances Date exactly at the boundary
between two call-through queries and requires the domain not_found/404 result,
no final payload, and the final query's new timestamp.

`D10F-01=CLOSED_BY_REMEDIATION`.
Additional same-family defects: **0**. Open ACC-10 defects: **0**.

## Defect-neighborhood audit

| Path / invariant | Classification | Source and proof |
| --- | --- | --- |
| Student default detail clock | SAME_DEFECT_FAMILY; remediated D10F-01 | C, U, F10: default refresh / explicit fixed clock / PostgreSQL expiry |
| Parent two-phase detail clock | CORRECT_ALREADY | C, UP: fresh final clock; P: final read relationship/enrollment/cancellation/expiry cases |
| Student recipient asset capability | CORRECT_ALREADY | R selects current canonical publication and exact live PRIVATE File in one SQL snapshot; AS resolves policy; FS samples Date.now immediately before signing; F/UF expiry cases |
| Parent recipient asset capability | CORRECT_ALREADY | Same atomic R/AS/FS path with current Guardian ownership predicates and Guardian download policy; F/UF |
| Parent accessible-children | CORRECT_ALREADY | R/C: one final set-based statement revalidates server-resolved live child contexts; P/DL current children tests |
| Current successor resolution | CORRECT_ALREADY | L invalidates predecessor before successor publication; R fences exact publication/revision; F10 runs governed lifecycle between both actors' reads |
| Publication cancellation fence | CORRECT_ALREADY | R repeats PUBLISHED predicate; new Student F10 and existing Parent P controlled database mutations |
| Current relationship fence | CORRECT_ALREADY | R repeats live user/student/enrollment/Guardian predicates; F10/P mutation evidence |
| Visibility expiration fence | SQL CORRECT_ALREADY; Student caller remediated | R uses supplied instant; C now refreshes default final instant; F10/UP/P/UF |
| Notification navigation | CORRECT_ALREADY; Student detail inherits D10F-01 fix | CN/DL navigate durable content through current recipient use cases; stale publication metadata remains context only |

Files have one canonical authorization SQL snapshot followed by policy and bounded
capability issuance. The accepted signer contract resamples the remaining whole
visibility seconds after policy work. It does not add a historical fallback or
persist signed URLs. This audit does not claim that an already issued provider
capability can be revoked retroactively.

## Final gap classification

Every acceptance item below has exactly one final classification. Counts are
acceptance items, rather than table rows or Jest cases:

- **E** = COVERED_BY_EXISTING_SOURCE_AND_TESTS: 194.
- **V** = CLOSED_BY_NEW_VERIFICATION: 9.
- **R** = CLOSED_BY_REMEDIATION: 3.
- **N/A** = NOT_APPLICABLE: 13 frozen additions with no corresponding change.
- MISSING_VERIFICATION_FINAL_COUNT = **0**.
- UNRESOLVED_PRODUCT_DEFECT_COUNT = **0**.

The full expanded 219-item matrix is retained as
`coverage/acc10f/final-gap-matrix.json`. The table groups items only when their
classification, production authority, evidence and named contract are identical.
All test aliases resolve below to repository files; final-regression-ledger.json
retains the exact executed named cases and actual outcomes.

| Acceptance item(s) | Class | Production authority | Test/evidence | Named case / contract |
| --- | --- | --- | --- | --- |
| `HISTORICAL_SNAPSHOT_AS_ACL_NO`, `LATE_ENROLLMENT_ALLOW`, `FORMER_ENROLLMENT_DENY`, `LATE_GUARDIAN_ALLOW`, `FORMER_GUARDIAN_DENY`, `NOTIFICATION_OPT_OUT_NO_EFFECT` | E | R + SA + PA | A + S + P + SC | never queries historical audience as the access ACL; allows late matching Enrollment; allows notification opt-out and a late Guardian link; denies a historical recipient after Enrollment withdrawal; uses current relationships despite historical membership |
| `NULL_HISTORICAL_STUDENT_ACCOUNT_LATER_LINKED_ALLOW`, `NULL_HISTORICAL_PARENT_ACCOUNT_LATER_LINKED_ALLOW` | V | R + C + live App adapters | F10 | %s recipient detail allows a later linked account while frozen historical user remains null |
| `STUDENT_CURRENT_RELATIONSHIP_ALLOW` | E | R + SA + PA | S | matches immutable %s targets identically to ACC-10A |
| `STUDENT_FOREIGN_SCHOOL_DENY`, `STUDENT_FOREIGN_CONTENT_DENY`, `STUDENT_FOREIGN_PUBLICATION_DENY`, `STUDENT_FOREIGN_REVISION_DENY` | E | R + C | S | isolates both Schools even with known content, publication and revision identifiers |
| `STUDENT_SCHOOL_IMMUTABLE_TARGET` | E | R.matchingRevisionTarget | S | matches immutable SCHOOL targets identically to ACC-10A |
| `STUDENT_STAGE_IMMUTABLE_TARGET` | E | R.matchingRevisionTarget | S | matches immutable STAGE targets identically to ACC-10A |
| `STUDENT_GRADE_IMMUTABLE_TARGET` | E | R.matchingRevisionTarget | S | matches immutable GRADE targets identically to ACC-10A |
| `STUDENT_SECTION_IMMUTABLE_TARGET` | E | R.matchingRevisionTarget | S | matches immutable SECTION targets identically to ACC-10A |
| `STUDENT_CLASSROOM_IMMUTABLE_TARGET` | E | R.matchingRevisionTarget | S | matches immutable CLASSROOM targets identically to ACC-10A |
| `STUDENT_SUBJECT_ALLOCATION_VALID`, `STUDENT_SUBJECT_ALLOCATION_MISSING`, `STUDENT_SUBJECT_ALLOCATION_ZERO_HOURS`, `STUDENT_SUBJECT_ALLOCATION_DELETED`, `STUDENT_SUBJECT_ALLOCATION_WRONG_YEAR`, `STUDENT_SUBJECT_ALLOCATION_WRONG_TERM`, `STUDENT_SUBJECT_ALLOCATION_WRONG_GRADE`, `STUDENT_SUBJECT_ALLOCATION_WRONG_SUBJECT`, `PARENT_SUBJECT_ALLOCATION_VALID`, `PARENT_SUBJECT_ALLOCATION_MISSING`, `PARENT_SUBJECT_ALLOCATION_ZERO_HOURS`, `PARENT_SUBJECT_ALLOCATION_DELETED`, `PARENT_SUBJECT_ALLOCATION_WRONG_YEAR`, `PARENT_SUBJECT_ALLOCATION_WRONG_TERM`, `PARENT_SUBJECT_ALLOCATION_WRONG_GRADE`, `PARENT_SUBJECT_ALLOCATION_WRONG_SUBJECT` | E | R.matchingRevisionTarget + current SubjectAllocation | A + S + P | enforces current SubjectAllocation: matching/zero/missing/grade/year/term/deleted; requires current SubjectAllocation: missing/zero-hours/deleted/wrong-year/wrong-term/wrong-grade/wrong-subject; requires subject qualification on the same currently matching target |
| `STUDENT_VISIBILITY_CURRENT_PUBLISHED`, `STUDENT_VISIBILITY_FUTURE_PUBLISHED_AT`, `STUDENT_VISIBILITY_FUTURE_VISIBLE_FROM`, `STUDENT_VISIBILITY_VISIBLE_UNTIL_REACHED`, `STUDENT_VISIBILITY_SCHEDULED`, `STUDENT_VISIBILITY_CANCELLED`, `STUDENT_VISIBILITY_EXPIRED` | E | R.currentRecipientPublicationQuery | S | matches immutable %s targets identically to ACC-10A; denies non-current visibility/version %j |
| `STUDENT_IMMUTABLE_REVISION_PAYLOAD`, `STUDENT_MUTABLE_TARGETS_NOT_AUTHORITY`, `PARENT_IMMUTABLE_REVISION_PAYLOAD`, `PARENT_MUTABLE_TARGETS_NOT_AUTHORITY` | E | R + SP + PP | A + S + P | uses exact published Revision Targets after mutable authoring targets diverge; filters and presents immutable weekly title, description, targets, tags, links and details |
| `PARENT_CURRENT_RELATIONSHIP_ALLOW` | E | R + SA + PA | P | matches immutable %s targets identically to ACC-10A |
| `PARENT_FOREIGN_SCHOOL_DENY`, `PARENT_FOREIGN_CONTENT_DENY`, `PARENT_FOREIGN_PUBLICATION_DENY`, `PARENT_FOREIGN_REVISION_DENY` | E | R + C | P | isolates both Schools even with known content, publication and revision identifiers |
| `PARENT_SCHOOL_IMMUTABLE_TARGET` | E | R.matchingRevisionTarget | P | matches immutable SCHOOL targets identically to ACC-10A |
| `PARENT_STAGE_IMMUTABLE_TARGET` | E | R.matchingRevisionTarget | P | matches immutable STAGE targets identically to ACC-10A |
| `PARENT_GRADE_IMMUTABLE_TARGET` | E | R.matchingRevisionTarget | P | matches immutable GRADE targets identically to ACC-10A |
| `PARENT_SECTION_IMMUTABLE_TARGET` | E | R.matchingRevisionTarget | P | matches immutable SECTION targets identically to ACC-10A |
| `PARENT_CLASSROOM_IMMUTABLE_TARGET` | E | R.matchingRevisionTarget | P | matches immutable CLASSROOM targets identically to ACC-10A |
| `PARENT_VISIBILITY_CURRENT_PUBLISHED`, `PARENT_VISIBILITY_FUTURE_PUBLISHED_AT`, `PARENT_VISIBILITY_FUTURE_VISIBLE_FROM`, `PARENT_VISIBILITY_VISIBLE_UNTIL_REACHED`, `PARENT_VISIBILITY_SCHEDULED`, `PARENT_VISIBILITY_CANCELLED`, `PARENT_VISIBILITY_EXPIRED` | E | R.currentRecipientPublicationQuery | P | matches immutable %s targets identically to ACC-10A; denies non-current visibility/version %j |
| `STUDENT_WRONG_USER_DENY` | E | R + SA | S + KS | fails closed on wrong-user |
| `STUDENT_WRONG_STUDENT_DENY` | E | R + SA | S + KS | fails closed on wrong-student |
| `STUDENT_WRONG_ENROLLMENT_DENY` | E | R + SA | S + KS | fails closed on wrong-enrollment |
| `STUDENT_WRONG_CLASSROOM_DENY` | E | R + SA | S + KS | fails closed on wrong-classroom |
| `STUDENT_WRONG_YEAR_DENY` | E | R + SA | S + KS | fails closed on wrong-year |
| `STUDENT_WRONG_TERM_DENY` | E | R + SA | S + KS | fails closed on wrong-term |
| `STUDENT_INACTIVE_STUDENT_DENY` | E | R + SA | S + KS | fails closed on inactive-student |
| `STUDENT_DELETED_STUDENT_DENY` | E | R + SA | S + KS | fails closed on deleted-student |
| `STUDENT_DELETED_ENROLLMENT_DENY` | E | R + SA | S + KS | fails closed on deleted-enrollment |
| `STUDENT_INACTIVE_USER_DENY` | E | R + SA | S + KS | fails closed on inactive-user |
| `PARENT_REMOVED_LINK_DENY` | E | R + PA | P + KP | revalidates current Parent relationship: removed-link |
| `PARENT_DELETED_GUARDIAN_DENY` | E | R + PA | P + KP | revalidates current Parent relationship: deleted-guardian |
| `PARENT_WRONG_GUARDIAN_OWNER_DENY` | E | R + PA | P + KP | revalidates current Parent relationship: wrong-guardian-owner |
| `PARENT_DELETED_USER_DENY` | E | R + PA | P + KP | revalidates current Parent relationship: deleted-user |
| `PARENT_WRONG_USER_TYPE_DENY` | E | R + PA | P + KP | revalidates current Parent relationship: wrong-user-type |
| `PARENT_NO_GUARDIAN_IDS_DENY` | E | R + PA | P + KP | revalidates current Parent relationship: no-guardian-ids |
| `PARENT_FOREIGN_CHILD_DENY`, `PARENT_SAME_SCHOOL_UNOWNED_CHILD_DENY`, `PARENT_RANDOM_CHILD_DENY`, `PARENT_FOREIGN_PARENT_DENY` | E | R + PA | P + KP + F | excludes non-owned children even when stale notification metadata names them; foreign/random Parent child stops before capability issuance; canonical Parent tenancy child ownership cases |
| `PARENT_WITHDRAWN_ENROLLMENT_DENY` | E | R + PA | P + DL | denies a historical recipient after Enrollment withdrawal |
| `STUDENT_DEFAULT_FINAL_CLOCK_REFRESH`, `STUDENT_EXPLICIT_CLOCK_PRESERVED`, `STUDENT_EXPIRY_BETWEEN_READS_404` | R | C.getCurrentStudentContent | U + F10 | refreshes the final default clock and preserves an explicit clock (explicit=%s); Student final real payload read denies after identity succeeds: visibility-ended |
| `STUDENT_FINAL_ENROLLMENT_CHANGED_DENY`, `STUDENT_FINAL_ENROLLMENT_WITHDRAWN_DENY`, `STUDENT_FINAL_ACTOR_INACTIVE_DENY`, `STUDENT_FINAL_USER_UNLINKED_DENY`, `STUDENT_FINAL_CANCELLATION_DENY` | V | R + C + live App adapters | F10 | Student final real payload read denies after identity succeeds: enrollment-changed/enrollment-withdrawn/actor-inactive/student-unlinked/cancelled |
| `STUDENT_FINAL_SUCCESSOR_PREDECESSOR_DENY`, `PARENT_FINAL_SUCCESSOR_PREDECESSOR_DENY` | V | R + C + live App adapters | F10 | %s final read denies predecessor after a governed successor publishes between phases |
| `PARENT_DEFAULT_FINAL_CLOCK_REFRESH`, `PARENT_FINAL_REMOVED_LINK_DENY`, `PARENT_FINAL_ENROLLMENT_CHANGED_DENY`, `PARENT_FINAL_CANCELLATION_DENY`, `PARENT_FINAL_VISIBILITY_ENDED_DENY` | E | R + C.getCurrentParentContent | UP + P | uses the current clock again at the final sensitive read; fences the final sensitive read after identity authorization: removed-link/enrollment-changed/cancelled/visibility-ended |
| `STUDENT_AUDIENCE_STUDENTS`, `STUDENT_AUDIENCE_GUARDIANS`, `STUDENT_AUDIENCE_STUDENTS_AND_GUARDIANS`, `STUDENT_AUDIENCE_INTERNAL_STAFF` | E | R + SP + PP | S | allows Student/Parent audience %s; denies unavailable audience/type %j |
| `STUDENT_TEACHER_PREPARATION_DENY`, `STUDENT_GUARDIAN_NOTE_POLICY` | E | R + SP + PP | S | denies unavailable audience/type %j; projects immutable Guardian Note metadata and body without adding acknowledgement state |
| `STUDENT_FEED_MINIMIZATION`, `STUDENT_DETAIL_MINIMIZATION`, `STUDENT_ONLINE_SESSION_SECRETS_DETAIL_ONLY`, `PARENT_FEED_MINIMIZATION`, `PARENT_DETAIL_MINIMIZATION`, `PARENT_ONLINE_SESSION_SECRETS_DETAIL_ONLY` | E | R + SP + PP | S + P | filters immutable session instants/platform and exposes capabilities only in authorized detail; presents Subject Resource and General Resource immutable details and safe asset metadata |
| `STUDENT_FILE_FOREIGN`, `STUDENT_FILE_CROSS_SCHOOL`, `STUDENT_FILE_DELETED`, `STUDENT_FILE_ZERO_SIZE`, `STUDENT_FILE_PUBLIC`, `STUDENT_FILE_ABSENT_REVISION_ASSET`, `STUDENT_FILE_MUTABLE_ONLY`, `STUDENT_FILE_PREDECESSOR_ONLY`, `STUDENT_FILE_SUCCESSOR_EXACT`, `STUDENT_FILE_PREVIEW`, `STUDENT_FILE_DOWNLOAD`, `STUDENT_FILE_INLINE_POLICY`, `STUDENT_FILE_UNSUPPORTED_PREVIEW`, `STUDENT_FILE_FINITE_VISIBILITY_TTL`, `STUDENT_FILE_NEAR_EXPIRY_NO_CAPABILITY`, `STUDENT_FILE_LATE_RELATIONSHIP`, `STUDENT_FILE_FORMER_RELATIONSHIP`, `STUDENT_FILE_SUBJECT_ALLOCATION`, `PARENT_FILE_FOREIGN`, `PARENT_FILE_CROSS_SCHOOL`, `PARENT_FILE_DELETED`, `PARENT_FILE_ZERO_SIZE`, `PARENT_FILE_PUBLIC`, `PARENT_FILE_ABSENT_REVISION_ASSET`, `PARENT_FILE_MUTABLE_ONLY`, `PARENT_FILE_PREDECESSOR_ONLY`, `PARENT_FILE_SUCCESSOR_EXACT`, `PARENT_FILE_PREVIEW`, `PARENT_FILE_DOWNLOAD`, `PARENT_FILE_INLINE_POLICY`, `PARENT_FILE_UNSUPPORTED_PREVIEW`, `PARENT_FILE_FINITE_VISIBILITY_TTL`, `PARENT_FILE_NEAR_EXPIRY_NO_CAPABILITY`, `PARENT_FILE_LATE_RELATIONSHIP`, `PARENT_FILE_FORMER_RELATIONSHIP`, `PARENT_FILE_SUBJECT_ALLOCATION` | E | R.findCurrentRecipientAsset + AS + FS | F + UF | signs a current exact private RevisionAsset and returns only the capability; rejects unusable File %s; exact revision membership / successor retained=%s; current download flag denies download while retaining preview; caps finite visibility TTL at the remaining window; issues no capability when policy work consumes the final whole second; allows a late current relationship absent from historical audience; denies a former relationship despite historical recipient membership; requires current positive SubjectAllocation |
| `PARENT_AUDIENCE_STUDENTS`, `PARENT_AUDIENCE_GUARDIANS`, `PARENT_AUDIENCE_STUDENTS_AND_GUARDIANS`, `PARENT_AUDIENCE_INTERNAL_STAFF` | E | R + SP + PP | P | allows Student/Parent audience %s; denies unavailable audience/type %j |
| `PARENT_TEACHER_PREPARATION_DENY`, `PARENT_GUARDIAN_NOTE_POLICY` | E | R + SP + PP | P | denies unavailable audience/type %j; projects immutable Guardian Note metadata and body without adding acknowledgement state |
| `FILE_NORMAL_TTL_300`, `FILE_RAW_STORAGE_METADATA_NO`, `FILE_SIGNED_URL_PERSISTED_NO`, `GENERIC_FILE_SHORTCUT_NO` | E | R + FS + existing generic Files boundary | F + UF + GF | HTTP access returns a 307 private no-store redirect without storage metadata; foreign/random Parent child stops before capability issuance; existing generic Files download boundary cases; signer sanitization and bounded expiry cases |
| `STUDENT_DEEP_LINK_CURRENT_SUCCESSOR`, `PARENT_SINGLE_CHILD_DEEP_LINK`, `PARENT_MULTI_CHILD_CURRENT_CHILDREN`, `STALE_PUBLICATION_ID_NOT_ACL`, `NOTIFICATION_POSSESSION_NOT_ACL`, `PARALLEL_NOTIFICATION_CENTER_NO` | E | CN + C + R + PA + SA | DL + CP | navigates from a persisted Student notification to the current successor detail; navigates a single-child Parent link to the current child-scoped successor; uses the existing multi-child resolver and current children, including a child without historical recipient membership; denies former Student enrollment; denies a removed Guardian link |
| `INITIAL_NOTIFICATION_BEFORE_VISIBLE_FROM_NO`, `UPDATED_NOTIFICATION_BEFORE_VISIBLE_FROM_NO`, `CANCELLATION_BEFORE_FIRST_VISIBILITY_NO`, `REMINDER_BEFORE_VISIBLE_FROM_NO` | E | PN + accepted ACC-10A visibility policy | N + NU + LG | schedules future visibility and recovers long-delayed due events deterministically; skips offsets before visibleFrom in %s without rescheduling; publication notification and later-event visibility cases |
| `SET_BASED_FEED`, `N_PLUS_ONE_NO`, `QUERY_SCALE`, `QUERY_PLAN`, `CURRENT_SUCCESSOR_ONLY` | E | R + one-active publication invariant + L | SC + S + P | uses current relationships despite historical membership; resolves current successor identities throughout the large feed; accepted six exact production SQL EXPLAIN cases rerun through unchanged scale suite |
| `STUDENT_VIEW_ONLY`, `PARENT_VIEW_ONLY`, `TEACHER_VIEW_MANAGE_PUBLISH`, `CANONICAL_ROLE_GRANTS_UNCHANGED`, `BOOTSTRAP_IDEMPOTENT` | E | IAM | B + IAMP | grants parent/student exactly recipient view; grants Teacher only view, manage and publish; canonical reference-data bootstrap persisted grants after both runs |
| `STUDENT_ROUTES_105_72_33`, `PARENT_ROUTES_77_65_12`, `TEACHER_ROUTES_149_79_70` | E | existing app controllers | route-inventory.cjs baseline/candidate + KS + KP + KT | complete method/path arrays equal to exact base; total/GET/non-GET assertions |
| `CORE_CONSUMERS_8`, `MEDIA_CONSUMERS_1`, `MAINTENANCE_REPEATS_9`, `API_CONSUMERS_0`, `API_SCHEDULES_0`, `REDIS_STEADY_40_RESERVE_4_MAX_44` | E | RT + frozen queue topology | RU + canonical CI PRD3-G02 | owns exactly the eight Core consumers; owns only Learning Media cleanup; owns exactly nine registrations; API producer-only; ADR-0008 exact Redis budget source contract |
| `MIGRATION_COUNT_26`, `LATEST_MIGRATION_20261006155322_FILE_LIVE_REFERENCE_INTEGRITY`, `FIRST_FRESH_DEPLOY`, `SECOND_DEPLOY_NOOP`, `MIGRATE_STATUS_CURRENT`, `SCHEMA_PARITY` | E | prisma/schema.prisma + frozen prisma/migrations + MIGRATION_GOVERNANCE.md | MG | fresh disposable complete replay, exact applied count before/after second deploy, final migrate status; read-only diff --from-schema-datasource to current datamodel exit-code zero |
| `ACC_1_TO_9_REGRESSION`, `TEACHER_READ_AUTHORING_FILES_WORKFLOW_REVIEW_REGRESSION`, `UPLOAD_FILE_LIFETIME_REGRESSION` | E | existing Academic Content + Teacher + Files modules | LG + T + FL + KT | canonical existing full selected suites; exact named executed cases retained in final-regression-ledger.json |
| `STUDENT_APP_REGRESSION`, `PARENT_APP_REGRESSION`, `COMMUNICATION_REGRESSION`, `GENERIC_FILES_REGRESSION` | E | existing app / Communication / Files modules | KS + KP + CP + GF | canonical tenancy, app final closeout, Communication center/presentation/deep-link/push and generic Files boundaries |
| `PRISMA_VALIDATE`, `PRISMA_GENERATE`, `PRODUCTION_TYPECHECK`, `PRODUCTION_BUILD`, `DIFF_CHECK`, `ZERO_NEW_LINT_ERRORS`, `ZERO_NEW_LINT_WARNINGS`, `ZERO_NEW_TYPE_DIAGNOSTICS` | E | current source + frozen quality configuration | static-gates.json + lint-comparison.json + typecheck-comparison.json | actual command exit codes; unfiltered exact-base/candidate diagnostic comparison with zero introduced and removed diagnostics |
| `NEW_SCHEMA_NO`, `NEW_MIGRATION_NO`, `NEW_ROUTE_NO`, `NEW_PERMISSION_NO`, `NEW_QUEUE_NO`, `NEW_WORKER_NO`, `NEW_CONSUMER_NO`, `NEW_REPEAT_NO`, `DEPLOYMENT_CHANGE_NO`, `NOTIFICATION_RUNTIME_CHANGE_NO`, `CI_ROUTER_CHANGE_NO`, `CI_CLASSIFIER_CHANGE_NO`, `ACC11_CHANGE_NO` | N/A | production diff allowlist | precommit-evidence.json | No corresponding change: exactly one production file, bounded clock semantics; no additions requiring new behavior verification |

### Source and test alias inventory

| Alias | Exact source or evidence |
| --- | --- |
| R | src/modules/academics/academic-content/infrastructure/academic-content-recipient-read.repository.ts (currentRecipientPublicationQuery, matchingRevisionTarget, findCurrentRecipientDetail, findCurrentRecipientAsset) |
| C | src/modules/academics/academic-content/application/academic-content-current-access.service.ts |
| SA | src/modules/student-app/access/student-app-access.service.ts + student-app-student-read.adapter.ts |
| PA | src/modules/parent-app/access/parent-app-access.service.ts + parent-app-guardian-read.adapter.ts |
| SP | src/modules/student-app/academic-content/presenters/student-academic-content.presenter.ts |
| PP | src/modules/parent-app/academic-content/presenters/parent-academic-content.presenter.ts |
| AS | src/modules/academics/academic-content/files/application/academic-content-recipient-asset-access.service.ts |
| FS | src/modules/academics/academic-content/files/application/academic-content-authorized-file.signer.ts |
| L | src/modules/academics/academic-content/infrastructure/academic-content-publication-lifecycle.repository.ts + academic-content-publication-snapshot.repository.ts |
| PN | src/modules/academics/academic-content/application/academic-content-publication-notification.service.ts + src/modules/academics/academic-content/domain/academic-content-publication-notification.policy.ts |
| CN | src/modules/communication/application/communication-app-notification-center.service.ts + src/modules/communication/presenters/communication-app-notification.presenter.ts |
| IAM | src/modules/iam/reference-data (canonical permission and system role derivation / bootstrap) |
| RT | src/runtime/core-worker/core-worker-consumers.module.ts + src/runtime/media-worker/media-worker-consumer.module.ts + src/runtime/maintenance-scheduler/maintenance-schedules.module.ts + src/modules/health/operational-probe.manifests.ts + adr/ADR-0008-redis-topology-and-recovery.md |
| S | test/integration/student-academic-content.integration.spec.ts |
| P | test/integration/parent-academic-content.integration.spec.ts |
| A | test/integration/academic-content-current-access.integration.spec.ts |
| F | test/integration/academic-content-recipient-asset-access.integration.spec.ts |
| F10 | test/integration/academic-content-acc10-final-closeout.integration.spec.ts |
| U | src/modules/academics/academic-content/tests/academic-content-recipient-read.spec.ts |
| UP | src/modules/academics/academic-content/tests/academic-content-parent-recipient-read.spec.ts |
| UF | src/modules/academics/academic-content/files/tests/academic-content-authorized-file.signer.spec.ts |
| DL | test/integration/academic-content-deep-link-navigation.integration.spec.ts |
| SC | test/integration/academic-content-recipient-scale.integration.spec.ts |
| B | test/integration/reference-data-bootstrap.integration.spec.ts |
| IAMP | src/modules/iam/reference-data/tests/academic-content-permissions.spec.ts |
| N | test/integration/academic-content-publication-notifications.integration.spec.ts + academic-content-app-notifications.integration.spec.ts |
| NU | src/modules/academics/academic-content/tests/academic-content-publication-notification.spec.ts + academic-content-later-notifications.spec.ts |
| GF | test/security/tenancy.files.spec.ts + tenancy.files-generic-download-boundary.spec.ts |
| KS | test/security/tenancy.student-app.spec.ts + test/e2e/student-app-final-closeout.e2e-spec.ts |
| KP | test/security/tenancy.parent-app.spec.ts + test/e2e/parent-app-final-closeout.e2e-spec.ts |
| KT | test/security/tenancy.teacher-app.spec.ts + test/e2e/teacher-app-final-closeout.e2e-spec.ts |
| RU | src/runtime/runtime-role.module-contract.spec.ts + critical-queue-recovery.contract.spec.ts; scripts/tests/verify-runtime-policy.test.cjs |
| MG | scripts/tests/check-migration-governance.test.cjs + migration-rebaseline-authorization.test.cjs; canonical migration-governance profile with read-only migrate diff |
| LG | canonical existing test/integration/academic-content-*.integration.spec.ts; every executed file/case is listed in retained final-regression-ledger.json |
| T | test/integration/teacher-academic-content-{read,authoring,files,workflow-publication}.integration.spec.ts + academic-content-acc9-final-closeout.integration.spec.ts |
| FL | test/integration/file-lifetime-integrity.integration.spec.ts + academic-content-upload-lifecycle.integration.spec.ts |
| CP | src/modules/communication/tests/communication-app-notification-center.service.spec.ts + communication-app-notification.presenter.spec.ts + communication-academic-content-notifications.spec.ts + communication-notification-push-delivery.service.spec.ts + communication-academic-content-contract.spec.ts |

## Security, visibility, files and notification results

Known foreign School/content/publication/revision IDs cannot select recipient
detail. Student identity/enrollment/classroom/year/term substitutions and
inactive/deleted records fail closed. Parent requires current Guardian ownership
and current child enrollment; foreign, unowned and random children remain
non-disclosing. Established resource not_found/404 and policy 403 contracts are
preserved.

Current access uses live relationships, exact immutable publication Revision,
immutable targets and current matching positive SubjectAllocation. Historical
AudienceRecipient rows are never ACL. Late matching relationships are allowed;
former relationships are denied. The new Student/Parent null-history tests prove
that later live account linkage allows real detail while the historical row
remains byte-for-field unchanged. Guardian notification opt-out has no effect on
content access. Mutable authoring data cannot override the published payload.

Visibility remains PUBLISHED, publishedAt <= now, visibleFrom <= now and
visibleUntil null or now < visibleUntil. Future publishedAt/visibleFrom,
SCHEDULED/CANCELLED/EXPIRED and reached visibleUntil deny. Student final read now
uses fresh default time; Parent already did. Governed successor races for both
actors deny the in-flight predecessor, then a new request returns the successor.

Student audience is STUDENTS or STUDENTS_AND_GUARDIANS, excluding Guardian Note
and Teacher Preparation. Parent audience is GUARDIANS or dual; Guardian Note is
allowed when otherwise authorized and Teacher Preparation remains denied.
Feed/detail presenters whitelist recipient fields. Online Session capabilities
remain absent from feed and available only in authorized detail.

File capabilities require exact current RevisionAsset membership, live PRIVATE
positive-size same-School File, recipient preview/download policy and supported
inline type. Mutable-only/predecessor-only/foreign/deleted/public/zero-size File
cases deny. Normal TTL is 300 seconds; finite visibility clamps it; consuming the
last whole visibility second during policy work yields no capability. Feed/detail
and redirect contracts expose no bucket/objectKey/provider coordinates or signed
capability persistence. Generic Files cannot bypass ACC recipient authorization.

Communication remains notification truth. Deep links navigate durable content
through current access; stale publication IDs and historical child metadata are
not ACL. Parent multi-child navigation uses the existing current-children resolver.
Initial/update/reminder notifications cannot precede visibleFrom; cancellation
before first visibility does not generate the cancellation notification. No
parallel notification center or new deep-link type was introduced.

## Scale, routes and permissions

The unchanged ACC-10E scale and six exact production SQL query-plan cases were
rerun through their canonical suite. Existing EXPLAIN observations and source
analysis remain authoritative; this task does not repeat manual plan archaeology,
change indexes or impose timing thresholds. Both feeds remain one set-based SQL
statement for page and total, with no per-publication authorization loop.

| Family | Total routes | GET | Non-GET | ACC grants |
| --- | ---: | ---: | ---: | --- |
| Student | 105 | 72 | 33 | view only |
| Parent | 77 | 65 | 12 | view only |
| Teacher | 149 | 79 | 70 | view, manage, publish |

Complete baseline/candidate method/path arrays are identical. Bootstrap tests
prove persisted canonical grants after both convergence runs, uniqueness and
idempotency. Catalogs and all role grants are frozen.

## Local regression and cleanup

The selected canonical files are disjoint across final groups. Exact files and
named cases are retained in final-regression-ledger.json; no predicted totals or
skipped suites are counted as a pass. Disposable groups use the unchanged CI
shard harness and ownership-checked cleanup. Local installed dependencies match
the accepted lock; the schema-matching generated client is reused during running
tests to avoid Windows DLL locks, followed by actual Prisma generate after tests.

| Group | Suites | Cases | Skipped | Result / cleanup |
| --- | ---: | ---: | ---: | --- |
| unit | 115 | 1266 | 0 | PASS / PASS |
| focus | 1 | 10 | 0 | PASS / PASS |
| integration | 6 | 289 | 0 | PASS / PASS |
| scale | 3 | 49 | 0 | PASS / PASS |
| legacy1 | 8 | 56 | 0 | PASS / PASS |
| legacy2 | 8 | 369 | 0 | PASS / PASS |
| legacy3 | 4 | 35 | 0 | PASS / PASS |
| teacher | 7 | 302 | 0 | PASS / PASS |
| security | 6 | 144 | 0 | PASS / PASS |
| migration | 0 | 39 | 0 | PASS / PASS |
| governance | 0 | 11 | 0 | PASS / PASS |

Final local Jest total: **158 suites / 2520 cases / 0 skipped**.
Additional Node TAP governance: **3 files / 50 cases / 0 skipped**.
Unique selected files: **161**. Migration/runtime Node TAP counts
come from actual runner footers and are listed separately in the ledger. The
canonical harness leaves its Jest count fields null for TAP profiles; those null
fields are not treated as zero-case passes.

The legacy groups cover draft lifecycle, management, links/tags/Revision V2, type
authoring/details, library, review/workflow/templates, publication intent/snapshot/
runtime/notifications, review decision notifications, uploads and File lifetime.
Teacher read/authoring/files/workflow and ACC-9 final regression are preserved.
Student/Parent ACC unit/integration, tenancy and app final closeout, Communication
center/presentation/generation/push and generic Files boundaries pass. Full
canonical exact-head CI supplies all foreign-domain and universal regression
shards; terminal evidence is collected after this complete candidate is pushed.

The first new integration attempt passed all 10 assertions but failed teardown:
the reused scale fixture did not remove the extra recipient-target/link rows
created by the governed lifecycle tests. Classification: TEST_DEFECT. Cleanup was
corrected only in the new suite, scoped to its owned Schools. Final rerun passed
with cleanup. An invalid inactive-user fixture enum was corrected to the existing
DISABLED value; temporary unsafe bind typings were replaced with precise function
types. No test failure was hidden, suppressed or used to broaden production scope.

## Database, runtime and quality gates

All 26 frozen migrations remain unchanged. Latest:
`20261006155322_file_live_reference_integrity`.
The canonical migration-governance profile created an empty owned PostgreSQL
database, replayed the complete chain, checked applied migration count, ran a
second deploy with unchanged count/no pending migration, and obtained final
CURRENT status. A read-only Prisma diff from schema datasource to current datamodel
used the deployed governance convention and exited 0: schema parity PASS. No
manual DDL, db push, resolve, reset, staging or production connection was used.

Core consumers **8**, Media consumers **1**, maintenance repeats **9**, API
consumers/schedules **0/0**. Queue Redis steady/reserve/maximum remain **40/4/44**,
as governed by ADR-0008 and canonical PRD3-G02 source/runtime assertions. No
runtime capacity or DevOps configuration mutation is required.

| Quality gate | Actual result |
| --- | --- |
| Prisma validate / generate | PASS / PASS |
| Production typecheck / build | PASS / PASS |
| Migration frozen-file check / migration tests | PASS / PASS |
| Fresh first deploy / second deploy no-op / status | PASS / PASS / CURRENT |
| Read-only schema parity | PASS (exit 0) |
| Changed TypeScript ESLint | clean PASS: base 0 errors/0 warnings, candidate 0/0 |
| Changed TypeScript diagnostics | clean PASS: base 0, candidate 0 |
| Introduced / removed lint and type diagnostics | 0 / 0 |
| Diff check | PASS |

Full unfiltered diagnostics and per-file comparisons against the exact base are
retained. This candidate needs no inherited-baseline exception. There are no
suppression or quality configuration changes. The final staged diff and source
hashes are bound by precommit-evidence.json before the single normal commit.

## Candidate and deferred boundaries

`ACC_10F=PASS/READY_FOR_INDEPENDENT_BACKEND_REVIEW` describes the verified
consolidated source candidate. Exact-head CI run/jobs/checks/canonical artifact
hash are independently collected and reported in terminal evidence after the
Draft PR is created; no run ID or count is predicted in this commit.

`ACC_10=IN_PROGRESS/PENDING_FINAL_REVIEW_MERGE_EXACT_MAIN`.
Only independent Backend acceptance, Ready, the post-Ready race guard, normal
two-parent merge and verified exact-main CI can close ACC-10.

ACC-11 is NOT_STARTED. Candidate ACC-11 entry and Student/Parent backend API
handoff readiness are YES/PENDING_ACC10_FINAL_MERGE. Recommended later ACC-11
scope: ENGAGEMENT_ACKNOWLEDGEMENTS_AND_ANALYTICS. No automatic start occurs.

Engagement, acknowledgement and analytics remain NOT_STARTED. Copy/reuse,
custom folders, Ask Teacher context, advanced digests and zero-downtime published
Revision replacement remain DEFERRED. No frontend repository change occurs.

Ready is not pressed; no merge, deployment or deployed production mutation is
performed. The task stops after the one Draft PR's exact-head canonical evidence.
