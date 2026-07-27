# Phase 1A — Runtime and Bootstrap Hardening Closeout

## Document control

| Field                              | Value                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Task ID                            | `PRODUCTION-READINESS-1A` / `PRODUCTION-READINESS-1A-R1`                                                                                         |
| Repository                         | `Abdallah-Mohamed-Abdallah-AbdulRazzaq/Moazez-Backend`                                                                                           |
| Branch                             | `feat/production-readiness-1a-runtime-bootstrap`                                                                                                 |
| Starting baseline / unchanged HEAD | `931661b9ee31727e577a1c446b8e05b4a7e150ce`                                                                                                       |
| Date                               | 2026-07-27                                                                                                                                       |
| Timezone                           | Africa/Cairo                                                                                                                                     |
| Scope                              | Node/Firebase/runtime alignment; HTTP/WebSocket CORS; Swagger policy; bounded correlation IDs; sanitized bootstrap failures; minimal public root |
| Status                             | `PHASE_1A_RUNTIME_BOOTSTRAP_READY_FOR_ARCHITECTURE_REVIEW`                                                                                       |

This package implements PRD1-G01 and PRD1-G03 only. Phase 1 remains
incomplete. PRD1-G02 and PRD1-G04 through PRD1-G07 remain `NOT_STARTED`.

## Authority and accepted constraints

| Authority                        | Applied constraint                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| ADR-0006 / PRD0-D022 / PRD0-Q022 | exact production and staging browser origins, credentials, WebSocket parity, and no wildcard |
| ADR-0010 / PRD0-D035 / PRD0-Q030 | minimal public root identity and one-release compatibility window                            |
| ADR-0011 / PRD0-D033 / PRD0-Q028 | Node 22 LTS, supported Firebase Admin 14.x, immutable Docker base, and CI/runtime alignment  |
| ADR-0011 / PRD0-D034 / PRD0-Q029 | no production Swagger audience, exception, or risk acceptor                                  |

Accepted ADRs constrain this implementation. They do not authorize Phase 2
runtime-role separation, cloud provisioning, storage migration, destructive
cleanup, or asynchronous Learning Media.

## Runtime policy

| Surface               | Locked value / result                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `.nvmrc`              | `22.23.1`                                                                                               |
| `package.json` engine | `>=22.23.1 <23`                                                                                         |
| `@types/node`         | declared `^22.20.1`; locked `22.20.1`                                                                   |
| Firebase Admin        | declaration unchanged at `^14.0.0`; lock unchanged at `14.0.0`                                          |
| Docker base           | `node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3`    |
| Digest ownership      | real Docker Hub multi-architecture manifest digest, re-observed with `docker buildx imagetools inspect` |
| GitHub Actions        | all three existing workflows use exact `22.23.1`                                                        |
| Runtime user          | UID 1000 (`node`), not root                                                                             |

`firebase-admin` was not upgraded, downgraded, removed, or re-locked. The
semantic lockfile changes are limited to the root Node engine, the root
`@types/node` declaration, the locked Node 22 type package, and its
corresponding `undici-types` dependency. Architecture review correction R1
restored the baseline `dev: true` metadata for
`node_modules/@angular-devkit/core` and removed the unrelated `dev: true`
metadata from `node_modules/@pkgjs/parseargs`.

The structural runtime-policy validator parses JSON, the Docker build argument,
and each `actions/setup-node` step. It rejects drift in `.nvmrc`, the engine
range, Node types, Firebase Admin major line/Node compatibility, Docker
tag/digest, and workflow Node versions.

## Application CORS contract

`APP_CORS_ORIGINS` is a dedicated comma-separated application-origin setting.
It is not derived from or shared with `STORAGE_CORS_ORIGINS`.

| Environment         | Exact normalized browser allowlist                                           |
| ------------------- | ---------------------------------------------------------------------------- |
| production          | `https://schools.moazez.cloud`, `https://admin.moazez.cloud`                 |
| staging             | `https://staging-schools.moazez.cloud`, `https://staging-admin.moazez.cloud` |
| development example | `http://localhost:3001`                                                      |
| test                | explicit localhost HTTP or valid HTTPS origins as selected by the test       |

Staging and production require the setting and exact environment-specific
sets. Order may differ. Missing, additional, duplicate, empty, wildcard,
`null`, cross-environment, non-HTTPS, credential-bearing, path-bearing,
query-bearing, fragment-bearing, and malformed entries fail validation.
Development and test HTTP entries are restricted to localhost forms.

HTTP and Socket.IO use the same normalized allowlist and origin-decision
callback. Credentialed requests are enabled. A request without `Origin`
continues to work for non-browser clients; a disallowed browser origin receives
no successful CORS authorization. The `/api/v1` prefix, `/api/v1/realtime`
namespace, authentication, authorization, room/event contracts, and Redis
adapter behavior are unchanged.

## Swagger contract

`SWAGGER_ENABLED` is an explicitly parsed boolean with a default of `false`.

| Environment / setting             | Behavior                                                   |
| --------------------------------- | ---------------------------------------------------------- |
| production / false                | no document build, no route registration, no URL log       |
| production / true                 | environment validation and bootstrap policy reject startup |
| non-production / false or omitted | no document build, route, or URL log                       |
| non-production / true             | existing UI is registered at `/api/v1/docs`                |

There is no alternate production audience, secret path, bypass, or accepted
risk mode.

## Request and trace correlation

- The sole inbound authority is `x-request-id`.
- Trusted values contain 1–128 characters from
  `A-Z a-z 0-9 . _ : -`.
- Missing, empty, overlong, whitespace/control-bearing, Unicode,
  line-breaking, disallowed-punctuation, and invalid first array values are
  replaced with a UUID.
- HTTP returns the canonical value in `x-request-id`.
- Request context, HTTP error-envelope `traceId`, WebSocket handshake context,
  and later socket command contexts use that same canonical value.
- `x-trace-id` is no longer trusted by the global or bounded custom error
  envelopes.
- When no valid request context exists, a bounded UUID fallback is generated.
- Actor, membership, organization, school, permission, and academic context
  behavior is unchanged.

## Bootstrap failure and public root

Bootstrap failures emit only `Application bootstrap failed` and set exit status

1. The helper never logs or serializes the thrown value, message, stack,
   multiline payload, URL, credential, token, key, or arbitrary object. This does
   not introduce shutdown or drain behavior assigned to PRD1-G02.

`GET /api/v1` now returns exactly:

```json
{
  "service": "moazez-backend",
  "version": "0.0.1"
}
```

Application name, version, global prefix, Swagger path, root response, and the
existing health-report version now use one metadata source. The health route,
response shape, dependency checks, and status semantics are otherwise
unchanged.

The root E2E compiles the real `AppModule`, creates the real Nest application,
applies `configureHttpApplication()` with explicit test CORS and disabled
Swagger, and therefore exercises the registered middleware, guards, filters,
and complete module composition. It proves the exact identity response at
`GET /api/v1` and proves `/` is not the public identity endpoint.

## Architecture review corrections

| Review finding | Resolution |
| --- | --- |
| unrelated package-lock metadata drift | restored both reviewed nodes exactly to baseline; the remaining semantic lockfile diff is limited to the approved Node engine/type dependency surfaces |
| isolated controller/provider root E2E | restored `imports: [AppModule]`, production-equivalent HTTP configuration, explicit test CORS, disabled Swagger, exact `/api/v1` response, `/` 404, and correct application closure |
| acceptance-matrix formatting churn | restored the complete baseline file and reapplied only the `PRD1-G01` and `PRD1-G03` rows; the raw diff is exactly two removed and two added lines |

## Exact changed-file inventory

Exactly 48 paths differ from the starting baseline:

1. `.env.example`
2. `.github/workflows/learning-content-integrity.yml`
3. `.github/workflows/learning-media-integrity.yml`
4. `.github/workflows/migration-integrity.yml`
5. `.nvmrc`
6. `Dockerfile`
7. `README.md`
8. `package-lock.json`
9. `package.json`
10. `scripts/tests/verify-runtime-policy.test.cjs`
11. `scripts/verify-runtime-policy.cjs`
12. `src/app.controller.spec.ts`
13. `src/app.controller.ts`
14. `src/app.service.ts`
15. `src/bootstrap/application-cors.policy.spec.ts`
16. `src/bootstrap/application-cors.policy.ts`
17. `src/bootstrap/application-metadata.spec.ts`
18. `src/bootstrap/application-metadata.ts`
19. `src/bootstrap/bootstrap-failure.spec.ts`
20. `src/bootstrap/bootstrap-failure.ts`
21. `src/bootstrap/http-application.spec.ts`
22. `src/bootstrap/http-application.ts`
23. `src/bootstrap/swagger.ts`
24. `src/common/context/context.middleware.spec.ts`
25. `src/common/context/context.middleware.ts`
26. `src/common/context/correlation-id.spec.ts`
27. `src/common/context/correlation-id.ts`
28. `src/common/context/request-context.ts`
29. `src/common/exceptions/global-exception.filter.spec.ts`
30. `src/common/exceptions/global-exception.filter.ts`
31. `src/config/env.validation.spec.ts`
32. `src/config/env.validation.ts`
33. `src/infrastructure/realtime/realtime.gateway.ts`
34. `src/infrastructure/realtime/realtime.types.ts`
35. `src/infrastructure/realtime/tests/realtime.gateway.spec.ts`
36. `src/main.ts`
37. `src/modules/academics/curriculum/tests/lesson-content-publication.contract.spec.ts`
38. `src/modules/files/uploads/filters/files-upload-multer-exception.filter.ts`
39. `src/modules/files/uploads/tests/file-upload-session.contract.spec.ts`
40. `src/modules/files/uploads/tests/files-upload-multer-exception.filter.spec.ts`
41. `src/modules/files/uploads/tests/uploads.controller.spec.ts`
42. `src/modules/health/health.service.ts`
43. `src/modules/settings/branding/controller/branding.controller.ts`
44. `src/modules/settings/branding/controller/public-school-branding.controller.ts`
45. `src/modules/settings/branding/tests/public-school-branding-logo.spec.ts`
46. `test/app.e2e-spec.ts`
47. `docs/production-readiness/phase-0/03-acceptance-and-risk-matrix.md`
48. `docs/production-readiness/phase-1/01-runtime-bootstrap-hardening-closeout.md`

The realtime type, bounded custom error envelopes, health metadata, and two
pre-existing workflow/runtime contract tests are narrowly adjacent paths
required to keep the canonical CORS/correlation/version policies consistent.
No feature business behavior changed.

## Validation evidence

| Command / evidence                                                                         | Outcome                                                                                        |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `docker buildx imagetools inspect node:22.23.1-bookworm-slim`                              | PASS; manifest digest matched the Dockerfile                                                   |
| `npm run verify:runtime-policy`                                                            | PASS; structural policy and drift test suite passed                                            |
| host `npm ci` correction reruns                                                            | NOT_COMPLETE; two bounded Windows-host attempts remained active past 10 and 15 minutes and were terminated by exact verified PID |
| clean Docker dependency stages                                                             | PASS; corrected lockfile completed `npm ci` and production `npm ci --omit=dev`                 |
| focused bootstrap/CORS/Swagger/context/error/realtime/Firebase/upload/branding tests       | PASS after in-container Prisma generation; 16 suites, 142 tests                                 |
| `npx jest --config ./test/jest-e2e.json --runInBand --runTestsByPath test/app.e2e-spec.ts` | PASS against real `AppModule` and isolated tmpfs services; 1 suite, 2 tests                     |
| `npm run build`                                                                            | PASS with the Dockerfile-equivalent 3 GB Node heap; the initial default-heap correction run ended in OOM and was not relabeled |
| `npm run test -- --runInBand`                                                              | PASS; 524 suites, 3,747 tests                                                                  |
| `npm run db:migrations:check`                                                              | PASS; 7 active migrations, 0 new migrations                                                    |
| `npx prisma validate` in the clean corrected test image                                    | PASS                                                                                           |
| disposable `prisma migrate deploy` replay                                                  | PASS; all 7 migrations on a fresh isolated PostgreSQL database                                 |
| corrected media-test and final-image Docker builds                                         | PASS; clean install, production-only install, Prisma generation, Nest build, and final export   |
| final-image `node --version`                                                               | PASS; `v22.23.1`                                                                               |
| final-image Firebase Admin app/messaging imports                                           | PASS                                                                                           |
| final-image Prisma Client import                                                           | PASS                                                                                           |
| final-image UID assertion                                                                  | PASS; UID 1000                                                                                 |
| final-image `scripts/verify-media-runtime.cjs`                                             | PASS; pinned ffprobe contract and MP4/WebM smoke                                               |
| `git diff --check`                                                                         | PASS; Windows LF-to-CRLF warnings are informational                                            |
| R1 fail-fast lockfile/matrix/scope validator                                               | PASS; 9 approved lockfile semantic leaves, matrix raw diff 2/2, 74 gates, 38 risks, and the exact 48 paths |
| R1 changed-file secret-pattern scan                                                        | PASS; zero unexpected runtime or documentation hits; synthetic build/test/example fixtures classified separately |

The following is retained prior Phase 1A security evidence; the full one-shot
security command was not rerun for R1. It was previously exercised in isolated
Docker infrastructure without exposing the workspace `.env`:

1. With all required docs mounted read-only, the one-shot command passed 87 of
   89 suites and 1,148 of 1,154 tests. Two late suites hit 5-second setup-hook
   timeouts after a BullMQ connection closed.
2. The exact two affected suites then passed in a fresh Jest process: 2 suites,
   16 tests.
3. Every unique security test therefore has a passing result, but the one-shot
   command's non-zero exit remains recorded rather than relabeled.

The disposable PostgreSQL, Redis, and MinIO containers used unique Phase 1A
names, tmpfs storage, an isolated Docker network, and synthetic test-only
settings. They were removed after validation. No existing local, shared,
staging, or production resource was contacted.

## Compatibility and security assessment

- The public root intentionally changes from a development greeting to the
  approved typed identity response.
- Swagger remains at the existing path when explicitly enabled; it is now
  absent by default and prohibited in production.
- Browser CORS changes from environment-wide permissiveness/production denial
  to the owner-approved exact allowlists for both HTTP and WebSocket.
- Non-browser requests without `Origin` remain compatible.
- Valid caller request IDs remain stable. Invalid IDs are intentionally
  replaced and never reflected.
- Existing authentication, authorization, tenancy, route prefix, validation
  pipe, realtime namespace/events/rooms, Redis adapter, health dependency
  semantics, Firebase package, Prisma schema, and migrations are preserved.
- Secret-pattern inspection found no real credential, private key, token,
  connection URL, or cloud credential in the changed implementation/evidence.

## Rollback and reopen procedure

Rollback is a focused source/config reversion to the verified starting
baseline:

1. restore the prior Node image/workflow/package runtime set as one unit;
2. restore the prior bootstrap entrypoint and root response as one unit;
3. restore the prior HTTP/WebSocket CORS and Swagger behavior only with an
   explicitly reviewed compatibility/security exception;
4. restore the prior correlation flow together across middleware, context,
   WebSocket, and all error envelopes;
5. rebuild and repeat the runtime-policy, focused bootstrap, full unit,
   security, Prisma, and final-image smoke evidence.

Reopen PRD1-G01 if the Node image digest, Node engine, workflow runtime,
Firebase Admin major line/engine, lockfile, final-image imports, or non-root
identity drifts. Reopen PRD1-G03 if origin policy, Swagger prohibition,
correlation bounds, log sanitization, root shape, prefix, or WebSocket parity
drifts.

## Known remaining Phase 1 work

| Gate     | Status        | Boundary                                                     |
| -------- | ------------- | ------------------------------------------------------------ |
| PRD1-G02 | `NOT_STARTED` | shutdown hooks, SIGTERM, bounded termination, drain/recovery |
| PRD1-G04 | `NOT_STARTED` | startup/liveness/readiness semantics                         |
| PRD1-G05 | `NOT_STARTED` | real BullMQ school-email job-ID proof                        |
| PRD1-G06 | `NOT_STARTED` | Reinforcement proof MIME enforcement                         |
| PRD1-G07 | `NOT_STARTED` | universal Phase 1 regression closeout                        |

The late full-security-process timing limitation belongs in PRD1-G07
closeout evidence if it recurs. It does not represent a failing Phase 1A
contract assertion.

## Safety attestation

- The branch and HEAD were not changed.
- No file was staged, committed, pushed, tagged, merged, or submitted in a PR.
- No schema, migration, seed source, dependency other than the Node type line,
  queue consumer/producer, worker, scheduler, storage adapter, Learning Media
  use case, Reinforcement use case, health dependency behavior, or cloud
  configuration changed.
- No `.env` file or secret value was read. Docker validation excluded `.env`
  via `.dockerignore`; only `docs/` and `ERROR_CATALOG.md` were mounted
  read-only for static security tests.
- No existing database, Redis, object storage, Docker volume, cloud project, or
  deployment was mutated. Disposable tmpfs test data was created only inside
  the explicitly authorized isolated validation stack and was destroyed with
  that stack.
- No deployment, provisioning, branch mutation, Git mutation, or production
  action occurred.
