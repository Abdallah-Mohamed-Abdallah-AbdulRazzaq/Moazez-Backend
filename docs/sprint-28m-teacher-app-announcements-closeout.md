# Sprint 28M — Teacher App Announcements Closeout

## Summary

Sprint 28M added Teacher App announcement management for teacher-owned class allocations. Teachers can now list, view, create draft announcements, update drafts, publish drafts, and archive allowed teacher-created announcements through Teacher App routes.

The implementation reuses the core Communication announcement lifecycle for create/update/publish/archive, so core domain validation, audit logging, and existing announcement notification generation remain the source of truth.

## Files Changed

- `src/modules/teacher-app/announcements/controller/teacher-announcements.controller.ts`
- `src/modules/teacher-app/announcements/application/teacher-announcements.use-cases.ts`
- `src/modules/teacher-app/announcements/infrastructure/teacher-announcements-read.adapter.ts`
- `src/modules/teacher-app/announcements/domain/teacher-announcement-app-domain.ts`
- `src/modules/teacher-app/announcements/dto/teacher-announcements.dto.ts`
- `src/modules/teacher-app/announcements/presenters/teacher-announcements.presenter.ts`
- `src/modules/teacher-app/announcements/tests/teacher-announcements.use-case.spec.ts`
- `src/modules/teacher-app/announcements/tests/teacher-announcements-read.adapter.spec.ts`
- `src/modules/teacher-app/teacher-app.module.ts`
- `src/modules/communication/communication.module.ts`
- `src/modules/communication/infrastructure/communication-notification-generation.worker.ts`

## Runtime Scope

Implemented Teacher App only:

- `GET /api/v1/teacher/announcements`
- `GET /api/v1/teacher/announcements/:announcementId`
- `POST /api/v1/teacher/announcements`
- `PATCH /api/v1/teacher/announcements/:announcementId`
- `POST /api/v1/teacher/announcements/:announcementId/publish`
- `POST /api/v1/teacher/announcements/:announcementId/archive`

No Parent/Student write routes were added.

## Routes Added

All routes are under the existing global `/api/v1` prefix and the Teacher App controller path `teacher/announcements`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/teacher/announcements` | List current teacher's Teacher App announcements |
| GET | `/api/v1/teacher/announcements/:announcementId` | Get one scoped teacher announcement |
| POST | `/api/v1/teacher/announcements` | Create a draft announcement, optionally publish immediately |
| PATCH | `/api/v1/teacher/announcements/:announcementId` | Update an owned draft/scheduled announcement |
| POST | `/api/v1/teacher/announcements/:announcementId/publish` | Publish an owned draft/scheduled announcement |
| POST | `/api/v1/teacher/announcements/:announcementId/archive` | Archive an owned allowed announcement |

## Request/Response Contract

Create request:

```json
{
  "title": "Announcement title",
  "body": "Announcement body",
  "target": {
    "type": "classroom",
    "classId": "teacher-app-class-id"
  },
  "audience": "students_and_parents",
  "priority": "important",
  "publishNow": false
}
```

`target.classId` follows the existing Teacher App convention backed by `TeacherSubjectAllocation.id`. `target.classroomId` is also accepted only when it resolves to one of the current teacher's owned allocations.

Teacher App response is camelCase only:

```json
{
  "announcement": {
    "announcementId": "uuid",
    "title": "Announcement title",
    "body": "Announcement body",
    "status": "draft",
    "audience": "students_and_parents",
    "target": {
      "type": "classroom",
      "classId": "teacher-app-class-id",
      "classroomId": "uuid",
      "label": "Grade / Section / Classroom"
    },
    "priority": "important",
    "createdAt": "ISO",
    "publishedAt": null,
    "archivedAt": null,
    "updatedAt": "ISO",
    "attachmentsCount": 0,
    "readCount": 0,
    "canEdit": true,
    "canPublish": true,
    "canArchive": true
  }
}
```

## Teacher Authorization Rules

- Current teacher actor is derived from `TeacherAppAccessService`.
- Client cannot provide `teacherId`, `actorId`, `schoolId`, `organizationId`, `membershipId`, or recipient arrays.
- Target authorization is checked against `listOwnedTeacherAllocations()`.
- Announcement detail/update/publish/archive requires:
  - `createdById` equals current teacher user id;
  - teacher-app metadata source is present;
  - metadata target still matches a current owned allocation.
- Unauthorized or guessed announcement ids return not found through the app use case.

## Target/Classroom Scoping Rules

- Initial scope is classroom/class allocation only.
- School-wide teacher announcements are not allowed.
- Multi-class/group targets are deferred.
- `classId` is the app-safe Teacher App class id already used by `/teacher/my-classes`.
- `classroomId` is accepted only when it resolves to an owned teacher allocation.
- Archived/deleted/unrelated/cross-school allocations are blocked by existing scoped allocation reads and the access service.

## Audience/Recipient Resolution Behavior

Supported audiences:

- `students`
- `parents`
- `students_and_parents`

Recipient rows are generated as core `CUSTOM` announcement audience rows:

- Students: active enrolled students in the authorized classroom with active student users, stored as `userId` audience rows.
- Parents: active guardians/parents linked to active students in the authorized classroom with active parent users, stored as `guardianId` audience rows.
- `students_and_parents`: both of the above, deduplicated.

Inactive/deleted students, guardians, users, and enrollments are excluded. Empty resolved audiences are rejected.

## Ownership/Status Lifecycle Behavior

- Teachers create draft announcements through the core create use case.
- `publishNow` creates the draft first, then calls the core publish use case.
- Teachers can update only records that pass Teacher App ownership and allocation checks; core domain rules block editing published/archived/cancelled announcements.
- Teachers can publish only owned teacher-app draft/scheduled announcements.
- Teachers can archive only owned teacher-app announcements allowed by core archive rules.
- Cancel route was not added; archive is the Teacher App lifecycle close action for this sprint.

## Notification Behavior

Publishing reuses existing Communication announcement notification generation.

- No duplicate notification system was added.
- Publish enqueues the existing announcement notification job.
- Notification generation remains recipient scoped by the existing core infrastructure.
- Message notification generation from Sprint 28K was not changed.

## Realtime Behavior

No new announcement realtime event was introduced.

If publish generates in-app notifications, existing `communication.notification.created` emission is reused through the notification generation service and is recipient-user-room scoped.

A narrow lifecycle cleanup was added to `CommunicationNotificationGenerationWorker` so BullMQ workers close on Nest app shutdown. This prevents stale worker instances from consuming jobs during security/e2e runs and does not change the notification payload contract.

## Attachment Behavior

Teacher announcement attachment linking/upload was deferred.

The response includes `attachmentsCount` from the core announcement count. No new upload pipeline, signed URL, storage metadata, or app attachment route was added for teacher announcements in 28M.

## Parent/Student Read Compatibility Behavior

Published teacher announcements are represented as core `CUSTOM` announcements:

- Student audience rows use student `userId`, which existing Student App announcement reads already understand.
- Parent audience rows use `guardianId`, which existing Parent App announcement reads already understand.

Parent/Student write behavior was not added. Existing Parent/Student announcement test suites passed.

## Explicitly Not Included

- Public/global announcements
- School-wide teacher-created announcements
- Group/multi-class teacher targets
- Individual student/guardian direct announcement routes
- Teacher announcement cancel route
- Announcement attachment upload/linking from Teacher App
- New upload pipeline
- Push/FCM/APNs
- Email/SMS
- Notification preferences
- Delivery/read receipt changes
- Message/media/contact discovery changes
- Prisma schema or migration changes
- Package changes
- Route renames/global prefix changes

## Security/No-Leak Confirmation

Teacher App announcement payloads do not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `teacherAllocationId`
- `enrollmentId`
- `studentGuardianId`
- `recipientUserId`
- `actorUserId`
- `createdById`
- `publishedById`
- `archivedById`
- `deletedAt`
- raw metadata
- raw recipient lists
- storage internals
- signed URLs

## Tests Run and Results

- `git status --short --untracked-files=all`: showed only Sprint 28M code/doc changes.
- `git diff --name-only`: tracked runtime files listed; new files are visible in `git status`.
- `git diff --stat`: clean tracked stat output.
- `git diff --check`: clean.
- `npx prisma validate`: passed.
- `npx prisma generate`: passed.
- `npm run build`: passed after clearing ignored stale `dist` output that initially caused a Nest cleanup `ENOTEMPTY` error.
- `npm run test -- communication --runInBand`: passed, 53 suites / 281 tests.
- `npm run test -- teacher-app --runInBand`: passed, 46 suites / 264 tests.
- `npm run test -- parent-app --runInBand`: passed, 49 suites / 197 tests.
- `npm run test -- student-app --runInBand`: passed, 49 suites / 234 tests.
- `npm run test -- realtime --runInBand`: passed, 9 suites / 48 tests.
- `npm run test -- files --runInBand`: passed, 8 suites / 27 tests.
- `npm run test:security -- --runInBand`
  - Result: PASS, 49 suites / 803 tests, 294.898 seconds.

Historical note:
An earlier full security run timed out after about 304 seconds. During investigation, the focused fallback security command passed with 4 suites / 152 tests. The final accepted verification for Sprint 28M is the full security suite pass above.

## Known Follow-ups For 28N And Later

- App notification preferences remain Sprint 28N.
- Teacher App announcement attachment linking/download can be considered later with explicit file ownership checks.
- Multi-class/group teacher announcements remain future scope.
- A dedicated Teacher App cancel route can be considered if product wants draft cancellation separate from archive.

## Final Verdict

TEACHER_APP_ANNOUNCEMENTS_COMPLETE