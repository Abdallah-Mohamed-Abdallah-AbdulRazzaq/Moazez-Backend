import { CommunicationParticipantStatus } from '@prisma/client';
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
});

function prismaMock(scoped: unknown): PrismaService {
  return {
    scoped,
  } as unknown as PrismaService;
}

function scopedPrismaMock(input: {
  conversation: { id: string } | null;
  participant: { status: CommunicationParticipantStatus } | null;
}) {
  return {
    communicationConversation: {
      findFirst: jest.fn().mockResolvedValue(input.conversation),
    },
    communicationConversationParticipant: {
      findFirst: jest.fn().mockResolvedValue(input.participant),
    },
  };
}
