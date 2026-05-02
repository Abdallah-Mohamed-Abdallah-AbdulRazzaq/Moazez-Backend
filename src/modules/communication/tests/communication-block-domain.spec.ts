import {
  assertCanCreateBlock,
  assertCanDeleteBlock,
  CommunicationUserBlockedException,
} from '../domain/communication-block-domain';
import { CommunicationConversationScopeInvalidException } from '../domain/communication-conversation-domain';

describe('communication block domain', () => {
  it('rejects self-block and duplicate active blocks', () => {
    expect(() =>
      assertCanCreateBlock({
        actorId: 'user-1',
        targetUserId: 'user-1',
        hasActiveBlock: false,
      }),
    ).toThrow(CommunicationConversationScopeInvalidException);

    expect(() =>
      assertCanCreateBlock({
        actorId: 'user-1',
        targetUserId: 'user-2',
        hasActiveBlock: true,
      }),
    ).toThrow(CommunicationUserBlockedException);
  });

  it('keeps block deletion actor-owned', () => {
    expect(() =>
      assertCanDeleteBlock({
        actorId: 'user-2',
        block: {
          id: 'block-1',
          blockerUserId: 'user-1',
          blockedUserId: 'user-3',
        },
      }),
    ).toThrow(CommunicationConversationScopeInvalidException);
  });
});
