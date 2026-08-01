# PRD1-G06 Reinforcement Proof MIME Enforcement Closeout Draft

## Gate status

`G06 LOCAL READY FOR COMMIT`

This is a local closeout draft. CI, pull request, and merge evidence remain
pending and this document does not declare G06 complete.

## Document control

| Field                              | Value                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Gate                               | `PRD1-G06`                                                                                                          |
| Objective                          | Enforce the Reinforcement proof MIME contract at the real storage boundary before persistence or audit side effects |
| Starting branch                    | `feat/production-readiness-1e-reinforcement-proof-mime`                                                             |
| Starting baseline / unchanged HEAD | `d86b8a13a752da66528a90e72563e8e464819f8e`                                                                          |
| Date                               | 2026-08-01                                                                                                          |
| Timezone                           | Africa/Cairo                                                                                                        |
| Local disposition                  | `G06 LOCAL READY FOR COMMIT`                                                                                        |

## Scope and exclusions

The gate covers Reinforcement stage submissions from School Management and
Student App, proof-file tenant/owner lookup, declared MIME allowlists,
bounded byte-signature verification against S3-compatible storage, public
error mapping, and the persistence/audit ordering around verification.

It does not change the generic upload lifecycle, Learning Media lifecycle,
Redis behavior, malware scanning, retention, storage metadata, file
visibility, storage locators, Prisma schema, migrations, seeds, dependencies,
Dockerfile, or workflows. No V1-excluded module was added.

## Data flow and mutation boundary

1. Authentication, user type, organization/school scope, permission, and
   assignment ownership guards run in their existing order.
2. The use case loads the assignment and stage in the active tenant context.
3. For a file-backed proof, `findProofFile` requires the exact file ID,
   organization, school, authenticated uploader, `PRIVATE` visibility,
   `deletedAt = null`, positive size, and a non-empty storage locator.
4. The declared MIME is checked against the proof-type allowlist.
5. Storage `statObject` verifies a positive size equal to the immutable File
   row, then `getObject` reads only the bounded prefix and detects content.
6. Only after verification succeeds may the existing transaction create or
   resubmit `ReinforcementSubmission` and mutate the assignment.
7. The existing audit service records exactly one successful submit event
   after persistence. Verification failures produce no submission,
   assignment, audit, or File-row mutation.

`ReinforcementProofType.NONE` preserves compatibility and skips file-byte
verification.

## MIME and content contract

| Proof type | Allowed declared and detected MIME |
| ---------- | ---------------------------------- |
| `IMAGE`    | `image/jpeg`, `image/png`          |
| `VIDEO`    | `video/mp4`, `video/webm`          |
| `DOCUMENT` | `application/pdf`                  |

The detector validates structural prefixes rather than filename extensions:

- PNG signature plus a valid non-zero IHDR, legal bit-depth/color-type
  combination, compression/filter/interlace values, and IHDR CRC;
- JPEG SOI followed by well-formed segments and a non-zero SOF frame;
- the exact `%PDF-1.x` header for PDF 1.x;
- ISO BMFF `ftyp` with a bounded, well-formed box and an accepted MP4 brand;
- EBML header with a bounded `DocType` equal to `webm`.

Known cross-type and unsupported signatures are classified so they map to the
allowlist error rather than being mistaken for malformed bytes. Empty,
unrecognized, ambiguous, malformed, truncated, or size-inconsistent content
maps to invalid content.

The maximum byte prefix is `256 KiB`. Each storage stat/read operation and the
stream collection have a `5 second` timeout. The verifier destroys the stream
after the prefix and does not buffer a complete video.

## Ownership, tenancy, and public errors

Proof lookup is non-enumerating. Missing files and failures of organization,
school, uploader, visibility, deletion, positive-size, locator, or request
scope all return the existing 404 resource-not-found behavior.

| Condition                                                        | HTTP | Public code                                    |
| ---------------------------------------------------------------- | ---- | ---------------------------------------------- |
| hidden proof-file lookup failure                                 | 404  | `not_found`                    |
| empty, malformed, truncated, ambiguous, or size mismatch         | 400  | `reinforcement.proof.invalid_content`          |
| allowed sibling MIME mismatch                                    | 400  | `reinforcement.proof.mime_mismatch`            |
| unsupported or cross-proof-type content                          | 415  | `reinforcement.proof.mime_not_allowed`         |
| missing object, stat/read error, timeout, or unavailable storage | 503  | `reinforcement.proof.verification_unavailable` |

HTTP regression proves the standard global error envelope does not expose the
bucket, object key, endpoint, access/secret values, raw storage code or cause,
Prisma/SQL details, or stack trace.

## Local evidence

Validation used the repository-pinned Node `22.23.1` Docker build, disposable
`postgres:16-alpine`, disposable
`minio/minio:RELEASE.2025-09-07T16-13-09Z`, and disposable
`redis:7-alpine`. No workspace `.env` value was loaded into the Docker build
or test runner.

| Gate                                                         | Result                                                |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| Prisma Client generation in disposable Docker runner         | PASS                                                  |
| Nest build in repository Docker build stage                  | PASS                                                  |
| Focused unit                                                 | PASS; 4 suites, 77 tests                              |
| Real MinIO                                                   | PASS; 1 suite, 11 tests                               |
| Real PostgreSQL repository and persistence                   | PASS; 2 suites, 20 tests                              |
| G06 HTTP/security                                            | PASS; 1 suite, 18 tests                               |
| Existing Reinforcement tenancy                               | PASS; 1 suite, 52 tests                               |
| Existing Student App tenancy                                 | PASS; 1 suite, 33 tests                               |
| Existing file/storage boundary security                      | PASS; 2 suites, 15 tests                              |
| Exception, organization-scope, permission, and storage units | PASS; 5 suites, 42 tests                              |
| Full unit suite on the complete working tree                 | PASS; 534 suites, 3,847 tests                         |
| `git diff --check`                                           | PASS; informational Windows line-ending warnings only |

An exploratory full-unit run inside the `media-test` target passed 531 of 534
suites and 3,790 of 3,794 tests. Its three failures were contract tests whose
inputs are deliberately absent from that target because `.dockerignore`
excludes `docs` and `.github` and the target does not copy root Docker/scripts
artifacts. The same complete 534-suite command passed on the full working tree;
all G06 and affected boundary suites passed inside the pinned image.

## Defect found and corrected

The real PostgreSQL lookup proof showed that the initial candidate accepted a
zero-size File row and empty storage locator fields. `findProofFile` now
rejects positive-size violations in SQL and rejects empty or whitespace-only
bucket/object-key values before returning a proof file. No schema or migration
change was needed.

No atomicity defect was found. The existing transaction boundary remained
unchanged; the tests prove verification runs before it and before audit.

## Changed-file inventory

1. `ERROR_CATALOG.md`
2. `src/modules/reinforcement/reviews/application/reinforcement-proof-content-verifier.service.ts`
3. `src/modules/reinforcement/reviews/application/submit-reinforcement-stage.use-case.ts`
4. `src/modules/reinforcement/reviews/domain/reinforcement-proof-content.ts`
5. `src/modules/reinforcement/reviews/domain/reinforcement-review-domain.ts`
6. `src/modules/reinforcement/reviews/infrastructure/reinforcement-reviews.repository.ts`
7. `src/modules/reinforcement/reviews/reviews.module.ts`
8. `src/modules/reinforcement/reviews/tests/reinforcement-proof-content-verifier.spec.ts`
9. `src/modules/reinforcement/reviews/tests/reinforcement-review-domain.spec.ts`
10. `src/modules/reinforcement/reviews/tests/reinforcement-reviews.use-case.spec.ts`
11. `test/integration/reinforcement-proof-content-verifier.integration.spec.ts`
12. `test/integration/reinforcement-proof-file.repository.integration.spec.ts`
13. `test/integration/reinforcement-proof-persistence.integration.spec.ts`
14. `test/security/tenancy.reinforcement-proof-mime.spec.ts`
15. `docs/production-readiness/phase-1/05-reinforcement-proof-mime-enforcement-closeout.md`

## Release state

| Item         | State   |
| ------------ | ------- |
| Migrations   | none    |
| Dependencies | none    |
| CI           | pending |
| PR           | pending |
| Merge        | pending |

Final local status: `G06 LOCAL READY FOR COMMIT`.
