import {
  CommunicationConversationStatus,
  CommunicationParticipantStatus,
} from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import { RealtimeCommunicationAccessService } from '../realtime-communication-access.service';

describe('RealtimeCommunicationAccessService', () => {
  it('allows current-school active participants to join conversation rooms', async () => {
    const scoped = scopedPrismaMock({
      conversation: { id: 'conversation-1' },
      participant: { status: CommunicationParticipantStatus.ACTIVE },
    });
    const service = new RealtimeCommunicationAccessService(prismaMock(scoped));

    await expect(
      service.canJoinConversationRoom({
        conversationId: 'conversation-1',
        actorId: 'user-1',
        permissions: [],
      }),
    ).resolves.toBe(true);

    expect(scoped.communicationConversation.findFirst).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      select: { id: true },
    });
    expect(
      scoped.communicationConversationParticipant.findFirst,
    ).toHaveBeenCalledWith({
      where: {
        conversationId: 'conversation-1',
        userId: 'user-1',
      },
      select: { status: true },
    });
  });

  it('allows safe admin view permissions when actor is not a participant', async () => {
    const scoped = scopedPrismaMock({
      conversation: { id: 'conversation-1' },
      participant: null,
    });
    const service = new RealtimeCommunicationAccessService(prismaMock(scoped));

    await expect(
      service.canJoinConversationRoom({
        conversationId: 'conversation-1',
        actorId: 'user-1',
        permissions: ['communication.admin.view'],
      }),
    ).resolves.toBe(true);
  });

  it('rejects missing conversations and inactive non-admin participants', async () => {
    const missingConversation = scopedPrismaMock({
      conversation: null,
      participant: null,
    });
    const missingService = new RealtimeCommunicationAccessService(
      prismaMock(missingConversation),
    );

    await expect(
      missingService.canJoinConversationRoom({
        conversationId: 'conversation-1',
        actorId: 'user-1',
        permissions: ['communication.admin.view'],
      }),
    ).resolves.toBe(false);

    const inactiveParticipant = scopedPrismaMock({
      conversation: { id: 'conversation-1' },
      participant: { status: CommunicationParticipantStatus.REMOVED },
    });
    const inactiveService = new RealtimeCommunicationAccessService(
      prismaMock(inactiveParticipant),
    );

    await expect(
      inactiveService.canJoinConversationRoom({
        conversationId: 'conversation-1',
        actorId: 'user-1',
        permissions: [],
      }),
    ).resolves.toBe(false);
  });

  it('uses communication policy to decide whether online presence is enabled', async () => {
    const enabledScoped = scopedPrismaMock({
      conversation: null,
      participant: null,
      policy: { isEnabled: true, allowOnlinePresence: true },
    });
    const enabledService = new RealtimeCommunicationAccessService(
      prismaMock(enabledScoped),
    );

    await expect(enabledService.isOnlinePresenceEnabled()).resolves.toBe(true);

    const disabledScoped = scopedPrismaMock({
      conversation: null,
      participant: null,
      policy: { isEnabled: true, allowOnlinePresence: false },
    });
    const disabledService = new RealtimeCommunicationAccessService(
      prismaMock(disabledScoped),
    );

    await expect(disabledService.isOnlinePresenceEnabled()).resolves.toBe(
      false,
    );
  });

  it('defaults online presence to enabled when no policy exists', async () => {
    const scoped = scopedPrismaMock({
      conversation: null,
      participant: null,
      policy: null,
    });
    const service = new RealtimeCommunicationAccessService(prismaMock(scoped));

    await expect(service.isOnlinePresenceEnabled()).resolves.toBe(true);
  });

  it('lists only active conversation ids for conversation-scoped presence', async () => {
    const scoped = scopedPrismaMock({
      conversation: null,
      participant: null,
      presenceParticipants: [
        { conversationId: 'conversation-1' },
        { conversationId: 'conversation-2' },
      ],
    });
    const service = new RealtimeCommunicationAccessService(prismaMock(scoped));

    await expect(
      service.listPresenceConversationIdsForActor({ actorId: 'user-1' }),
    ).resolves.toEqual(['conversation-1', 'conversation-2']);

    expect(
      scoped.communicationConversationParticipant.findMany,
    ).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: {
          in: [
            CommunicationParticipantStatus.ACTIVE,
            CommunicationParticipantStatus.MUTED,
          ],
        },
        conversation: {
          status: CommunicationConversationStatus.ACTIVE,
          deletedAt: null,
        },
      },
      select: { conversationId: true },
      orderBy: { conversationId: 'asc' },
    });
  });
});

function prismaMock(scoped: unknown): PrismaService {
  return {
    scoped,
  } as unknown as PrismaService;
}

function scopedPrismaMock(input: {
  conversation: { id: string } | null;
  participant: { status: CommunicationParticipantStatus } | null;
  policy?: { isEnabled: boolean; allowOnlinePresence: boolean } | null;
  presenceParticipants?: Array<{ conversationId: string }>;
}) {
  return {
    communicationConversation: {
      findFirst: jest.fn().mockResolvedValue(input.conversation),
    },
    communicationConversationParticipant: {
      findFirst: jest.fn().mockResolvedValue(input.participant),
      findMany: jest.fn().mockResolvedValue(input.presenceParticipants ?? []),
    },
    communicationPolicy: {
      findFirst: jest.fn().mockResolvedValue(input.policy ?? null),
    },
  };
}
