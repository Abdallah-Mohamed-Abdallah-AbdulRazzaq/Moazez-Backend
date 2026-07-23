# Learning Content Discovery and Media 1D - Student Secure Playback Closeout

## Scope and baseline

- Phase: `LEARNING-CONTENT-DISCOVERY-AND-MEDIA-1D`
- Branch: `feat/learning-content-media-1d-student-secure-playback`
- Baseline and unchanged `HEAD`: `78b33af6b852b41d4166629f697dbf53ceb3b785`
- Route:
  `GET /api/v1/student/lessons/:lessonPlanItemId/content/:contentItemId/playback`
- Schema changes: 0
- Migration changes: 0
- Package changes: 0
- Permission or role changes: 0

This phase implements Student-only secure video playback. Parent playback,
Teacher playback, proxy streaming, HLS/DASH, transcoding, thumbnails, schema
work, and upload-lifecycle changes remain outside this phase.

## HTTP and authorization contract

The controller accepts only the two UUID path parameters. It requires
`academics.lesson_plans.view`; it neither requires nor uses
`files.downloads.view`. Both parameters use the established UUID validation
boundary.

The use case resolves the current Student and active enrollment through
`StudentAppAccessService`. The persistence boundary then reuses
`visibleStudentLessonWhere` and proves the exact active School, classroom,
academic year, term, Subject, LessonPlan, Curriculum, Unit, Lesson,
LessonPlanItem, LessonContentItem, File, and FileUploadSession relation. It does
not add a current TeacherSubjectAllocation predicate, so a stale historical
allocation does not hide an otherwise valid activated plan.

The success body contains exactly:

```text
url
expiresAt
mimeType
sizeBytes
disposition
renewable
```

`sizeBytes` is a decimal string, `mimeType` is the authoritative `video/mp4` or
`video/webm`, `disposition` is `inline`, `renewable` is `true`, and the TTL is
exactly 300 seconds. No File, upload-session, tenant, actor, storage-coordinate,
checksum, filename, or verification field is returned.

All owned-route resource failures collapse to
`learning.content.playback_not_found` / 404 with no `details`. Actor-class and
permission failures remain at the existing global security boundary.

## READY media eligibility

Playback requires:

- PUBLISHED, non-deleted FILE content on the exact Curriculum/Unit/Lesson;
- a non-deleted File in the exact School and Organization;
- the File's unique upload session with purpose `LESSON_CONTENT` and status
  `READY`;
- no final cleanup claim and no final-object deletion evidence;
- authoritative verification timestamp, size, MIME, duration, width, and
  height;
- File/session MIME, size, File ID, final bucket, and final object-key parity;
- `video/mp4` or `video/webm`.

The PostgreSQL matrix proves rejection of DRAFT and ARCHIVED content, deleted
File, cleanup-claimed READY, mismatched size or MIME, audio, image, document,
bare/unrelated File, wrong lesson/content relation, wrong classroom/year/term/
School context, and database-valid CREATED, UPLOADING, VERIFYING, LEGACY,
FAILED, CANCELLED, EXPIRED, and PURGED session shapes.

## Signing capability and compatibility

The shared signed-GET boundary now returns `{ url, expiresAt }` and accepts an
explicit `attachment | inline | none` disposition. `expiresAt` is derived from
validated `X-Amz-Date` and `X-Amz-Expires` values in the actual MinIO
capability; malformed or missing expiry values fail closed.

Student playback signs only the finalized File coordinates with an inline
Content-Disposition and authoritative video Content-Type for 300 seconds.
Original filenames and staging coordinates are not supplied to the signer.

The generic Files, Communication, Parent, and Applicant callers explicitly use
`attachment` and still return only the URL string with their existing TTL,
filename, authorization, audit, response, and error behavior.

The Generic Files actor-boundary security test was corrected to mock the
current `PresignedGetCapability` result instead of the obsolete URL string. It
now verifies the 307 redirect and the complete attachment-signing input for
School, Organization, and custom management actors while retaining all denied
actor, tenant-isolation, deleted/missing File, and no-leak assertions.

## Serialization and renewal

The adapter performs a preliminary scoped read, then a final PostgreSQL
transaction. Before its final candidate read, it revalidates and protects the
complete mutable Student authorization graph using parameterized shared row
locks in this deterministic order:

```text
User
Student
Membership
Enrollment
Term
Stage
Grade
Section
Classroom
Subject
LessonPlanItem
LessonPlan
Curriculum
CurriculumUnit
CurriculumLesson
FileUploadSession
File
LessonContentItem
```

The `LessonPlanItem`-before-`LessonPlan` order is compatible with the existing
LessonPlan soft-delete cascade. Existing Lesson Content media locks retain
their established Curriculum-to-Content order. The authorization gate proves
the exact active Student User, linked active Student, active scoped
Membership, active Enrollment and placement, non-deleted Term and classroom
hierarchy, active Subject and LessonPlan, and non-deleted exact LessonPlanItem.
It then revalidates the complete playable candidate and performs signing while
all authorization and media eligibility locks remain held.

Database-backed tests prove both serial directions for:

- Enrollment withdrawal;
- User deactivation;
- Student deactivation;
- Subject deactivation;
- LessonPlan archive;
- LessonPlanItem soft deletion;
- playback versus unpublish;
- playback versus archive;
- playback versus File soft deletion;
- playback versus final cleanup claim.

For each authorization mutation, the mutation-first case produces no
capability and invokes signing zero times. In the playback-first case,
PostgreSQL proves the conflicting writer is blocked while the controlled
signing callback remains open; playback returns one capability, the writer
then completes, and subsequent playback is denied. All three independent
33-test executions completed with no deadlock, transaction timeout, or open
handle. Repeated eligible requests produce renewed capabilities without
persisting a URL, mutating the session, or writing an AuditLog.

Global prevention of deleting a File later referenced by PUBLISHED content is
still deferred to its separate lifecycle contract.

## Real MinIO evidence

The supported MinIO release returned:

- HTTP 206 for `Range: bytes=0-1023`;
- exact `Content-Range: bytes 0-1023/4096`;
- `Accept-Ranges: bytes`;
- the exact expected 1024-byte slice;
- authoritative `video/mp4` Content-Type;
- inline Content-Disposition;
- `X-Amz-Expires=300`;
- exact returned-expiry parity with signed time plus 300 seconds.

The test obtained a second valid capability, removed its object, and removed
its unique bucket.

## Security and no-leak evidence

Real AppModule tests prove Student success, the exact response allowlist,
renewal, permission rejection, actor rejection for Parent, Teacher, Applicant,
Platform, School management, and Organization management, classroom and
cross-School isolation, malformed UUID validation, guessed/mismatched IDs, and
one safe hidden-resource error.

The response/error denylist covers File/session IDs, tenant IDs, actor/uploader
IDs, bucket, object key, checksum, and verification version. Playback writes no
AuditLog and no signed capability is persisted.

Repository inspection found the stable `rate_limit.exceeded` error mapping but
no active runtime rate-limit implementation. This remains an operational
residual; 1D did not add a new rate-limit subsystem.

## Executed validation

- Focused playback and signed-URL unit suites: 3/3 suites, 15/15 tests.
- Affected download-caller unit suites: 4/4 suites, 44/44 tests.
- Generic Files actor-boundary compatibility: 1/1 suite, 7/7 tests.
- Focused playback PostgreSQL, MinIO Range, Student E2E, and Student security
  group: 4/4 suites, 60/60 tests.
- Existing Student lesson and learning-media unit regressions: 3/3 suites,
  54/54 tests.
- Student playback PostgreSQL integration: 1/1 suite, 33/33 tests on each of
  three independent runs.
- Existing upload/storage/cleanup integration: 3/3 suites, 37/37 tests.
- Real MinIO Range integration: 1/1 suite, 1/1 test.
- Student lesson E2E: 1/1 suite, 19/19 tests.
- Student lesson security: 1/1 suite, 7/7 tests.
- Complete repository security inventory: 89/89 suites, 1152/1152 tests.
- Build: PASS.
- Migration governance: PASS (`active=7`, `new=0`).
- Prisma validate: PASS.
- Prisma generate: PASS.
- Supported Phase 1D ESLint surface: PASS. Differential JSON audit found zero
  branch-introduced findings in the six tracked modified test hunks. The broad
  historical changed-test surface still contains 96 errors and 2 warnings,
  all outside those hunks and identical to the baseline findings, so the
  unrelated debt was not rewritten.
- Prettier supported paths: PASS. The Applicant document test is a verified
  unchanged baseline whole-file formatting exception; its Phase 1D capability
  mock and attachment assertions were inspected separately. An unfiltered
  all-changed-file Prettier exit-code-zero result is not claimed.
- `git diff --check`: PASS.

The Learning Media Integrity workflow now executes the focused Student
playback/storage/caller tests, PostgreSQL playback integration, real MinIO
Range integration, the Generic Files actor-boundary compatibility regression,
and the affected Student E2E/security suites. No GitHub Actions green claim is
made before a user-owned commit, push, and check run.

## Cleanup and review state

- Playback fixture rows: 0.
- Playback/test AuditLog residue: 0.
- MinIO object residue: 0.
- Playback Range bucket residue: 0.
- Redis keys introduced by this phase: 0.
- Temporary files introduced by this phase: 0.
- Disposable PostgreSQL, Redis, and MinIO containers/volumes: removed at final
  cleanup.
- Unauthorized files: 0.
- Staged files: 0.
- Commits, pushes, pull requests, ZIPs, and review archives: 0.

The final change set contains exactly the 29 authorized paths reported in the
repository status. Parent and Teacher playback remain unimplemented.
