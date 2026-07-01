# COMM-PUSH-1A BullMQ Job ID Fix Closeout

## Problem summary

Communication push notification delivery jobs failed to enqueue in production with:

```text
Custom Id cannot contain :
```

This left `CommunicationNotificationDelivery` rows in `PENDING` because BullMQ rejected the custom push delivery `jobId` before the worker could process the job.

## Root cause

Communication notification enqueue paths used deterministic custom BullMQ job IDs containing `:`. BullMQ rejects custom job IDs with colons.

The production push delivery failure came from `buildCommunicationNotificationPushJobId`. The adjacent announcement notification generation enqueue path used the same unsafe delimiter pattern and is also passed to BullMQ as a custom `jobId`.

## Files changed

- `src/modules/communication/domain/communication-notification-generation-domain.ts`
- `src/modules/communication/tests/communication-notification-generation-domain.spec.ts`
- `src/modules/communication/tests/communication-notification-push-queue.service.spec.ts`
- `src/modules/communication/tests/communication-notification-queue.service.spec.ts`
- `docs/sprint-comm-push-1a-bullmq-jobid-fix-closeout.md`

## Exact job ID formats before/after

Push delivery job ID:

```text
Before: communication-push:{deliveryId}
After:  communication-push-{deliveryId}
```

Announcement notification generation job ID:

```text
Before: communication-announcement-notifications:{schoolId}:{announcementId}
After:  communication-announcement-notifications-{schoolId}-{announcementId}
```

## Why the fix is BullMQ-safe

The new formats are deterministic, preserve the same idempotency inputs, and do not contain `:`.

The push delivery ID still includes `deliveryId` and does not include FCM token material, encrypted token material, token hashes, credentials, school or organization internals beyond the existing queue payload, or raw notification payload content.

The announcement generation ID still includes `schoolId` and `announcementId`, preserving the existing per-school, per-announcement idempotency semantics.

Queue names, job names, retry attempts, backoff settings, payload shape, and worker behavior were not changed.

## Tests run

```text
npm run test -- --runInBand src/modules/communication/tests/communication-notification-generation-domain.spec.ts
Result: passed. 1 suite, 6 tests.

npm run test -- --runInBand src/modules/communication/tests/communication-notification-push-queue.service.spec.ts
Result: passed. 1 suite, 1 test.

npm run test -- --runInBand src/modules/communication/tests/communication-notification-queue.service.spec.ts
Result: passed. 1 suite, 1 test.

npm run build
Result: passed after clearing stale ignored dist output. An earlier build attempt timed out at 120s, and the next attempt failed with ENOTEMPTY while removing dist/src/modules/teacher-app/shared.

npx prisma validate
Result: passed. prisma/schema.prisma is valid.
```

## Out of scope

- Firebase credentials or provider configuration
- FCM dry-run behavior
- Mobile token registration logic
- Queue names or job names
- Retry/backoff changes
- Worker processing changes
- Database schema changes, migrations, seeds, or generated Prisma client changes
- API routes or API response contracts
- Replay or requeue logic for existing failed deliveries

## Known production follow-up

Existing `PENDING` push deliveries that failed to enqueue before this fix will not automatically move unless a separate replay or requeue operation is performed. This sprint intentionally does not implement replay. New announcements or messages after the fix should enqueue normally and create `pushAttempts`.

## Final verdict

READY FOR REVIEW
