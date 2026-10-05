import { randomUUID } from 'node:crypto';
import { AcademicContentType, UserType } from '@prisma/client';
import { CommunicationNotificationQueueService } from '../../../communication/application/communication-notification-queue.service';
import { CommunicationNotificationGenerationWorker } from '../../../communication/infrastructure/communication-notification-generation.worker';
import {
  buildAcademicContentCancellationJobId,
  buildAcademicContentNotificationGenerationJobId,
  buildAcademicContentSessionReminderJobId,
  isAcademicContentSessionReminderJobData,
  COMMUNICATION_ACADEMIC_CONTENT_CANCELLATION_GENERATE_JOB_NAME as CANCEL,
  COMMUNICATION_ACADEMIC_CONTENT_SESSION_REMINDER_GENERATE_JOB_NAME as REMINDER,
} from '../../../communication/domain/communication-notification-generation-domain';
import {
  academicContentReminderAt,
  academicContentSessionStartAt,
} from '../domain/academic-content-publication-notification.policy';
import { getRequestContext } from '../../../../common/context/request-context';

const now = new Date('2026-10-04T12:00:00.000Z');
const start = new Date(now.getTime() + 60 * 60_000);
const identity = () => ({
  schoolId: randomUUID(),
  organizationId: randomUUID(),
  contentId: randomUUID(),
  publicationId: randomUUID(),
  actorUserId: null,
  actorUserType: null,
});

describe('ACC-8D immutable reminder timing and queue boundary', () => {
  const timing = (
    phase: 'publication' | 'worker' | 'recovery',
    instant: Date,
    publishedAt = new Date(now.getTime() - 86400000),
  ) =>
    academicContentReminderAt({
      startAt: start,
      publishedAt,
      offsetMinutes: 15,
      now: instant,
      phase,
    });
  const due = new Date(start.getTime() - 15 * 60_000);
  it('uses strict publish, due, stale and session-start boundaries', () => {
    expect(timing('publication', now)).toEqual(due);
    expect(timing('publication', due)).toBeNull();
    expect(timing('publication', now, due)).toBeNull();
    expect(timing('worker', new Date(due.getTime() - 1))).toBeNull();
    expect(timing('worker', due)).toEqual(due);
    expect(timing('worker', new Date(due.getTime() + 299999))).toEqual(due);
    expect(timing('worker', new Date(due.getTime() + 300000))).toBeNull();
    expect(timing('worker', start)).toBeNull();
    expect(timing('recovery', new Date(due.getTime() - 86400000))).toEqual(due);
    expect(timing('recovery', new Date(due.getTime() - 86400001))).toBeNull();
    expect(timing('recovery', new Date(due.getTime() + 299999))).toEqual(due);
    expect(timing('recovery', new Date(due.getTime() + 300000))).toBeNull();
  });
  it('decodes canonical immutable V2 timing and fails closed for wrong or corrupt snapshots', () => {
    const state = {
      platform: 'ZOOM',
      providerName: 'provider-secret',
      joinUrl: 'https://example.test/join-secret',
      accessCode: 'code-secret',
      instructions: 'instruction-secret',
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + 3600000).toISOString(),
      timezone: 'Africa/Cairo',
      timetableEntryId: null,
    };
    expect(
      academicContentSessionStartAt(
        { type: 'ONLINE_SESSION', state },
        AcademicContentType.ONLINE_SESSION,
      ),
    ).toEqual(start);
    expect(
      academicContentSessionStartAt(
        {
          type: 'ONLINE_SESSION',
          state: { ...state, startAt: '2026-10-04T13:00:00Z' },
        },
        AcademicContentType.ONLINE_SESSION,
      ),
    ).toBeNull();
    expect(
      academicContentSessionStartAt({}, AcademicContentType.ONLINE_SESSION),
    ).toBeNull();
    expect(
      academicContentSessionStartAt({}, AcademicContentType.GENERAL_RESOURCE),
    ).toBeNull();
  });
  it.each([undefined, null, 0, 4, 10081, 5.5, '15', NaN])(
    'rejects invalid offset %s using the existing policy validator',
    (offset) => {
      expect(
        isAcademicContentSessionReminderJobData({
          ...identity(),
          reminderOffsetMinutes: offset,
        }),
      ).toBe(false);
    },
  );
  it.each([5, 15, 10080])(
    'accepts offset %s only in the exact seven-field payload',
    (offset) => {
      const data = { ...identity(), reminderOffsetMinutes: offset };
      expect(isAcademicContentSessionReminderJobData(data)).toBe(true);
      expect(
        isAcademicContentSessionReminderJobData({
          ...data,
          startAt: start.toISOString(),
        }),
      ).toBe(false);
      expect(
        isAcademicContentSessionReminderJobData({ ...data, joinUrl: 'secret' }),
      ).toBe(false);
    },
  );
  it('ensures distinct colon-free cancellation and delayed offset job IDs with minimum identity data', async () => {
    const ensure = jest.fn().mockResolvedValue('created');
    const queue = new CommunicationNotificationQueueService({
      ensureJobFromPersistedTruth: ensure,
    } as never);
    const data = identity();
    await queue.ensureAcademicContentCancellationNotifications(data);
    await queue.ensureAcademicContentCancellationNotifications(data);
    const reminder = { ...data, reminderOffsetMinutes: 15 };
    await queue.ensureAcademicContentSessionReminder(reminder, due, now);
    await queue.ensureAcademicContentSessionReminder(
      reminder,
      due,
      new Date(due.getTime() + 1),
    );
    expect(ensure.mock.calls[0]).toEqual(ensure.mock.calls[1]);
    expect(ensure.mock.calls[0]).toEqual([
      'communication-notifications',
      CANCEL,
      data,
      {
        jobId: buildAcademicContentCancellationJobId(data),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    ]);
    expect(ensure.mock.calls[2]).toEqual([
      'communication-notifications',
      REMINDER,
      reminder,
      {
        jobId: buildAcademicContentSessionReminderJobId(reminder),
        delay: due.getTime() - now.getTime(),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    ]);
    expect((ensure.mock.calls[3] as unknown[])[3]).toMatchObject({ delay: 0 });
    const ids = [
      buildAcademicContentCancellationJobId(data),
      buildAcademicContentNotificationGenerationJobId(data),
      buildAcademicContentSessionReminderJobId(reminder),
      buildAcademicContentSessionReminderJobId({
        ...reminder,
        reminderOffsetMinutes: 5,
      }),
    ];
    expect(new Set(ids).size).toBe(4);
    ids.forEach((id) => expect(id).not.toContain(':'));
  });
  it('dispatches later events on the existing worker and ignores queued actor authority', async () => {
    let process!: (job: {
      name: string;
      id: string;
      data: unknown;
    }) => Promise<void>;
    const createWorker = jest.fn((_queue: string, callback: typeof process) => {
      process = callback;
    });
    const observed = jest.fn(() => Promise.resolve(getRequestContext()));
    new CommunicationNotificationGenerationWorker(
      { createWorker } as never,
      {} as never,
      {} as never,
      {
        generateCancellation: observed,
        generateSessionReminder: observed,
      } as never,
      {} as never,
    ).onModuleInit();
    const data = {
      ...identity(),
      actorUserId: randomUUID(),
      actorUserType: UserType.SCHOOL_USER,
    };
    await process({ name: CANCEL, id: 'cancel', data });
    await process({
      name: REMINDER,
      id: 'reminder',
      data: { ...data, reminderOffsetMinutes: 15 },
    });
    for (const result of observed.mock.results) {
      const context = await (result.value as Promise<
        ReturnType<typeof getRequestContext>
      >);
      expect(context?.actor).toBeUndefined();
      expect(context?.activeMembership?.schoolId).toBe(data.schoolId);
    }
    expect(createWorker).toHaveBeenCalledTimes(1);
    await expect(process({ name: REMINDER, id: 'bad', data })).rejects.toThrow(
      'academic_content_notification_job_invalid',
    );
    await expect(
      process({
        name: CANCEL,
        id: 'bad',
        data: { ...data, cancellationReason: 'WITHDRAWN' },
      }),
    ).rejects.toThrow('academic_content_notification_job_invalid');
    await expect(process({ name: 'unknown', id: 'bad', data })).rejects.toThrow(
      'communication_notification_job_unknown',
    );
  });
});
