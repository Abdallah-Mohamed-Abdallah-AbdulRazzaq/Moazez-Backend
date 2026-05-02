import { Injectable } from '@nestjs/common';
import { CommunicationParticipantStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const CONVERSATION_ROOM_VIEW_PERMISSIONS = new Set([
  'communication.messages.moderate',
  'communication.conversations.manage',
  'communication.admin.view',
  'communication.admin.manage',
]);

const PARTICIPANT_READ_STATUSES = new Set<CommunicationParticipantStatus>([
  CommunicationParticipantStatus.ACTIVE,
  CommunicationParticipantStatus.MUTED,
]);

@Injectable()
export class RealtimeCommunicationAccessService {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async canJoinConversationRoom(input: {
    conversationId: string;
    actorId: string;
    permissions: string[];
  }): Promise<boolean> {
    const conversation =
      await this.scopedPrisma.communicationConversation.findFirst({
        where: { id: input.conversationId },
        select: { id: true },
      });
    if (!conversation) return false;

    const participant =
      await this.scopedPrisma.communicationConversationParticipant.findFirst({
        where: {
          conversationId: input.conversationId,
          userId: input.actorId,
        },
        select: {
          status: true,
        },
      });

    if (participant && PARTICIPANT_READ_STATUSES.has(participant.status)) {
      return true;
    }

    return input.permissions.some((permission) =>
      CONVERSATION_ROOM_VIEW_PERMISSIONS.has(permission),
    );
  }
}
