import { ValidationPipe } from '@nestjs/common';
import { ParentAcademicContentQueryDto } from '../dto/parent-academic-content-query.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const parse = (value: unknown): Promise<unknown> =>
  pipe.transform(value, {
    type: 'query',
    metatype: ParentAcademicContentQueryDto,
  });

describe('Parent Academic Content safe query validation', () => {
  it('accepts only the supported filters and transforms pagination and whitespace', async () => {
    await expect(
      parse({
        type: 'ONLINE_SESSION',
        subjectId: '11111111-1111-4111-8111-111111111111',
        search: '  published  ',
        tag: ' Tag ',
        sessionPlatform: 'ZOOM',
        sessionStartAtFrom: '2026-10-07T10:00:00+02:00',
        sessionStartAtTo: '2026-10-07T09:00:00Z',
        page: '2',
        limit: '100',
      }),
    ).resolves.toMatchObject({
      search: 'published',
      tag: 'Tag',
      page: 2,
      limit: 100,
    });
    await expect(
      parse({
        type: 'WEEKLY_PLAN',
        weeklyDateFrom: '2026-10-05',
        weeklyDateTo: '2026-10-09',
      }),
    ).resolves.toBeInstanceOf(ParentAcademicContentQueryDto);
  });

  it('accepts Guardian Weekly Note without broadening Student query normalization', async () => {
    await expect(
      parse({ type: 'GUARDIAN_WEEKLY_NOTE' }),
    ).resolves.toBeInstanceOf(ParentAcademicContentQueryDto);
  });

  it.each([
    'status',
    'audience',
    'studentId',
    'enrollmentId',
    'academicYearId',
    'termId',
    'stageId',
    'gradeId',
    'sectionId',
    'classroomId',
    'teacherUserId',
    'guardianPriority',
    'guardianId',
    'recipientUserId',
  ])('rejects forbidden %s', async (key) => {
    await expect(parse({ [key]: 'chosen-by-client' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it.each([
    { type: 'TEACHER_PREPARATION' },
    { subjectId: 'invalid' },
    { page: '0' },
    { page: '1.5' },
    { limit: '0' },
    { limit: '101' },
    { page: '9007199254740992' },
    { search: 'x'.repeat(121) },
    { tag: 'x'.repeat(81) },
    { sessionPlatform: 'invalid' },
    { weeklyDateFrom: '2026-02-30' },
    { weeklyDateTo: '07/10/2026' },
    { weeklyDateFrom: '2026-10-09', weeklyDateTo: '2026-10-05' },
    { sessionStartAtFrom: '2026-10-07' },
    { sessionStartAtTo: 'invalid' },
    {
      sessionStartAtFrom: '2026-10-07T12:00:00Z',
      sessionStartAtTo: '2026-10-07T13:00:00+02:00',
    },
  ])('rejects invalid query %j', async (query) => {
    await expect(parse(query)).rejects.toMatchObject({ status: 400 });
  });
});
