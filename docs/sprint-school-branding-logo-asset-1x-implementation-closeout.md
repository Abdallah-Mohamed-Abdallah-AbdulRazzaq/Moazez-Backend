# School Branding Logo Asset 1X — Unified Implementation Closeout

## Status Header

```text
PROGRAM: SCHOOL-BRANDING-LOGO-ASSET-1X
STATUS: IMPLEMENTED; CI MOCK COMPATIBILITY CORRECTION VALIDATED
IMPLEMENTATION BASELINE: 9993a58a6b23fb4401434cdcd7ed3fa05520ed26
BRANCH: feat/school-branding-logo-asset-1x
ARCHITECTURE CONTRACT: docs/sprint-school-branding-logo-asset-0a-reality-contract-audit.md
PULL REQUEST: #21
ORIGINAL IMPLEMENTATION COMMIT: c35dcf7c50d4aef5f1220482af06121b4fa29a15
CORRECTION COMMIT SUBJECT: test(ci): complete BullMQ AppModule mocks
PR HEAD AFTER CORRECTION: the correction commit, not the original implementation commit
COMMITS AFTER BASELINE AFTER PUBLICATION: 2
STAGED FILES AFTER PUBLICATION: 0
```

This document is the working scope ledger and will become the final unified
implementation closeout. It does not authorize staging, committing, pushing,
or destructive legacy retirement.

## Materialized Unified File Allowlist

The implementation scope is the union of the locked Phase 1A and Phase 1B
allowlists plus only the non-destructive compatibility classifier and this
unified closeout. A listed path is authorized to change when required; listing
a path does not require changing it.

```text
prisma/schema.prisma
prisma/migrations/<generated_timestamp>_school_branding_logo_asset/migration.sql
ERROR_CATALOG.md

src/infrastructure/storage/minio.adapter.ts
src/infrastructure/storage/storage.service.ts
src/infrastructure/storage/tests/minio.adapter.spec.ts
src/infrastructure/storage/tests/storage.service.spec.ts

src/modules/settings/branding/branding.module.ts
src/modules/settings/branding/controller/branding.controller.ts
src/modules/settings/branding/controller/public-school-branding.controller.ts
src/modules/settings/branding/application/get-branding.use-case.ts
src/modules/settings/branding/application/update-branding.use-case.ts
src/modules/settings/branding/application/upload-branding-logo.use-case.ts
src/modules/settings/branding/application/delete-branding-logo.use-case.ts
src/modules/settings/branding/application/get-public-school-branding-logo.use-case.ts
src/modules/settings/branding/application/resolve-school-logo-url.service.ts
src/modules/settings/branding/application/branding-logo-cleanup-queue.service.ts
src/modules/settings/branding/application/process-branding-logo-cleanup.use-case.ts
src/modules/settings/branding/domain/branding-logo.constants.ts
src/modules/settings/branding/domain/branding-logo.errors.ts
src/modules/settings/branding/domain/branding-logo-signature.ts
src/modules/settings/branding/domain/branding-logo.types.ts
src/modules/settings/branding/domain/legacy-branding-logo-url.ts
src/modules/settings/branding/dto/branding-response.dto.ts
src/modules/settings/branding/dto/update-branding.dto.ts
src/modules/settings/branding/dto/upload-branding-logo.dto.ts
src/modules/settings/branding/infrastructure/branding.repository.ts
src/modules/settings/branding/infrastructure/branding-logo-cleanup.worker.ts
src/modules/settings/branding/presenters/branding.presenter.ts
src/modules/settings/branding/tests/update-branding.use-case.spec.ts
src/modules/settings/branding/tests/branding-logo-signature.spec.ts
src/modules/settings/branding/tests/legacy-branding-logo-url.spec.ts
src/modules/settings/branding/tests/branding-logo-lifecycle.spec.ts
src/modules/settings/branding/tests/public-school-branding-logo.spec.ts
src/modules/settings/branding/tests/branding-logo-cleanup.spec.ts
src/modules/settings/branding/tests/branding-repository-concurrency.spec.ts
test/e2e/settings-branding-logo.e2e-spec.ts
test/security/tenancy.settings-branding-logo.spec.ts

src/modules/applicant-portal/applicant-portal.module.ts
src/modules/applicant-portal/application/get-discoverable-school.use-case.ts
src/modules/applicant-portal/application/list-discoverable-schools.use-case.ts
src/modules/applicant-portal/application/get-applicant-request.use-case.ts
src/modules/applicant-portal/application/list-applicant-requests.use-case.ts
src/modules/applicant-portal/dto/applicant-request.dto.ts
src/modules/applicant-portal/dto/school-discovery.dto.ts
src/modules/applicant-portal/infrastructure/applicant-portal.repository.ts
src/modules/applicant-portal/presenters/applicant-request.presenter.ts
src/modules/applicant-portal/presenters/school-discovery.presenter.ts
src/modules/applicant-portal/tests/applicant-portal-foundation.spec.ts
src/modules/applicant-portal/tests/applicant-portal-requests.spec.ts
src/modules/applicant-portal/tests/applicant-portal-school-discovery.spec.ts
test/e2e/applicant-portal-account-foundation.e2e-spec.ts
test/e2e/applicant-portal-request-ownership.e2e-spec.ts
test/e2e/applicant-portal-school-discovery.e2e-spec.ts
test/security/tenancy.applicant-portal.spec.ts
test/security/tenancy.applicant-portal-requests.spec.ts
test/security/tenancy.applicant-portal-school-discovery.spec.ts

src/modules/teacher-app/teacher-app.module.ts
src/modules/teacher-app/shared/infrastructure/teacher-app-composition-read.adapter.ts
src/modules/teacher-app/home/application/get-teacher-home.use-case.ts
src/modules/teacher-app/home/presenters/teacher-home.presenter.ts
src/modules/teacher-app/profile/application/get-teacher-profile.use-case.ts
src/modules/teacher-app/profile/infrastructure/teacher-profile-read.adapter.ts
src/modules/teacher-app/profile/presenters/teacher-profile.presenter.ts
src/modules/teacher-app/settings/application/get-teacher-settings-about.use-case.ts
src/modules/teacher-app/settings/infrastructure/teacher-settings-read.adapter.ts
src/modules/teacher-app/settings/presenters/teacher-settings.presenter.ts
src/modules/teacher-app/home/tests/get-teacher-home.use-case.spec.ts
src/modules/teacher-app/home/tests/teacher-home.presenter.spec.ts
src/modules/teacher-app/profile/tests/teacher-profile.use-case.spec.ts
src/modules/teacher-app/profile/tests/teacher-profile.presenter.spec.ts
src/modules/teacher-app/profile/tests/teacher-profile-read.adapter.spec.ts
src/modules/teacher-app/settings/tests/teacher-settings.use-case.spec.ts
src/modules/teacher-app/settings/tests/teacher-settings.presenter.spec.ts
src/modules/teacher-app/settings/tests/teacher-settings-read.adapter.spec.ts
test/e2e/teacher-app-home-my-classes.e2e-spec.ts
test/e2e/teacher-app-final-closeout.e2e-spec.ts
test/security/tenancy.teacher-app.spec.ts

src/modules/student-app/student-app.module.ts
src/modules/student-app/home/application/get-student-home.use-case.ts
src/modules/student-app/home/dto/student-home.dto.ts
src/modules/student-app/home/infrastructure/student-home-read.adapter.ts
src/modules/student-app/home/presenters/student-home.presenter.ts
src/modules/student-app/profile/application/get-student-profile.use-case.ts
src/modules/student-app/profile/application/student-profile-response.builder.ts
src/modules/student-app/profile/application/upload-student-avatar.use-case.ts
src/modules/student-app/profile/application/delete-student-avatar.use-case.ts
src/modules/student-app/profile/dto/student-profile.dto.ts
src/modules/student-app/profile/infrastructure/student-profile-read.adapter.ts
src/modules/student-app/profile/presenters/student-profile.presenter.ts
src/modules/student-app/home/tests/get-student-home.use-case.spec.ts
src/modules/student-app/home/tests/student-home.presenter.spec.ts
src/modules/student-app/home/tests/student-home-read.adapter.spec.ts
src/modules/student-app/profile/tests/get-student-profile.use-case.spec.ts
src/modules/student-app/profile/tests/student-avatar.use-case.spec.ts
src/modules/student-app/profile/tests/student-profile.presenter.spec.ts
src/modules/student-app/profile/tests/student-profile-read.adapter.spec.ts
test/e2e/student-app-final-closeout.e2e-spec.ts
test/security/tenancy.student-app.spec.ts

src/modules/parent-app/parent-app.module.ts
src/modules/parent-app/home/application/get-parent-home.use-case.ts
src/modules/parent-app/home/dto/parent-home.dto.ts
src/modules/parent-app/home/infrastructure/parent-home-read.adapter.ts
src/modules/parent-app/home/presenters/parent-home.presenter.ts
src/modules/parent-app/profile/application/get-parent-profile.use-case.ts
src/modules/parent-app/profile/dto/parent-profile.dto.ts
src/modules/parent-app/profile/infrastructure/parent-profile-read.adapter.ts
src/modules/parent-app/profile/presenters/parent-profile.presenter.ts
src/modules/parent-app/home/tests/get-parent-home.use-case.spec.ts
src/modules/parent-app/home/tests/parent-home.presenter.spec.ts
src/modules/parent-app/home/tests/parent-home-read.adapter.spec.ts
src/modules/parent-app/profile/tests/get-parent-profile.use-case.spec.ts
src/modules/parent-app/profile/tests/parent-profile.presenter.spec.ts
src/modules/parent-app/profile/tests/parent-profile-read.adapter.spec.ts
test/e2e/parent-app-final-closeout.e2e-spec.ts
test/security/tenancy.parent-app.spec.ts

src/modules/settings/email/email.module.ts
src/modules/settings/email/application/preview-email-template.use-case.ts
src/modules/settings/email/application/update-email-template.use-case.ts
src/modules/settings/email/delivery/application/preview-email-campaign.use-case.ts
src/modules/settings/email/delivery/application/school-email-renderer.service.ts
src/modules/settings/email/domain/default-email-templates.ts
src/modules/settings/email/domain/email-template-content.ts
src/modules/settings/email/dto/email-template.dto.ts
src/modules/settings/email/infrastructure/email-settings.repository.ts
src/modules/settings/email/presenters/email-template.presenter.ts
src/modules/settings/email/tests/email-template.use-case.spec.ts
src/modules/settings/email/delivery/tests/email-delivery.use-cases.spec.ts
src/modules/settings/email/delivery/tests/process-email-delivery-recipient.use-case.spec.ts
test/e2e/identity-credentials-email-final-closeout.e2e-spec.ts

scripts/audits/pre-real-data-provider-url-audit.ts
docs/sprint-school-branding-logo-asset-1x-implementation-closeout.md

test/e2e/communication-security-contract.e2e-spec.ts
test/e2e/dashboard-activity-feed-foundation.e2e-spec.ts
test/e2e/dashboard-alerts-foundation.e2e-spec.ts
test/e2e/dashboard-analytics-catalog-foundation.e2e-spec.ts
test/e2e/dashboard-analytics-data-pack-foundation.e2e-spec.ts
test/e2e/dashboard-command-center-foundation.e2e-spec.ts
test/e2e/dashboard-light-mode-dropdown-foundation.e2e-spec.ts
test/e2e/dashboard-module-pages-foundation.e2e-spec.ts
test/e2e/dashboard-summary-foundation.e2e-spec.ts
test/e2e/dashboard-todos-crud.e2e-spec.ts
test/e2e/dashboard-widgets-foundation.e2e-spec.ts
test/e2e/homework-answer-review-completion.e2e-spec.ts
test/e2e/homework-answers-attachments-foundation.e2e-spec.ts
test/e2e/homework-final-closeout.e2e-spec.ts
test/e2e/homework-grade-sync-integration.e2e-spec.ts
test/e2e/homework-questions-attachments-foundation.e2e-spec.ts
test/e2e/homework-submissions-final-closeout.e2e-spec.ts
test/e2e/platform-admin-entitlements-seat-usage.e2e-spec.ts
test/e2e/platform-admin-feature-control-foundation.e2e-spec.ts
test/e2e/platform-admin-organizations-schools-foundation.e2e-spec.ts
test/e2e/platform-admin-school-provisioning.e2e-spec.ts
test/e2e/platform-admin-student-seat-limit-enforcement.e2e-spec.ts
test/e2e/school-support-chat.e2e-spec.ts
test/security/tenancy.platform-admin.spec.ts
test/security/tenancy.school-support-chat.spec.ts
```

The Phase 1B correction is locked: the Student Home, Student Profile, Parent
Home, and Parent Profile DTO files above must declare `logoUrl!: string | null;`.
Teacher DTOs are intentionally absent because their current contract already
supports `string | null`.

## Scope-Stop Protocol

Any required change outside the materialized allowlist stops implementation
until this document records `SCOPE STOP`, the rationale, architecture impact,
security impact, and an explicit updated allowlist decision. The implementation
must not silently widen scope.

### Recorded scope stops and decisions

1. **SCOPE STOP - mandatory Student Profile resolver after avatar mutation.**
   `UploadStudentAvatarUseCase` and `DeleteStudentAvatarUseCase` both return the
   same Student Profile response built by `student-profile-response.builder.ts`.
   Once that builder required the central logo resolver, leaving either caller
   unchanged caused a production type failure and would have made branding
   resolution optional on those two response paths. Architecture impact is
   limited to injecting the existing exported Branding resolver; security
   impact is positive because the active context school remains the only input.
   The allowlist was expanded by exactly these three paths:

   ```text
   src/modules/student-app/profile/application/upload-student-avatar.use-case.ts
   src/modules/student-app/profile/application/delete-student-avatar.use-case.ts
   src/modules/student-app/profile/tests/student-avatar.use-case.spec.ts
   ```

2. **SCOPE STOP - deterministic repository concurrency evidence.** The original
   named Branding tests did not provide a safe place to model Serializable
   retry exhaustion and simultaneous upload/upload plus upload/delete state.
   There is no runtime architecture or security expansion. The allowlist was
   expanded by exactly:

   ```text
   src/modules/settings/branding/tests/branding-repository-concurrency.spec.ts
   ```

3. **SCOPE STOP - stale error-localization governance.** Runtime inspection
   proved that `GlobalExceptionFilter` formats the English message embedded in
   each `DomainException`; it does not load `src/common/i18n/errors.en.json`,
   `src/common/i18n/errors.ar.json`, or inspect `Accept-Language`. Adding unused
   JSON entries would not localize runtime errors and would create a false
   assurance. `ERROR_CATALOG.md`, already allowlisted, was corrected to describe
   the authoritative runtime behavior. No i18n JSON or other path was added.

4. **SCOPE STOP - CI-discovered AppModule BullMQ mock compatibility.** GitHub
   Actions fresh-replay smoke tests load `AppModule` and override
   `BullmqService` with historical no-op test doubles. The managed Branding
   cleanup providers added legitimate initialization calls to `addJob`,
   `getQueueReadiness`, and `createWorker().on(...)`. The historical Dashboard
   double did not implement that dependency contract, so `app.init()` failed
   before its Dashboard assertions executed. Repository-wide inspection found
   25 AppModule override suites with the same incomplete contract. The
   correction expands the allowlist by exactly the 25 test paths listed above
   and this already-allowlisted closeout document. Architecture and production
   behavior impact: none; this is test-only compatibility. Security and tenancy
   impact: none. Migration impact: none. Production dependency strictness,
   periodic reconciliation, cleanup worker registration, and Redis/BullMQ
   behavior are unchanged.

These decisions do not authorize any further path. Every path outside the
corrected materialized allowlist remains a scope stop.

## Checkpoint Status

### Checkpoint A — Managed Asset Foundation

**Status: complete.**

The governed additive migration introduces nullable
`SchoolProfile.logoFileId`, `@@unique([File.id, File.schoolId])`, the
`SchoolProfile.logoFile` composite relation over `[logoFileId, schoolId]`, and
the supporting `logoFileId` index. The relation uses `onDelete: Restrict` and
the legacy `SchoolProfile.logoUrl` column remains present. The migration does
not backfill or delete data.

`POST /api/v1/settings/branding/logo` accepts exactly one multipart `file`
field. The route requires bearer authentication,
`settings.branding.manage`, and a `SCHOOL_USER` or `ORGANIZATION_USER` actor.
It rejects client ownership and storage fields through the global whitelist
contract. PNG and JPEG are the only accepted types and the buffered and
transport-level payload limit is 5 MiB. Validation is package-free and
structural, not prefix-only. PNG requires the complete eight-byte signature,
first `IHDR` chunk with length 13, positive dimensions, bounded complete chunk
framing, valid CRC for every chunk, image data, terminal `IEND`, and no trailing
bytes. JPEG requires SOI, bounded marker/segment traversal, a supported SOF with
positive dimensions, a scan, terminal EOI, and no truncation or trailing bytes.
The declared MIME must match the recognized structure. Branding derives the
school, organization, uploader, private bucket, object key, MIME, size, and
SHA-256 checksum server-side.

The lifecycle runs in a Prisma interactive transaction at PostgreSQL
`Serializable` isolation with at most three attempts for retryable `P2034`
conflicts. It creates private File metadata with non-null school and
organization ownership and links the new File. A linked previous File is
soft-deleted and returned for cleanup only after one full eligibility decision
proves that it is active, belongs to the active school and organization, is
`PRIVATE`, uses the trusted configured private bucket, has the exact active-school
Branding UUID object-key prefix and shape, uses PNG or JPEG MIME, and has
a positive size no greater than 5 MiB. That same decision alone selects
`branding.logo.replace`; otherwise the operation is `branding.logo.upload`, the
profile relation is replaced, and the ineligible or unrelated historical File
is left active and untouched with no cleanup dispatch. This serialization
prevents concurrent upload/upload and upload/delete requests from leaving an
active unlinked managed File. Retry exhaustion compensates the newly uploaded
object; a compensation failure is recorded without masking the original
transaction exception and the orphan reconciler remains able to remove the
object after its grace period.

Success audits use exact resource type `school_branding_logo` and exact actions
`branding.logo.upload`, `branding.logo.replace`, and `branding.logo.delete`.
Applicable sanitized facts are `changed`, detected MIME, byte size, prior
managed/legacy presence, replacement status, SchoolProfile resource ID, actor
user type, and active school/organization context. Validation, storage write,
database transaction, compensation, cleanup enqueue, and terminal cleanup
failure emit best-effort sanitized AuditLog or structured-log evidence that
cannot mask the original exception. Intermediate worker failure uses
`branding.logo.cleanup.attempt_failed`; retry scheduling uses
`branding.logo.cleanup.retry_scheduled`; the retained terminal failed state
uses exactly `branding.logo.cleanup.failed`. Audit/log payloads exclude File
IDs, bucket, object key, checksum, signed URL, raw legacy URL, credentials, and
raw exception payloads. An invalid, deleted, or otherwise ineligible historic
relation is not classified as a replacement.

`DELETE /api/v1/settings/branding/logo` uses the same authorization boundary.
It atomically clears both managed and legacy logo sources, soft-deletes an
eligible linked File, writes `branding.logo.delete`, and remains idempotent.
The delete path uses the same full server-owned eligibility decision: an
ineligible linked File has its profile relation cleared but remains active and
untouched, is not returned for cleanup, and contributes no detected-MIME or
byte-size audit facts.
Post-commit object deletion will only run for a soft-deleted private File whose
school, organization, bucket, Branding prefix, MIME type, and size remain
eligible. Failed deletion is retried by BullMQ with five exponential attempts;
failed jobs are retained and 100 completed jobs are retained for operational
inspection. Reconciliation uses deterministic `(deletedAt, id)` keyset pages of
100 records, continues after individual enqueue failures, and reports a
sanitized aggregate failure so the BullMQ job remains retryable. Storage orphan
listing uses bounded 100-object continuation pages and never collects the
`schools/` namespace in memory. Already-missing objects are idempotent success;
old unregistered objects are removed only under the exact Branding key shape.
Readiness exposes only waiting, active, delayed, and failed counts.

### Checkpoint B — Public Delivery and Resolver

**Status: complete.**

The central `ResolveSchoolLogoUrlService` applies this precedence:

1. eligible managed `logoFileId`;
2. safe external legacy HTTPS `logoUrl`;
3. `null`.

Managed URLs are absolute values built from the trusted required `APP_URL`,
the public school UUID, the fixed `/api/v1` path, and a SHA-256-derived opaque
version token. A leading route path normalizes an `APP_URL` with or without a
trailing slash. No request `Host` or forwarded-host value participates.
Staging and production require an HTTPS `APP_URL` that passes the configured
syntactic public-origin policy. This is not a claim that network reachability
was tested. The policy rejects credentials; localhost and subdomains;
single-label hostnames; `.local`, `.localdomain`, `.internal`, `.intranet`,
`.lan`, `.home`, `.home.arpa`, `.test`, `.example`, and `.invalid`; and known
loopback, private, link-local, unspecified, documentation, multicast, and
reserved IPv4/IPv6 literals, including IPv4-mapped private IPv6 forms. No DNS
lookup or outbound request occurs.

`GET /api/v1/public/schools/:schoolId/branding/logo` is explicitly public and
streams the private object through the API. It does not call the generic Files
download route, return a redirect, add attachment disposition, or disclose a
file ID, bucket, object key, checksum, uploader, organization, or storage URL.
Eligibility requires active/non-deleted School and Organization records, the
same-school managed relation, matching File/School organization metadata,
private visibility, the configured private bucket, the exact school Branding
prefix, PNG/JPEG MIME, size in `(0, 5 MiB]`, and non-deleted File metadata.
Stored-object size and content-type metadata must also match the File row.

Missing/inactive/deleted/ineligible metadata, cross-boundary metadata, object
not found, and storage metadata mismatch produce the same safe
`404 not_found`. Storage timeout, connection failure, unexpected operational
failure, and stream-initialization failure produce a route-local sanitized
`503 service_unavailable` envelope with `Cache-Control: no-store`; this avoids
the global 5xx logger recording the identifier-bearing request URL. End or
close before the first non-empty byte is an initialization failure. The
integrity wrapper counts every streamed byte against the validated File/storage
length: short clean EOF and extra bytes are failures. Before headers, failures
return 503. After headers, a short, long, or errored stream destroys the
response safely, emits only `branding.logo.public.stream_failed`, and never
attempts a second JSON response. Successful exact-length PNG/JPEG responses are
inline bytes with the validated content type, length, `nosniff`, and locked
short public cache policy.

### Checkpoint C — Consumer Integration

**Status: complete.**

Settings Branding reads and update responses now use the central resolver, and
the generic PATCH contract no longer accepts `logoUrl`. Applicant school list
and detail preserve the exact public allowlist (`id`, `name`, `shortName`,
`city`, `country`, `address`, `logoUrl`). Applicant request list/detail school
summaries add only `logoUrl`. The Applicant Profile implementation was not
changed and remains school-neutral.

The resolver is a mandatory constructor dependency on every production
consumer path. Teacher Home, Profile, and Settings/About resolve only the
current school. Student Home and Profile, including the profile returned after
avatar upload/delete, and Parent Home and Profile do the same. Explicit mocks
are injected in unit tests; there is no optional fallback that can silently
restore literal `null`. The four verified Student/Parent DTO declarations are
now exactly
`logoUrl!: string | null;`; Teacher DTOs were not modified because they already
had that type. Composition adapters continue to avoid selecting raw branding
values and the resolver supplies the presentation value.

Email preview and queued delivery rendering use the same resolved absolute
logo URL and emit an image element suitable for remote email clients. Preview
data cannot override the resolved school logo. The deprecated arbitrary email
template `logoFileId` is no longer accepted, returned, audited, persisted by
the update path, or emitted as an internal marker. Its existing database column
is retained and ignored; column removal remains destructive deferred work.

Consumer evidence covers managed absolute resolver output, safe external HTTPS
fallback, invalid fallback resolving to `null`, current-school-only calls, and
metadata non-exposure. Applicant request summaries add only `logoUrl`; the
Applicant Profile contract remains school-neutral and contains no arbitrary
selected school. Email preview, campaign preview, and queued delivery HTML use
the absolute public URL and contain no `data-logo-file-id`, bucket, key, signed
query, checksum, or File ID marker.

### Checkpoint D — Compatibility and Legacy Readiness

**Status: complete for the authorized non-destructive work.**

The temporary fallback accepts only credential-free HTTPS URLs that pass the
same configured syntactic public-host policy. This is syntactic filtering, not
proof of network reachability. It rejects HTTP, protected
`/api/v1/files/:id/download` routes, recognized signed-storage parameters, raw
keys, local/internal/test host forms, and known private/reserved address
literals. Signed-storage recognition covers AWS/generic signature parameters,
GCS V4 and legacy `GoogleAccessId` forms, CloudFront canned/custom policy forms,
and Azure service/account SAS when `sig` is paired with a recognized SAS
companion field. An unrelated ordinary URL is not classified as Azure SAS from
`sig` alone. Query values are never logged. Managed eligible assets always take
precedence. A safe fallback emits only
`branding.logo.legacy_fallback_used`; neither the URL nor tenant/file/storage
identifiers are logged.

The read-only classifier selects only non-null `SchoolProfile.logoUrl` values,
never writes data, and prints counts plus bounded sanitized patterns. It was
executed against the available local development database with this result:

```text
external_http_https: 0
protected_files_download_route: 0
signed_storage_url: 0
raw_storage_key: 0
invalid_url: 0
other: 0
```

This local result is not production remediation evidence and does not
authorize destructive retirement. BullMQ exposes waiting, active, delayed,
and failed counts in readiness evidence; startup logs the sanitized
`branding.logo.cleanup.queue_ready` event with only those counts. Retry,
failed-job retention, reconciliation, and cleanup outcomes use deterministic
sanitized event names, including exact terminal event
`branding.logo.cleanup.failed`. No metrics dependency or package change was
introduced.

Dropping `SchoolProfile.logoUrl`, dropping the deprecated email template
column, mutating legacy data, or removing fallback remains prohibited until a
real deployed-data classification, approved remediation, retained zero-
fallback evidence for the approved observation period, a clear cleanup queue,
and explicit destructive migration authorization all exist.

### Checkpoint E — Integrated Validation

**Status: complete.**

Migration and schema evidence:

- `npm run db:migrations:check`: passed with base `origin/main` at
  `9993a58a6b23`, three active migrations, exactly one new migration, and no
  rebaseline authorization.
- Development deploy: the one new migration applied successfully; a second
  `prisma migrate deploy` reported no pending migrations.
- Fresh PostgreSQL replay: all three migrations applied to a newly created
  empty database; the second deploy was a no-op; `prisma migrate status`
  reported the database up to date; the temporary database was then dropped.
- `npx prisma validate`: passed.
- `npx prisma generate`: passed with Prisma Client 6.19.3.
- Live datasource/schema diff: no difference detected.

Build and test evidence:

- `npx tsc -p tsconfig.build.json --noEmit`: passed.
- `npm run build`: passed.
- Direct final surgical correction regression: 4 suites and 89 tests passed;
  the complete focused Branding and Applicant/Teacher/Student/Parent/Email
  resolver regression passed 21 suites and 226 tests.
- Full unit regression: 472 suites and 2,982 tests passed.
- CI compatibility correction: the exact formerly failing GitHub Actions smoke
  command passed 4 suites and 23 tests; the Dashboard LightModeDropdown suite
  independently passed 1 suite and 8 tests.
- All 25 AppModule suites that override `BullmqService` passed 25 suites and
  166 tests with complete no-op test doubles. The Dashboard double additionally
  asserts successful periodic reconciliation scheduling, readiness inspection,
  cleanup worker creation, and failed-event handler registration; overriding
  the provider prevents any live Redis or BullMQ connection.
- Focused Branding cleanup and lifecycle regression passed 2 suites and 20
  tests. Branding E2E and security/tenancy regression passed 2 suites and 8
  tests. Generic Files privacy regression passed 2 suites and 9 tests.
- Final cross-surface E2E regression: 11 suites and 75 tests passed, covering
  Branding, Applicant account/discovery/requests, Teacher, Student/avatar,
  Parent, email, and generic Files privacy flows.
- Final relevant security/tenancy regression: 9 suites and 179 tests passed,
  covering Branding, Settings, generic Files, Applicant, Teacher, Student, and
  Parent boundaries.
- Focused managed-logo E2E/security evidence: live private PNG upload/public
  streaming, JPEG replacement, deletion/idempotency, audit actions, metadata
  mismatch, inactive/deleted School and Organization, deleted/public File,
  object absence, ownership override rejection, composite cross-school FK,
  and organization mismatch all passed.
- Unit coverage includes structural PNG/JPEG and CRC/framing failures,
  unsupported/mismatched/oversized input, transport-level size envelope,
  Serializable retry success/exhaustion, concurrent lifecycle invariants,
  compensation, the full table-driven prior-File eligibility matrix and
  ineligible-File preservation, bounded non-starving reconciliation and
  listing, intermediate versus terminal cleanup events, exact audit
  actions/facts, APP_URL normalization and syntactic host rejection, 404/503
  separation, empty/short/long/errored stream integrity, AWS/GCS/Azure/
  CloudFront signed-URL filtering/classification, mandatory consumer paths,
  absolute email HTML, and metadata non-exposure.

The route/Swagger review confirms the fixed route paths, multipart contract,
public marker, response DTO, and no arbitrary identifier field. Permission and
tenancy review confirms that generic Files remains private, management writes
require the existing manage permission plus management user types, the public
route is read-only and anti-enumerating, and no database RLS claim is made.

Prettier check mode passed for every changed implementation/test TypeScript
file and this closeout. `ERROR_CATALOG.md` retains its historical table layout:
formatting that entire file would recreate the unrelated whole-file churn this
correction explicitly forbids, so its narrow 22-addition/8-deletion governance
diff was reviewed directly. The isolated temporary-index diff check remains the
authoritative whitespace check across every tracked and untracked change.

## Scope and Change Audit

Every changed path is contained in the corrected materialized allowlist above.
The CI compatibility correction records Scope Stop 4 and changes only 25 test
files plus this existing closeout. No production source, package, environment,
deployment, seed, schema, migration, generic Files controller/permission, i18n
JSON, or historical audit file changed. The correction does not alter the
locked additive Branding migration.

```text
PULL REQUEST FILES AFTER CORRECTION:
ADDED FILES: 26
MODIFIED FILES: 95
DELETED FILES: 0
TOTAL FILES: 121

CORRECTION COMMIT FILES: 26
PRODUCTION SOURCE FILES: 0
TEST FILES: 25
DOCUMENTATION FILES: 1
MIGRATION FILES: 0
NEW MIGRATIONS IN CORRECTION: 0
TOTAL BRANDING MIGRATIONS: 1
COMMITS AFTER BASELINE AFTER PUBLICATION: 2
CORRECTION COMMIT SUBJECT: test(ci): complete BullMQ AppModule mocks
```

```text
PRETTIER (CORRECTION TESTS + CLOSEOUT): PASS
GIT DIFF CHECK: PASS
CORRECTION STAGING: EXACT APPROVED FILES ONLY
CORRECTION COMMIT: ONE AUTHORIZED COMMIT
CORRECTION PUSH: EXISTING PR BRANCH ONLY; NO FORCE PUSH
```

## Known Blockers and Deferred Work

There are no implementation, security, tenancy, or migration blockers for the
non-destructive managed-logo capability. Production data classification and
the observation period remain intentionally unavailable before deployment, so
destructive legacy retirement is blocked. CDN/image transformation, richer
Applicant public fields, exact-coordinate publication, generic Files public
delivery, and Dashboard work remain out of scope.

The package-free validator proves bounded container structure, dimensions,
terminal markers, and PNG CRCs; it is intentionally not a pixel decoder and
does not decompress PNG image data or entropy-decode JPEG scans. The public-host
policy rejects known local/private/reserved forms syntactically and intentionally
does not perform DNS resolution, an outbound fetch, or a network-reachability
claim. These limitations do not weaken the locked MIME, size, ownership,
delivery, or SSRF boundaries.

## Final Verdict

The unified managed school-branding-logo implementation remains unchanged. The
CI-discovered AppModule BullMQ mock compatibility correction is validated and
is limited to test harnesses plus this closeout. The correction is ready for
the authorized single commit and normal push to existing PR #21. This closeout
does not authorize merging the pull request or destructive legacy retirement.
