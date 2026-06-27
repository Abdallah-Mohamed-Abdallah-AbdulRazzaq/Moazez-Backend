import { Injectable } from '@nestjs/common';
import {
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationPreferenceCategory,
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationType,
} from '@prisma/client';
import {
  CommunicationNotificationCommandSkippedReason,
  normalizeCommunicationNotificationDeliveryChannels,
  normalizeCommunicationNotificationIdempotencyKey,
} from '../domain/communication-notification-command-domain';
import { CommunicationNotificationInvalidException } from '../domain/communication-notification-domain';
import {
  CommunicationNotificationCommandRecord,
  CommunicationNotificationCommandRepository,
} from '../infrastructure/communication-notification-command.repository';
import { CommunicationNotificationPreferenceService } from './communication-notification-preference.service';

export interface CreateOrReuseCommunicationNotificationCommand {
  schoolId: string;
  recipientUserId: string;
  actorUserId?: string | null;
  sourceModule: CommunicationNotificationSourceModule;
  sourceType: string;
  sourceId?: string | null;
  idempotencyKey?: string | null;
  type: CommunicationNotificationType;
  title: string;
  body: string;
  priority?: CommunicationNotificationPriority;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown> | null;
  deliveryChannels?: CommunicationNotificationDeliveryChannel[] | null;
  preferenceCategory?: CommunicationNotificationPreferenceCategory | null;
  now?: Date;
}

export interface CreateOrReuseCommunicationNotificationCommandResult {
  notification: CommunicationNotificationCommandRecord | null;
  createdNotification: boolean;
  reusedExistingNotification: boolean;
  createdDeliveryCount: number;
  existingDeliveryCount: number;
  skippedReason: CommunicationNotificationCommandSkippedReason | null;
}

@Injectable()
export class CommunicationNotificationCommandService {
  constructor(
    private readonly commandRepository: CommunicationNotificationCommandRepository,
    private readonly preferenceService: CommunicationNotificationPreferenceService,
  ) {}

  async createOrReuseNotification(
    command: CreateOrReuseCommunicationNotificationCommand,
  ): Promise<CreateOrReuseCommunicationNotificationCommandResult> {
    const idempotencyKey = normalizeCommunicationNotificationIdempotencyKey(
      command.idempotencyKey,
    );
    const deliveryChannels = normalizeCommunicationNotificationDeliveryChannels(
      command.deliveryChannels,
    );
    const title = normalizeRequiredNotificationText('title', command.title);
    const body = normalizeRequiredNotificationText('body', command.body);
    const sourceType = normalizeRequiredNotificationText(
      'sourceType',
      command.sourceType,
    );

    if (
      command.preferenceCategory &&
      deliveryChannels.includes(CommunicationNotificationDeliveryChannel.IN_APP)
    ) {
      const inAppEnabled =
        await this.preferenceService.shouldCreateInAppNotification({
          schoolId: command.schoolId,
          recipientUserId: command.recipientUserId,
          category: command.preferenceCategory,
        });

      if (!inAppEnabled) {
        return {
          notification: null,
          createdNotification: false,
          reusedExistingNotification: false,
          createdDeliveryCount: 0,
          existingDeliveryCount: 0,
          skippedReason: 'in_app_preference_disabled',
        };
      }
    }

    const result =
      await this.commandRepository.createOrReuseCurrentSchoolNotification({
        schoolId: command.schoolId,
        recipientUserId: command.recipientUserId,
        actorUserId: command.actorUserId ?? null,
        sourceModule: command.sourceModule,
        sourceType,
        sourceId: command.sourceId ?? null,
        idempotencyKey,
        type: command.type,
        title,
        body,
        priority: command.priority ?? CommunicationNotificationPriority.NORMAL,
        expiresAt: command.expiresAt ?? null,
        metadata: command.metadata ?? null,
        deliveryChannels,
        now: command.now ?? new Date(),
      });

    return {
      ...result,
      skippedReason: null,
    };
  }
}

function normalizeRequiredNotificationText(field: string, value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new CommunicationNotificationInvalidException(
      'Notification command field cannot be empty',
      { field },
    );
  }

  return normalized;
}
