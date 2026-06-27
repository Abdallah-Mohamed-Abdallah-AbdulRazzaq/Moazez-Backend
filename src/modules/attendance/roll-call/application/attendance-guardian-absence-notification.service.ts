import { Injectable, Logger } from '@nestjs/common';
import {
  AttendanceStatus,
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationPreferenceCategory,
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationType,
} from '@prisma/client';
import { CommunicationNotificationCommandService } from '../../../communication/application/communication-notification-command.service';
import {
  ATTENDANCE_ABSENCE_NOTIFICATION_TITLE,
  ATTENDANCE_ABSENCE_SUBMIT_SOURCE_TYPE,
  buildAttendanceStudentDisplayName,
  buildGuardianAbsenceNotificationBody,
  buildGuardianAbsenceNotificationIdempotencyKey,
} from '../domain/guardian-absence-notification';
import {
  AttendanceRollCallRepository,
  RollCallGuardianAbsenceNotificationRecipientRecord,
  RollCallSessionDetailRecord,
} from '../infrastructure/attendance-roll-call.repository';

@Injectable()
export class AttendanceGuardianAbsenceNotificationService {
  private readonly logger = new Logger(
    AttendanceGuardianAbsenceNotificationService.name,
  );

  constructor(
    private readonly attendanceRollCallRepository: AttendanceRollCallRepository,
    private readonly notificationCommandService: CommunicationNotificationCommandService,
  ) {}

  async notifySubmittedAbsences(
    session: RollCallSessionDetailRecord,
  ): Promise<void> {
    try {
      await this.dispatchSubmittedAbsenceNotifications(session);
    } catch (error) {
      this.logNotificationFailure(error);
    }
  }

  private async dispatchSubmittedAbsenceNotifications(
    session: RollCallSessionDetailRecord,
  ): Promise<void> {
    if (!session.policyId) return;

    const absentEntries = session.entries.filter(
      (entry) => entry.status === AttendanceStatus.ABSENT,
    );
    if (absentEntries.length === 0) return;

    const policy =
      await this.attendanceRollCallRepository.findPolicyGuardianAbsenceNotificationConfig(
        session.policyId,
      );
    if (!policy?.notifyGuardiansOnAbsence) return;

    const recipients =
      await this.attendanceRollCallRepository.listGuardianAbsenceNotificationRecipients(
        {
          schoolId: session.schoolId,
          studentIds: absentEntries.map((entry) => entry.studentId),
        },
      );
    if (recipients.length === 0) return;

    const recipientsByStudentId = groupRecipientsByStudentId(recipients);
    for (const entry of absentEntries) {
      const recipientUserIds = recipientsByStudentId.get(entry.studentId) ?? [];
      if (recipientUserIds.length === 0) continue;

      const studentDisplayName = buildAttendanceStudentDisplayName({
        firstName: entry.student.firstName,
        lastName: entry.student.lastName,
        fallback: 'Student',
      });

      for (const recipientUserId of recipientUserIds) {
        await this.createNotificationSafely({
          schoolId: session.schoolId,
          recipientUserId,
          idempotencyKey: buildGuardianAbsenceNotificationIdempotencyKey({
            sessionId: session.id,
            entryId: entry.id,
            studentId: entry.studentId,
            recipientUserId,
          }),
          body: buildGuardianAbsenceNotificationBody({
            studentDisplayName,
            date: session.date,
          }),
        });
      }
    }
  }

  private async createNotificationSafely(params: {
    schoolId: string;
    recipientUserId: string;
    idempotencyKey: string;
    body: string;
  }): Promise<void> {
    try {
      await this.notificationCommandService.createOrReuseNotification({
        schoolId: params.schoolId,
        recipientUserId: params.recipientUserId,
        actorUserId: null,
        sourceModule: CommunicationNotificationSourceModule.ATTENDANCE,
        sourceType: ATTENDANCE_ABSENCE_SUBMIT_SOURCE_TYPE,
        sourceId: null,
        idempotencyKey: params.idempotencyKey,
        type: CommunicationNotificationType.ATTENDANCE_ABSENCE,
        title: ATTENDANCE_ABSENCE_NOTIFICATION_TITLE,
        body: params.body,
        priority: CommunicationNotificationPriority.NORMAL,
        metadata: null,
        deliveryChannels: [CommunicationNotificationDeliveryChannel.IN_APP],
        preferenceCategory: CommunicationNotificationPreferenceCategory.ATTENDANCE,
      });
    } catch (error) {
      this.logNotificationFailure(error);
    }
  }

  private logNotificationFailure(error: unknown): void {
    const errorName = error instanceof Error ? error.name : typeof error;
    this.logger.warn(
      `Guardian absence notification dispatch skipped after failure (${errorName})`,
    );
  }
}

function groupRecipientsByStudentId(
  recipients: RollCallGuardianAbsenceNotificationRecipientRecord[],
): Map<string, string[]> {
  const grouped = new Map<string, Set<string>>();

  for (const recipient of recipients) {
    const current = grouped.get(recipient.studentId) ?? new Set<string>();
    current.add(recipient.recipientUserId);
    grouped.set(recipient.studentId, current);
  }

  return new Map(
    [...grouped.entries()].map(([studentId, recipientUserIds]) => [
      studentId,
      [...recipientUserIds],
    ]),
  );
}
