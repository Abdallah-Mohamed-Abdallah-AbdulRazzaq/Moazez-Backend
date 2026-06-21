# Sprint 28L — Conversation Creation / Contact Discovery Closeout

## Summary

Sprint 28L added app-facing Communication contact discovery and create-or-get direct conversation flows for Parent, Student, and Teacher apps.

The implementation is intentionally narrow:

- app contacts are resolved from existing app relationship scope;
- clients submit a single app-safe `contactId`;
- clients cannot submit arbitrary participant arrays, user ids, school ids, organization ids, sender ids, or actor ids;
- direct one-to-one conversations are created or reused through core Communication;
- group conversation creation and initial-message creation are deferred.

## Files changed

Runtime:

- `src/modules/communication/application/communication-conversation.use-cases.ts`
- `src/modules/communication/communication.module.ts`
- `src/modules/communication/infrastructure/communication-conversation.repository.ts`
- `src/modules/communication/presenters/communication-app-contact.presenter.ts`
- `src/modules/parent-app/messages/application/parent-message-contacts.use-cases.ts`
- `src/modules/parent-app/messages/controller/parent-messages.controller.ts`
- `src/modules/parent-app/messages/dto/parent-messages.dto.ts`
- `src/modules/parent-app/messages/infrastructure/parent-messages-read.adapter.ts`
- `src/modules/parent-app/parent-app.module.ts`
- `src/modules/student-app/messages/application/student-message-contacts.use-cases.ts`
- `src/modules/student-app/messages/controller/student-messages.controller.ts`
- `src/modules/student-app/messages/dto/student-messages.dto.ts`
- `src/modules/student-app/messages/infrastructure/student-messages-read.adapter.ts`
- `src/modules/student-app/student-app.module.ts`
- `src/modules/teacher-app/messages/application/teacher-message-contacts.use-cases.ts`
- `src/modules/teacher-app/messages/controller/teacher-messages.controller.ts`
- `src/modules/teacher-app/messages/dto/teacher-messages.dto.ts`
- `src/modules/teacher-app/messages/infrastructure/teacher-messages-read.adapter.ts`
- `src/modules/teacher-app/teacher-app.module.ts`

Tests:

- `src/modules/communication/tests/communication-conversation.use-case.spec.ts`
- `src/modules/parent-app/messages/tests/parent-messages-read.adapter.spec.ts`
- `src/modules/parent-app/messages/tests/parent-messages.use-case.spec.ts`
- `src/modules/student-app/messages/tests/student-messages-read.adapter.spec.ts`
- `src/modules/student-app/messages/tests/student-messages.use-case.spec.ts`
- `src/modules/teacher-app/messages/tests/teacher-messages-read.adapter.spec.ts`
- `src/modules/teacher-app/messages/tests/teacher-messages.use-case.spec.ts`

Docs:

- `docs/sprint-28l-conversation-creation-contact-discovery-closeout.md`

## Runtime scope

Implemented:

- Parent contact discovery.
- Student contact discovery.
- Teacher contact discovery.
- Parent create-or-get direct conversation.
- Student create-or-get direct conversation.
- Teacher create-or-get direct conversation.
- Core direct conversation create/reuse use-case.
- Core repository direct active-pair lookup and direct participant creation.
- Shared app-safe contact presenter.

No schema or migration was added.

## Routes added

Parent:

- `GET /api/v1/parent/messages/contacts`
- `POST /api/v1/parent/messages/conversations`

Student:

- `GET /api/v1/student/messages/contacts`
- `POST /api/v1/student/messages/conversations`

Teacher:

- `GET /api/v1/teacher/messages/contacts`
- `POST /api/v1/teacher/messages/conversations`

Existing routes were not renamed.

## Contact ID contract

Parent contacts:

- `teacher:<teacherUserId>`

Student contacts:

- `teacher:<teacherUserId>`

Teacher contacts:

- `student:<studentId>`
- `guardian:<guardianId>`

The app client treats `contactId` as an opaque app-facing token. The create endpoints resolve `contactId` through the same scoped discovery read model before any conversation creation occurs.

## Contact discovery rules by app surface

Parent:

- returns teachers allocated to classrooms for the parent’s linked active child enrollments;
- supports `q` over safe teacher display names inside the authorized set only;
- supports `role=teacher`;
- returns an empty list for unsupported role filters;
- does not expose unrelated teachers, parents, students, guardians, or school directory records.

Student:

- returns teachers allocated to the current student’s active enrollment classroom;
- supports `q` over safe teacher display names inside the authorized set only;
- supports `role=teacher`;
- returns an empty list for unsupported role filters;
- does not expose unrelated teachers, students, parents, guardians, or school directory records.

Teacher:

- returns students in classrooms allocated to the current teacher;
- returns guardians with active parent users linked to those allocated students;
- supports `q` over safe display names inside the authorized set only;
- supports `role=student` and `role=parent`;
- returns an empty list for unsupported role filters such as `teacher`;
- does not expose unrelated students, guardians, parents, teachers, or school directory records.

## Conversation creation/reuse rules

All app create endpoints:

- derive the current app actor from existing app access services;
- resolve `contactId` through the app’s scoped contact read model;
- reject unknown or unauthorized contacts with safe not-found behavior;
- call core Communication direct conversation create/reuse with the resolved target user;
- create only direct one-to-one conversations;
- create exactly two active participants for new direct conversations: actor and target;
- return the existing app-facing conversation detail contract after reloading through the app read adapter.

Clients cannot submit participant arrays or override actor, recipient, school, or organization identity.

## Relationship authorization rules

Parent:

- parent actor must be a current parent in the active school;
- parent contact scope is limited to teachers allocated to linked child classrooms.

Student:

- student actor must be the current student with active enrollment;
- student contact scope is limited to teachers allocated to the current enrollment classroom.

Teacher:

- teacher actor must be the current teacher;
- teacher contact scope is limited to owned teacher allocation classrooms;
- student contacts are active students in those classrooms;
- guardian contacts are active parent users linked to those students.

## Direct conversation dedupe behavior

Core Communication performs best-effort reuse by looking for an existing non-deleted `DIRECT` conversation where the actor and target are the active/muted participant pair.

If found, the existing conversation is reused and no new audit create entry is written. If not found, a new direct conversation is created and audited.

No schema migration was added. There is no database-level unique constraint for unordered direct participant pairs, so concurrency-perfect dedupe remains a future migration candidate if product requirements demand it.

Inactive, removed, left, or blocked historical participant-pair conversations are not reactivated in this sprint.

## Policy behavior

The core direct create/reuse use-case enforces the existing Communication policy `isEnabled` gate through `assertConversationCreateAllowedByPolicy`.

Broader product policy controls for contact availability, staff channels, student-to-student messaging, and support routing remain future work.

## Response payload contract

Contact list:

Parent/Student use dual aliases:

```json
{
  "contacts": [
    {
      "contactId": "teacher:<id>",
      "contact_id": "teacher:<id>",
      "displayName": "Teacher Name",
      "display_name": "Teacher Name",
      "role": "teacher",
      "avatarUrl": null,
      "avatar_url": null,
      "subtitle": "Math - Grade 4",
      "conversationId": "uuid-or-null",
      "conversation_id": "uuid-or-null",
      "canMessage": true,
      "can_message": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1
  }
}
```

Teacher uses camelCase:

```json
{
  "contacts": [
    {
      "contactId": "student:<id>",
      "displayName": "Student Name",
      "role": "student",
      "avatarUrl": null,
      "subtitle": "Student - Grade 4",
      "conversationId": null,
      "canMessage": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1
  }
}
```

Create conversation request:

```json
{
  "contactId": "teacher:<id>"
}
```

Create conversation response:

- returns the existing app-facing conversation detail wrapper for the relevant app surface;
- Parent/Student keep dual aliases;
- Teacher keeps camelCase;
- no raw contact target user id is returned.

## Realtime behavior

No new realtime events were added.

Conversation creation does not publish contact discovery data. Conversation creation does not generate message realtime events because initial message creation is deferred.

## Notification behavior

No notification rows are created by conversation creation in Sprint 28L.

Sprint 28K message notification generation remains centralized in the existing message creation flow. Because Sprint 28L does not create an initial message, it does not trigger message notifications.

## Explicitly not included

- public/global directory search;
- arbitrary userId messaging;
- client-provided participant arrays;
- group conversation creation;
- initial message creation;
- contact search by email or phone;
- support channel creation;
- push/FCM/APNs;
- notification preferences;
- teacher announcements;
- delivery receipt changes;
- read receipt changes;
- message/media send changes;
- schema, migration, package, route-prefix, or generated-file changes.

## Security/no-leak confirmation

App-facing contact and create responses do not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `participantId`
- `recipientUserId`
- `actorUserId`
- `targetUserId`
- raw unscoped user directory data
- password hashes
- email
- phone
- `deletedAt`
- `studentGuardianId`
- `enrollmentId`
- `teacherAllocationId`
- raw metadata
- storage internals
- finance/payment fields

The app read adapters use scoped Prisma and relationship-rooted filters. The create use-cases resolve contacts through the same scoped read models before delegating to core Communication.

## Tests run and results

Verification completed:

- `git status --short --untracked-files=all` - completed.
- `git diff --name-only` - completed.
- `git diff --stat` - completed.
- `git diff --check` - passed.
- `npx prisma validate` - passed.
- `npx prisma generate` - passed.
- `npm run build` - passed.
- `npm run test -- communication --runInBand` - passed, 53 suites / 281 tests.
- `npm run test -- parent-app --runInBand` - passed, 49 suites / 197 tests.
- `npm run test -- student-app --runInBand` - passed, 49 suites / 234 tests.
- `npm run test -- teacher-app --runInBand` - passed, 44 suites / 253 tests.
- `npm run test -- realtime --runInBand` - passed, 9 suites / 48 tests.
- `npm run test -- files --runInBand` - passed, 8 suites / 27 tests.
- `npm run test:security -- --runInBand` - passed, 49 suites / 803 tests.
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.communication.spec.ts test/security/tenancy.parent-app.spec.ts test/security/tenancy.student-app.spec.ts test/security/tenancy.teacher-app.spec.ts` - passed, 4 suites / 152 tests.

## Known follow-ups for 28M and later

- Sprint 28M owns Teacher app announcements.
- Group conversation creation remains deferred.
- Initial message during conversation creation remains deferred.
- Support channel creation remains deferred.
- True database-level direct pair uniqueness would require a future schema/migration decision.
- Rich contact availability reasons and policy toggles remain future app contract work.

## Final verdict

CONVERSATION_CREATION_CONTACT_DISCOVERY_COMPLETE
