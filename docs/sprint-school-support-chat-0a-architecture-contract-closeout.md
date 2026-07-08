# Sprint School Support Chat 0A Architecture Contract Closeout

## Sprint Name

SCHOOL-SUPPORT-CHAT-0A - Architecture and API Contract

## Baseline Commit

Expected baseline:

```text
3e9f086f docs: refresh dismissal final acceptance baseline
```

Observed `HEAD` at sprint start:

```text
3e9f086f docs: refresh dismissal final acceptance baseline
```

Baseline difference:

```text
None. Observed HEAD matched the expected baseline.
```

## Purpose

Document the backend architecture and frontend/backend API contract for School Dashboard Help support chat between a school user and Moazez Platform Admin / `platform_super_admin`.

This sprint is docs-only. It does not implement runtime behavior.

## Files Changed

- `docs/school-support-chat-architecture-v1.md`
- `docs/school-support-chat-api-contract-v1.md`
- `docs/sprint-school-support-chat-0a-architecture-contract-closeout.md`

## Schema Changes

None.

## Migration Changes

None.

## Seed Changes

None.

## Runtime Source Changes

None.

## Tests Added

None.

## Docs Created

- `docs/school-support-chat-architecture-v1.md`
- `docs/school-support-chat-api-contract-v1.md`
- `docs/sprint-school-support-chat-0a-architecture-contract-closeout.md`

## Verification Commands

Initial commands run before writing docs:

```powershell
git status --short --untracked-files=all
git log --oneline -15
npx prisma validate
```

Initial results:

- `git status --short --untracked-files=all`: no output; working tree was clean.
- `git log --oneline -15`: top commit was `3e9f086f docs: refresh dismissal final acceptance baseline`.
- `npx prisma validate`: passed.

Commands run after docs were created:

```powershell
npx prisma validate
npm run build
git diff --name-only
git diff --stat
git diff --check
git status --short --untracked-files=all
```

Because the new docs are untracked, `git add -N` should be run if needed so the docs appear in `git diff`:

```powershell
git add -N `
  docs/school-support-chat-architecture-v1.md `
  docs/school-support-chat-api-contract-v1.md `
  docs/sprint-school-support-chat-0a-architecture-contract-closeout.md
```

Final results:

- `npx prisma validate`: passed.
- `npm run build`: first long run failed with Windows generated-output cleanup error `ENOTEMPTY: directory not empty, rmdir '...\dist\src\modules\reinforcement\tasks'`; `dist/` was verified as ignored and untracked, removed safely, then `npm run build` passed.
- `git diff --name-only`: shows only the three requested docs.
- `git diff --stat`: `3 files changed, 1300 insertions(+)`.
- `git diff --stat` showed only the three requested docs.
- `git diff --check`: passed; Git emitted normal Windows LF-to-CRLF warnings only.
- `git status --short --untracked-files=all`: shows the three docs as intent-to-add only.

## Key Decisions

- Use existing Communication tables.
- Use `CommunicationConversationType.SUPPORT`.
- Use one persistent support conversation per school in V1.
- Use support-specific School Dashboard and Platform Admin endpoints.
- Do not use generic `/communication` routes for platform admin replies.
- Do not make `platform_super_admin` a school member.
- Platform Admin support routes stay under `/api/v1/platform-admin/support/*`.
- School Dashboard support routes use `/api/v1/school-support/*`.
- Platform participant rows may be used for the support conversation, but they must not create school membership or Settings Users visibility.
- REST remains source of truth; realtime is best-effort.
- Notification and push behavior must not be overclaimed before implementation verification.

## Rejected Alternatives

- Separate support chat schema from scratch.
- Reusing generic `/api/v1/communication/*` for Platform Admin support replies.
- Making `platform_super_admin` a school member.
- Full V1 ticketing with categories, priority, assignment, SLA, internal notes, and ticket numbers.
- Storing frontend response shapes in the database.

## Open Questions

- Should one support conversation per school be enforced only in application code for V1, or by a future DB uniqueness strategy?
- Should platform unread count be per platform user, shared across the platform support inbox, or both?
- Should platform support display always be `Moazez Support`, or may a safe operator display name be shown?
- Should V1 support messages allow attachments, or text only?
- Should Platform Admin support realtime room join be implemented in V1, or should Platform Admin use polling/inbox refresh first?
- Should a school message automatically reopen a closed support conversation?

## Known Issues

- Required root file `DIRECTORY_STRUCTURE.md` was not present. The repository contains `DIRECTORY_STRUCTURE_VISUAL.md`, which was read as the closest available directory guide.
- Existing generic Communication routes require active school scope through `requireCommunicationScope()`, so Platform Admin support must use support-specific platform-safe routes.
- Current seed behavior likely gives `school_admin` any new non-platform permission through `NON_PLATFORM`; this must be verified when adding `school.support.*`.
- `npm run build` initially hit a Windows `dist/` cleanup `ENOTEMPTY` condition. The ignored/untracked `dist/` build output was removed safely and the clean build passed.

## Final Verdict

READY FOR REVIEW.
