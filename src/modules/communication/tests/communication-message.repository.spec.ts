import { CommunicationMessageRepository } from '../infrastructure/communication-message.repository';

const SCHOOL_ID = 'school-1';
const CONVERSATION_ID = 'conversation-1';
const MESSAGE_ID = 'message-1';
const ACTOR_ID = 'actor-1';
const SENDER_ID = 'sender-1';
const PARTICIPANT_ID = 'participant-1';
const READ_AT = new Date('2026-05-02T09:00:00.000Z');

describe('CommunicationMessageRepository read receipts', () => {
  it('creates one read row for a non-sender and returns absolute readCount', async () => {
    const tx = transactionMock();
    tx.communicationMessage.findFirst.mockResolvedValue({
      id: MESSAGE_ID,
      senderUserId: SENDER_ID,
    });
    tx.communicationMessageRead.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(readRow());
    tx.communicationMessageRead.create.mockResolvedValue({ id: 'read-1' });
    tx.communicationMessageRead.count.mockResolvedValue(1);
    const { repository } = repositoryMock(tx);

    const result = await repository.markCurrentSchoolMessageRead({
      schoolId: SCHOOL_ID,
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      userId: ACTOR_ID,
      participantId: PARTICIPANT_ID,
      readAt: READ_AT,
    });

    expect(tx.communicationMessageRead.create).toHaveBeenCalledWith({
      data: {
        schoolId: SCHOOL_ID,
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
        userId: ACTOR_ID,
        readAt: READ_AT,
      },
      select: { id: true },
    });
    expect(tx.communicationMessageRead.count).toHaveBeenCalledWith({
      where: {
        messageId: MESSAGE_ID,
        userId: { not: SENDER_ID },
      },
    });
    expect(result).toMatchObject({
      id: 'read-1',
      messageId: MESSAGE_ID,
      userId: ACTOR_ID,
      readCount: 1,
      wasCreated: true,
      isSenderRead: false,
    });
  });

  it('updates an existing non-sender read without inflating readCount', async () => {
    const tx = transactionMock();
    tx.communicationMessage.findFirst.mockResolvedValue({
      id: MESSAGE_ID,
      senderUserId: SENDER_ID,
    });
    tx.communicationMessageRead.findFirst
      .mockResolvedValueOnce({ id: 'read-1' })
      .mockResolvedValueOnce(readRow());
    tx.communicationMessageRead.count.mockResolvedValue(2);
    const { repository } = repositoryMock(tx);

    const result = await repository.markCurrentSchoolMessageRead({
      schoolId: SCHOOL_ID,
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      userId: ACTOR_ID,
      participantId: PARTICIPANT_ID,
      readAt: READ_AT,
    });

    expect(tx.communicationMessageRead.create).not.toHaveBeenCalled();
    expect(tx.communicationMessageRead.updateMany).toHaveBeenCalledWith({
      where: { id: 'read-1' },
      data: { readAt: READ_AT },
    });
    expect(result).toMatchObject({
      readCount: 2,
      wasCreated: false,
      isSenderRead: false,
    });
  });

  it('does not create or update a read row when the sender marks their own message read', async () => {
    const tx = transactionMock();
    tx.communicationMessage.findFirst.mockResolvedValue({
      id: MESSAGE_ID,
      senderUserId: ACTOR_ID,
    });
    tx.communicationMessageRead.count.mockResolvedValue(2);
    const { repository } = repositoryMock(tx);

    const result = await repository.markCurrentSchoolMessageRead({
      schoolId: SCHOOL_ID,
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      userId: ACTOR_ID,
      participantId: PARTICIPANT_ID,
      readAt: READ_AT,
    });

    expect(tx.communicationMessageRead.findFirst).not.toHaveBeenCalled();
    expect(tx.communicationMessageRead.create).not.toHaveBeenCalled();
    expect(tx.communicationMessageRead.updateMany).not.toHaveBeenCalled();
    expect(tx.communicationConversationParticipant.updateMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: null,
      messageId: MESSAGE_ID,
      userId: ACTOR_ID,
      readCount: 2,
      wasCreated: false,
      isSenderRead: true,
      createdAt: null,
      updatedAt: null,
    });
  });

  it('marks a conversation read only for newly unread non-self messages', async () => {
    const tx = transactionMock();
    tx.communicationMessage.findMany.mockResolvedValue([
      { id: 'message-1', senderUserId: 'sender-1' },
      { id: 'message-2', senderUserId: null },
    ]);
    tx.communicationMessageRead.findMany.mockResolvedValue([
      { messageId: 'message-1', userId: ACTOR_ID },
      { messageId: 'message-1', userId: 'sender-1' },
      { messageId: 'message-2', userId: ACTOR_ID },
    ]);
    tx.communicationMessage.findFirst.mockResolvedValue({ id: 'message-3' });
    const { repository } = repositoryMock(tx);

    const result = await repository.markCurrentSchoolConversationRead({
      schoolId: SCHOOL_ID,
      conversationId: CONVERSATION_ID,
      userId: ACTOR_ID,
      participantId: PARTICIPANT_ID,
      readAt: READ_AT,
    });

    expect(tx.communicationMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId: CONVERSATION_ID,
          OR: [
            { senderUserId: null },
            { senderUserId: { not: ACTOR_ID } },
          ],
          reads: {
            none: {
              userId: ACTOR_ID,
            },
          },
        }),
      }),
    );
    expect(tx.communicationMessageRead.createMany).toHaveBeenCalledWith({
      data: [
        {
          schoolId: SCHOOL_ID,
          conversationId: CONVERSATION_ID,
          messageId: 'message-1',
          userId: ACTOR_ID,
          readAt: READ_AT,
        },
        {
          schoolId: SCHOOL_ID,
          conversationId: CONVERSATION_ID,
          messageId: 'message-2',
          userId: ACTOR_ID,
          readAt: READ_AT,
        },
      ],
      skipDuplicates: true,
    });
    expect(result).toEqual({
      conversationId: CONVERSATION_ID,
      readAt: READ_AT,
      markedCount: 2,
      messages: [
        { messageId: 'message-1', readCount: 1 },
        { messageId: 'message-2', readCount: 1 },
      ],
    });
  });

  it('keeps repeated conversation mark-read idempotent', async () => {
    const tx = transactionMock();
    tx.communicationMessage.findMany.mockResolvedValue([]);
    tx.communicationMessage.findFirst.mockResolvedValue({ id: 'message-3' });
    const { repository } = repositoryMock(tx);

    const result = await repository.markCurrentSchoolConversationRead({
      schoolId: SCHOOL_ID,
      conversationId: CONVERSATION_ID,
      userId: ACTOR_ID,
      participantId: PARTICIPANT_ID,
      readAt: READ_AT,
    });

    expect(tx.communicationMessageRead.createMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      conversationId: CONVERSATION_ID,
      readAt: READ_AT,
      markedCount: 0,
      messages: [],
    });
  });

  it('loads read summary counts excluding historical sender rows', async () => {
    const tx = transactionMock();
    const { repository, scopedPrisma } = repositoryMock(tx);
    scopedPrisma.communicationMessage.findMany.mockResolvedValue([
      {
        id: MESSAGE_ID,
        senderUserId: SENDER_ID,
        reads: [
          { userId: SENDER_ID },
          { userId: ACTOR_ID },
          { userId: 'reader-2' },
        ],
      },
    ]);
    scopedPrisma.communicationMessage.count.mockResolvedValue(1);

    const result =
      await repository.loadCurrentSchoolConversationReadSummary({
        conversationId: CONVERSATION_ID,
      });

    expect(result.items).toEqual([{ messageId: MESSAGE_ID, readCount: 2 }]);
  });
});

function repositoryMock(tx: ReturnType<typeof transactionMock>) {
  const scopedPrisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
    communicationMessage: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
  const prisma = {
    scoped: scopedPrisma,
  };

  return {
    repository: new CommunicationMessageRepository(prisma as any),
    scopedPrisma,
  };
}

function transactionMock() {
  return {
    communicationMessage: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    communicationMessageRead: {
      findFirst: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    communicationConversationParticipant: {
      updateMany: jest.fn(),
    },
  };
}

function readRow() {
  return {
    id: 'read-1',
    schoolId: SCHOOL_ID,
    conversationId: CONVERSATION_ID,
    messageId: MESSAGE_ID,
    userId: ACTOR_ID,
    readAt: READ_AT,
    metadata: null,
    createdAt: READ_AT,
    updatedAt: READ_AT,
  };
}
