import { Injectable } from '@nestjs/common';
import {
  CommunicationNotificationType,
  DismissalRequestEventType,
  DismissalRequestStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { createDismissalParentNotificationForRequestEvent } from '../../notifications/application/create-dismissal-notification.service';

const DISMISSAL_REQUEST_STATUS_ACADEMIC_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      classroomId: true,
      classroom: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          sectionId: true,
          section: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              gradeId: true,
              grade: {
                select: {
                  id: true,
                  nameAr: true,
                  nameEn: true,
                  stageId: true,
                  stage: {
                    select: {
                      id: true,
                      nameAr: true,
                      nameEn: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

const DISMISSAL_REQUEST_STATUS_UPDATE_ARGS =
  Prisma.validator<Prisma.DismissalRequestDefaultArgs>()({
    select: {
      id: true,
      status: true,
      requestedAt: true,
      updatedAt: true,
      gateId: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      enrollment: {
        select: DISMISSAL_REQUEST_STATUS_ACADEMIC_ARGS.select,
      },
      gate: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
        },
      },
      events: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          type: true,
          statusFrom: true,
          statusTo: true,
          note: true,
          createdAt: true,
        },
      },
    },
  });

export type DismissalRequestStatusUpdateRecord =
  Prisma.DismissalRequestGetPayload<
    typeof DISMISSAL_REQUEST_STATUS_UPDATE_ARGS
  >;

@Injectable()
export class DismissalRequestsWriteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async updateStatusWithEvent(params: {
    schoolId: string;
    requestId: string;
    statusFrom: DismissalRequestStatus;
    statusTo: DismissalRequestStatus;
    actorUserId: string;
    note: string | null;
  }): Promise<DismissalRequestStatusUpdateRecord> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.dismissalRequest.update({
        where: {
          id_schoolId: {
            id: params.requestId,
            schoolId: params.schoolId,
          },
        },
        data: {
          status: params.statusTo,
        },
        select: { id: true },
      });

      await tx.dismissalRequestEvent.create({
        data: {
          schoolId: params.schoolId,
          requestId: params.requestId,
          type: DismissalRequestEventType.REQUEST_STATUS_CHANGED,
          actorUserId: params.actorUserId,
          statusFrom: params.statusFrom,
          statusTo: params.statusTo,
          note: params.note,
        },
      });

      if (params.statusTo === DismissalRequestStatus.CALLED) {
        await createDismissalParentNotificationForRequestEvent(tx, {
          schoolId: params.schoolId,
          requestId: params.requestId,
          eventType: CommunicationNotificationType.DISMISSAL_REQUEST_CALLED,
          now,
        });
      }

      if (params.statusTo === DismissalRequestStatus.READY) {
        await createDismissalParentNotificationForRequestEvent(tx, {
          schoolId: params.schoolId,
          requestId: params.requestId,
          eventType: CommunicationNotificationType.DISMISSAL_REQUEST_READY,
          now,
        });
      }

      return tx.dismissalRequest.findFirstOrThrow({
        where: {
          id: params.requestId,
          schoolId: params.schoolId,
        },
        ...DISMISSAL_REQUEST_STATUS_UPDATE_ARGS,
      });
    });
  }
}
