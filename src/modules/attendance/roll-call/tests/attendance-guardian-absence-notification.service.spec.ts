import {
  AttendanceMode,
  AttendanceScopeType,
  AttendanceSessionStatus,
  AttendanceStatus,
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationPreferenceCategory,
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationType,
} from '@prisma/client';
import { CommunicationNotificationCommandService } from '../../../communication/application/communication-notification-command.service';
import { AttendanceGuardianAbsenceNotificationService } from '../application/attendance-guardian-absence-notification.service';
import { ATTENDANCE_ABSENCE_SUBMIT_SOURCE_TYPE } from '../domain/guardian-absence-notification';
import {
  AttendanceRollCallRepository,
  RollCallSessionDetailRecord,
} from '../infrastructure/attendance-roll-call.repository';

describe('AttendanceGuardianAbsenceNotificationService', () => {
  function sessionRecord(
    overrides?: Partial<{
      policyId: string | null;
      entries: RollCallSessionDetailRecord['entries'];
    }>,
  ): RollCallSessionDetailRecord {
    return {
      id: 'session-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      date: new Date('2026-09-15T00:00:00.000Z'),
      scopeType: AttendanceScopeType.CLASSROOM,
      scopeKey: 'classroom:classroom-1',
      stageId: 'stage-1',
      gradeId: 'grade-1',
      sectionId: 'section-1',
      classroomId: 'classroom-1',
      mode: AttendanceMode.DAILY,
      periodId: null,
      periodKey: 'daily',
      periodLabelAr: null,
      periodLabelEn: null,
      policyId:
        overrides && 'policyId' in overrides ? overrides.policyId : 'policy-1',
      status: AttendanceSessionStatus.SUBMITTED,
      submittedAt: new Date('2026-09-15T07:20:00.000Z'),
      submittedById: 'user-1',
      createdAt: new Date('2026-09-15T07:00:00.000Z'),
      updatedAt: new Date('2026-09-15T07:20:00.000Z'),
      deletedAt: null,
      term: {
        id: 'term-1',
        academicYearId: 'year-1',
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
      },
      entries: overrides?.entries ?? [entryRecord()],
    } as RollCallSessionDetailRecord;
  }

  function entryRecord(
    overrides?: Partial<{
      id: string;
      studentId: string;
      status: AttendanceStatus;
      firstName: string;
      lastName: string;
    }>,
  ): RollCallSessionDetailRecord['entries'][number] {
    const studentId = overrides?.studentId ?? 'student-1';

    return {
      id: overrides?.id ?? 'entry-1',
      schoolId: 'school-1',
      sessionId: 'session-1',
      studentId,
      enrollmentId: `enrollment-${studentId}`,
      status: overrides?.status ?? AttendanceStatus.ABSENT,
      lateMinutes: null,
      earlyLeaveMinutes: null,
      excuseReason: null,
      note: null,
      markedById: 'user-1',
      markedAt: new Date('2026-09-15T07:05:00.000Z'),
      createdAt: new Date('2026-09-15T07:05:00.000Z'),
      updatedAt: new Date('2026-09-15T07:05:00.000Z'),
      student: {
        id: studentId,
        firstName: overrides?.firstName ?? 'Layla',
        lastName: overrides?.lastName ?? 'Hassan',
        status: 'ACTIVE',
      },
      enrollment: {
        id: `enrollment-${studentId}`,
        classroomId: 'classroom-1',
        classroom: {
          id: 'classroom-1',
          nameAr: 'Classroom AR',
          nameEn: 'Classroom 1A',
          section: {
            id: 'section-1',
            nameAr: 'Section AR',
            nameEn: 'Section A',
            grade: {
              id: 'grade-1',
              nameAr: 'Grade AR',
              nameEn: 'Grade 1',
              stage: {
                id: 'stage-1',
                nameAr: 'Stage AR',
                nameEn: 'Primary',
              },
            },
          },
        },
      },
    } as RollCallSessionDetailRecord['entries'][number];
  }

  function repository(
    overrides?: Partial<Record<string, jest.Mock>>,
  ): AttendanceRollCallRepository {
    return {
      findPolicyGuardianAbsenceNotificationConfig: jest
        .fn()
        .mockResolvedValue({
          id: 'policy-1',
          notifyGuardiansOnAbsence: true,
        }),
      listGuardianAbsenceNotificationRecipients: jest.fn().mockResolvedValue([
        {
          studentId: 'student-1',
          recipientUserId: 'parent-user-1',
        },
      ]),
      ...overrides,
    } as unknown as AttendanceRollCallRepository;
  }

  function notificationCommand(
    overrides?: Partial<Record<string, jest.Mock>>,
  ): CommunicationNotificationCommandService {
    return {
      createOrReuseNotification: jest.fn().mockResolvedValue({
        notification: null,
        createdNotification: true,
        reusedExistingNotification: false,
        createdDeliveryCount: 1,
        existingDeliveryCount: 0,
        skippedReason: null,
      }),
      ...overrides,
    } as unknown as CommunicationNotificationCommandService;
  }

  function service(
    rollCallRepository = repository(),
    commandService = notificationCommand(),
  ): AttendanceGuardianAbsenceNotificationService {
    return new AttendanceGuardianAbsenceNotificationService(
      rollCallRepository,
      commandService,
    );
  }

  it('notifies eligible guardians for submitted ABSENT entries when the linked policy flag is enabled', async () => {
    const rollCallRepository = repository();
    const commandService = notificationCommand();

    await service(rollCallRepository, commandService).notifySubmittedAbsences(
      sessionRecord(),
    );

    expect(
      rollCallRepository.findPolicyGuardianAbsenceNotificationConfig,
    ).toHaveBeenCalledWith('policy-1');
    expect(
      rollCallRepository.listGuardianAbsenceNotificationRecipients,
    ).toHaveBeenCalledWith({
      schoolId: 'school-1',
      studentIds: ['student-1'],
    });
    expect(commandService.createOrReuseNotification).toHaveBeenCalledWith({
      schoolId: 'school-1',
      recipientUserId: 'parent-user-1',
      actorUserId: null,
      sourceModule: CommunicationNotificationSourceModule.ATTENDANCE,
      sourceType: ATTENDANCE_ABSENCE_SUBMIT_SOURCE_TYPE,
      sourceId: null,
      idempotencyKey:
        'attendance.absence.submit:session-1:entry-1:student-1:parent-user-1:ABSENT',
      type: CommunicationNotificationType.ATTENDANCE_ABSENCE,
      title: 'Attendance absence recorded',
      body: 'Layla Hassan was marked absent on 2026-09-15.',
      priority: CommunicationNotificationPriority.NORMAL,
      metadata: null,
      deliveryChannels: [CommunicationNotificationDeliveryChannel.IN_APP],
      preferenceCategory: CommunicationNotificationPreferenceCategory.ATTENDANCE,
    });
  });

  it('does not notify when the session has no linked policyId', async () => {
    const rollCallRepository = repository();
    const commandService = notificationCommand();

    await service(rollCallRepository, commandService).notifySubmittedAbsences(
      sessionRecord({ policyId: null }),
    );

    expect(
      rollCallRepository.findPolicyGuardianAbsenceNotificationConfig,
    ).not.toHaveBeenCalled();
    expect(commandService.createOrReuseNotification).not.toHaveBeenCalled();
  });

  it('does not notify when notifyGuardiansOnAbsence is false', async () => {
    const rollCallRepository = repository({
      findPolicyGuardianAbsenceNotificationConfig: jest
        .fn()
        .mockResolvedValue({
          id: 'policy-1',
          notifyGuardiansOnAbsence: false,
        }),
    });
    const commandService = notificationCommand();

    await service(rollCallRepository, commandService).notifySubmittedAbsences(
      sessionRecord(),
    );

    expect(
      rollCallRepository.listGuardianAbsenceNotificationRecipients,
    ).not.toHaveBeenCalled();
    expect(commandService.createOrReuseNotification).not.toHaveBeenCalled();
  });

  it.each([
    AttendanceStatus.PRESENT,
    AttendanceStatus.LATE,
    AttendanceStatus.EARLY_LEAVE,
    AttendanceStatus.EXCUSED,
    AttendanceStatus.UNMARKED,
  ])('does not notify for %s entries', async (status) => {
    const rollCallRepository = repository();
    const commandService = notificationCommand();

    await service(rollCallRepository, commandService).notifySubmittedAbsences(
      sessionRecord({ entries: [entryRecord({ status })] }),
    );

    expect(
      rollCallRepository.findPolicyGuardianAbsenceNotificationConfig,
    ).not.toHaveBeenCalled();
    expect(commandService.createOrReuseNotification).not.toHaveBeenCalled();
  });

  it('sends separate notifications to multiple guardians and dedupes duplicate links by recipient user id', async () => {
    const rollCallRepository = repository({
      listGuardianAbsenceNotificationRecipients: jest.fn().mockResolvedValue([
        { studentId: 'student-1', recipientUserId: 'parent-user-1' },
        { studentId: 'student-1', recipientUserId: 'parent-user-1' },
        { studentId: 'student-1', recipientUserId: 'parent-user-2' },
      ]),
    });
    const commandService = notificationCommand();

    await service(rollCallRepository, commandService).notifySubmittedAbsences(
      sessionRecord(),
    );

    expect(commandService.createOrReuseNotification).toHaveBeenCalledTimes(2);
    expect(commandService.createOrReuseNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: 'parent-user-1',
        idempotencyKey:
          'attendance.absence.submit:session-1:entry-1:student-1:parent-user-1:ABSENT',
      }),
    );
    expect(commandService.createOrReuseNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: 'parent-user-2',
        idempotencyKey:
          'attendance.absence.submit:session-1:entry-1:student-1:parent-user-2:ABSENT',
      }),
    );
  });

  it('sends one notification per absent student for the same guardian', async () => {
    const rollCallRepository = repository({
      listGuardianAbsenceNotificationRecipients: jest.fn().mockResolvedValue([
        { studentId: 'student-1', recipientUserId: 'parent-user-1' },
        { studentId: 'student-2', recipientUserId: 'parent-user-1' },
      ]),
    });
    const commandService = notificationCommand();

    await service(rollCallRepository, commandService).notifySubmittedAbsences(
      sessionRecord({
        entries: [
          entryRecord({ id: 'entry-1', studentId: 'student-1' }),
          entryRecord({
            id: 'entry-2',
            studentId: 'student-2',
            firstName: 'Omar',
            lastName: 'Ali',
          }),
        ],
      }),
    );

    expect(commandService.createOrReuseNotification).toHaveBeenCalledTimes(2);
    expect(commandService.createOrReuseNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey:
          'attendance.absence.submit:session-1:entry-1:student-1:parent-user-1:ABSENT',
        body: 'Layla Hassan was marked absent on 2026-09-15.',
      }),
    );
    expect(commandService.createOrReuseNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey:
          'attendance.absence.submit:session-1:entry-2:student-2:parent-user-1:ABSENT',
        body: 'Omar Ali was marked absent on 2026-09-15.',
      }),
    );
  });

  it('skips guardian, user, or student records that are not resolved as eligible recipients by the repository', async () => {
    const rollCallRepository = repository({
      listGuardianAbsenceNotificationRecipients: jest.fn().mockResolvedValue([]),
    });
    const commandService = notificationCommand();

    await service(rollCallRepository, commandService).notifySubmittedAbsences(
      sessionRecord(),
    );

    expect(commandService.createOrReuseNotification).not.toHaveBeenCalled();
  });

  it('allows ATTENDANCE preference opt-out to skip creation through the Communication command result', async () => {
    const commandService = notificationCommand({
      createOrReuseNotification: jest.fn().mockResolvedValue({
        notification: null,
        createdNotification: false,
        reusedExistingNotification: false,
        createdDeliveryCount: 0,
        existingDeliveryCount: 0,
        skippedReason: 'in_app_preference_disabled',
      }),
    });

    await expect(
      service(repository(), commandService).notifySubmittedAbsences(
        sessionRecord(),
      ),
    ).resolves.toBeUndefined();
    expect(commandService.createOrReuseNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        preferenceCategory:
          CommunicationNotificationPreferenceCategory.ATTENDANCE,
        deliveryChannels: [CommunicationNotificationDeliveryChannel.IN_APP],
      }),
    );
  });

  it('does not fail submit-side orchestration when notification creation fails', async () => {
    const commandService = notificationCommand({
      createOrReuseNotification: jest
        .fn()
        .mockRejectedValue(new Error('communication unavailable')),
    });

    await expect(
      service(repository(), commandService).notifySubmittedAbsences(
        sessionRecord(),
      ),
    ).resolves.toBeUndefined();
  });
});
