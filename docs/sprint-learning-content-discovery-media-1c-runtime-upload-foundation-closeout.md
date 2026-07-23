# Learning Content Discovery and Media 1C — Runtime and Upload Foundation Closeout

## Scope and baseline

This integrated phase combines the ffprobe runtime prerequisite and direct
learning-media upload foundation on branch
`feat/learning-content-media-1c-runtime-upload-foundation` from baseline
`ce7451b26553c71664a72b178fe77470d31ea823`.

It does not implement playback, Student or Parent playback routes, generic
media-library APIs, transcoding, thumbnails, resumable multipart upload, or
deployment. The implementation is committed as
`9a91bb3ec8bbaf0960ab40068e06c515c0a06943` and published in PR #41.
The first GitHub Actions run completed with Learning Content Integrity and
Migration Integrity passing, while Learning Media Integrity failed because the
legacy classifier ran before baseline migrations initialized the database.
No overall CI-green claim is made until the workflow correction is committed,
pushed, and the required checks rerun successfully.

## Independent-review correction evidence

The correction red group ran against the first implementation and produced two
failed suites with 16 behavioral/contract failures and 14 passes out of 30.
Those failures demonstrated the mutable final-object design, terminal PUT
replay gap, discovery-owned cleanup attempts, infrastructure misclassification,
video-only attachment gate, unreachable historical-uploader verification,
incomplete lifecycle constraints, missing runtime startup identity guard,
incomplete idempotent replay, controller-only HTTP/security evidence, and
missing CORS proof. Syntax, fixture, and infrastructure failures were not
accepted as correction evidence.

The V3 correction then added nine focused behavioral/database red proofs before
changing production behavior. They demonstrated a CHECK-invalid finalization
recovery state, inability to return recovery to a valid retryable state,
abandoned-session non-expiry, cleanup job-ID collision between staging and
final phases, a persisted capability boundary that could precede the signed
URL boundary, false UPLOADING state after signing failure, MOV accepted as MP4,
Matroska accepted as WebM, and SQL/JavaScript filename-normalization drift.
Infrastructure, fixture, syntax, and import failures were excluded.

The V3.1 surgical correction added one real Redis/BullMQ and PostgreSQL red
case. Against the retained-completed-job implementation, the first
finalization-recovery cycle completed but the second cycle timed out while the
session remained `finalization_cleanup_pending`. The focused red result was
one failed test with eight skipped in the nine-test cleanup suite. No
infrastructure or fixture failure was counted.

## Canonical runtime and startup identity

The repository owns a multi-stage `Dockerfile` based on the immutable image:

```text
node:20.19.4-bookworm-slim@sha256:6db5e436948af8f0244488a1f658c2c8e55a3ae51ca2e1686ed042be8f25f70a
```

It installs exact Debian 12 packages:

```text
ffmpeg: 7:5.1.9-0+deb12u1
openssl: 3.0.20-1~deb12u2
```

The shared runtime contract fixes:

- executable `/usr/bin/ffprobe`;
- first line
  `ffprobe version 5.1.9-0+deb12u1 Copyright (c) 2007-2026 the FFmpeg developers`;
- identifier `ffprobe-5.1.9-debian12-learning-media-v1`;
- Node `spawn` with `shell: false`, closed stdin, working directory `/`, and a
  minimal child environment;
- protocol allowlist `file,pipe,fd`;
- 15,000 ms timeout;
- 786,432 stdout bytes, 262,144 stderr bytes, and 1,048,576 combined bytes;
- `SIGKILL` on timeout or output overflow;
- stable failure reasons with no raw subprocess output or paths.

The build verification script, application startup guard, and production probe
all consume this one contract. The rebuilt production image starts successfully
with the pinned binary. Overriding `FFPROBE_PATH` to `/usr/bin/ffmpeg` makes the
running application fail closed with `version_mismatch`. The runtime entrypoint
uses the actual Nest build output at `dist/src/main.js` and runs as the non-root
`node` user.

## Staging-to-final object lifecycle

Every new upload owns two distinct identities:

- a client-writable staging bucket/key used by every initial or renewed signed
  PUT; and
- a server-only final bucket/key stored on the finalized `File`.

No signed PUT is issued for the final key. Completion conditionally claims the
session, streams staging bytes once into a uniquely created temporary file,
counts and hashes those exact bytes, verifies the stat and expected size,
inspects/probes the local artifact, then streams that same artifact to the final
key. It stats the final object before atomically creating the File, moving the
session to READY, and writing the success audit. The temporary directory is
removed in `finally`.

The real MinIO integration proves object A can be uploaded and completed, the
original staging PUT can then write object B, and the finalized File still
returns A with A's persisted SHA-256. Cleanup after the recorded PUT capability
boundary removes staging B while final A remains unchanged.

LEGACY sessions have no staging identity or PUT capability. Their existing
File object is the final object and migration does not copy or rewrite it.

## PUT capability expiry and terminal cleanup

New intents are committed as CREATED. Only successful signing moves the session
to UPLOADING; a signing failure moves CREATED to FAILED with a bounded reason,
no URL, no File, and no completion audit. Identical replay returns that same
terminal result without another session, key, signing attempt, or create audit.

The storage adapter derives the capability boundary from the signed URL's
validated `X-Amz-Date` and `X-Amz-Expires` values. Initial signing and renewal
persist that exact boundary only after signing succeeds. Renewal keeps the same
session and staging key, writes no second create audit, takes the maximum known
capability expiry, and does not change the original two-hour session expiry.
FAILED, CANCELLED, and EXPIRED staging cleanup cannot become eligible before
the latest actual PUT expiry. Deletion evidence is written only after that
boundary and confirmed absence.

The exact-release MinIO test saves a valid PUT URL, cancels, replays the URL,
proves cleanup cannot finalize at or before the actual capability boundary,
then proves post-expiry cleanup removes the replayed object, the old URL cannot
recreate it, and repeated cleanup is idempotent. The same timing is used for
deterministic media rejection.

## Per-candidate cleanup retries and audits

One discovery job repeats every 15 minutes with one attempt. Before discovery,
it atomically expires abandoned CREATED and UPLOADING sessions whose two-hour
clock elapsed, using service audit attribution. Expiry races with completion,
cancellation, and renewal through conditional writes and repeated discovery is
idempotent.

Discovery enqueues a deterministic job per upload and cleanup target:
`staging`, `final`, or `finalization-recovery`. Candidate jobs own five attempts
with exponential backoff, so a visible claim does not make a retry wait for
stale-claim recovery. Duplicate discovery converges on active work for the same
target; claims older than 15 minutes can be recovered. A completed staging job
can remain in BullMQ history without blocking a later final-retention job for
the same upload.

When the database reports a candidate whose deterministic target job is still
retained in completed or failed history, discovery acquires a short
target-specific Redis lease, re-fetches the job, and removes it only if it is
still terminal. Waiting, delayed, active, and other live states are never
removed. Concurrent discoverers either replace the terminal job once or defer
to that replacement, while the deterministic ID continues to prevent duplicate
live work. The lease is token-released and has a bounded expiry.

Real Redis/BullMQ evidence proves one candidate's deletion fails twice and
succeeds on attempt three, with evidence written only after success. Separate
cases exhaust all five staging or finalization-recovery attempts and retain the
visible claim, failure state, and object for remediation. The full phase
sequence proves completed staging cleanup does not prevent a later seven-day
final cleanup from reaching PURGED; live DRAFT or ARCHIVED Lesson Content
references prevent the final phase.

The repeated-recovery integration proof drives the same upload through two
`finalization_cleanup_pending` cycles. The first completed job remains visible
in completed history; concurrent second discovery safely supersedes it, deletes
the second final object, returns the session to a CHECK-valid UPLOADING state,
leaves exactly one completed history entry and zero live duplicates, and writes
exactly two service-attributed cleanup audits.

Automated cleanup audits use `actorId: null` and `userType: SERVICE_ACCOUNT`.
They do not attribute system work to the historical uploader. User-triggered
intent, completion, cancellation, and explicit LEGACY verification continue to
audit the authenticated actor.

## Deterministic media rejection versus infrastructure failure

Deterministic byte, signature, MIME, container, codec, stream-layout, duration,
and dimension failures move a new upload to FAILED, write a stable failure audit,
schedule staging cleanup after capability expiry, and return the bounded 422
contract.

Storage, temporary-filesystem, ffprobe runtime, database, File insert, session
finalization, and audit failures do not become `probe_failed` or another false
media-invalid state. They write no completion success audit. If immediate
deletion of an uncommitted final object fails, the CHECK-valid recovery substate
is VERIFYING with `finalization_cleanup_pending` and an exact final cleanup
target. Successful recovery cleanup deletes that object and atomically returns
the session to a clean UPLOADING state with no stale final key evidence, claim,
File, or success audit. Retrying completion then creates exactly one File and
one success audit. Exhausted recovery cleanup attempts retain visible evidence
for remediation.

## Locked FILE MIME matrix

The accepted MIME matrix is:

```text
application/pdf
text/plain
image/jpeg
image/png
audio/mpeg
audio/mp4
audio/webm
video/mp4
video/webm
```

Video permits 200 MiB; non-video retains the existing 10 MiB boundary. Every
type receives streamed SHA-256 and signature/content verification independent
of client MIME. PDF and safe text require no duration or dimensions. JPEG/PNG
require dimensions. Audio requires an allowed container/codec and duration.
Video requires an allowed container/codec, duration, and rotation-aware
dimensions. ffprobe runs only for audio/video.

The canonical media-test image passes all nine types. MP4 requires an explicit
accepted ISO BMFF compatible brand and a consistent ffprobe format; QuickTime,
MOV, and unsupported brands are rejected. WebM requires EBML with DocType
`webm` and a consistent ffprobe format; Matroska and non-WebM EBML are rejected.
Raw magic spoofs, PDF as text, audio-only WebM as video, and NUL/binary text are
also rejected. Existing Academics Lesson Content fixtures remain PDF with
PDF-applicable READY facts rather than being rewritten as MP4.

## LEGACY management verification

`POST /api/v1/academics/learning-media/uploads/legacy/:uploadId/verify` is a
deliberate management-only action protected by `@SchoolManagementOnly()` and
both `academics.curriculum.manage` and `files.uploads.manage`.

It scopes and locks the exact same-organization, same-School LEGACY session and
File, requires a live Lesson Content reference, and cannot verify an arbitrary
same-School File. The current management actor performs and is credited for the
verification; the original uploader remains historical metadata. Integration
evidence covers historical School-management, Teacher, and Student uploaders.

## Idempotent replay

The unique intent key remains
`(schoolId, createdByUserId, purpose, clientRequestId)`. An identical normalized
payload returns the existing state without another session, object identity, or
create audit:

- UPLOADING can renew a PUT for the same staging key;
- VERIFYING returns retryable in-progress;
- READY returns the existing File/completion result;
- FAILED, CANCELLED, and PURGED return bounded terminal state, including after
  the session clock has elapsed;
- EXPIRED retains the stable 410 contract.

A different normalized payload returns the bounded 409 conflict.

## Database lifecycle constraints

The single migration introduced by this PR,
`20260722160000_learning_media_runtime_upload_foundation`,
was finalized before its initial commit; no second corrective migration was
added and no committed historical migration was edited. It owns 19
FileUploadSession CHECK constraints and the immutable
`normalize_learning_media_original_name` compatibility function. Active-chain
totals are 15 partial unique indexes, 38 CHECK constraints, one inventoried
function, and 54 PostgreSQL-specific integrity objects.

The constraints cover expected/actual size, exact lowercase SHA-256, duration,
dimensions, normalized name, staging/final identity separation, session and PUT
expiry, chronological cleanup eligibility/claim/deletion evidence,
MIME-specific authoritative facts, and all nine lifecycle states. READY final
eligibility is exactly `completedAt + 7 days`. PURGED requires the File, final
claim, final deletion evidence, and consistent staging evidence. Failed LEGACY
retains its File/final object and has no cleanup eligibility.

The direct PostgreSQL matrix passes 20 valid shapes and 36 named invalid shapes:
56/56. It covers all nine READY MIME shapes, every lifecycle state, the
finalization-recovery substate, and at least one invalid row for every one of
the 19 constraints. A 12/12 PostgreSQL rehearsal matrix proves the migration
function and JavaScript classifier agree for path basenames, all relevant Cc
ranges storable by PostgreSQL, ECMAScript surrounding whitespace including
NBSP, empty names, the 255/256-code-point boundary, combining characters, and
supplementary characters. No truncation or invented fallback name is used.

## Real HTTP, security, and browser CORS

The new E2E and security suites bootstrap the real `AppModule`, global guards,
global validation, real controllers/use cases/Prisma, and real MinIO where
upload/finalization is exercised. Security covers School management,
Organization management with selected School, custom School and Organization
roles with both permissions, each missing-permission case, Student, Parent,
Teacher, Applicant, Platform, foreign School, wrong owner, and safe response
denylist behavior. Denied actor classes are proven to fail before unit-of-work
lookup.

The exact MinIO release receives a real browser-style OPTIONS request. The
configured frontend origin is granted PUT with `content-type`; an unconfigured
origin receives no wildcard grant. Staging and production configuration require
explicit, non-wildcard origins and have no localhost default.

## Lesson Content integration

New FILE attachment/replacement/publication locks the exact READY session before
the File and requires same organization, School, creator, purpose, no final
cleanup claim, a live File, and one of the nine authoritative MIME types. Bare,
LEGACY, non-READY, claimed, deleted, wrong-owner, wrong-purpose, and foreign
records cannot authorize a new attachment.

The five Curriculum/Lesson Content unit-contract-controller suites pass 81/81.
The three PostgreSQL publication suites, including atomicity, pass 85/85. The
affected app unit regressions pass 97/97; four app E2E suites pass 28/28; four
app security suites pass 20/20.

## CI ownership

`.github/workflows/learning-media-integrity.yml` uses Node 20, PostgreSQL 16,
Redis 7, the exact MinIO release, full-history migration-base resolution, only
`npm ci`, governance, Prisma validation/deploy/status/generation, seed, build,
canonical runtime and startup identity smoke, the nine-MIME verifier, real
MinIO/CORS, per-candidate BullMQ cleanup, real HTTP/security, all five affected
Curriculum/Lesson Content unit suites, all three Lesson Content PostgreSQL
integration suites, and affected Academics/Student/Parent/Teacher unit,
E2E, and security regressions. It publishes and deploys no image.

PR #41 CI correction: `Learning Media Integrity / learning-media-integrity`
failed because `verify:legacy-learning-media` ran against an empty PostgreSQL
service before any baseline migration had created the `files` table. The
workflow now materializes `prisma/migrations` from the resolved
`MIGRATION_BASE_REF`, deploys that baseline into the disposable CI database,
then runs the legacy classifier before deploying the current 1C migration.
There is no production, schema, migration, package, or test-code change in
this correction. GitHub Actions remains pending until this workflow-only
correction is reviewed and pushed.

## Executed green evidence

- media unit/contract: 2/2 suites, 45/45 tests;
- upload lifecycle integration: 24/24 Jest tests, including 56/56 direct
  lifecycle rows;
- cleanup integration: 9/9;
- storage/CORS integration: 4/4;
- canonical MIME/container verification: 18/18;
- real learning-media E2E/security: 2/2 suites, 17/17;
- affected Curriculum/Lesson Content unit: 5/5 suites, 81/81;
- Lesson Content PostgreSQL integration: 3/3 suites, 85/85;
- affected app unit regressions: 7/7 suites, 97/97;
- affected app E2E: 4/4 suites, 28/28;
- affected app security: 4/4 suites, 20/20;
- core run 1: 5/5 suites, 82/82 tests;
- core run 2: 5/5 suites, 82/82 tests;
- core run 3: 5/5 suites, 82/82 tests;
- canonical image build, shared runtime verifier, non-root/Prisma smoke,
  pinned application startup, and wrong-binary rejection: PASS;
- migration governance: PASS, active migrations 7, new migrations 1,
  historical edits 0;
- exact PostgreSQL 16 six-to-seven upgrade: PASS;
- independent fresh seven-migration replay: PASS;
- normal seed, up-to-date status, and second deploy no-op in both rehearsals:
  PASS;
- Prisma format, validate, generate, and host build: PASS.

## Cleanup and deferred scope

Proof databases and the extracted baseline tree were removed after migration
rehearsal. Before teardown, the disposable database contained zero upload
sessions and learning-media audits, Redis reported zero keys, both MinIO test
buckets reported zero objects, and the phase temporary-file patterns reported
zero matches. The disposable PostgreSQL, Redis, and exact-release MinIO
containers and their anonymous volumes were removed, as were the replaced
MinIO volume, phase image tags, and the exact MinIO tag pulled for final proof.
Pre-existing stopped project services and their named volumes were not
modified. Final checks found zero phase database, Redis, MinIO-object,
temporary-file, Docker container/image/volume, Jest/application,
ffmpeg/ffprobe, and staged residue. Scoped ESLint passed for 33 V3-supported
TypeScript files; two inherited H1 Academics test files retain their pre-existing
lint debt and were not modified by V3. Changed-file Prettier and
`git diff --check` passed without a fix-mode linter or broad formatter.

Global prevention of later deletion of a File already referenced by PUBLISHED
content remains deferred to the future File/media lifecycle contract. Playback
and all later media phases were not implemented.
