import { CommunicationNotificationSourceModule } from '@prisma/client';
import { ACADEMIC_CONTENT_CLEANUP_QUEUE } from '../../src/modules/academics/academic-content/files/domain/academic-content-file.constants';
import { effectiveAcademicContentNotificationPolicy } from '../../src/modules/academics/academic-content/domain/academic-content-notification.policy';
import {
  ACADEMIC_CONTENT_NOTIFICATION_CONTEXT_PAGE_SIZE,
  ACADEMIC_CONTENT_NOTIFICATION_RECIPIENT_PAGE_SIZE,
  ACADEMIC_CONTENT_NOTIFICATION_RECOVERY_PAGE_SIZE,
} from '../../src/modules/academics/academic-content/domain/academic-content-publication-notification.policy';
import { ACADEMIC_CONTENT_PUBLICATION_QUEUE } from '../../src/modules/academics/academic-content/domain/academic-content-publication-runtime.constants';
import {
  COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATION_SOURCE_TYPE,
  COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATION_TYPES,
} from '../../src/modules/communication/domain/communication-notification-domain';
import {
  buildAcademicContentCancellationJobId,
  buildAcademicContentNotificationGenerationJobId,
  buildAcademicContentSessionReminderJobId,
  COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME,
  COMMUNICATION_NOTIFICATION_QUEUE_NAME,
  COMMUNICATION_PREPARED_NOTIFICATION_BATCH_MAX_USERS,
} from '../../src/modules/communication/domain/communication-notification-generation-domain';
import {
  COMMUNICATION_APP_NOTIFICATION_CATEGORIES,
  COMMUNICATION_NOTIFICATION_SOURCE_MODULES,
  COMMUNICATION_NOTIFICATION_TYPES,
} from '../../src/modules/communication/dto/communication-notification.dto';
import {
  CORE_WORKER_ASSIGNED_CONSUMERS,
  createOperationalRoleManifests,
  MAINTENANCE_SCHEDULE_REGISTRATIONS,
  MEDIA_WORKER_ASSIGNED_CONSUMERS,
} from '../../src/modules/health/operational-probe.manifests';

describe('Academic Content ACC-8 final cross-slice contracts', () => {
  it('keeps the four events in the existing Communication source and app category', () => {
    expect(COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATION_TYPES).toEqual([
      'ACADEMIC_CONTENT_PUBLISHED',
      'ACADEMIC_CONTENT_UPDATED',
      'ACADEMIC_CONTENT_CANCELLED',
      'ONLINE_SESSION_REMINDER',
    ]);
    expect(CommunicationNotificationSourceModule.ACADEMICS).toBe('ACADEMICS');
    expect(COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATION_SOURCE_TYPE).toBe(
      'academic_content_publication',
    );
    expect(COMMUNICATION_NOTIFICATION_SOURCE_MODULES).toContain('academics');
    expect(COMMUNICATION_APP_NOTIFICATION_CATEGORIES).toContain(
      'academic_content',
    );
    const publicTypes = COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATION_TYPES.map(
      (type) => type.toLowerCase(),
    );
    expect(publicTypes).toEqual([
      'academic_content_published',
      'academic_content_updated',
      'academic_content_cancelled',
      'online_session_reminder',
    ]);
    expect(COMMUNICATION_NOTIFICATION_TYPES).toEqual(
      expect.arrayContaining(publicTypes),
    );
  });

  it('locks effective policy defaults with reminders disabled until configured', () => {
    const defaults = {
      notificationsEnabled: true,
      studentNotificationsEnabled: true,
      guardianNotificationsEnabled: true,
      weeklyPlanNotificationsEnabled: true,
      guardianWeeklyNoteNotificationsEnabled: true,
      subjectResourceNotificationsEnabled: true,
      onlineSessionNotificationsEnabled: true,
      generalResourceNotificationsEnabled: true,
      significantUpdateNotificationsEnabled: true,
      cancellationNotificationsEnabled: true,
      onlineSessionRemindersEnabled: false,
      onlineSessionReminderOffsetsMinutes: [],
    };
    expect(effectiveAcademicContentNotificationPolicy()).toEqual(defaults);
    expect(effectiveAcademicContentNotificationPolicy(null)).toEqual(defaults);
  });

  it('keeps generation, cancellation and each reminder offset deterministic and distinct', () => {
    const identity = {
      schoolId: '10000000-0000-4000-8000-000000000001',
      publicationId: '20000000-0000-4000-8000-000000000002',
    };
    // PUBLISHED and UPDATED use the same path with distinct Publication truth.
    const generation =
      buildAcademicContentNotificationGenerationJobId(identity);
    const updatedIdentity = {
      ...identity,
      publicationId: '20000000-0000-4000-8000-000000000003',
    };
    const updatedGeneration =
      buildAcademicContentNotificationGenerationJobId(updatedIdentity);
    const cancellation = buildAcademicContentCancellationJobId(identity);
    const reminder15 = buildAcademicContentSessionReminderJobId({
      ...identity,
      reminderOffsetMinutes: 15,
    });
    const reminder60 = buildAcademicContentSessionReminderJobId({
      ...identity,
      reminderOffsetMinutes: 60,
    });
    const suffix = `${identity.schoolId}-${identity.publicationId}`;
    expect(generation).toBe(
      `communication-academic-content-notifications-${suffix}`,
    );
    expect(updatedGeneration).toBe(
      `communication-academic-content-notifications-${updatedIdentity.schoolId}-${updatedIdentity.publicationId}`,
    );
    expect(cancellation).toBe(
      `communication-academic-content-cancellation-${suffix}`,
    );
    expect(reminder15).toBe(
      `communication-academic-content-session-reminder-${suffix}-15`,
    );
    expect(reminder60).toBe(
      `communication-academic-content-session-reminder-${suffix}-60`,
    );
    expect(
      buildAcademicContentNotificationGenerationJobId({ ...identity }),
    ).toBe(generation);
    expect(
      buildAcademicContentNotificationGenerationJobId({ ...updatedIdentity }),
    ).toBe(updatedGeneration);
    expect(buildAcademicContentCancellationJobId({ ...identity })).toBe(
      cancellation,
    );
    expect(
      buildAcademicContentSessionReminderJobId({
        ...identity,
        reminderOffsetMinutes: 15,
      }),
    ).toBe(reminder15);
    expect(
      new Set([
        generation,
        updatedGeneration,
        cancellation,
        reminder15,
        reminder60,
      ]).size,
    ).toBe(5);
  });

  it('reuses existing queues within the exact worker and maintenance topology', () => {
    expect(CORE_WORKER_ASSIGNED_CONSUMERS).toHaveLength(8);
    expect(new Set(CORE_WORKER_ASSIGNED_CONSUMERS).size).toBe(8);
    expect(MEDIA_WORKER_ASSIGNED_CONSUMERS).toHaveLength(1);
    expect(MAINTENANCE_SCHEDULE_REGISTRATIONS).toHaveLength(9);
    expect(
      CORE_WORKER_ASSIGNED_CONSUMERS.filter((queue) =>
        queue.startsWith('communication-'),
      ),
    ).toEqual([
      COMMUNICATION_NOTIFICATION_QUEUE_NAME,
      COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME,
    ]);
    expect(
      CORE_WORKER_ASSIGNED_CONSUMERS.filter((queue) =>
        queue.startsWith('academic-content-'),
      ),
    ).toEqual([
      ACADEMIC_CONTENT_PUBLICATION_QUEUE,
      ACADEMIC_CONTENT_CLEANUP_QUEUE,
    ]);
    const roles = createOperationalRoleManifests();
    expect(roles.api.assignedConsumers).toEqual([]);
    expect(roles.api.assignedSchedules).toEqual([]);
    expect(roles['core-worker'].assignedConsumers).toEqual(
      CORE_WORKER_ASSIGNED_CONSUMERS,
    );
    expect(roles['maintenance-scheduler'].assignedSchedules).toEqual(
      MAINTENANCE_SCHEDULE_REGISTRATIONS,
    );
  });

  it('preserves server-owned recipient, context, Communication and recovery bounds', () => {
    expect(ACADEMIC_CONTENT_NOTIFICATION_RECIPIENT_PAGE_SIZE).toBe(500);
    expect(ACADEMIC_CONTENT_NOTIFICATION_CONTEXT_PAGE_SIZE).toBe(500);
    expect(COMMUNICATION_PREPARED_NOTIFICATION_BATCH_MAX_USERS).toBe(500);
    expect(ACADEMIC_CONTENT_NOTIFICATION_RECOVERY_PAGE_SIZE).toBe(100);
  });
});
