import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { SearchStudentConversationMessagesUseCase } from '../application/search-student-conversation-messages.use-case';
import { SearchStudentConversationMessagesQueryDto } from '../dto/student-messages.dto';
import { StudentMessagesReadAdapter } from '../infrastructure/student-messages-read.adapter';

describe('SearchStudentConversationMessagesUseCase', () => {
  it('searches only after resolving the current student and visible conversation', async () => {
    const { useCase, accessService, readAdapter } = createUseCase();

    const result = await useCase.execute({
      conversationId: 'conversation-1',
      query: { q: 'science', page: 2, limit: 10 },
    });

    expect(accessService.getCurrentStudentWithEnrollment).toHaveBeenCalledTimes(
      1,
    );
    expect(readAdapter.findConversationForStudent).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      studentUserId: 'student-user-1',
    });
    expect(readAdapter.searchMessages).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      studentUserId: 'student-user-1',
      q: 'science',
      page: 2,
      limit: 10,
    });
    expect(result).toEqual({
      conversationId: 'conversation-1',
      conversation_id: 'conversation-1',
      messages: [],
      pagination: { page: 2, limit: 10, total: 0 },
      query: 'science',
    });
  });

  it('does not query messages for an unauthorized student conversation', async () => {
    const { useCase, readAdapter } = createUseCase();
    readAdapter.findConversationForStudent.mockResolvedValueOnce(null);

    await expect(
      useCase.execute({
        conversationId: 'conversation-1',
        query: { q: 'science' },
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);

    expect(readAdapter.searchMessages).not.toHaveBeenCalled();
  });

  it('validates and trims student search query params without raw scope ids', async () => {
    const pipe = createQueryValidationPipe();
    const metadata = searchQueryMetadata(
      SearchStudentConversationMessagesQueryDto,
    );

    await expect(
      pipe.transform({ q: '  science  ', page: '2', limit: '10' }, metadata),
    ).resolves.toMatchObject({ q: 'science', page: 2, limit: 10 });

    await expect(pipe.transform({ q: 's' }, metadata)).rejects.toBeDefined();
    await expect(
      pipe.transform({ q: 'science', userId: 'user-1' }, metadata),
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
  metatype: typeof SearchStudentConversationMessagesQueryDto,
): ArgumentMetadata {
  return {
    type: 'query',
    metatype,
    data: '',
  };
}

function createUseCase() {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn().mockResolvedValue({
      context: {
        studentUserId: 'student-user-1',
      },
    }),
  };
  const readAdapter = {
    findConversationForStudent: jest.fn().mockResolvedValue({
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
    useCase: new SearchStudentConversationMessagesUseCase(
      accessService as unknown as StudentAppAccessService,
      readAdapter as unknown as StudentMessagesReadAdapter,
    ),
    accessService,
    readAdapter,
  };
}
