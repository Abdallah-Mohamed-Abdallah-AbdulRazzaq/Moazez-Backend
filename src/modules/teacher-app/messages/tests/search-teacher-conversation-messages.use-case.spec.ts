import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { SearchTeacherConversationMessagesUseCase } from '../application/search-teacher-conversation-messages.use-case';
import { SearchTeacherConversationMessagesQueryDto } from '../dto/teacher-messages.dto';
import { TeacherMessagesReadAdapter } from '../infrastructure/teacher-messages-read.adapter';

describe('SearchTeacherConversationMessagesUseCase', () => {
  it('searches only after resolving the current teacher and visible conversation', async () => {
    const { useCase, accessService, readAdapter } = createUseCase();

    const result = await useCase.execute('conversation-1', {
      q: 'exam',
      page: 2,
      limit: 10,
    });

    expect(accessService.assertCurrentTeacher).toHaveBeenCalledTimes(1);
    expect(readAdapter.findConversationForTeacher).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      teacherUserId: 'teacher-1',
    });
    expect(readAdapter.searchMessages).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      teacherUserId: 'teacher-1',
      q: 'exam',
      page: 2,
      limit: 10,
    });
    expect(result).toEqual({
      conversationId: 'conversation-1',
      messages: [],
      pagination: { page: 2, limit: 10, total: 0 },
      query: 'exam',
    });
  });

  it('does not query messages for an unauthorized teacher conversation', async () => {
    const { useCase, readAdapter } = createUseCase();
    readAdapter.findConversationForTeacher.mockResolvedValueOnce(null);

    await expect(
      useCase.execute('conversation-1', { q: 'exam' }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);

    expect(readAdapter.searchMessages).not.toHaveBeenCalled();
  });

  it('validates and trims teacher search query params without raw scope ids', async () => {
    const pipe = createQueryValidationPipe();
    const metadata = searchQueryMetadata(
      SearchTeacherConversationMessagesQueryDto,
    );

    await expect(
      pipe.transform({ q: '  exam  ', page: '2', limit: '10' }, metadata),
    ).resolves.toMatchObject({ q: 'exam', page: 2, limit: 10 });

    await expect(pipe.transform({ q: 'e' }, metadata)).rejects.toBeDefined();
    await expect(
      pipe.transform({ q: 'exam', userId: 'user-1' }, metadata),
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
  metatype: typeof SearchTeacherConversationMessagesQueryDto,
): ArgumentMetadata {
  return {
    type: 'query',
    metatype,
    data: '',
  };
}

function createUseCase() {
  const accessService = {
    assertCurrentTeacher: jest.fn().mockReturnValue({
      teacherUserId: 'teacher-1',
    }),
  };
  const readAdapter = {
    findConversationForTeacher: jest.fn().mockResolvedValue({
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
    useCase: new SearchTeacherConversationMessagesUseCase(
      accessService as unknown as TeacherAppAccessService,
      readAdapter as unknown as TeacherMessagesReadAdapter,
    ),
    accessService,
    readAdapter,
  };
}
