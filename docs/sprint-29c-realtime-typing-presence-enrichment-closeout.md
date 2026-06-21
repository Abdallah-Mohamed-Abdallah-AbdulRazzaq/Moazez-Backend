# Sprint 29C - Realtime Typing/Presence Enrichment Closeout

## Summary

Sprint 29C enriched realtime typing payloads with an app-safe actor card and narrowed app-facing presence publication from the broad school room to active shared conversation rooms. The work preserves Track A realtime event names and client command names, keeps existing `userId` fields for backward compatibility, and does not change HTTP routes, notifications, message persistence, read receipts, attachments, schema, migrations, packages, lockfiles, or generated files.

Final verdict: `REALTIME_TYPING_PRESENCE_ENRICHMENT_COMPLETE`

## Files changed

Runtime files changed:

- `src/infrastructure/realtime/realtime-actor-card.ts`
- `src/infrastructure/realtime/realtime-auth.service.ts`
- `src/infrastructure/realtime/realtime-communication-access.service.ts`
- `src/infrastructure/realtime/realtime-presence.service.ts`
- `src/infrastructure/realtime/realtime-presence.types.ts`
- `src/infrastructure/realtime/realtime-typing.service.ts`
- `src/infrastructure/realtime/realtime.gateway.ts`
- `src/infrastructure/realtime/realtime.types.ts`

Test files changed:

- `src/infrastructure/realtime/tests/realtime-auth.service.spec.ts`
- `src/infrastructure/realtime/tests/realtime-communication-access.service.spec.ts`
- `src/infrastructure/realtime/tests/realtime-presence.service.spec.ts`
- `src/infrastructure/realtime/tests/realtime-typing.service.spec.ts`
- `src/infrastructure/realtime/tests/realtime.gateway.spec.ts`

Closeout file changed:

- `docs/sprint-29c-realtime-typing-presence-enrichment-closeout.md`

## Runtime scope

Runtime work was limited to realtime typing actor-card enrichment, authenticated socket context enrichment, and conversation-scoped presence publication. Existing message, read receipt, reaction, attachment, announcement, notification, file, and app-message behavior was not changed.

## Existing event names

Preserved:

- `communication.typing.started`
- `communication.typing.stopped`
- `communication.presence.user.updated`

No new realtime event names were added.

## Existing client commands

Preserved:

- `communication.typing.start`
- `communication.typing.stop`
- `communication.chat.conversation.join`
- `communication.chat.conversation.leave`
- `communication.chat.conversation.read`

No client command names were changed or added.

## Typing payload shape

Typing started payload:

```json
{
  "conversationId": "conversation-id",
  "userId": "existing-user-id",
  "actor": {
    "displayName": "Test Teacher",
    "userType": "teacher",
    "avatarUrl": null
  },
  "startedAt": "2026-05-03T10:00:00.000Z",
  "expiresAt": "2026-05-03T10:00:08.000Z"
}
```

Typing stopped payload:

```json
{
  "conversationId": "conversation-id",
  "userId": "existing-user-id",
  "actor": {
    "displayName": "Test Teacher",
    "userType": "teacher",
    "avatarUrl": null
  },
  "stoppedAt": "2026-05-03T10:00:10.000Z"
}
```

`userId` remains because it was already part of the existing realtime typing contract. No new raw identity ids were added.

## Actor card behavior

The actor card is built from the authenticated socket user already loaded by `RealtimeAuthService`.

Fields:

- `displayName`: `firstName + lastName`, trimmed; fallback `User`.
- `userType`: app-safe display category.
- `avatarUrl`: always `null` in 29C because no safe avatar URL is readily available in the authenticated socket context.

User type mapping:

- `TEACHER` -> `teacher`
- `STUDENT` -> `student`
- `PARENT` -> `parent`
- `PLATFORM_USER`, `ORGANIZATION_USER`, `SCHOOL_USER` -> `admin`
- anything else -> `user`

No broad user directory lookup was added.

## Presence payload behavior

Presence event payload:

```json
{
  "userId": "existing-user-id",
  "status": "online",
  "online": true,
  "updatedAt": "2026-05-03T10:00:00.000Z",
  "actor": {
    "displayName": "Test Teacher",
    "userType": "teacher",
    "avatarUrl": null
  }
}
```

Offline transitions use the same shape with:

- `status: "offline"`
- `online: false`

Presence payloads do not include `lastSeen`.

## Presence room targeting behavior

Presence publication is now conversation-scoped:

- On first socket online transition, the service lists active conversation ids where the actor is an active or muted participant in an active, non-deleted conversation.
- The presence event is published to each matching conversation room.
- Additional sockets for the same user do not emit duplicate online events.
- Disconnecting one of several sockets does not emit offline.
- The final socket disconnect emits offline to the same conversation-scoped target set.
- If no active shared conversations are found, the safe payload is returned internally but no app-facing presence event is published.

Conversation access remains enforced for room joins. Presence visibility therefore depends on sockets being in authorized conversation rooms; it is not sent to a global school directory room.

## School-room presence broadcast decision

The old presence implementation published `communication.presence.user.updated` to the school room. Sprint 29C narrowed this behavior: presence transitions no longer publish through `publishToSchool`.

The baseline socket still joins the school room for existing non-presence realtime infrastructure, but school-room presence is not an app-facing contract and is no longer used by presence publication.

## lastSeen decision

Exact `lastSeen` remains omitted from app-facing presence payloads. No coarsened last-seen field was added in 29C.

## avatarUrl decision

`avatarUrl` is included in actor cards and is `null` in 29C. No file/profile/avatar lookup was added.

## userId backward compatibility decision

Existing `userId` remains in typing and presence payloads for backward compatibility with the current realtime contract. No additional raw user ids or relationship ids were added.

## Security/no-leak confirmation

Typing remains gated by:

- authenticated socket actor;
- conversation access through `RealtimeCommunicationAccessService.canJoinConversationRoom`;
- conversation-room publication only.

Presence publication is scoped to active participant conversations and does not use school-room publication.

Payloads do not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- raw `guardianId`
- `studentGuardianId`
- `enrollmentId`
- `teacherAllocationId`
- `recipientUserId`
- `actorUserId`
- `uploadedById`
- bucket/object/storage keys
- signed URLs
- raw metadata
- provider metadata
- queue metadata
- `deletedAt`
- `passwordHash`
- exact `lastSeen`

Current limitation: blocked-user checks are not evaluated in the realtime presence query in 29C. The sprint enforces the current supported minimum of active participant and active conversation scope, matching the existing conversation-room access model.

## Explicitly not included

This sprint did not include:

- notification generation changes
- notification filtering or preference changes
- message search
- push, FCM, APNs, or device-token support
- email, SMS, or provider delivery
- schema or migration changes
- package or lockfile changes
- generated file changes
- a new global presence directory
- new HTTP routes
- new socket namespaces
- new socket commands
- message persistence changes
- read receipt behavior changes
- file or media attachment behavior changes

## Tests run and results

Focused tests run during implementation:

- `npm run test -- realtime --runInBand` - PASS, 9 suites, 50 tests.
- `npm run test -- communication-realtime-events --runInBand` - PASS, 1 suite, 3 tests.

Final verification:

- `git status --short --untracked-files=all` - PASS, only intended realtime runtime/test files plus the new closeout and actor-card helper are changed.
- `git diff --name-only` - PASS, tracked realtime runtime/test files only; new untracked files are listed by status.
- `git diff --stat` - PASS, 12 tracked files changed, 283 insertions, 24 deletions.
- `git diff --check` - PASS, no whitespace errors; Git reported line-ending conversion warnings only.
- `npx prisma validate` - PASS, schema valid.
- `npx prisma generate` - PASS, Prisma Client generated to `node_modules/@prisma/client`.
- `npm run build` - PASS.
- `npm run test -- communication --runInBand` - PASS, 54 suites, 295 tests.
- `npm run test -- parent-app --runInBand` - PASS, 49 suites, 200 tests.
- `npm run test -- student-app --runInBand` - PASS, 49 suites, 237 tests.
- `npm run test -- teacher-app --runInBand` - PASS, 46 suites, 267 tests.
- `npm run test -- realtime --runInBand` - PASS, 9 suites, 50 tests.
- `npm run test -- files --runInBand` - PASS, 8 suites, 27 tests.
- `npm run test:security -- --runInBand` - PASS, 49 suites, 803 tests.

The full security suite completed successfully, so the focused fallback security command was not needed.

## Known follow-ups for 29D and later

- Sprint 29D: app-safe attachment presenter hardening.
- Sprint 29E: scheduled announcement publishing and replay tooling.
- Sprint 29F: app message search.
- Future presence hardening may add explicit block/restriction checks if the product decides those states should affect realtime presence beyond active participant scope.
