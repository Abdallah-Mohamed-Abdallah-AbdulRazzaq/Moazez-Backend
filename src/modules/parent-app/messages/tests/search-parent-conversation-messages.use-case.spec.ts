import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { SearchParentConversationMessagesUseCase } from '../application/search-parent-conversation-messages.use-case';
import { SearchParentConversationMessagesQueryDto } from '../dto/parent-messages.dto';
import { ParentMessagesReadAdapter } from '../infrastructure/parent-messages-read.adapter';

describe('SearchParentConversationMessagesUseCase', () => {
  it('searches only after resolving the current parent and visible conversation', async () => {
    const { useCase, accessService, readAdapter } = createUseCase();

    const result = await useCase.execute({
      conversationId: 'conversation-1',
      query: { q: 'teacher', page: 2, limit: 10 },
    });

    expect(accessService.assertCurrentParent).toHaveBeenCalledTimes(1);
    expect(readAdapter.findConversationForParent).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      parentUserId: 'parent-user-1',
    });
    expect(readAdapter.searchMessages).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      parentUserId: 'parent-user-1',
      q: 'teacher',
      page: 2,
      limit: 10,
    });
    expect(result).toEqual({
      conversationId: 'conversation-1',
      conversation_id: 'conversation-1',
      messages: [],
      pagination: { page: 2, limit: 10, total: 0 },
      query: 'teacher',
    });
  });

  it('does not query messages for an unauthorized parent conversation', async () => {
    const { useCase, readAdapter } = createUseCase();
    readAdapter.findConversationForParent.mockResolvedValueOnce(null);

    await expect(
      useCase.execute({
        conversationId: 'conversation-1',
        query: { q: 'teacher' },
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);

    expect(readAdapter.searchMessages).not.toHaveBeenCalled();
  });

  it('validates and trims parent search query params without raw scope ids', async () => {
    const pipe = createQueryValidationPipe();
    const metadata = searchQueryMetadata(SearchParentConversationMessagesQueryDto);

    await expect(
      pipe.transform({ q: '  teacher  ', page: '2', limit: '10' }, metadata),
    ).resolves.toMatchObject({ q: 'teacher', page: 2, limit: 10 });

    await expect(pipe.transform({ q: 't' }, metadata)).rejects.toBeDefined();
    await expect(
      pipe.transform({ q: 'teacher', userId: 'user-1' }, metadata),
    ).rejects.toBeDefined();
  });
});

function createQueryValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
}

function searchQueryMetadata(
  metatype: typeof SearchParentConversationMessagesQueryDto,
): ArgumentMetadata {
  return {
    type: 'query',
    metatype,
    data: '',
  };
}

function createUseCase() {
  const accessService = {
    assertCurrentParent: jest.fn().mockResolvedValue({
      parentUserId: 'parent-user-1',
    }),
  };
  const readAdapter = {
    findConversationForParent: jest.fn().mockResolvedValue({
      id: 'conversation-1',
    }),
    searchMessages: jest.fn().mockResolvedValue({
      conversationId: 'conversation-1',
      items: [],
      total: 0,
      page: 2,
      limit: 10,
    }),
  };

  return {
    useCase: new SearchParentConversationMessagesUseCase(
      accessService as unknown as ParentAppAccessService,
      readAdapter as unknown as ParentMessagesReadAdapter,
    ),
    accessService,
    readAdapter,
  };
}
