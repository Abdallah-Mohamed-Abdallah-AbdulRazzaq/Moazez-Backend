import {
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationDeliveryStatus,
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationStatus,
  CommunicationNotificationType,
  DismissalRequestStatus,
  MembershipStatus,
  Prisma,
  UserStatus,
  UserType,
} from '@prisma/client';

const DISMISSAL_NOTIFICATION_SOURCE_TYPE = 'dismissal_request';
const DISMISSAL_IN_APP_NOTIFICATION_PROVIDER = 'in_app';

const DISMISSAL_NOTIFICATION_REQUEST_ARGS =
  Prisma.validator<Prisma.DismissalRequestDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      status: true,
      requestedById: true,
      gateId: true,
      requestedBy: {
        select: {
          id: true,
          userType: true,
          status: true,
          deletedAt: true,
        },
      },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      enrollment: {
        select: {
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
      },
      gate: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
        },
      },
    },
  });

type DismissalNotificationRequestRecord = Prisma.DismissalRequestGetPayload<
  typeof DISMISSAL_NOTIFICATION_REQUEST_ARGS
>;

type StaffAssignmentMatchRecord = {
  staffUserId: string;
  gateId: string | null;
  stageId: string | null;
  gradeId: string | null;
  sectionId: string | null;
  classroomId: string | null;
};

export interface DismissalNotificationCreationResult {
  recipientCount: number;
  createdNotificationCount: number;
  existingNotificationCount: number;
}

export async function createDismissalStaffNotificationsForRequestEvent(
  tx: Prisma.TransactionClient,
  params: {
    schoolId: string;
    requestId: string;
    eventType: CommunicationNotificationType;
    now: Date;
  },
): Promise<DismissalNotificationCreationResult> {
  const request = await findNotificationRequest(tx, params);
  if (!request) return emptyNotificationCreationResult();

  const assignments = await tx.dismissalStaffAssignment.findMany({
    where: {
      schoolId: params.schoolId,
      isActive: true,
      deletedAt: null,
      OR: [{ startsAt: null }, { startsAt: { lte: params.now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: params.now } }] }],
      staffUser: {
        is: {
          userType: UserType.DISMISSAL_STAFF,
          status: UserStatus.ACTIVE,
          deletedAt: null,
          memberships: {
            some: {
              schoolId: params.schoolId,
              userType: UserType.DISMISSAL_STAFF,
              status: MembershipStatus.ACTIVE,
              deletedAt: null,
            },
          },
        },
      },
    },
    select: {
      staffUserId: true,
      gateId: true,
      stageId: true,
      gradeId: true,
      sectionId: true,
      classroomId: true,
    },
  });

  const recipientUserIds = uniqueStrings(
    assignments
      .filter((assignment) => assignmentMatchesRequest(assignment, request))
      .map((assignment) => assignment.staffUserId),
  );

  return createDismissalNotificationsForRecipients(tx, {
    schoolId: params.schoolId,
    request,
    recipientUserIds,
    eventType: params.eventType,
    now: params.now,
  });
}

export async function createDismissalParentNotificationForRequestEvent(
  tx: Prisma.TransactionClient,
  params: {
    schoolId: string;
    requestId: string;
    eventType: CommunicationNotificationType;
    now: Date;
  },
): Promise<DismissalNotificationCreationResult> {
  const request = await findNotificationRequest(tx, params);
  if (!request || !isActiveParentUser(request.requestedBy)) {
    return emptyNotificationCreationResult();
  }

  return createDismissalNotificationsForRecipients(tx, {
    schoolId: params.schoolId,
    request,
    recipientUserIds: [request.requestedById],
    eventType: params.eventType,
    now: params.now,
  });
}

async function findNotificationRequest(
  tx: Prisma.TransactionClient,
  params: { schoolId: string; requestId: string },
): Promise<DismissalNotificationRequestRecord | null> {
  return tx.dismissalRequest.findFirst({
    where: {
      id: params.requestId,
      schoolId: params.schoolId,
      deletedAt: null,
    },
    ...DISMISSAL_NOTIFICATION_REQUEST_ARGS,
  });
}

async function createDismissalNotificationsForRecipients(
  tx: Prisma.TransactionClient,
  params: {
    schoolId: string;
    request: DismissalNotificationRequestRecord;
    recipientUserIds: string[];
    eventType: CommunicationNotificationType;
    now: Date;
  },
): Promise<DismissalNotificationCreationResult> {
  let createdNotificationCount = 0;
  let existingNotificationCount = 0;
  const recipientUserIds = uniqueStrings(params.recipientUserIds);
  const message = buildDismissalNotificationMessage({
    eventType: params.eventType,
    request: params.request,
  });
  const metadata = buildDismissalNotificationMetadata(params.request);

  for (const recipientUserId of recipientUserIds) {
    const result = await createOrReuseDismissalNotificationInTransaction(tx, {
      schoolId: params.schoolId,
      recipientUserId,
      requestId: params.request.id,
      eventType: params.eventType,
      title: message.title,
      body: message.body,
      metadata,
      now: params.now,
    });
    if (result.createdNotification) {
      createdNotificationCount += 1;
    } else {
      existingNotificationCount += 1;
    }
  }

  return {
    recipientCount: recipientUserIds.length,
    createdNotificationCount,
    existingNotificationCount,
  };
}

async function createOrReuseDismissalNotificationInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    schoolId: string;
    recipientUserId: string;
    requestId: string;
    eventType: CommunicationNotificationType;
    title: string;
    body: string;
    metadata: Record<string, unknown>;
    now: Date;
  },
): Promise<{ createdNotification: boolean }> {
  const idempotencyKey = buildDismissalNotificationIdempotencyKey({
    eventType: params.eventType,
    requestId: params.requestId,
    recipientUserId: params.recipientUserId,
  });

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dismissal-notification:${params.schoolId}:${idempotencyKey}`}, 0))`;

  const existing = await tx.communicationNotification.findFirst({
    where: {
      schoolId: params.schoolId,
      idempotencyKey,
    },
    select: { id: true },
  });

  const notification =
    existing ??
    (await tx.communicationNotification.create({
      data: {
        schoolId: params.schoolId,
        recipientUserId: params.recipientUserId,
        actorUserId: null,
        sourceModule: CommunicationNotificationSourceModule.DISMISSAL,
        sourceType: DISMISSAL_NOTIFICATION_SOURCE_TYPE,
        sourceId: params.requestId,
        idempotencyKey,
        type: params.eventType,
        title: params.title,
        body: params.body,
        priority: CommunicationNotificationPriority.NORMAL,
        status: CommunicationNotificationStatus.UNREAD,
        metadata: params.metadata as Prisma.InputJsonObject,
      },
      select: { id: true },
    }));

  await ensureInAppDelivery(tx, {
    schoolId: params.schoolId,
    notificationId: notification.id,
    now: params.now,
  });

  return { createdNotification: !existing };
}

async function ensureInAppDelivery(
  tx: Prisma.TransactionClient,
  params: { schoolId: string; notificationId: string; now: Date },
): Promise<void> {
  const existingDelivery = await tx.communicationNotificationDelivery.findFirst({
    where: {
      schoolId: params.schoolId,
      notificationId: params.notificationId,
      channel: CommunicationNotificationDeliveryChannel.IN_APP,
    },
    select: { id: true },
  });

  if (existingDelivery) return;

  await tx.communicationNotificationDelivery.create({
    data: {
      schoolId: params.schoolId,
      notificationId: params.notificationId,
      channel: CommunicationNotificationDeliveryChannel.IN_APP,
      status: CommunicationNotificationDeliveryStatus.DELIVERED,
      provider: DISMISSAL_IN_APP_NOTIFICATION_PROVIDER,
      attemptedAt: params.now,
      deliveredAt: params.now,
    },
  });
}

function assignmentMatchesRequest(
  assignment: StaffAssignmentMatchRecord,
  request: DismissalNotificationRequestRecord,
): boolean {
  const academicScope = getRequestAcademicScope(request);
  return (
    matchesNullableDimension(assignment.gateId, request.gateId) &&
    matchesNullableDimension(assignment.classroomId, academicScope.classroomId) &&
    matchesNullableDimension(assignment.sectionId, academicScope.sectionId) &&
    matchesNullableDimension(assignment.gradeId, academicScope.gradeId) &&
    matchesNullableDimension(assignment.stageId, academicScope.stageId)
  );
}

function matchesNullableDimension(
  assignmentValue: string | null,
  requestValue: string | null,
): boolean {
  return !assignmentValue || assignmentValue === requestValue;
}

function getRequestAcademicScope(request: DismissalNotificationRequestRecord): {
  classroomId: string | null;
  sectionId: string | null;
  gradeId: string | null;
  stageId: string | null;
} {
  const classroom = request.enrollment.classroom;
  const section = classroom?.section ?? null;
  const grade = section?.grade ?? null;

  return {
    classroomId: request.enrollment.classroomId ?? classroom?.id ?? null,
    sectionId: classroom?.sectionId ?? section?.id ?? null,
    gradeId: section?.gradeId ?? grade?.id ?? null,
    stageId: grade?.stageId ?? grade?.stage?.id ?? null,
  };
}

function buildDismissalNotificationMessage(params: {
  eventType: CommunicationNotificationType;
  request: DismissalNotificationRequestRecord;
}): { title: string; body: string } {
  const childDisplayName =
    displayName([params.request.student.firstName, params.request.student.lastName]) ??
    'Student';

  switch (params.eventType) {
    case CommunicationNotificationType.DISMISSAL_REQUEST_CREATED:
      return {
        title: 'New pickup request',
        body: `A pickup request was created for ${childDisplayName}.`,
      };
    case CommunicationNotificationType.DISMISSAL_REQUEST_CANCELLED:
      return {
        title: 'Pickup request cancelled',
        body: `A parent cancelled the pickup request for ${childDisplayName}.`,
      };
    case CommunicationNotificationType.DISMISSAL_REQUEST_CALLED:
      return {
        title: 'Student called',
        body: `${childDisplayName} has been called for pickup.`,
      };
    case CommunicationNotificationType.DISMISSAL_REQUEST_READY:
      return {
        title: 'Student ready',
        body: `${childDisplayName} is ready at ${params.request.gate.name}.`,
      };
    case CommunicationNotificationType.DISMISSAL_REQUEST_HANDED_OVER:
      return {
        title: 'Pickup completed',
        body: `Pickup for ${childDisplayName} has been completed.`,
      };
    default:
      return {
        title: 'Dismissal update',
        body: `Pickup status changed for ${childDisplayName}.`,
      };
  }
}

function buildDismissalNotificationMetadata(
  request: DismissalNotificationRequestRecord,
): Record<string, unknown> {
  const classroom = request.enrollment.classroom;
  const section = classroom?.section ?? null;
  const grade = section?.grade ?? null;

  return {
    request: {
      id: request.id,
      status: presentDismissalRequestStatus(request.status),
    },
    child: {
      id: request.student.id,
      displayName:
        displayName([request.student.firstName, request.student.lastName]) ??
        'Student',
      grade: label(grade),
      section: label(section),
      classroom: label(classroom),
    },
    gate: {
      id: request.gate.id,
      code: request.gate.code,
      name: request.gate.name,
    },
  };
}

function buildDismissalNotificationIdempotencyKey(params: {
  eventType: CommunicationNotificationType;
  requestId: string;
  recipientUserId: string;
}): string {
  return `dismissal:${params.eventType.toLowerCase()}:${params.requestId}:${params.recipientUserId}`;
}

function presentDismissalRequestStatus(
  status: DismissalRequestStatus,
): string {
  return status.toLowerCase();
}

function isActiveParentUser(
  user: DismissalNotificationRequestRecord['requestedBy'],
): boolean {
  return (
    user.userType === UserType.PARENT &&
    user.status === UserStatus.ACTIVE &&
    user.deletedAt === null
  );
}

function displayName(parts: Array<string | null | undefined>): string | null {
  const value = parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  return value || null;
}

function label(
  record: { nameEn?: string | null; nameAr?: string | null } | null,
): string | null {
  return record?.nameEn || record?.nameAr || null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function emptyNotificationCreationResult(): DismissalNotificationCreationResult {
  return {
    recipientCount: 0,
    createdNotificationCount: 0,
    existingNotificationCount: 0,
  };
}
