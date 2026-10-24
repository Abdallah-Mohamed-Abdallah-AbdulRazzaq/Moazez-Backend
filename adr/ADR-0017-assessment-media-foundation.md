# ADR-0017: Assessment Media foundation and release boundary

## Status and authority

Proposed for independent Backend review under the Owner's ST-03 order of
2026-10-24. This is source implementation authority, not deployment, scanner,
quarantine, retention, or Production enablement approval. ADR-0013 continues
to own general File security and retention; ADR-0016 prohibits retired Staging.

## Existing capabilities and gaps

`FileUploadSession` already owns tenant/uploader identity, request idempotency,
expected metadata, status, verification facts, File provenance, capability
expiry, and cleanup evidence. `StorageService` provides provider-neutral private
objects, generic signed PUT, optional resumable sessions, streaming, and object identity.
ST-03 adds an optional bounded capability without changing those contracts.
MinIO does not claim resumable support; the GCS adapter implements that optional
contract. Generic Files retains its separate 10 MiB contract.

Academic Content owns its policy, Asset links, lifecycle and cleanup worker.
Its extension/MIME registry and bounded signature predicates are reusable pure
utilities, but signature checks alone do not attest container integrity or
malware safety. Learning Media owns its bounded streaming/hash/temp-file and
FFprobe verification workflow. Reuse that service, not a duplicate verifier.
Its image/PDF inspection is insufficient to assert universal content security.
The private-media reader remains the future resource-authorized read boundary.

Missing capabilities are assessment-owned policy, purpose/resource binding,
transaction-time upload authorization, atomic reservations, release gating,
and conservative assessment session bookkeeping.

## Ownership and purpose matrix

Files owns this shared technical foundation. Homework and Grades retain their
separate business/authorization truth through separate resource adapters.
App-facing modules do not acquire repositories or new domain ownership.

| Purpose | Actual context | Eligible actor / existing permission |
| --- | --- | --- |
| `HOMEWORK_ASSIGNMENT_MEDIA` | Existing HomeworkAssignment | Owned allocated teacher or school/organization management; `homework.attachments.manage` |
| `GRADE_ASSESSMENT_MEDIA` | Existing GradeAssessment | Allocated teacher or school/organization management; `grades.questions.manage` |
| `HOMEWORK_SUBMISSION_MEDIA` | Existing HomeworkTarget | The target's active student; `homework.submission_attachments.manage` |
| `GRADE_SUBMISSION_MEDIA` | Existing GradeSubmission | The submission's active student; `grades.submissions.submit` |

The caller supplies neither an actor nor a school nor storage coordinates.
Every operation derives request scope, proves live membership/permission and
resource ownership inside the mutation transaction, and verifies exact stored
purpose/context/creator identity. Bare UUIDs are never ownership evidence.
Authoring and submission status/academic eligibility remain domain-owned.
Question-, answer-, and assessment-asset relations and their public binding
APIs remain later-stage work. ST-03 exposes internal application contracts only;
no new public upload/download or policy-management route is necessary.

## State, capability and idempotency

Create reserves a session under a school mutex. Issue its private staging
capability outside the transaction, then reauthorize before recording
`CREATED -> UPLOADING`. The provider's actual capability expiry is persisted.
Assessment upload issuance requires exact-size and exact-MIME bounds. GCS uses
resumable initiation with `X-Upload-Content-Length` (SDK `metadata.contentLength`)
and MIME metadata; MinIO uses its existing SDK POST policy with exact key, MIME
and `content-length-range [expected, expected]`. Unsupported adapters fail closed;
there is no unbounded signed-PUT fallback. The existing generic capability shape
stays unchanged. GCS runtime enforcement/CORS/least-privilege evidence remains a
DevOps dependency; the real owned MinIO policy is tested. Never persist or log
the secret URL or POST fields. These are bearer capabilities: early provider
revocation is not assumed. An issued MinIO capability may still write its exact
staging object until expiry, including after application cancellation/completion;
it cannot address the server-only final object or authorize another actor to
finalize/reuse the intent. All reservations account for the actual lifetime. A create retry with
identical metadata returns the same session and current status without
reissuing a capability; changed metadata conflicts.

Completion claims `UPLOADING -> VERIFYING` atomically. Only the claim owner may
finalize once. Technical verification reads staging bytes and produces a
server-owned final object to which the uploader has no write capability.
Required security evidence, current policy and resource authorization are
checked before the atomic File/READY/audit commit. READY retries return the
same authoritative File. Concurrent completes cannot create duplicate Files.
Failure, cancellation and expiry never manufacture verification facts. Existing
LESSON_CONTENT/ACADEMIC_CONTENT, LEGACY and PURGED branches retain their meaning.

## Verification and DR-07

| Category | Reusable technical capability | Release restriction |
| --- | --- | --- |
| Plain text | Bounded UTF-8 prefix/signature validation and full bounded byte/hash streaming | Full-content security acceptance remains pending; no approved release gate |
| JPEG / PNG | Signature and bounded dimensions | Deep image/content security is not attested by these checks; blocked |
| PDF / Office | Signature only / no approved deep parser | Blocked; Office is outside the assessment allowlist |
| Audio / video | Accepted containers/codecs/duration/dimensions via bounded FFprobe | Additional security release gate; runtime acceptance required |
| Archives / active / executable / ambiguous content | No assessment acceptance | Denied |

Every category is disabled in the default school policy. Required unavailable
verification fails closed: no File, READY, download or asset link. The default
security gate always reports NOT_APPROVED; an interface is not a scanner.
Controlled test attestations exercise persistence/concurrency contracts only
and are explicitly not production malware scanning. No env flag selects a fake
scanner. No quarantine provider or automatic physical deletion is introduced.

## Policy, ceilings and reservations

`SchoolAssessmentMediaPolicy` is separate from Academic Content. Missing policy
means disabled. Exact MIME allowlists, actor eligibility, per-file/resource/
school byte ceilings, file counts, concurrency/rate limits, duration/dimensions,
preview/download and future guardian controls are bounded by platform caps.
School settings can only narrow them. No public policy mutation API or broad
permission grant is introduced.

The implementation ceiling follows the existing bounded verifier: non-video at
most 10 MiB and video at most 200 MiB, with a default per-file setting of 10 MiB
and all categories off. The proposed 25 MiB documents / 50 MiB audio remain
planning candidates requiring new resource/runtime acceptance. The proposed
eight assets is an upper bound per existing owning resource, not a QuestionAsset
implementation or launch setting. No Generic Files limit is changed.

School-row locking serializes reservation decisions. In-flight and ready
sessions consume resource quotas; cancelled/expired capability reservations
cannot be released before the last issued capability expires. Conservatively,
stored-byte reservations remain charged while object deletion is unproven.
No deletion authority is inferred from expiry, failure, cancellation or soft
deletion. Request-rate accounting includes failed/cancelled attempts.

## Schema and migration plan

Add four purpose values in a dedicated enum migration, then the assessment
policy and narrow purpose-specific session constraints in a following migration.
Existing shared predicates are wrapped verbatim for the new purpose branches,
following Academic Content's proven enum-transaction precedent. No old
migration, generic File-purpose field, future Asset relation or backfill changes.
Register policy school scope and custom SQL. Validate Prisma/SQL/governance,
replay the complete chain on owned empty PostgreSQL, inspect status and prove
the second deploy is a no-op before acceptance.

## Retention and runtime boundary

Expiry/cancellation and cleanup eligibility are internal, tenant/actor-scoped
bookkeeping. Reuse the complete retained-reference inventory. Assessment code
does not delete any object or File, register a worker/repeat/queue, or alter
another purpose. Active, historical, cross-purpose and uncertain references
therefore cannot be destroyed by this foundation. All historical rows remain.

Production upload execution is disabled by default and cannot be enabled by a
school policy. New source acceptance is separate from production readiness.
DevOps must provide read-only evidence for FFprobe/version/temp disk, storage
capabilities and generation semantics, memory/CPU/deadlines/concurrency, and
any later approved security provider. No cloud inspection or mutation is part
of this implementation. A separate runtime handoff records those questions.

## Rejected alternatives

- Reusing ACADEMIC_CONTENT purpose/policy: mixes domain authority and quotas.
- Copying verifiers: diverges security behavior and hides capability gaps.
- Unbounded signed PUT for assessments: cannot enforce expected byte reservations.
- Arbitrary purpose/context or client storage coordinates: enables escalation.
- Signature-only READY or a successful mock scanner in runtime: false attestation.
- Future Asset relations or generic file-id downloads: exceed ST-03 authority.
- New cleanup worker/provider or physical deletion: DR-07/retention authority absent.
- Raising all upload sizes to planning candidates: unproven resource budget.

## Verification obligations

Real owned PostgreSQL/MinIO evidence must cover authorization revocation,
cross-purpose/actor/tenant replay, atomic reservations and completion, actual
bytes/identity/size/type checks, missing security capabilities, cancellation,
expiry and retained-reference safety. Preserve Generic Files, Academic Content,
Learning Media, private streams, ST-01 and ST-02 regressions. Build/postbuild,
exact-base non-fixing lint delta, migration gates and complete exact-head CI
precede Draft PR handoff. No independent Reviewer Receipt is manufactured.

Provider contract: [GCS expected length header](https://docs.cloud.google.com/storage/docs/json_api/v1/parameters#xuploadcontentlength).
The installed SDK maps `metadata.contentLength` to that initiation header; no live GCS operation is performed.
