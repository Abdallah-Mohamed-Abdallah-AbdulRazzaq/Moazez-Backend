import { Injectable } from '@nestjs/common';
import { CommunicationNotificationType } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import {
  DismissalNotificationInvalidFilterException,
  DismissalNotificationSchoolContextRequiredException,
} from '../../shared/dismissal.errors';
import {
  DismissalNotificationsListResponseDto,
  ListDismissalNotificationsQueryDto,
} from '../dto/dismissal-notifications-query.dto';
import { DismissalNotificationsRepository } from '../infrastructure/dismissal-notifications.repository';
import { presentDismissalNotificationsList } from '../presenter/dismissal-notifications.presenter';

export interface DismissalNotificationScope {
  actorId: string;
  schoolId: string;
}

@Injectable()
export class ListDismissalNotificationsUseCase {
  constructor(
    private readonly dismissalNotificationsRepository: DismissalNotificationsRepository,
  ) {}

  async execute(
    query: ListDismissalNotificationsQueryDto = {},
  ): Promise<DismissalNotificationsListResponseDto> {
    const scope = requireDismissalNotificationScope();
    const result =
      await this.dismissalNotificationsRepository.listCurrentActorNotifications(
        {
          recipientUserId: scope.actorId,
          unreadOnly: parseUnreadOnly(query.unreadOnly),
          type: parseNotificationType(query.type),
          page: parsePage(query.page),
          limit: parseLimit(query.limit),
          sort: parseSort(query.sort),
        },
      );

    return presentDismissalNotificationsList(result);
  }
}

export function requireDismissalNotificationScope(): DismissalNotificationScope {
  const context = getRequestContext();
  const actorId = context?.actor?.id;
  const schoolId = context?.activeMembership?.schoolId;
  if (!actorId || !schoolId) {
    throw new DismissalNotificationSchoolContextRequiredException();
  }

  return { actorId, schoolId };
}

export function parseNotificationType(
  value: string | undefined,
): CommunicationNotificationType | undefined {
  if (value === undefined || value === null || value.trim().length === 0) {
    return undefined;
  }

  switch (value.trim().toLowerCase()) {
    case 'request_created':
      return CommunicationNotificationType.DISMISSAL_REQUEST_CREATED;
    case 'request_cancelled':
      return CommunicationNotificationType.DISMISSAL_REQUEST_CANCELLED;
    case 'request_called':
      return CommunicationNotificationType.DISMISSAL_REQUEST_CALLED;
    case 'request_ready':
      return CommunicationNotificationType.DISMISSAL_REQUEST_READY;
    case 'request_handed_over':
      return CommunicationNotificationType.DISMISSAL_REQUEST_HANDED_OVER;
    case 'request_expired':
      return CommunicationNotificationType.DISMISSAL_REQUEST_EXPIRED;
    default:
      throw new DismissalNotificationInvalidFilterException({
        field: 'type',
        value,
      });
  }
}

function parseUnreadOnly(value: string | undefined): boolean {
  if (value === undefined || value === null || value === '') return false;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  throw new DismissalNotificationInvalidFilterException({
    field: 'unreadOnly',
    value,
  });
}

function parsePage(value: number | undefined): number {
  if (value === undefined || value === null) return 1;
  if (!Number.isInteger(value) || value < 1) {
    throw new DismissalNotificationInvalidFilterException({
      field: 'page',
      value,
    });
  }
  return value;
}

function parseLimit(value: number | undefined): number {
  if (value === undefined || value === null) return 20;
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new DismissalNotificationInvalidFilterException({
      field: 'limit',
      value,
    });
  }
  return value;
}

function parseSort(
  value: string | undefined,
): 'created_at_desc' | 'created_at_asc' {
  if (value === undefined || value === null || value.trim().length === 0) {
    return 'created_at_desc';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'created_at_desc' || normalized === 'created_at_asc') {
    return normalized;
  }

  throw new DismissalNotificationInvalidFilterException({
    field: 'sort',
    value,
  });
}
