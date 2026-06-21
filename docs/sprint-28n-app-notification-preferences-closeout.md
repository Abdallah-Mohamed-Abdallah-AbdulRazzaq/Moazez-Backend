# Sprint 28N — App Notification Preferences Closeout

## Summary

Sprint 28N adds app-facing in-app notification preference management for Parent, Student, and Teacher notification centers. Preferences are scoped to the current school and current authenticated app actor, default to enabled when no row exists, and are now consulted by Communication message and announcement notification generation before persisted in-app notification rows and `communication.notification.created` realtime events are created.

No push, FCM, APNs, email, SMS, device-token, provider, read receipt, delivery receipt, media, contact discovery, or announcement lifecycle contract changes were added.

## Files changed

- `prisma/schema.prisma`
- `prisma/migrations/20260621120000_0040_communication_notification_preferences/migration.sql`
- `src/infrastructure/database/school-scope.extension.ts`
- `src/modules/communication/application/communication-notification-generation.service.ts`
- `src/modules/communication/application/communication-notification-preference.service.ts`
- `src/modules/communication/domain/communication-notification-preference-domain.ts`
- `src/modules/communication/dto/communication-notification-preference.dto.ts`
- `src/modules/communication/infrastructure/communication-notification-preference.repository.ts`
- `src/modules/communication/presenters/communication-notification-preference.presenter.ts`
- `src/modules/communication/communication.module.ts`
- `src/modules/communication/tests/communication-notification-generation.service.spec.ts`
- `src/modules/communication/tests/communication-notification-preference.service.spec.ts`
- `src/modules/parent-app/notifications/**`
- `src/modules/parent-app/parent-app.module.ts`
- `src/modules/student-app/notifications/**`
- `src/modules/student-app/student-app.module.ts`
- `src/modules/teacher-app/notifications/**`
- `src/modules/teacher-app/teacher-app.module.ts`

## Runtime scope

Implemented:

- App-facing preference GET/PATCH routes for Parent, Student, and Teacher notification centers.
- A core Communication notification preference service/repository/presenter.
- A narrow `CommunicationNotificationPreference` persistence model.
- Generation-time preference gating for `message_received` and `announcement`.
- Focused unit/security regression coverage.

Not changed:

- Existing notification list/detail/summary/read/read-all/archive contracts.
- Existing message creation, announcement publishing, media, contact discovery, read receipt, and delivery receipt behavior, except notification generation now checks recipient preferences.

## Routes added

Parent:

- `GET /api/v1/parent/notifications/preferences`
- `PATCH /api/v1/parent/notifications/preferences`

Student:

- `GET /api/v1/student/notifications/preferences`
- `PATCH /api/v1/student/notifications/preferences`

Teacher:

- `GET /api/v1/teacher/notifications/preferences`
- `PATCH /api/v1/teacher/notifications/preferences`

All routes derive the actor from the existing app access service. They do not accept `userId`, `recipientUserId`, `actorUserId`, `schoolId`, `organizationId`, `membershipId`, or `roleId` overrides.

## Preference categories

Implemented categories:

- `message_received`
- `announcement`

`message_mention` remains deferred because mention notifications are still deferred. Broad categories such as attendance, grades, behavior, reinforcement, homework, or provider/device preferences are not part of Sprint 28N.

## Persistence strategy

A schema migration was required because no existing user/school-scoped notification preference persistence existed.

New persistence:

- `communication_notification_preference_category` enum:
  - `MESSAGE_RECEIVED`
  - `ANNOUNCEMENT`
- `communication_notification_preferences` table:
  - `school_id`
  - `user_id`
  - `category`
  - `in_app_enabled`
  - timestamps
- Unique constraint: `school_id + user_id + category`

The model is added to school-scope injection so app routes and repository calls remain tenant-scoped.

## Request/response contract

GET response, camel style:

```json
{
  "preferences": [
    {
      "category": "message_received",
      "label": "Messages",
      "description": "Notifications for new communication messages.",
      "inAppEnabled": true,
      "canChange": true
    },
    {
      "category": "announcement",
      "label": "Announcements",
      "description": "Notifications for school and class announcements.",
      "inAppEnabled": true,
      "canChange": true
    }
  ]
}
```

Parent and Student responses also include `in_app_enabled` and `can_change` aliases. Teacher responses remain camelCase.

PATCH request:

```json
{
  "preferences": [
    {
      "category": "message_received",
      "inAppEnabled": false
    },
    {
      "category": "announcement",
      "inAppEnabled": true
    }
  ]
}
```

Parent and Student may also send `in_app_enabled`. If camel and snake aliases conflict, the request is rejected. Unknown categories are rejected.

## Parent/Student/Teacher app behavior

- Parent preferences are scoped to `context.parentUserId`.
- Student preferences are scoped to `context.studentUserId`.
- Teacher preferences are scoped to `context.teacherUserId`.
- Missing rows return the full defaulted preference set with `inAppEnabled: true`.
- PATCH upserts only the current actor/current school rows and returns the full defaulted response.
- Existing notification-center rows remain visible even if the user disables a category later.

## Default behavior

Missing preference row means enabled by default.

This preserves existing notification behavior for every user until they explicitly disable a Communication notification category.

## Notification generation integration

Preference checks are centralized in `CommunicationNotificationPreferenceService` and applied by `CommunicationNotificationGenerationService`.

Order of checks:

1. Existing source validation: message/announcement exists, belongs to current school, and is in a notifiable state.
2. Existing eligibility rules: participant status, mute, active user, announcement audience resolution.
3. Recipient preference gating.
4. Persist missing notification rows and in-app delivery records.
5. Emit `communication.notification.created` only for newly persisted notifications.

Preference suppression is non-fatal. Message creation and announcement publishing still succeed.

## Message notification behavior

- Category: `message_received`.
- Sender is still excluded by the Sprint 28K recipient rules.
- Muted/inactive/removed/blocked/non-readable participants remain excluded before preferences are checked.
- If a recipient disabled `message_received`, no persisted notification row is created for that recipient and no `communication.notification.created` event is emitted to that recipient.
- Other eligible recipients with enabled/default preferences still receive notifications.
- Sender preference does not affect recipient notification generation.
- Existing idempotent retry behavior remains: existing notifications are not re-created and do not emit duplicate realtime events.

## Announcement notification behavior

- Category: `announcement`.
- Announcement audience resolution remains unchanged.
- If a recipient disabled `announcement`, no persisted notification row is created for that recipient and no `communication.notification.created` event is emitted to that recipient.
- Other eligible recipients with enabled/default preferences still receive notifications.
- Announcement publish remains successful even when every resolved recipient disabled announcement notifications.
- Existing announcement notification dedupe remains intact.

## Muted conversation interaction

Conversation participant mute remains stronger and unchanged for message notifications. Muted participants are removed from the eligible recipient set before preference gating runs.

## Realtime behavior

- Existing `message.created` realtime behavior is unchanged.
- Existing announcement publish behavior is unchanged.
- `communication.notification.created` is emitted only for newly persisted app notification rows.
- Disabled recipients receive no notification-created event.
- Events remain recipient-user-room only through the existing realtime notification publisher.

## Explicitly not included

- Push/FCM/APNs.
- Device tokens.
- Email/SMS.
- Notification provider integrations.
- Notification preferences for non-Communication categories.
- Admin preference management.
- Message lifecycle changes.
- Contact discovery changes.
- Announcement lifecycle changes beyond generation preference gating.
- Read receipt or delivery receipt changes.
- Media changes.
- Message mention preference activation.

## Security/no-leak confirmation

Preference routes and presenters do not expose:

- `schoolId`
- `organizationId`
- `membershipId`
- `roleId`
- `recipientUserId`
- `actorUserId`
- `userId`
- preference row ids
- notification delivery ids
- queue ids
- provider metadata
- raw metadata
- `passwordHash`
- `deletedAt`

App routes reject ownership override attempts through DTO whitelist validation and app access services.

## Tests run and results

- `npx prisma validate` — passed.
- `npx prisma generate` — passed.
- `npm run build` — first 180s attempt timed out; rerun with longer timeout passed.
- `npm run test -- communication --runInBand` — passed, 54 suites / 288 tests.
- `npm run test -- parent-app --runInBand` — passed, 49 suites / 199 tests.
- `npm run test -- student-app --runInBand` — passed, 49 suites / 236 tests.
- `npm run test -- teacher-app --runInBand` — passed, 46 suites / 266 tests.
- `npm run test -- realtime --runInBand` — passed, 9 suites / 48 tests.
- `npm run test -- files --runInBand` — passed, 8 suites / 27 tests.
- `npm run test:security -- --runInBand` — initially failed because the local database had not yet applied the new migration and the announcement worker could not finish preference-aware generation.
- `npm run db:migrate` — applied `20260621120000_0040_communication_notification_preferences`.
- `npm run test:security -- --runInBand --runTestsByPath test/security/tenancy.communication.spec.ts` — passed, 1 suite / 67 tests.
- `npm run test:security -- --runInBand` — passed, 49 suites / 803 tests.

## Known follow-ups for 28O and later

- Track A final integration audit/handoff should include the new preference routes and generation behavior.
- Message mention preferences should only become active if message mentions are implemented.
- Device-token, push provider, realtime-vs-persisted channel separation, and broader app notification categories remain future work.

## Final verdict

APP_NOTIFICATION_PREFERENCES_COMPLETE
