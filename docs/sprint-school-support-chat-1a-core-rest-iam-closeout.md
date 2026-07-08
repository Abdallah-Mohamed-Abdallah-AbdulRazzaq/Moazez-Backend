# Sprint School Support Chat 1A Core REST IAM Closeout

## Sprint Name

SCHOOL-SUPPORT-CHAT-1A - Core REST and IAM

## Baseline Commit

Expected baseline:

```text
210cc9bf docs: define school support chat architecture
```

Observed `HEAD` at sprint start:

```text
210cc9bf docs: define school support chat architecture
```

Baseline difference:

```text
None. Observed HEAD matched the expected baseline.
```

## Purpose

Implement the core REST and IAM foundation for School Dashboard Help support chat between school users and Moazez Platform Support.

## Files Changed

- `ERROR_CATALOG.md`
- `docs/school-support-chat-architecture-v1.md`
- `docs/school-support-chat-api-contract-v1.md`
- `docs/sprint-school-support-chat-1a-core-rest-iam-closeout.md`
- `prisma/seeds/01-permissions.seed.ts`
- `src/app.module.ts`
- `src/modules/school-support/**`
- `test/e2e/school-support-chat.e2e-spec.ts`
- `test/security/tenancy.school-support-chat.spec.ts`

## Schema Changes

None.

## Migration Changes

None.

## Seed Changes

Added permission catalog entries:

- `school.support.view`
- `school.support.send`
- `platform.support.view`
- `platform.support.reply`
- `platform.support.manage`

No role seed arrays were explicitly expanded. Current role behavior:

- `platform_super_admin` receives `platform.support.*` through `ALL`.
- `school_admin` receives `school.support.*` through `NON_PLATFORM` / `SCHOOL_LEVEL`.
- Teacher, Parent, Student, and Dismissal Staff explicit arrays do not include `school.support.*`.

## Runtime Source Changes

Added `SchoolSupportModule` and registered it in `AppModule`.

Implemented:

- School support controller under `/api/v1/school-support/*`.
- Platform support controller under `/api/v1/platform-admin/support/*`.
- Support use cases, repository, presenters, DTOs, context helpers, and domain errors.
- One persistent `CommunicationConversationType.SUPPORT` conversation per school in application code.
- Text-only school messages and platform replies.
- Per-current-user unread/read semantics.
- Platform participant row creation without school membership creation.
- Closed-conversation `409` behavior for school sends and platform replies.

## Routes Added

School Dashboard:

- `GET /api/v1/school-support/conversation`
- `GET /api/v1/school-support/messages`
- `POST /api/v1/school-support/messages`
- `POST /api/v1/school-support/read`

Platform Admin:

- `GET /api/v1/platform-admin/support/conversations`
- `GET /api/v1/platform-admin/support/conversations/:conversationId`
- `GET /api/v1/platform-admin/support/conversations/:conversationId/messages`
- `POST /api/v1/platform-admin/support/conversations/:conversationId/messages`
- `POST /api/v1/platform-admin/support/conversations/:conversationId/read`
- `POST /api/v1/platform-admin/support/conversations/:conversationId/close`
- `POST /api/v1/platform-admin/support/conversations/:conversationId/reopen`

## Tests Added

- `test/e2e/school-support-chat.e2e-spec.ts`
- `test/security/tenancy.school-support-chat.spec.ts`

## Docs Updated / Created

Updated:

- `docs/school-support-chat-architecture-v1.md`
- `docs/school-support-chat-api-contract-v1.md`

Created:

- `docs/sprint-school-support-chat-1a-core-rest-iam-closeout.md`

## Verification Commands

Initial commands:

```powershell
git status --short --untracked-files=all
git log --oneline -15
npx prisma validate
```

Initial results:

- `git status --short --untracked-files=all`: no output; working tree was clean.
- `git log --oneline -15`: top commit was `210cc9bf docs: define school support chat architecture`.
- `npx prisma validate`: passed.

Implementation checks run before final verification:

```powershell
npx tsc -p tsconfig.build.json --noEmit
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/school-support-chat.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.school-support-chat.spec.ts
```

Results:

- `npx tsc -p tsconfig.build.json --noEmit`: passed.
- `test/e2e/school-support-chat.e2e-spec.ts`: passed, 3 tests.
- `test/security/tenancy.school-support-chat.spec.ts`: passed, 5 tests.

Final verification commands:

```powershell
npx prisma validate
npx prisma generate
npm run seed
npm run build
npx jest --config ./test/jest-e2e.json --runInBand test/e2e/school-support-chat.e2e-spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.school-support-chat.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.dashboard.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.communication.spec.ts
npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.platform-admin.spec.ts
npx tsc -p tsconfig.build.json --noEmit
git diff --name-only
git diff --stat
git diff --check
git status --short --untracked-files=all
```

Final results:

- `npx prisma validate`: passed.
- `npx prisma generate`: passed.
- `npm run seed`: passed; seeded 227 permissions.
- `npm run build`: passed.
- `test/e2e/school-support-chat.e2e-spec.ts`: passed, 3 tests.
- `test/security/tenancy.school-support-chat.spec.ts`: passed, 5 tests.
- `test/security/tenancy.dashboard.spec.ts`: passed, 6 tests.
- `test/security/tenancy.platform-admin.spec.ts`: passed, 12 tests.
- `npx tsc -p tsconfig.build.json --noEmit`: passed after trailing EOF cleanup.
- `git diff --check`: passed after trailing EOF cleanup. Git emitted normal Windows LF-to-CRLF warnings.
- `test/security/tenancy.communication.spec.ts`: failed, 8 failed and 60 passed. Failures are in pre-existing communication suite expectations around default teacher/parent/student communication access and one announcement notification job id expectation; no failure references `school-support` routes.

## Key Decisions

- Use existing Communication tables.
- Use `CommunicationConversationType.SUPPORT`.
- Use one persistent support conversation per school in V1.
- Use support-specific School Dashboard and Platform Admin endpoints.
- Do not use generic `/communication` routes for platform admin replies.
- Do not make `platform_super_admin` a school member.
- Use per-current-user unread semantics for school and platform actors.
- Use text-only support messages in 1A.
- Reject school sends and platform replies to closed conversations with `409`.
- Keep support-specific realtime/push out of 1A; REST remains source of truth.

## Rejected Alternatives

- Separate support chat schema from scratch.
- Reusing generic `/api/v1/communication/*` for Platform Admin support replies.
- Making `platform_super_admin` a school member.
- Full ticketing in 1A.
- Shared platform-team unread state in 1A.
- Auto-reopening a closed support conversation when a school sends a message.

## Open Questions

- Should one-support-conversation-per-school be enforced with a future DB uniqueness strategy?
- Should 1B implement platform-safe realtime support room access or keep platform polling?
- Should support-specific push/in-app notification delivery be added in 1B?
- Should attachments be added in a later sprint after file authorization and presenter contracts are approved?

## Known Issues

- Required root file `DIRECTORY_STRUCTURE.md` is still absent in this checkout.
- Support-specific realtime and push notification behavior is intentionally not implemented in 1A.
- One persistent support conversation per school is enforced in application code only; there is no DB uniqueness constraint.
- The broad existing communication tenancy regression currently fails outside the new support-chat routes. This needs human triage before treating the full communication regression suite as green.

Baseline regression verification:

A separate git worktree was created at baseline commit:

210cc9bf docs: define school support chat architecture

The baseline worktree was prepared with the same local .env, then the following commands passed:

- npx prisma validate
- npx prisma generate
- npm run seed
- npm run build

The baseline seed reported 222 permissions, as expected before SCHOOL-SUPPORT-CHAT-1A.

Running:

npx jest --config ./test/jest-e2e.json --runInBand test/security/tenancy.communication.spec.ts --verbose

from the baseline worktree produced the same broad Communication regression result:

8 failed, 60 passed, 68 total.

Therefore, the Communication tenancy suite failure is pre-existing at 210cc9bf and is not caused by SCHOOL-SUPPORT-CHAT-1A.

## Final Verdict

READY FOR REVIEW.

SCHOOL-SUPPORT-CHAT-1A passed its focused e2e/security checks and relevant Dashboard/Platform Admin regressions. The failing broad Communication tenancy suite was reproduced on the baseline worktree at 210cc9bf and is documented as a pre-existing known issue outside this sprint.
