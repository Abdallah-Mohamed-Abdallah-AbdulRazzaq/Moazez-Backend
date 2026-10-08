import { randomUUID } from 'node:crypto';
import { TeacherAcademicContentAnalyticsUseCase } from '../application/teacher-academic-content-analytics.use-case';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import {
  AcademicContentTeacherAnalyticsRepository,
  type AcademicContentTeacherAnalyticsRow,
} from '../../../academics/academic-content/infrastructure/academic-content-teacher-analytics.repository';
import {
  ACADEMIC_CONTENT_OWN_ANALYTICS_PERMISSIONS,
  academicContentAnalyticsRangeDays,
} from '../../../academics/academic-content/domain/academic-content-analytics.contract';

describe('Teacher Academic Content analytics contract', () => {
  const teacher = {
    teacherUserId: randomUUID(),
    schoolId: randomUUID(),
    organizationId: randomUUID(),
    membershipId: randomUUID(),
    roleId: randomUUID(),
    permissions: [...ACADEMIC_CONTENT_OWN_ANALYTICS_PERMISSIONS],
  };
  const contentId = randomUUID();
  const row: AcademicContentTeacherAnalyticsRow = {
    from: new Date('2026-09-08T12:00:00Z'),
    toExclusive: new Date('2026-10-08T12:00:00Z'),
    revisionId: null,
    includedPublicationCount: '9007199254740993',
    totalEventReports: '9007199254740993',
    distinctStudentActorsEngaged: '1',
    distinctParentChildPairsEngaged: '2',
    acknowledgementRecords: '3',
    distinctAcknowledgingParentChildPairs: '2',
    eventCountsByTypeAndActorKind: [],
  };
  function setup(permissions: string[] = [...teacher.permissions]) {
    const current = jest.fn(() => ({ ...teacher, permissions }));
    const read = jest.fn(() => Promise.resolve(row));
    return {
      read,
      useCase: new TeacherAcademicContentAnalyticsUseCase(
        { assertCurrentTeacher: current } as unknown as TeacherAppAccessService,
        { read } as unknown as AcademicContentTeacherAnalyticsRepository,
      ),
    };
  }
  it('preserves counts above Number.MAX_SAFE_INTEGER and projects only the aggregate contract', async () => {
    const { useCase, read } = setup();
    const result = await useCase.execute(contentId, {});
    expect(result.metrics.totalEventReports).toBe('9007199254740993');
    expect(result.includedPublicationCount).toBe('9007199254740993');
    expect(Object.keys(result).sort()).toEqual([
      'contentId',
      'includedPublicationCount',
      'measurements',
      'metrics',
      'publicationId',
      'revisionId',
      'window',
    ]);
    expect(read).toHaveBeenCalledWith(teacher, contentId, '30d', undefined);
  });
  it.each(ACADEMIC_CONTENT_OWN_ANALYTICS_PERMISSIONS)(
    'requires %s on independent application calls',
    async (permission) => {
      const { useCase, read } = setup(
        teacher.permissions.filter((entry) => entry !== permission),
      );
      await expect(useCase.execute(contentId, {})).rejects.toMatchObject({
        code: 'auth.scope.missing',
      });
      expect(read).not.toHaveBeenCalled();
    },
  );
  it('rejects direct client scope injection and arbitrary windows', async () => {
    const { useCase, read } = setup();
    await expect(
      useCase.execute(contentId, { range: '30d', schoolId: randomUUID() } as {
        range: '30d';
      }),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    for (const range of ['1d', '', null, ['7d', '30d'], {}])
      expect(() => academicContentAnalyticsRangeDays(range)).toThrow();
    expect(read).not.toHaveBeenCalled();
  });
});
