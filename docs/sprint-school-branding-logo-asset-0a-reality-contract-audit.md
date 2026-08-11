# SCHOOL-BRANDING-LOGO-ASSET-0A Reality and Contract Audit

## 1. Status Header

| Item                      | Status                                                            |
| ------------------------- | ----------------------------------------------------------------- |
| Phase                     | `SCHOOL-BRANDING-LOGO-ASSET-0A`                                   |
| Audit date                | 2026-07-16                                                        |
| Repository                | `Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend`            |
| Locked baseline           | `a372f97829dfff6833b0b8d850164bb7fb638f75`                        |
| Working branch            | `docs/school-branding-logo-asset-0a`                              |
| Phase status              | Decision-locked documentation audit; no runtime implementation    |
| Correction pass           | `SCHOOL-BRANDING-LOGO-ASSET-0A-DOCUMENT-CORRECTION` applied       |
| Runtime changes           | None                                                              |
| Schema changes            | None                                                              |
| Migration changes         | None                                                              |
| Documentation-only        | Yes                                                               |
| Local data classification | Not executed; the configured development database was unreachable |
| Staging authorization     | No                                                                |

This document is the only artifact of this phase. It records verified repository
reality, locks the future contract, and defines implementation gates. It does not
reopen or modify Dashboard work.

## 2. Executive Verdict

The reported problem is verified, but it is a Branding contract defect rather
than a defect in the generic Files authorization boundary.

`SchoolProfile.logoUrl` is currently a nullable text value accepted through
`PATCH /api/v1/settings/branding`. The backend validates only that a supplied
non-null value resembles a URL, stores the value verbatim, and returns it
verbatim. It does not establish file ownership, school ownership, object
existence, MIME type, content signature, lifecycle, or a stable public delivery
contract. JSON `null` also passes the current optional validator and clears the
column, although that behavior is absent from the TypeScript DTO contract and
has no test.

The generic Files module is intentionally private. Its upload path always
creates `PRIVATE` file metadata, and its download path requires authentication,
an active school scope, and `files.downloads.view`. The download then redirects
to a five-minute signed URL with attachment disposition. Making that route
public would weaken a correct security boundary and would not solve browser or
email logo delivery safely.

Current consumers are inconsistent:

- Applicant Portal school list and detail read `SchoolProfile.logoUrl`, but only
  reject values that are not absolute HTTP(S) URLs. Protected Files URLs,
  expiring signed URLs, and otherwise unsafe absolute URLs still pass.
- Applicant request list and detail school summaries omit `logoUrl` entirely.
- Teacher, Student, and Parent app school display contracts expose `logoUrl` but
  deliberately hard-code it to `null`; this prevents leakage but leaves the
  branding contract incomplete.
- School email rendering injects the raw branding value as
  `school.logoUrl`. Separately, email templates accept an arbitrary
  `logoFileId` UUID with no relation or ownership validation and render it as a
  `data-logo-file-id` marker rather than an image.
- Applicant Profile is membershipless and school-neutral by design. No singular
  selected-school contract exists, so adding one arbitrary school would be
  incorrect.

The locked future decision is that Settings / Branding owns the school-logo
asset lifecycle and public representation. Files remains a private generic
metadata and storage facility. A nullable composite relation from
`SchoolProfile` to `File` provides database-enforced same-school integrity while
the legacy text column remains temporarily for controlled compatibility. Logo
management uses dedicated multipart Branding routes; clients never assign a
file ID and never use the generic Files routes for a school logo.

The public delivery route is locked as
`GET /api/v1/public/schools/:schoolId/branding/logo`. It streams an eligible
private object through the Branding boundary. A 307 redirect to storage was
evaluated and rejected for V1 because its `Location` header necessarily exposes
the storage endpoint and normally the bucket/object path, contradicting this
phase's explicit non-exposure requirement.

The route path is not itself the value presented in `logoUrl`. Managed
`logoUrl` values are absolute URLs built by the central resolver from the
existing required `APP_URL`, the `/api/v1` route, the public School UUID, and one
opaque version token. They must work in browser `img src` attributes and in
remote email clients. The origin is never derived from the request `Host`
header. Staging and production `APP_URL` values must be externally reachable API
origins, use HTTPS, and must not name localhost or an internal-only container.

Managed File eligibility supplements the composite same-school relation by
requiring non-null school/organization metadata and
`File.organizationId === School.organizationId`. Ineligible or genuinely absent
assets fail uniformly with 404. Storage timeout, connection/operational failure,
or stream initialization failure returns a non-cacheable 503 without disclosing
the storage component; a failure after headers terminates the stream safely and
is recorded through sanitized structured logging.

## 3. Authority and Source-of-Truth Order

The audit used this precedence:

1. The `SCHOOL-BRANDING-LOGO-ASSET-0A` phase instructions.
2. `AGENTS.md`, then `CLAUDE.md`.
3. Current architecture, security, engineering, API, migration, testing,
   observability, scope, module, user-type, and glossary documents.
4. ADRs in numeric order.
5. Active Prisma schema and committed migrations.
6. Current runtime code, route decorators, module wiring, permission seeds, and
   tests.
7. Repository history and historical handoff documents, used only to explain
   intent where current sources are silent.
8. Read-only local data, if available.

The required current documents were read, including
`PROJECT_OVERVIEW.md`, `ARCHITECTURE_DECISION.md`,
`DIRECTORY_STRUCTURE_VISUAL.md`, `ENGINEERING_RULES.md`,
`SECURITY_MODEL.md`, `USER_TYPES.md`, `PRISMA_CONVENTIONS.md`,
`MIGRATION_GOVERNANCE.md`, `API_CONTRACT_RULES.md`, `ERROR_CATALOG.md`,
`TESTING_STRATEGY.md`, `OBSERVABILITY.md`, `V1_SCOPE.md`, `MODULES.md`, and
`DOMAIN_GLOSSARY.md`. `ADR-0001` through `ADR-0003` were read in order.

`DIRECTORY_STRUCTURE.md`, named by `AGENTS.md` and `CLAUDE.md`, does not exist at
the locked baseline. The repository contains `DIRECTORY_STRUCTURE_VISUAL.md`.
No missing content was inferred. This is an authority-document discrepancy, not
a reason to change project structure in this phase.

`docs/sprint-dashboard-v1-final-closeout-audit.md` was read only as a frozen
baseline. Nothing in this audit changes its decisions or reopens Dashboard
scope.

Repository history confirms that the plain `logoUrl` model existed from the
initial foundation, Applicant Portal school discovery later exposed that value,
and Teacher, Student, Parent, and email surfaces evolved independently. A
historical Dashboard handoff recommended a backend-owned multipart logo upload
and stable URL, but its suggested `/settings/school-profile` namespace was never
registered. Current route reality, `/settings/branding`, is authoritative.

## 4. Baseline and Git State

The pre-work gate completed before the branch was created:

| Check                               | Verified result                            |
| ----------------------------------- | ------------------------------------------ |
| Worktree                            | Clean                                      |
| Git index                           | Empty                                      |
| Fetch                               | `origin` fetched with prune                |
| Local `main`                        | `a372f97829dfff6833b0b8d850164bb7fb638f75` |
| `origin/main`                       | `a372f97829dfff6833b0b8d850164bb7fb638f75` |
| Ahead / behind                      | `0 / 0`                                    |
| Target local branch before creation | Absent                                     |
| Target remote branch                | Absent                                     |
| Branch created                      | `docs/school-branding-logo-asset-0a`       |
| Branch start point                  | Exactly the locked baseline                |

No reset, rebase, force checkout, force deletion, clean, stage, commit, push, PR,
or patch export was performed. At phase close, `HEAD` must still be the locked
baseline, commits after it must remain zero, the index must remain empty, and
the only worktree change must be this untracked document.

## 5. Current Branding Contract

### Routes and access

| Route                             | Authentication | Permission                 | User-type restriction             | Scope                                                                |
| --------------------------------- | -------------- | -------------------------- | --------------------------------- | -------------------------------------------------------------------- |
| `GET /api/v1/settings/branding`   | Bearer token   | `settings.branding.view`   | None beyond permission assignment | Active organization and school membership required by Settings scope |
| `PATCH /api/v1/settings/branding` | Bearer token   | `settings.branding.manage` | None beyond permission assignment | Active organization and school membership required by Settings scope |

The absence of an explicit management user-type guard means a custom role could
grant the current permissions more broadly than the system-role defaults. A
platform user has no active school context and fails Settings scope resolution.

### Acceptance, storage, presentation, and clearing

- `UpdateBrandingDto.logoUrl` is optional and uses `@IsUrl({ require_tld:
false })`.
- A supplied string can be an external HTTP(S) URL, an absolute protected
  `/api/v1/files/:id/download` URL, or an expiring signed storage URL. The DTO
  cannot distinguish their semantics.
- A relative protected route or raw object key fails normal request DTO
  validation, but the column and Prisma schema have no database constraint;
  such values can exist through older code, direct seed/test setup, or imported
  data.
- Because class-validator's `@IsOptional()` skips both `undefined` and `null`, a
  runtime JSON `null` reaches Prisma and clears `logo_url`, despite the declared
  TypeScript type being `string | undefined`. This clearing behavior is
  undocumented and untested.
- Omission leaves the current value unchanged because Prisma ignores
  `undefined` in the update payload.
- `BrandingRepository` upserts the text directly into
  `settings_school_profile.logo_url`.
- `presentBranding` returns the stored string unchanged as
  `BrandingResponseDto.logoUrl`.
- No Branding-owned upload, removal, or public delivery route is registered.

### Validation and audit reality

There is no lookup of a `File`, no check of uploader or school ownership, no
organization comparison, no object existence check, no declared-MIME
allowlist, and no content-signature validation.

`PATCH` is audited with action `branding.update`. The audit captures the actor,
active organization and school, and an `after` object containing `schoolName`,
`timezone`, and the raw `logoUrl`. It has no dedicated upload/replace/delete
action and no before snapshot. `GET` is not audited, which is appropriate for a
normal non-sensitive read.

Current tests cover a normal application-layer update and its audit call. A
Settings tenancy test proves that School A's branding read does not return
School B's profile. There is no current E2E or security test for URL clearing,
malformed/semantic logo URLs, file ownership, cross-school assignment,
replacement, deletion, or public delivery.

## 6. Current Files and Storage Contract

### Generic upload

`POST /api/v1/files` is authenticated, requires
`files.uploads.manage`, requires an active school scope, and accepts one
multipart field named `file`.

The allowed declared MIME values are:

```text
application/pdf
audio/mp4
audio/mpeg
audio/webm
image/jpeg
image/png
text/plain
video/mp4
video/webm
```

The application limit is 10 MiB (`10 * 1024 * 1024`). The current Multer
interceptor limits the count to one file but does not set `fileSize`, so the
buffer can reach the use case before the size failure. Validation trusts the
multipart-declared MIME and buffered length; it performs no magic-byte check.

Every known production caller registers `FileVisibility.PRIVATE`. The generic
upload use case writes an object key shaped as
`schools/{schoolId}/files/{uuid}{safeExtension}`, calculates SHA-256, and stores
private metadata. If metadata persistence fails, the new object is deleted on a
best-effort basis while the original error is preserved. Its response excludes
bucket, object key, checksum, uploader, and signed URL.

No production path was found that writes `FileVisibility.PUBLIC`. PUBLIC occurs
in enum/resolver support and tests, not an active public-asset workflow.

### Generic download

`GET /api/v1/files/:id/download` is authenticated, requires
`files.downloads.view`, and uses the scoped Prisma extension. It returns 404 for
a cross-school or soft-deleted `File`. Within the same school, permission is the
authorization boundary; it does not enforce uploader ownership and does not
branch on visibility.

The route returns 307 to a signed object URL with a five-minute TTL. It supplies
the original filename, causing `Content-Disposition: attachment`. That is
correct for a private generic download and wrong for an anonymous reusable
`img src` or email asset.

### Storage infrastructure

- `SignedUrlService` has a general default TTL of 15 minutes; the Files download
  use case explicitly overrides it to five minutes.
- `StorageService.createDownloadUrl` can omit a filename, in which case it does
  not request attachment disposition.
- `MinioAdapter` creates missing buckets and performs object operations and
  presigning. It does not configure an anonymous bucket policy.
- `STORAGE_PUBLIC_BUCKET` and visibility-based bucket selection exist as
  configuration, and readiness checks assert that both configured buckets
  exist. Existence is not public readability.
- No application or deployment code sets a public bucket policy, creates a CDN
  URL, or generates a stable anonymous public storage URL.
- File soft deletion sets `File.deletedAt`; scoped reads exclude it. There is no
  generic file-deletion route in the inspected upload controller.

### Boundary verdict

The generic Files security model is not the logo root cause. It must remain
private. This audit explicitly rejects making
`GET /api/v1/files/:id/download` public or teaching frontend clients to use
generic `POST /files` for school-logo management.

## 7. Current Applicant Portal Contract

### `GET /api/v1/applicant-portal/schools`

- Authentication: none; the route is marked public.
- Permission: none.
- Response: paginated cards whose exact school fields are `id`, `name`,
  `shortName`, `city`, `country`, `address`, and `logoUrl`.
- Discoverability: `School.status = ACTIVE`, `School.deletedAt IS NULL`, related
  `Organization.status = ACTIVE`, and `Organization.deletedAt IS NULL`.
- Search: public school/profile display names and city; city also has an exact
  case-insensitive filter.
- Logo: reads `SchoolProfile.logoUrl`; returns it only if JavaScript URL parsing
  yields HTTP or HTTPS. It does not establish public reachability or reject a
  protected Files route, signed query, credentials, local/private host, or
  expiring link.
- Leakage posture: explicit projection and presenter allowlist; no organization
  ID/status, school status, entitlement, feature, audit, membership, or
  operational record is returned.
- Test evidence: unit, E2E, and security coverage verifies filters, pagination,
  active-only discovery, identical anonymous/token output, exact public keys,
  raw object-key suppression, and omission of unsafe schools/organizations.

### `GET /api/v1/applicant-portal/schools/:schoolId`

- Authentication: none; the route is marked public.
- Permission: none.
- Response fields: currently identical to the list card: `id`, `name`,
  `shortName`, `city`, `country`, `address`, and `logoUrl`.
- Discoverability: exactly the same active/non-deleted School and Organization
  predicate as list.
- Failure: nonexistent or non-discoverable records return safe 404.
- Logo and leakage posture: identical to list.
- Test evidence: includes active detail, inactive/deleted/suspended-organization
  404, safe fields, and no operational leakage.

There is no approved richer detail-only field set in current code or product
authority. Coordinates exist in `SchoolProfile`, but no explicit public-privacy
decision approves them.

### `GET /api/v1/applicant-portal/profile`

- Authentication: required.
- Access rule: `@AllowApplicantPortalAccess`; the actor must be a membershipless
  `UserType.APPLICANT`. No ordinary permission code is used.
- Exact response fields: `applicantId`, `userId`, `fullName`, `email`,
  `loginEmail`, `contactEmail`, `phoneNumber`, `city`, `relationship`,
  `userType`, `createdAt`, and `updatedAt`.
- School behavior: no school, organization, membership, tenant, or branding
  field is selected or returned.
- Leakage protection: identity is derived from the authenticated applicant;
  guessed profile IDs and query parameters do not select another applicant.
- Test evidence: unit, E2E, and security tests prove membershipless applicant
  access, no membership creation, non-applicant denial, and absence of guessed
  profile access.

### School summaries embedded in applicant requests

Authenticated applicant request list and detail are applicant-owner scoped.
Both use the same school summary projection and presenter. The exact current
fields are `id`, `name`, `shortName`, `city`, and `country`; `address` and
`logoUrl` are absent. Request ownership, request soft deletion, unsafe-school
creation/submission checks, and operational-field non-leakage have unit, E2E,
and security coverage.

## 8. Applicant Profile Decision

`GET /api/v1/applicant-portal/profile` remains school-neutral.

An applicant can create distinct admission requests for different schools, and
the selected school is request-specific. The repository contains no singular
selected-school relation on `ApplicantProfile`, no membership, and no product
contract identifying one school as canonical. Attaching the newest, first, or
otherwise arbitrary request school would be nondeterministic and could leak
request context into an identity endpoint.

School branding belongs on public school discovery and on each request's school
summary. It does not belong on Applicant Profile unless a future, separately
approved singular selected-school model is introduced.

## 9. Cross-Surface Consumer Inventory

The following inventory covers every production `SchoolProfile.logoUrl` read,
every school-facing `logoUrl` DTO found in the inspected surfaces, every hard-
coded school logo `null`, and the separate email `logoFileId` behavior.

| Surface                             | Route / use case                                   | Current source                                  | Current output                                | Authentication                                       | Required permission                                              | Must work in `img src`             | Public or scoped school                               | Required future behavior                                                                                |
| ----------------------------------- | -------------------------------------------------- | ----------------------------------------------- | --------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Settings branding read              | `GET /api/v1/settings/branding`                    | Raw `SchoolProfile.logoUrl`                     | Stored string or `null`                       | Bearer                                               | `settings.branding.view`                                         | Yes for admin UI preview           | Active scoped school                                  | Absolute `APP_URL`-based managed URL first; safe legacy external fallback; otherwise `null`             |
| Settings branding update            | `PATCH /api/v1/settings/branding`                  | Client `logoUrl`                                | Verbatim persisted URL                        | Bearer                                               | `settings.branding.manage`                                       | Yes                                | Active scoped school                                  | Reject any client `logoUrl`; dedicated logo routes own mutation                                         |
| Applicant school list               | `GET /api/v1/applicant-portal/schools`             | `SchoolProfile.logoUrl`                         | Absolute HTTP(S) unchanged, otherwise `null`  | Public                                               | None                                                             | Yes                                | Public eligible school                                | Absolute `APP_URL`-based managed URL; safe legacy fallback only                                         |
| Applicant school detail             | `GET /api/v1/applicant-portal/schools/:schoolId`   | `SchoolProfile.logoUrl`                         | Same as list                                  | Public                                               | None                                                             | Yes                                | Public eligible school                                | Same resolver and eligibility as list                                                                   |
| Applicant request list              | `GET /api/v1/applicant-portal/requests`            | No logo selected                                | School summary has no `logoUrl`               | Applicant bearer                                     | Applicant Portal annotation and ownership                        | Yes                                | Applicant-owned request school                        | Add resolved `logoUrl`; preserve owner scoping and summary allowlist                                    |
| Applicant request detail            | `GET /api/v1/applicant-portal/requests/:requestId` | No logo selected                                | School summary has no `logoUrl`               | Applicant bearer                                     | Applicant Portal annotation and ownership                        | Yes                                | Applicant-owned request school                        | Same resolved summary as list                                                                           |
| Applicant profile                   | `GET /api/v1/applicant-portal/profile`             | No school source                                | No school or logo                             | Applicant bearer                                     | Applicant Portal annotation                                      | No                                 | School-neutral                                        | Remain school-neutral                                                                                   |
| Teacher home                        | `GET /api/v1/teacher/home`                         | Adapter does not select raw logo                | `school.logoUrl = null`                       | Bearer Teacher                                       | `teacher.home.view`                                              | Yes                                | Active current-school Teacher membership and identity | Resolved managed/safe-legacy URL for current school                                                     |
| Teacher profile                     | `GET /api/v1/teacher/profile`                      | Adapter hard-codes logo                         | `school.logoUrl = null`                       | Bearer Teacher                                       | `teacher.profile.view`                                           | Yes                                | Active current-school Teacher membership and identity | Resolved managed/safe-legacy URL                                                                        |
| Teacher settings                    | `GET /api/v1/teacher/settings/about`               | Adapter and presenter hard-code logo            | `school.logoUrl = null`                       | Bearer Teacher                                       | `teacher.settings.view`                                          | Yes                                | Active current-school Teacher membership and identity | Resolved managed/safe-legacy URL                                                                        |
| Student home                        | `GET /api/v1/student/home`                         | Adapter hard-codes logo                         | `school.logoUrl = null`                       | Bearer Student                                       | `student.home.view`                                              | Yes                                | Active current-school Student identity and enrollment | Resolved managed/safe-legacy URL                                                                        |
| Student profile                     | `GET /api/v1/student/profile`                      | Adapter hard-codes logo                         | `school.logoUrl = null`                       | Bearer Student                                       | `student.profile.view`                                           | Yes                                | Active current-school Student identity and enrollment | Resolved managed/safe-legacy URL; unrelated avatar contract unchanged                                   |
| Parent home                         | `GET /api/v1/parent/home`                          | Adapter hard-codes logo                         | `school.logoUrl = null`                       | Bearer Parent                                        | `parent.home.view`                                               | Yes                                | Active current-school Parent/Guardian ownership       | Resolved managed/safe-legacy URL for current school only                                                |
| Parent profile                      | `GET /api/v1/parent/profile`                       | Adapter hard-codes logo                         | `school.logoUrl = null`                       | Bearer Parent                                        | `parent.profile.view`                                            | Yes                                | Active current-school Parent/Guardian ownership       | Resolved managed/safe-legacy URL                                                                        |
| Email template preview              | Template preview use cases                         | `findSchoolBranding()` raw `logoUrl`            | `school.logoUrl` template variable            | Bearer                                               | `settings.email.templates.view` or campaign preview permission   | Yes in rendered HTML/email preview | Active scoped school                                  | Central resolver returns an absolute externally reachable URL without bearer auth                       |
| Email delivery                      | `SchoolEmailRendererService`                       | `findSchoolBranding()` raw `logoUrl`            | `school.logoUrl` in variable data             | Queued service context derived from authorized batch | Creating surface's manage permission; worker has service context | Yes in recipient email client      | Batch school and organization                         | Snapshot or resolve the absolute `APP_URL`-based Branding URL without storage metadata                  |
| Email template-specific logo marker | Template update/preview/delivery                   | Arbitrary `SchoolEmailTemplate.logoFileId` UUID | `<div data-logo-file-id="...">`; not an image | Bearer / queued worker                               | Template manage for mutation; view/manage per render surface     | No, currently unusable             | Scoped school but no file relation                    | Deprecate input, stop emitting the ID, use school Branding asset; remove column only in legacy closeout |

Every managed future behavior in this table means an absolute URL generated by
the central resolver from `APP_URL`; no consumer may return the route as a
relative string or infer its origin from request headers. The Student home,
Student profile, Parent home, and Parent profile DTOs currently declare
`logoUrl` as literal `null` and require a Phase 1B type change to
`string | null`. Current Teacher DTOs already support `string | null` and do not
require a DTO change.

Teacher, Student, and Parent tests intentionally seed raw logo-like values and
assert `null`/no raw selection in several paths. This is a verified
non-leakage measure, not evidence that logo delivery is complete.

## 10. Current Data Classification

```text
DATA CLASSIFICATION: NOT EXECUTED
REASON: The configured local development database could not be reached. Prisma
reported an initialization/connection failure. No values were read and no
database mutation was attempted.
```

Counts are therefore deliberately not reported.

| Required class                   |         Count | Sanitized example policy                                         |
| -------------------------------- | ------------: | ---------------------------------------------------------------- |
| `external_http_https`            | Not available | `https://<external-host>/<redacted-path>`                        |
| `protected_files_download_route` | Not available | `/api/v1/files/<redacted-id>/download`                           |
| `signed_storage_url`             | Not available | `https://<storage-host>/<redacted-path>?<signed-query-redacted>` |
| `raw_storage_key`                | Not available | `<tenant-prefix>/<redacted-object-key>`                          |
| `invalid_url`                    | Not available | `<invalid-value length=N>`                                       |
| `other`                          | Not available | `<scheme/value redacted>`                                        |

The future read-only classifier must check protected Files routes before generic
HTTP(S), detect common signed-query keys before external URLs, and never print
credentials, query parameters, private bucket names, tenant identifiers, or
personal data. This classification is a mandatory entry gate for legacy
closeout, not permission to backfill.

## 11. Verified Defects and Non-defects

### Verified defects

1. Branding persists logo location as an unowned text value and does not manage
   an asset lifecycle.
2. URL-shaped validation permits semantically invalid logo sources, including
   protected Files routes and expiring signed URLs.
3. Current clearing through JSON `null` is an accidental validator/runtime
   behavior rather than an explicit contract.
4. Branding logo changes have only a generic update audit and no dedicated
   upload, replace, delete, failure, or cleanup semantics.
5. Applicant discovery's HTTP(S) filter prevents raw-key leakage but is not a
   sufficient safe-public logo policy.
6. Applicant request school summaries omit the logo contract already present on
   public school cards.
7. Teacher, Student, and Parent school logo DTOs are permanently `null` despite
   exposing the field.
8. Email branding can inject a protected, expired, or invalid raw URL into
   `school.logoUrl`.
9. `SchoolEmailTemplate.logoFileId` has no Prisma relation or same-school/file
   validation and is emitted as an internal UUID marker, not rendered as a
   usable logo.
10. A configured “public bucket” is not an implemented anonymous-public asset
    facility; no public policy or stable URL generator exists.

### Verified non-defects

1. Generic Files upload being private is correct.
2. Generic Files download requiring auth, permission, and school scope is
   correct and must not be relaxed.
3. Attachment disposition on generic downloads is appropriate for that route.
4. Applicant Profile being school-neutral is correct.
5. Applicant list/detail active School plus active Organization eligibility and
   their field allowlist are correctly defensive.
6. Teacher, Student, and Parent hard-coded `null` values avoid raw URL leakage;
   they are incomplete behavior, not a cross-tenant exposure.
7. The application uses scoped Prisma enforcement and explicit predicates; the
   repository does not claim or implement database RLS.
8. No package deficiency was found that requires a dependency change; PNG/JPEG
   signature checks can be implemented locally and explicitly.

## 12. Architecture Decision

### Decision

Settings / Branding owns school-logo upload, replacement, removal, validation,
persistence relationship, resolution, presentation, public delivery, auditing,
and cleanup orchestration.

Files remains a private generic metadata and storage facility. Logo objects are
stored in the private bucket and represented by ordinary `File` rows with
`FileVisibility.PRIVATE`. Branding owns how one such row becomes the current
school logo.

Frontend clients:

- upload through `POST /api/v1/settings/branding/logo`;
- delete through `DELETE /api/v1/settings/branding/logo`;
- receive an absolute Branding-owned public URL from presenters; and
- never assign `logoFileId`, bucket, object key, visibility, uploader, school,
  organization, checksum, or URL.

### Relation decision

Adopt a nullable `SchoolProfile.logoFileId` and relation while retaining
`SchoolProfile.logoUrl` temporarily. Add `@@unique([id, schoolId])` to `File` and
define the Branding relation over `[logoFileId, schoolId]` referencing
`[id, schoolId]`. This is supported by the repository's established Prisma
composite-relation pattern and makes a cross-school link fail at the database
constraint, in addition to application checks.

Use `onDelete: Restrict`. `SetNull` is inappropriate for this composite relation
because `SchoolProfile.schoolId` is required and shared with the existing School
relation. Managed-logo deletion must explicitly unlink the profile before
soft-deleting file metadata and deleting the object.

Do not expose an arbitrary `logoFileId` input in JSON or multipart fields.

The composite same-school relation remains the primary referential boundary.
In addition, Branding-created managed logo Files must have non-null `schoolId`
and `organizationId`, and application/public-delivery eligibility must require
`File.organizationId === School.organizationId`. The organization comparison is
an application-level consistency check because the proposed composite relation
does not include organization ID. A mismatch fails closed and never exposes
either identifier.

### Delivery decision and rejected alternative

Lock the route path as:

```text
GET /api/v1/public/schools/:schoolId/branding/logo
```

The V1 route returns the eligible image bytes with `200`, correct `Content-Type`,
no attachment disposition, and no metadata DTO. It reads the object server-side
through a new storage streaming method.

A 307 redirect to a five-minute signed URL without attachment disposition was
evaluated. It would work in `img src`, but the browser-visible `Location`
necessarily contains a storage URL and commonly a bucket/object path. Because
this phase expressly forbids exposure of the internal storage URL, bucket, and
object key, the redirect is rejected. The chosen contract issues no signed URL
to the client, so signed-URL TTL is not applicable. If a later security decision
explicitly relaxes that non-exposure rule, the only approved redirect TTL would
be 300 seconds with no content-disposition override; that is not the V1
decision.

### Managed URL construction

The route path and presented URL are distinct contracts. The route remains:

```text
/api/v1/public/schools/:schoolId/branding/logo
```

The central resolver returns a managed `logoUrl` using canonical construction
equivalent to:

```ts
new URL(
  `/api/v1/public/schools/${schoolId}/branding/logo?v=${opaqueVersion}`,
  appUrl,
).toString();
```

`appUrl` comes only from the existing required `APP_URL` environment value. URL
construction must normalize a present or absent trailing slash, avoid duplicate
path separators, preserve the global `/api/v1` prefix, and append only the
opaque version query parameter. It must never use an untrusted request `Host`,
`X-Forwarded-Host`, or similar header to choose the public origin.

`APP_URL` must represent the externally reachable API origin. In staging and
production it must use HTTPS and must not be localhost, a loopback address, a
private internal-only name, or a container service hostname. No new environment
variable, package, or configuration-file change is authorized; `APP_URL`
already exists and is required by environment validation.

## 13. Managed Asset Lifecycle

### States and precedence

1. **Managed active:** a valid `logoFileId` relation is present and eligible;
   presenters return the absolute `APP_URL`-based Branding URL with an opaque
   cache token.
2. **Legacy fallback:** no managed relation is usable, and legacy `logoUrl`
   passes the strict external-public policy; presenters return it temporarily.
3. **No public logo:** neither condition passes; presenters return `null` and
   the managed public route returns safe 404.

An invalid managed relation never causes an automatic fallback to a suspicious
legacy value; the fallback still must pass the independent legacy policy.
Operational storage failure is not an eligibility/not-found result and follows
the separate 503/no-store or post-header stream-termination contract.

### Upload and replace

1. Resolve the authenticated active organization/school and enforce
   `settings.branding.manage` plus management user type.
2. Require exactly one non-empty multipart field named `file`; reject client
   ownership/location overrides and additional file parts.
3. Enforce a transport-level 5 MiB limit, then validate actual buffered length.
4. Allow only `image/png` and `image/jpeg`. Detect the signature from bytes and
   require it to match the normalized declared MIME. Do not trust extension or
   filename.
5. Create an immutable randomized key under
   `schools/{schoolId}/branding/logos/{uuid}.{detectedExtension}` in the private
   bucket, with the detected content type.
6. After object storage succeeds, use one database transaction to create the
   private `File` metadata with non-null context `schoolId` and `organizationId`,
   link/upsert the SchoolProfile, mark the previously managed File soft-deleted
   after unlinking it, and create the success audit. The composite foreign key
   is the final same-school enforcement; the application also requires the
   File organization to equal the School organization.
7. If the object write fails, change no database state. If the database
   transaction fails, delete the new object best-effort and return the original
   failure. The Branding orphan sweeper must also recognize unregistered old
   objects under the dedicated prefix, so a failed compensation is recoverable.
8. After commit, attempt old-object deletion immediately. Failure does not roll
   back the newly active logo: the old object is private, unlinked, and its File
   row is soft-deleted. Enqueue an idempotent BullMQ cleanup job with bounded
   exponential retries. A periodic prefix/soft-deleted-record reconciliation is
   required so enqueue failure is recoverable. Failed jobs remain retained for
   inspection and reconciliation.

### Cleanup and delivery observability

Phase 1A uses existing observability capabilities only:

- sanitized structured logs with deterministic event names, including
  `branding.logo.cleanup.retry_scheduled`, `branding.logo.cleanup.failed`,
  `branding.logo.cleanup.reconciled`,
  `branding.logo.public.storage_unavailable`, and
  `branding.logo.public.stream_failed`;
- BullMQ waiting, active, delayed, and failed job counts;
- queue readiness evidence; and
- retained failed-job state plus periodic reconciliation evidence.

No log may contain a bucket, object key, checksum, signed URL, credential, raw
legacy URL, or file ID. Phase 1A does not introduce a Prometheus or other custom
metric. Phase 1C proves the zero-legacy-fallback observation gate from retained
structured telemetry/log evidence for the approved observation period, using
the deterministic `branding.logo.legacy_fallback_used` event.

Upload retains the legacy text value during compatibility, but managed relation
precedence means it is not presented. This preserves a controlled rollback path
without allowing the client to update the legacy value.

### Delete

`DELETE` atomically clears `logoFileId` and the legacy `logoUrl`, soft-deletes
the previously linked managed File, and writes `branding.logo.delete` audit
metadata. Clearing both sources prevents a deleted managed logo from revealing
an old fallback.

Delete is idempotent: when both sources are already absent it returns `204` and
records a sanitized successful no-op audit with `changed: false`. If a source
was cleared it records `changed: true`. Object cleanup uses the same immediate
attempt, durable retry, and reconciliation path as replacement. Cleanup failure
does not restore the public link; the private unlinked object remains
inaccessible through Branding and generic Files scoped reads exclude its
soft-deleted row.

### Audit actions

Lock these action strings:

```text
branding.logo.upload
branding.logo.replace
branding.logo.delete
```

Record actor/user type, active organization and school, `module: settings`,
`resourceType: school_branding_logo`, SchoolProfile resource ID when present,
outcome, detected MIME, byte size, whether a prior managed/legacy value existed,
and whether state changed. Do not put bucket, object key, checksum, signed URL,
raw legacy URL, or file ID into the audit JSON. Validation and persistence
failures require sanitized failure audit/log coverage without masking the
original error.

## 14. Proposed API Contracts

### `POST /api/v1/settings/branding/logo`

| Contract item      | Locked value                                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication     | Bearer token                                                                                                                                                |
| Permission         | `settings.branding.manage`                                                                                                                                  |
| User types         | `ORGANIZATION_USER` and `SCHOOL_USER` only, using the existing school-management guard                                                                      |
| School source      | Active membership context only; no client school ID                                                                                                         |
| Content type       | `multipart/form-data`                                                                                                                                       |
| Field              | Exactly one file field named `file`                                                                                                                         |
| Allowed types      | PNG and JPEG only                                                                                                                                           |
| Maximum size       | 5 MiB at interceptor and application layers                                                                                                                 |
| Content validation | PNG/JPEG magic bytes must match declared MIME; empty/truncated/ambiguous files rejected                                                                     |
| Semantics          | First upload creates; later upload replaces with a new immutable object and File row                                                                        |
| Success            | `200 OK` with the full existing `BrandingResponseDto`; `logoUrl` is the resolved absolute `APP_URL`-based public URL                                        |
| Audit              | `branding.logo.upload` or `branding.logo.replace`                                                                                                           |
| Overrides          | Reject `fileId`, `logoFileId`, `logoUrl`, `schoolId`, `organizationId`, `uploaderId`, `bucket`, `objectKey`, `visibility`, `checksum`, and extra file parts |
| Failure            | No changed public link; compensate new object/metadata as defined in lifecycle                                                                              |

`PATCH /api/v1/settings/branding` retains non-logo branding fields and response
shape, but any occurrence of `logoUrl` becomes a validation error. The dedicated
POST/DELETE routes are the only mutation contract.

### `DELETE /api/v1/settings/branding/logo`

| Contract item                           | Locked value                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Authentication / permission / user type | Same as upload                                                                                      |
| Body                                    | None; any body ownership/location override is rejected                                              |
| Success                                 | `204 No Content`                                                                                    |
| Semantics                               | Clear managed relation and legacy value; soft-delete metadata; asynchronously ensure object removal |
| Idempotency                             | Repeated delete remains `204`                                                                       |
| Audit                                   | `branding.logo.delete`, including sanitized `changed` boolean                                       |
| Failure                                 | Before commit, retain old public link; after commit, cleanup failure does not restore link          |

### `GET /api/v1/public/schools/:schoolId/branding/logo`

| Contract item               | Locked value                                                                                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication / permission | None; explicit public route                                                                                                                                                                                                                                                                 |
| Identifier                  | Public School UUID only                                                                                                                                                                                                                                                                     |
| School eligibility          | School `ACTIVE` and not deleted                                                                                                                                                                                                                                                             |
| Organization eligibility    | Related Organization `ACTIVE` and not deleted                                                                                                                                                                                                                                               |
| Profile/file eligibility    | Managed relation exists; same-school composite match; File school/organization IDs are non-null; `File.organizationId` equals `School.organizationId`; File not deleted; `PRIVATE`; detected/stored MIME is PNG or JPEG; size is non-zero and at most 5 MiB                                 |
| Storage eligibility         | Configured private bucket, branding object-key namespace for that school, object exists, and storage stat MIME agrees with metadata                                                                                                                                                         |
| Success                     | `200` byte stream, `Content-Type: image/png` or `image/jpeg`, no `Content-Disposition`, `X-Content-Type-Options: nosniff`                                                                                                                                                                   |
| Safe 404                    | Uniform `404 not_found` for absent/inactive/deleted School; inactive/deleted Organization; absent profile/relation/File; deleted File; cross-school relation; organization mismatch; invalid visibility/MIME/size; wrong bucket/prefix; genuine object-not-found; storage metadata mismatch |
| Operational failure         | `503 service_unavailable` for storage timeout/connection failure, unexpected MinIO/storage operational failure, or stream initialization failure; do not identify the internal component                                                                                                    |
| 503 cache policy            | `Cache-Control: no-store`                                                                                                                                                                                                                                                                   |
| Mid-stream failure          | If headers were sent, terminate the stream/connection safely and emit `branding.logo.public.stream_failed`; never attempt a second JSON response                                                                                                                                            |
| Cache                       | `Cache-Control: public, max-age=300, stale-while-revalidate=60`; no long immutable cache on the unversioned route                                                                                                                                                                           |
| Cache busting               | Presenters append `?v=<opaque-token>` derived by hashing the managed File UUID and truncating/base64url-encoding it; never expose the UUID. Route ignores `v` for authorization and lookup                                                                                                  |
| Signed URL TTL              | Not applicable to the chosen streaming contract; no signed URL leaves the backend                                                                                                                                                                                                           |
| Forbidden output            | No JSON/body/header field containing file ID, bucket, object key, checksum, uploader, organization ID, internal URL, or tenant metadata                                                                                                                                                     |

The public route serves managed assets only. A valid legacy external fallback is
returned directly by consumer DTOs and is never fetched or proxied server-side.
It must not reveal whether a 503 arose in MinIO, bucket resolution, object
lookup, or another storage component. Genuine object absence remains a safe
404; operational inability to determine or initialize delivery is a 503.

## 15. Public School Data Allowlist

The locked public Applicant school list-card contract remains:

```text
id
name
shortName
city
country
address
logoUrl
```

The current detail endpoint has no separately approved richer fields, so V1
detail remains the same allowlist. A future detail expansion requires product
and privacy approval of each persisted field.

Explicitly forbidden from list and detail are organization identity, tenant
identifiers, internal School/Organization status, entitlements, feature
controls, seat limits, membership/role data, audit metadata, storage metadata,
and operational records.

Exact `latitude` and `longitude` are not public in this decision. Their presence
in `SchoolProfile` does not establish permission to disclose them. A future
proposal must decide precision, consent, safety, and whether a coarse map area
is sufficient.

Applicant request school summaries may add only `logoUrl` to their current
`id`, `name`, `shortName`, `city`, and `country` fields in Phase 1B. Applicant
Profile remains unchanged and school-neutral.

## 16. Prisma and Migration Plan

### Exact Prisma changes

Add to `SchoolProfile`:

```prisma
logoFileId String? @map("logo_file_id") @db.Uuid
logoFile   File?   @relation(
  "SchoolProfileLogoFile",
  fields: [logoFileId, schoolId],
  references: [id, schoolId],
  onDelete: Restrict
)

@@index([logoFileId])
```

Retain:

```prisma
logoUrl String? @map("logo_url")
```

Add to `File`:

```prisma
schoolProfilesUsingAsLogo SchoolProfile[] @relation("SchoolProfileLogoFile")

@@unique([id, schoolId])
```

The existing `File.schoolId` remains nullable for generic/global file use cases.
Branding-created logo Files always supply non-null `schoolId` and
`organizationId`. The composite relation prevents a SchoolProfile from linking
a File belonging to another school. Application and public-delivery validation
additionally require `File.organizationId` to equal `School.organizationId`;
that check supplements and does not replace the composite same-school database
boundary.

### Migration requirements

Create one new incremental migration with `prisma migrate dev --create-only`.
It must:

1. add nullable `settings_school_profile.logo_file_id UUID`;
2. add a unique index on `files(id, school_id)`;
3. add an index on `settings_school_profile(logo_file_id)`; and
4. add a composite foreign key from
   `(logo_file_id, school_id)` to `files(id, school_id)` with
   `ON DELETE RESTRICT ON UPDATE CASCADE`.

It must not alter the two active committed migration directories, change
`logo_url`, create a public bucket policy, or write data. Seed changes are not
required because the existing `settings.branding.manage` permission is reused.

### Governance and rollback

- Before migration creation, require clean history and a healthy migration
  status. Drift, checksum mismatch, reset request, failed migration, or P3009 is
  a hard stop under `MIGRATION_GOVERNANCE.md`.
- Validate a fresh PostgreSQL replay from all committed migrations, deploy the
  new migration, then run a second deploy and prove it is a no-op.
- Run Prisma validate/generate before TypeScript tests/build.
- The additive nullable migration is application-backward-compatible. Rollback
  of application code leaves the legacy column available.
- Database rollback is not an automatic down migration. If explicitly approved,
  first unlink all managed profile relations, then remove the FK/index/column;
  never edit a committed migration.
- No value backfill belongs in the schema migration.

## 17. Compatibility and Legacy Policy

The presentation algorithm is locked in this order:

1. valid managed relation -> absolute `APP_URL`-based Branding public URL;
2. otherwise valid legacy external URL -> temporary direct fallback;
3. otherwise `null`.

Both managed and accepted legacy values are therefore absolute URLs. Managed
values use only the configured external API origin and the canonical
`/api/v1/public/schools/:schoolId/branding/logo?v=<opaqueVersion>` path. Legacy
values remain externally hosted absolute HTTPS URLs during compatibility. No
consumer constructs an origin from request headers or returns a relative
managed route.

A legacy fallback is valid only when it is an absolute HTTPS URL with no
credentials, a public hostname, and no protected Files path or recognizable
signed-storage query keys. Reject localhost, `.local`, loopback, link-local,
private IP literals, relative paths, raw object keys, non-HTTP schemes, malformed
values, `/api/v1/files/:id/download`, and signed/expiring storage URLs. Production
does not allow plain HTTP because it creates mixed-content and integrity risks.
The backend does not fetch legacy URLs, so this is presentation filtering, not
an SSRF fetch contract.

Phase 1A makes `logoUrl` read-only at the API boundary but retains the column.
Upload does not erase it; delete intentionally erases it so removal is complete.
No speculative conversion or download-and-reupload backfill is allowed.

Legacy remediation requires a separately reviewed, read-only classification
followed by an approved owner-driven plan:

- valid external values may remain during the compatibility window;
- protected routes, signed URLs, raw keys, invalid values, and unknown values
  are not treated as public and must be cleared or replaced by an authorized
  branding upload;
- no script may infer a File relation from a URL or object key without verified
  same-school metadata, content signature, object existence, and explicit
  approval.

`SchoolProfile.logoUrl` may be removed only when all of the following are true:

1. production-safe classification has run without exposing values;
2. every non-null value is remediated or explicitly retired;
3. all consumers use the central resolver and managed route;
4. direct API writes have been rejected for at least two releases;
5. retained structured telemetry/log evidence contains zero
   `branding.logo.legacy_fallback_used` events for an agreed minimum of 30 days;
6. object cleanup backlog is zero; and
7. a separately reviewed destructive migration passes fresh replay and no-op
   deploy checks.

The unclassified local database blocks Phase 1C closeout, but it does not
justify a backfill and does not alter the additive Phase 1A schema design.

## 18. Security and Tenancy Matrix

No row below relies on database RLS. Authenticated rows use existing global
guards, active membership context, user-type/application access services, and
application-level Prisma scoping or explicit predicates.

| Surface                 | Route                                                          | Authentication                          | Permission                       | School boundary                                         | Owner boundary                       | Public eligibility                                               | Approved identifiers                            | Forbidden fields                                               | Safe failure                                                                                              | Audit requirement                                                     | Test evidence / required evidence                                            |
| ----------------------- | -------------------------------------------------------------- | --------------------------------------- | -------------------------------- | ------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Branding read           | `GET /settings/branding`                                       | Bearer                                  | `settings.branding.view`         | Active current school                                   | None beyond role/scope               | N/A                                                              | Context school only                             | Storage/file internals                                         | 401/403; no cross-school row                                                                              | None                                                                  | Current School A/B read; add managed/legacy presentation tests               |
| Branding update         | `PATCH /settings/branding`                                     | Bearer                                  | `settings.branding.manage`       | Active current school                                   | Management user type in target state | N/A                                                              | Context school; non-logo fields                 | `logoUrl` and all asset overrides                              | 400/401/403; old state retained                                                                           | Existing `branding.update`; sanitize logo field rejection             | Current unit only; add DTO/E2E/security coverage                             |
| Branding logo upload    | `POST /settings/branding/logo`                                 | Bearer                                  | `settings.branding.manage`       | Context school plus composite FK and organization match | `ORGANIZATION_USER` / `SCHOOL_USER`  | N/A                                                              | Multipart `file` only                           | Client tenant/file/storage IDs                                 | 400/401/403; compensation; no changed link                                                                | Upload/replace success and sanitized failures                         | Future unit/E2E/security/migration tests required                            |
| Branding logo delete    | `DELETE /settings/branding/logo`                               | Bearer                                  | `settings.branding.manage`       | Context school plus linked relation                     | `ORGANIZATION_USER` / `SCHOOL_USER`  | N/A                                                              | No client resource ID                           | All body IDs/URLs/storage metadata                             | Idempotent 204; pre-commit failure retains link                                                           | Delete/no-op success and sanitized failures                           | Future A/B, repeated delete, cleanup tests                                   |
| Public logo delivery    | `GET /api/v1/public/schools/:schoolId/branding/logo`           | Public                                  | None                             | Composite same-school relation plus organization match  | N/A                                  | Active/non-deleted School and Organization; eligible linked File | Public School UUID; opaque `v` ignored for auth | File ID, org ID, bucket, key, checksum, uploader, internal URL | 404 for ineligible/not-found; 503 `no-store` for operational storage failure; terminate failed mid-stream | No per-read audit; deterministic sanitized structured delivery events | Future absolute URL, org mismatch, 404/503, stream, leakage, and cache tests |
| Applicant school list   | `GET /applicant-portal/schools`                                | Public                                  | None                             | Explicit active School/Organization predicate           | N/A                                  | Required                                                         | Search/city/page/limit only                     | Tenant/operational/storage fields                              | Empty list/400                                                                                            | None                                                                  | Strong current unit/E2E/security; add managed/fallback cases                 |
| Applicant school detail | `GET /applicant-portal/schools/:schoolId`                      | Public                                  | None                             | Same predicate as list                                  | N/A                                  | Required                                                         | Public School UUID                              | Same as list                                                   | Uniform 404                                                                                               | None                                                                  | Strong current unit/E2E/security; add managed/fallback cases                 |
| Applicant profile       | `GET /applicant-portal/profile`                                | Applicant bearer                        | Applicant Portal annotation      | No school membership                                    | Authenticated applicant only         | N/A                                                              | Authenticated user only                         | School, org, membership, branding                              | 401/403/404 as current                                                                                    | Normal auth audit policy                                              | Current tests prove school neutrality; preserve                              |
| Teacher school branding | `/teacher/home`, `/teacher/profile`, `/teacher/settings/about` | Teacher bearer                          | Route-specific view permission   | Active current-school Teacher identity                  | Teacher self/current employment      | N/A                                                              | No client school ID                             | Raw relation/storage fields                                    | 401/403/404                                                                                               | None for read                                                         | Current null/no-leak tests; future resolved URL and A/B tests                |
| Student school branding | `/student/home`, `/student/profile`                            | Student bearer                          | Route-specific view permission   | Active current-school Student/enrollment                | Student self                         | N/A                                                              | No client school ID                             | Raw relation/storage fields                                    | 401/403/404                                                                                               | None for read                                                         | Current null tests; future resolved URL and A/B tests                        |
| Parent school branding  | `/parent/home`, `/parent/profile`                              | Parent bearer                           | Route-specific view permission   | Active current-school membership and Guardian ownership | Parent self/current school           | N/A                                                              | No client school ID                             | Other-school branding and storage fields                       | 401/403/404                                                                                               | None for read                                                         | Current current-school/null tests; future resolved URL and A/B tests         |
| Email branding preview  | Template/campaign preview routes                               | Bearer                                  | Templates/campaigns view         | Active current school                                   | Management surface scope             | N/A                                                              | Template key / scoped inputs                    | File ID marker and storage internals                           | 400/401/403/404                                                                                           | Existing preview audit policy; no raw logo data                       | Future central resolver/no-ID HTML tests                                     |
| Email branding delivery | Queued email render/send                                       | Authorized creator then service context | Creation route manage permission | Batch school/org carried and revalidated                | Batch recipient ownership/targeting  | N/A                                                              | Batch/recipient IDs internal to worker          | Storage metadata and raw file ID in HTML                       | Fail recipient safely; no cross-school render                                                             | Existing delivery audit plus deterministic sanitized resolution logs  | Future absolute remotely fetchable URL, integration, and tenant tests        |

## 19. Test Matrix

The implementation phases must add or update these exact behaviors.

### Validation and lifecycle

- Accept a real minimal PNG with declared `image/png`.
- Accept a real minimal JPEG with declared `image/jpeg`.
- Reject PNG bytes declared as JPEG and JPEG bytes declared as PNG before
  storage.
- Reject a text/polyglot/truncated payload declared as an allowed image.
- Reject unsupported types, including WebP, SVG, GIF, PDF, and text.
- Reject empty files and files over 5 MiB; prove the interceptor size limit and
  domain limit map to a stable error envelope.
- Upload creates one PRIVATE File with non-null context `schoolId` and
  `organizationId`, links the same SchoolProfile, requires
  `File.organizationId === School.organizationId`, uses the branding prefix,
  and returns no internal metadata.
- Replacement produces a new managed asset, changes the cache token, unlinks
  and soft-deletes the old File, and schedules/deletes the old object.
- Delete clears managed and legacy sources, returns 204, and repeated delete is
  an audited no-op.
- Reject every client override field and extra file part.
- Verify upload/replace/delete action strings and sanitized success/failure
  audits.

### Rollback and cleanup

- Storage-write failure creates no File, relation, or success audit.
- File/profile/audit transaction failure retains the previous relation and
  compensates the new object.
- Compensation deletion failure is found by reconciliation and does not expose
  the orphan.
- Old-object deletion failure keeps the new logo active, leaves the old File
  soft-deleted/private, enqueues deterministic retry, and emits its deterministic
  sanitized structured event.
- Cleanup jobs are idempotent for already-missing objects and already-deleted
  metadata.
- Queue enqueue failure is recovered by the periodic reconciler.
- BullMQ waiting, active, delayed, and failed counts and queue readiness are
  observable through existing queue infrastructure; failed jobs remain retained
  for evidence and reconciliation.
- Cleanup and delivery logs use the locked event names and contain no bucket,
  object key, checksum, signed URL, credential, raw legacy URL, or file ID.

### Security, tenancy, and public delivery

- School A cannot upload/delete against School B through IDs, multipart fields,
  context manipulation, or a stale active membership.
- Non-management user types and actors without `settings.branding.manage`
  receive 403; unauthenticated management receives 401.
- Database and application layers reject a cross-school File relation.
- Application linking and public delivery reject a File whose `organizationId`
  does not equal the linked School's `organizationId`; the failure exposes no
  identifiers.
- School absent/inactive/deleted, Organization inactive/deleted, profile absent,
  managed relation absent, File absent/deleted, cross-school relation,
  organization metadata mismatch, invalid visibility/MIME/size, wrong bucket,
  wrong branding prefix, genuine object-not-found, and storage metadata mismatch
  all produce the same safe public 404.
- Storage timeout, storage connection failure, unexpected MinIO/storage
  operational failure, and stream initialization failure return
  `503 service_unavailable` with `Cache-Control: no-store`, without identifying
  the internal component.
- A mid-stream failure after headers safely terminates the stream/connection,
  emits `branding.logo.public.stream_failed`, and does not attempt a second JSON
  error response.
- Active School plus active Organization returns inline PNG/JPEG bytes.
- suspended/archived/deleted School, and suspended/archived/deleted Organization,
  return 404.
- Public success has correct content type, no attachment disposition,
  `nosniff`, locked cache headers, and a changed opaque token after replacement.
- `APP_URL` with and without a trailing slash generates the same canonical
  absolute managed URL, preserves `/api/v1`, and creates no duplicate slash.
- Managed URL generation appends only the opaque `v` token, never uses the
  request `Host`/forwarded-host origin, and enforces the staging/production HTTPS
  expectation.
- Public responses and errors contain no file ID, bucket, object key, checksum,
  uploader, organization ID, internal URL, signed query, or tenant metadata.
- Generic Files upload/download tests remain private and unchanged; add a
  regression proving neither generic route became public.

### Consumers

- Applicant list and detail retain their exact allowlist and resolve the same
  managed, legacy-safe, and invalid/null logo outcomes.
- Applicant list/detail continue to omit inactive schools and organizations.
- Applicant request list/detail add only `logoUrl` to the school summary and
  preserve applicant ownership.
- Applicant Profile continues to contain no school, organization, membership,
  selected-school, or branding fields.
- Teacher home/profile/settings-about return only their current school's
  resolved URL; School A/B isolation remains.
- Student home/profile return only their current school's resolved URL; avatar
  behavior remains separate.
- Parent home/profile remain current-school-only and do not aggregate or leak a
  child's other-school branding.
- Email preview and actual queued delivery resolve the same absolute,
  externally reachable public logo URL suitable for a remote email client, do
  not emit `data-logo-file-id`, and never emit storage/file metadata.
- Invalid or deleted managed assets produce no broken internal/protected URL in
  any consumer.

### Migration and regression gates

- Preflight migration status is healthy with no drift/checksum/P3009/reset.
- Fresh PostgreSQL replays every committed migration from zero.
- First deploy applies the additive migration; second deploy is a no-op.
- Composite same-school FK is present and enforced.
- `npx prisma validate` and `npx prisma generate` pass.
- Production TypeScript checks and Nest build pass.
- Affected Branding, Files/storage, Applicant Portal, Teacher, Student, Parent,
  and email unit/E2E/security suites pass.
- Full unit, security, E2E, migration-integrity, and project regression gates
  pass before closeout.

This docs-only phase does not execute that runtime validation matrix.

## 20. Phase Decomposition

### `SCHOOL-BRANDING-LOGO-ASSET-1A`

| Item            | Locked scope                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Purpose         | Add managed relation, dedicated management lifecycle, private-object public streaming route, absolute `APP_URL` resolver, auditing, and cleanup recovery                                               |
| Schema impact   | Add nullable composite relation and indexes; retain legacy text                                                                                                                                        |
| Route impact    | Add POST/DELETE management and GET public delivery; PATCH rejects `logoUrl`                                                                                                                            |
| Security impact | Management user-type restriction, same-school composite integrity, File/School organization consistency, public 404/503 split, and no-metadata stream                                                  |
| Tests           | Validation, lifecycle, rollback, cleanup, APP_URL canonicalization, organization mismatch, public 404/503/mid-stream behavior, queue evidence, tenancy, leakage, Files non-regression, migration gates |
| Entry gate      | Approved 0A content; locked baseline; clean Git; healthy migration status; public streaming decision accepted                                                                                          |
| Exit gate       | All 1A contracts and tests pass; cleanup reconciler, retained failed jobs, BullMQ counts/readiness, and sanitized structured logs evidenced; no Files weakening; migration replay/no-op proven         |
| Deferred        | Cross-surface consumer adoption and legacy data removal                                                                                                                                                |

### `SCHOOL-BRANDING-LOGO-CONSUMERS-1B`

| Item            | Locked scope                                                                                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose         | Replace raw/null consumer behavior with the absolute `APP_URL`-based central resolver and update the four verified Student/Parent literal-null DTOs without widening public or owner-scoped fields |
| Schema impact   | None                                                                                                                                                                                               |
| Route impact    | No new paths; existing response `logoUrl` values become usable; applicant request summaries add `logoUrl`                                                                                          |
| Security impact | Preserve Applicant public allowlist, applicant request ownership, and Teacher/Student/Parent current-school boundaries; remove email file-ID marker                                                |
| Tests           | Applicant list/detail/request/profile, Teacher, Student, Parent DTO/consumer contracts, absolute remote-email URL, A/B isolation, no metadata leakage                                              |
| Entry gate      | 1A deployed and stable; managed resolver/public route contract fixed                                                                                                                               |
| Exit gate       | Every inventoried consumer uses central resolution; profile remains neutral; all affected/full regressions pass                                                                                    |
| Deferred        | Legacy text/data and deprecated email template column removal                                                                                                                                      |

### `SCHOOL-BRANDING-LOGO-LEGACY-CLOSEOUT-1C`

| Item            | Locked scope                                                                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose         | Classify/remediate legacy values, prove zero fallback, and remove deprecated columns/contracts only after destructive-migration approval                                                        |
| Schema impact   | Separate migration may remove `SchoolProfile.logoUrl`; may remove deprecated `SchoolEmailTemplate.logoFileId` only after its own classification and approval                                    |
| Route impact    | No path changes; remove all legacy fallback/input remnants                                                                                                                                      |
| Security impact | Eliminate ambiguous legacy URL and email file-ID surfaces; verify cleanup backlog zero                                                                                                          |
| Tests           | Classification sanitization, retained zero-fallback structured telemetry/log evidence, destructive fresh replay/no-op, all consumers, full regressions                                          |
| Entry gate      | Production-safe classification completed; two-release write rejection; approved observation period with zero retained legacy-fallback events; no cleanup backlog; explicit destructive approval |
| Exit gate       | No legacy data/columns/code paths remain; migration governance and full validation pass                                                                                                         |
| Deferred        | CDN/image transformations or richer public school details, each requiring a separate decision                                                                                                   |

## 21. Exact Implementation File Allowlist per Phase

Files outside the following allowlists require a stop and a new scope decision.
Generated migration directory timestamps may vary, but exactly one new migration
directory is allowed in each schema-changing phase.

### Phase 1A allowlist

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

test/e2e/settings-branding-logo.e2e-spec.ts
test/security/tenancy.settings-branding-logo.spec.ts
```

`src/infrastructure/storage/tests/` does not currently exist; Phase 1A may add
only the two named test files if storage streaming requires direct coverage.
No Files controller, generic Files permission, permission seed, system-role seed,
package, environment, deployment, or bucket-policy file is allowed to change.

### Phase 1B allowlist

```text
src/modules/settings/branding/branding.module.ts
src/modules/settings/branding/application/resolve-school-logo-url.service.ts
src/modules/settings/branding/infrastructure/branding.repository.ts
src/modules/settings/branding/tests/public-school-branding-logo.spec.ts

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
src/modules/student-app/profile/dto/student-profile.dto.ts
src/modules/student-app/profile/infrastructure/student-profile-read.adapter.ts
src/modules/student-app/profile/presenters/student-profile.presenter.ts
src/modules/student-app/home/tests/get-student-home.use-case.spec.ts
src/modules/student-app/home/tests/student-home.presenter.spec.ts
src/modules/student-app/home/tests/student-home-read.adapter.spec.ts
src/modules/student-app/profile/tests/get-student-profile.use-case.spec.ts
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
src/modules/settings/email/domain/email-template-content.ts
src/modules/settings/email/dto/email-template.dto.ts
src/modules/settings/email/infrastructure/email-settings.repository.ts
src/modules/settings/email/presenters/email-template.presenter.ts
src/modules/settings/email/tests/email-template.use-case.spec.ts
src/modules/settings/email/delivery/tests/email-delivery.use-cases.spec.ts
src/modules/settings/email/delivery/tests/process-email-delivery-recipient.use-case.spec.ts
test/e2e/identity-credentials-email-final-closeout.e2e-spec.ts
```

The four listed Student/Parent DTOs have a verified literal-`null` declaration.
Phase 1B must change each school logo field to exactly:

```ts
logoUrl!: string | null;
```

Teacher school-logo DTO fields already support `string | null`; no Teacher DTO
file is required or allowed for this correction. Any other path outside the
corrected Phase 1B allowlist requires a scope stop and document amendment before
implementation.

### Phase 1C allowlist

```text
prisma/schema.prisma
prisma/migrations/<generated_timestamp>_school_branding_logo_legacy_closeout/migration.sql

scripts/audits/pre-real-data-provider-url-audit.ts
docs/sprint-school-branding-logo-legacy-closeout.md

src/modules/settings/branding/application/resolve-school-logo-url.service.ts
src/modules/settings/branding/domain/legacy-branding-logo-url.ts
src/modules/settings/branding/dto/branding-response.dto.ts
src/modules/settings/branding/infrastructure/branding.repository.ts
src/modules/settings/branding/presenters/branding.presenter.ts
src/modules/settings/branding/tests/legacy-branding-logo-url.spec.ts
src/modules/settings/branding/tests/public-school-branding-logo.spec.ts

src/modules/settings/email/application/update-email-template.use-case.ts
src/modules/settings/email/delivery/application/school-email-renderer.service.ts
src/modules/settings/email/domain/default-email-templates.ts
src/modules/settings/email/domain/email-template-content.ts
src/modules/settings/email/dto/email-template.dto.ts
src/modules/settings/email/infrastructure/email-settings.repository.ts
src/modules/settings/email/presenters/email-template.presenter.ts
src/modules/settings/email/tests/email-template.use-case.spec.ts
src/modules/settings/email/delivery/tests/email-delivery.use-cases.spec.ts

test/e2e/settings-branding-logo.e2e-spec.ts
test/e2e/applicant-portal-school-discovery.e2e-spec.ts
test/e2e/teacher-app-final-closeout.e2e-spec.ts
test/e2e/student-app-final-closeout.e2e-spec.ts
test/e2e/parent-app-final-closeout.e2e-spec.ts
test/e2e/identity-credentials-email-final-closeout.e2e-spec.ts
test/security/tenancy.settings-branding-logo.spec.ts
test/security/tenancy.applicant-portal-school-discovery.spec.ts
test/security/tenancy.teacher-app.spec.ts
test/security/tenancy.student-app.spec.ts
test/security/tenancy.parent-app.spec.ts
```

The classification script is read-only and must output counts plus sanitized
patterns only. No remediation/backfill script is pre-authorized. Dropping the
email template column is optional within 1C and requires its own classification
and explicit decision; otherwise it remains deprecated and unused.

## 22. Risks and Stop Conditions

### Security blockers

- Any proposal to make the generic Files download public is a stop.
- Any proposal to accept client file/tenant/storage identifiers is a stop.
- A 307 storage redirect is a stop while internal URL/bucket/object-key exposure
  remains forbidden.
- Public delivery without the exact active School and active Organization
  predicate, same-school File validation, File/School organization consistency,
  MIME/size/storage validation, safe 404 classification, operational 503
  classification, and mid-stream termination policy is a stop.
- Any managed `logoUrl` that is relative, derives its origin from a request
  header, omits `/api/v1`, or uses a staging/production `APP_URL` that is not an
  externally reachable HTTPS API origin is a stop.
- Exact coordinates or richer public fields require a new privacy/product
  decision.
- Failure to restrict logo mutation to school-management user types is a stop.

### Tenancy blockers

- Failure of Prisma to validate the proposed composite optional relation is a
  stop; do not fall back to an application-only arbitrary File assignment.
- Any cross-school relation accepted by the database or resolver is a stop.
- Any managed File with null school/organization metadata or with
  `File.organizationId !== School.organizationId` accepted by the application or
  public resolver is a stop.
- Any Teacher, Student, or Parent implementation that accepts a client school
  ID instead of the existing access context is a stop.
- Any Applicant request summary that bypasses applicant ownership is a stop.
- Do not claim database RLS as evidence.

### Data and migration blockers

- Drift, checksum mismatch, reset request, failed migration, or P3009 is a hard
  stop with no direct SQL, schema push, or unapproved resolution.
- The unavailable local data classification blocks 1C, not this documentation
  phase and not the additive/no-backfill design.
- A request to infer relations or copy remote legacy content without verified
  ownership and explicit approval is a stop.
- Existing invalid legacy data must never be made public merely to preserve
  appearance.

### Lifecycle and operational blockers

- Phase 1A cannot close without deterministic compensation, retry, and
  reconciliation for new/old object cleanup.
- Phase 1A cannot close without sanitized deterministic structured logs,
  retained failed jobs, BullMQ waiting/active/delayed/failed counts, and queue
  readiness evidence. It does not require new custom metrics infrastructure.
- Streaming introduces backend bandwidth load. The 5 MiB cap and five-minute
  cache bound make V1 finite; CDN/proxy offload needs a separate non-exposure
  design.
- Genuine object absence and storage metadata disagreement must fail closed as
  safe 404; storage outage/timeout and stream initialization failure must return
  503 with `no-store`. A post-header stream failure must terminate safely and be
  recorded without secrets or a second response.
- Do not add a package solely for magic-byte validation; a package change
  requires a new justified decision.

### Git and scope blockers

- Any moved `main`, dirty preflight, staged file, commit, remote target branch,
  or change outside this phase's single document is a stop for 0A.
- Runtime, schema, migration, seed, test, package, configuration, README,
  historical audit, or project-structure edits are forbidden in 0A.

## 23. Final Decision

The architecture and contract are decision-locked for content review:

- Branding owns the school-logo managed asset.
- Files remains private and unchanged in authorization posture.
- `SchoolProfile.logoFileId` uses a database-enforced same-school composite
  relation to `File`; legacy `logoUrl` remains temporarily.
- Management uses dedicated multipart POST and idempotent DELETE routes under
  `/api/v1/settings/branding/logo`, with PNG/JPEG signature validation and a
  5 MiB limit.
- Public delivery uses the Branding-owned streaming route
  `/api/v1/public/schools/:schoolId/branding/logo`; it does not reveal a signed
  storage URL or metadata.
- Branding and all consumers present managed logos as absolute URLs constructed
  from the existing required external `APP_URL`, never from request host
  headers; staging and production require an externally reachable HTTPS origin.
- Managed Files require non-null school/organization metadata and application
  validation that `File.organizationId` equals `School.organizationId`, while
  the composite same-school relation remains the primary referential boundary.
- Ineligible, invalid, and genuinely absent assets fail with safe 404; storage
  operational outages fail with 503 and `no-store`; post-header stream failures
  terminate safely with sanitized structured logging.
- Managed relation wins, strictly valid external HTTPS legacy URL is temporary
  fallback, and invalid/protected/signed/raw values resolve to `null`.
- Applicant list/detail retain the locked public allowlist; Applicant Profile
  remains school-neutral; request summaries gain only `logoUrl` in the consumer
  phase.
- Teacher, Student, Parent, and email consumers adopt the central resolver in
  Phase 1B.
- No backfill is authorized. Legacy removal is blocked until classification,
  remediation, retained structured zero-fallback telemetry/log evidence,
  cleanup completion, and destructive migration approval.
- No package change is required.
- Phase 1A observability uses deterministic sanitized structured logs and
  existing BullMQ counts/readiness/failed-job retention; Phase 1C uses retained
  telemetry/log evidence for the zero-legacy-fallback gate, with no new custom
  metric requirement.

This phase authorizes documentation content audit only. It authorizes no
runtime implementation, migration, staging, commit, push, or PR.

```text
RUNTIME CHANGES: NONE
SCHEMA CHANGES: NONE
MIGRATION CHANGES: NONE
DOCUMENTATION ONLY: YES
STAGING AUTHORIZED: NO
```
