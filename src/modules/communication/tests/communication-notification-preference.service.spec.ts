import { CommunicationNotificationPreferenceCategory } from '@prisma/client';
import { CommunicationNotificationPreferenceService } from '../application/communication-notification-preference.service';
import {
  CommunicationNotificationPreferenceRecord,
  CommunicationNotificationPreferenceRepository,
} from '../infrastructure/communication-notification-preference.repository';

const SCHOOL_ID = 'school-1';
const USER_ID = 'user-1';

describe('CommunicationNotificationPreferenceService', () => {
  it('returns the complete defaulted preference set when no rows exist', async () => {
    const repository = repositoryMock({
      listCurrentSchoolUserPreferences: jest.fn().mockResolvedValue([]),
    });

    const result = await new CommunicationNotificationPreferenceService(
      repository,
    ).getPreferencesForActor({
      schoolId: SCHOOL_ID,
      userId: USER_ID,
      aliasStyle: 'dual',
    });

    expect(result).toEqual({
      preferences: [
        {
          category: 'message_received',
          label: 'Messages',
          description: 'Notifications for new communication messages.',
          inAppEnabled: true,
          in_app_enabled: true,
          pushEnabled: true,
          push_enabled: true,
          canChange: true,
          can_change: true,
        },
        {
          category: 'announcement',
          label: 'Announcements',
          description: 'Notifications for school and class announcements.',
          inAppEnabled: true,
          in_app_enabled: true,
          pushEnabled: true,
          push_enabled: true,
          canChange: true,
          can_change: true,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('userId');
    expect(JSON.stringify(result)).not.toContain('schoolId');
    expect(JSON.stringify(result)).not.toContain('preference-');
  });

  it('upserts scoped preference rows and returns camel-only teacher style when requested', async () => {
    const repository = repositoryMock({
      upsertCurrentSchoolUserPreferences: jest.fn().mockResolvedValue([
        preferenceRecord({
          category:
            CommunicationNotificationPreferenceCategory.MESSAGE_RECEIVED,
          inAppEnabled: false,
          pushEnabled: false,
        }),
        preferenceRecord({
          id: 'preference-2',
          category: CommunicationNotificationPreferenceCategory.ANNOUNCEMENT,
          inAppEnabled: true,
          pushEnabled: true,
        }),
      ]),
    });

    const result = await new CommunicationNotificationPreferenceService(
      repository,
    ).updatePreferencesForActor({
      schoolId: SCHOOL_ID,
      userId: USER_ID,
      aliasStyle: 'camel',
      preferences: [
        { category: 'message_received', inAppEnabled: false },
        { category: 'announcement', push_enabled: false },
      ],
    });

    expect(repository.upsertCurrentSchoolUserPreferences).toHaveBeenCalledWith({
      schoolId: SCHOOL_ID,
      userId: USER_ID,
      preferences: [
        {
          category:
            CommunicationNotificationPreferenceCategory.MESSAGE_RECEIVED,
          inAppEnabled: false,
        },
        {
          category: CommunicationNotificationPreferenceCategory.ANNOUNCEMENT,
          pushEnabled: false,
        },
      ],
    });
    expect(result).toEqual({
      preferences: [
        {
          category: 'message_received',
          label: 'Messages',
          description: 'Notifications for new communication messages.',
          inAppEnabled: false,
          pushEnabled: false,
          canChange: true,
        },
        {
          category: 'announcement',
          label: 'Announcements',
          description: 'Notifications for school and class announcements.',
          inAppEnabled: true,
          pushEnabled: true,
          canChange: true,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('in_app_enabled');
    expect(JSON.stringify(result)).not.toContain('push_enabled');
    expect(JSON.stringify(result)).not.toContain('userId');
  });

  it('rejects unknown categories and conflicting aliases', async () => {
    const service = new CommunicationNotificationPreferenceService(
      repositoryMock(),
    );

    await expect(
      service.updatePreferencesForActor({
        schoolId: SCHOOL_ID,
        userId: USER_ID,
        aliasStyle: 'dual',
        preferences: [{ category: 'grades', inAppEnabled: true }],
      }),
    ).rejects.toMatchObject({
      code: 'communication.notification_preference.invalid',
    });

    await expect(
      service.updatePreferencesForActor({
        schoolId: SCHOOL_ID,
        userId: USER_ID,
        aliasStyle: 'dual',
        preferences: [
          {
            category: 'message_received',
            inAppEnabled: true,
            in_app_enabled: false,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'communication.notification_preference.invalid',
    });

    await expect(
      service.updatePreferencesForActor({
        schoolId: SCHOOL_ID,
        userId: USER_ID,
        aliasStyle: 'dual',
        preferences: [
          {
            category: 'message_received',
            pushEnabled: true,
            push_enabled: false,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'communication.notification_preference.invalid',
    });
  });

  it('defaults missing generation preferences to enabled and filters disabled recipients', async () => {
    const repository = repositoryMock({
      isCurrentSchoolInAppNotificationEnabled: jest
        .fn()
        .mockResolvedValue(true),
      listCurrentSchoolDisabledUserIdsForCategory: jest
        .fn()
        .mockResolvedValue(['user-2']),
      listCurrentSchoolPushDisabledUserIdsForCategory: jest
        .fn()
        .mockResolvedValue(['user-3']),
    });
    const service = new CommunicationNotificationPreferenceService(repository);

    await expect(
      service.shouldCreateInAppNotification({
        schoolId: SCHOOL_ID,
        recipientUserId: USER_ID,
        category: CommunicationNotificationPreferenceCategory.MESSAGE_RECEIVED,
      }),
    ).resolves.toBe(true);

    await expect(
      service.filterInAppEnabledRecipientUserIds({
        schoolId: SCHOOL_ID,
        recipientUserIds: ['user-1', 'user-2', 'user-1'],
        category: CommunicationNotificationPreferenceCategory.ANNOUNCEMENT,
      }),
    ).resolves.toEqual(['user-1']);
    expect(repository.listCurrentSchoolDisabledUserIdsForCategory).toHaveBeenCalledWith(
      {
        schoolId: SCHOOL_ID,
        userIds: ['user-1', 'user-2'],
        category: CommunicationNotificationPreferenceCategory.ANNOUNCEMENT,
      },
    );

    await expect(
      service.filterPushEnabledRecipientUserIds({
        schoolId: SCHOOL_ID,
        recipientUserIds: ['user-1', 'user-3', 'user-1'],
        category: CommunicationNotificationPreferenceCategory.MESSAGE_RECEIVED,
      }),
    ).resolves.toEqual(['user-1']);
    expect(
      repository.listCurrentSchoolPushDisabledUserIdsForCategory,
    ).toHaveBeenCalledWith({
      schoolId: SCHOOL_ID,
      userIds: ['user-1', 'user-3'],
      category: CommunicationNotificationPreferenceCategory.MESSAGE_RECEIVED,
    });
  });
});

function repositoryMock(
  overrides?: Record<string, unknown>,
): CommunicationNotificationPreferenceRepository & Record<string, jest.Mock> {
  return {
    listCurrentSchoolUserPreferences: jest.fn().mockResolvedValue([
      preferenceRecord({
        category: CommunicationNotificationPreferenceCategory.MESSAGE_RECEIVED,
      }),
    ]),
    upsertCurrentSchoolUserPreferences: jest.fn().mockResolvedValue([
      preferenceRecord({
        category: CommunicationNotificationPreferenceCategory.MESSAGE_RECEIVED,
      }),
    ]),
    isCurrentSchoolInAppNotificationEnabled: jest.fn().mockResolvedValue(true),
    listCurrentSchoolDisabledUserIdsForCategory: jest
      .fn()
      .mockResolvedValue([]),
    listCurrentSchoolPushDisabledUserIdsForCategory: jest
      .fn()
      .mockResolvedValue([]),
    ...(overrides ?? {}),
  } as unknown as CommunicationNotificationPreferenceRepository &
    Record<string, jest.Mock>;
}

function preferenceRecord(
  overrides?: Partial<CommunicationNotificationPreferenceRecord>,
): CommunicationNotificationPreferenceRecord {
  return {
    id: 'preference-1',
    schoolId: SCHOOL_ID,
    userId: USER_ID,
    category: CommunicationNotificationPreferenceCategory.MESSAGE_RECEIVED,
    inAppEnabled: true,
    pushEnabled: true,
    createdAt: new Date('2026-06-21T09:00:00.000Z'),
    updatedAt: new Date('2026-06-21T09:00:00.000Z'),
    ...(overrides ?? {}),
  };
}
