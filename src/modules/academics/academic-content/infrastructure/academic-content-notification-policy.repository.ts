import { Injectable } from '@nestjs/common';
import { AuditOutcome, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  AcademicContentNotificationPolicyPatch,
  effectiveAcademicContentNotificationPolicy,
  normalizeAcademicContentNotificationPolicyPatch,
} from '../domain/academic-content-notification.policy';

const POLICY_SELECT = {
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
  onlineSessionRemindersEnabled: true,
  onlineSessionReminderOffsetsMinutes: true,
} satisfies Prisma.AcademicContentNotificationPolicySelect;

@Injectable()
export class AcademicContentNotificationPolicyRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPolicy(schoolId: string) {
    return this.prisma.academicContentNotificationPolicy.findUnique({
      where: { schoolId },
      select: POLICY_SELECT,
    });
  }

  async updatePolicy(input: {
    schoolId: string;
    organizationId: string;
    actorId: string;
    patch: AcademicContentNotificationPolicyPatch;
  }) {
    const patch = normalizeAcademicContentNotificationPolicyPatch(input.patch);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const current =
              await tx.academicContentNotificationPolicy.findUnique({
                where: { schoolId: input.schoolId },
                select: { id: true, ...POLICY_SELECT },
              });
            const before = effectiveAcademicContentNotificationPolicy(current);
            const after = effectiveAcademicContentNotificationPolicy({
              ...before,
              ...patch,
            });
            if (JSON.stringify(before) === JSON.stringify(after)) return before;

            const policy = current
              ? await tx.academicContentNotificationPolicy.update({
                  where: { schoolId: input.schoolId },
                  data: after,
                  select: { id: true },
                })
              : await tx.academicContentNotificationPolicy.create({
                  data: { schoolId: input.schoolId, ...after },
                  select: { id: true },
                });
            await tx.auditLog.create({
              data: {
                actorId: input.actorId,
                organizationId: input.organizationId,
                schoolId: input.schoolId,
                module: 'academic-content',
                action: 'academics.academic_content.notification_policy.update',
                resourceType: 'academic_content_notification_policy',
                resourceId: policy.id,
                outcome: AuditOutcome.SUCCESS,
                before: { ...before },
                after: { ...after },
              },
            });
            return after;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !['P2034', 'P2002'].includes(error.code) ||
          attempt === 2
        )
          throw error;
      }
    }
    throw new Error(
      'Unreachable Academic Content notification policy retry state',
    );
  }
}
