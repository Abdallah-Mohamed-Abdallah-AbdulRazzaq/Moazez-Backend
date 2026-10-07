import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AcademicContentCurrentAccessService } from '../application/academic-content-current-access.service';
import { AcademicContentAudienceRepository } from '../infrastructure/academic-content-audience.repository';
import { AcademicContentRecipientReadRepository } from '../infrastructure/academic-content-recipient-read.repository';
import { normalizeAcademicContentRecipientQuery } from '../domain/academic-content-recipient.query';
import { AcademicContentCurrentRecipientContext } from '../domain/academic-content-current-access.policy';

const context: Extract<
  AcademicContentCurrentRecipientContext,
  { actorKind: 'PARENT' }
> = {
  actorKind: 'PARENT',
  guardianIds: ['88888888-8888-4888-8888-888888888888'],
  schoolId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  studentId: '33333333-3333-4333-8333-333333333333',
  enrollmentId: '44444444-4444-4444-8444-444444444444',
  classroomId: '55555555-5555-4555-8555-555555555555',
  academicYearId: '66666666-6666-4666-8666-666666666666',
  termId: '77777777-7777-4777-8777-777777777777',
};
const now = new Date('2026-10-07T10:00:00.000Z');

describe('Core bounded immutable Parent recipient reads', () => {
  it('uses the current clock again at the final sensitive read', async () => {
    jest.useFakeTimers().setSystemTime(now);
    try {
      const reads = {
        findCurrentParentPublication: jest.fn().mockImplementation(() => {
          jest.setSystemTime(new Date(now.getTime() + 1000));
          return Promise.resolve({
            publicationId: context.studentId,
            revisionId: context.termId,
          });
        }),
        findCurrentParentDetail: jest.fn().mockResolvedValue(null),
      };
      const service = new AcademicContentCurrentAccessService(
        reads as unknown as AcademicContentRecipientReadRepository,
        {} as AcademicContentAudienceRepository,
      );
      await expect(
        service.getCurrentParentContent(context, context.studentId),
      ).rejects.toMatchObject({ code: 'not_found' });
      expect(reads.findCurrentParentPublication).toHaveBeenCalledWith(
        context,
        context.studentId,
        now,
      );
      expect(reads.findCurrentParentDetail).toHaveBeenCalledWith(
        context,
        { publicationId: context.studentId, revisionId: context.termId },
        new Date(now.getTime() + 1000),
      );
    } finally {
      jest.useRealTimers();
    }
  });
  it('uses one parameterized statement for page and total, even for an empty page', async () => {
    const raw = jest
      .fn<Promise<unknown>, [Prisma.Sql]>()
      .mockResolvedValue([{ publicationId: null, total: 25 }]);
    const reads = new AcademicContentRecipientReadRepository({
      $queryRaw: raw,
    } as unknown as PrismaService);
    const result = await reads.listCurrentParentPublications(
      context,
      normalizeAcademicContentRecipientQuery({
        page: 3,
        limit: 20,
        search: "' OR true -- 100%_",
      }),
      now,
    );
    expect(result).toEqual({
      items: [],
      pagination: { page: 3, limit: 20, total: 25 },
    });
    expect(raw).toHaveBeenCalledTimes(1);
    const sql = raw.mock.calls[0][0];
    expect(sql.sql).not.toContain('OR true --');
    expect(sql.values).toContain("%' OR true -- 100\\%\\_%");
    expect(sql.sql).toContain('count(*)');
    expect(sql.sql).toContain('academic_content_revision_targets');
    expect(sql.sql).toContain('subject_allocations');
    expect(sql.sql).not.toContain('academic_content_audience_recipients');
    expect(sql.sql).not.toContain('joinUrl');
    expect(sql.sql).not.toContain('accessCode');
  });

  it('never calls per-Publication authorization for a feed', async () => {
    const raw = jest
      .fn<Promise<unknown>, [Prisma.Sql]>()
      .mockResolvedValue([{ publicationId: null, total: 0 }]);
    const service = new AcademicContentCurrentAccessService(
      new AcademicContentRecipientReadRepository({
        $queryRaw: raw,
      } as unknown as PrismaService),
      {} as AcademicContentAudienceRepository,
    );
    const spy = jest.spyOn(service, 'assertPublicationAccess');
    await service.listCurrentParentPublications(context, {}, now);
    expect(spy).not.toHaveBeenCalled();
    expect(raw).toHaveBeenCalledTimes(1);
  });

  it('revalidates every child in one batched statement without fetching details', async () => {
    const raw = jest.fn<Promise<unknown>, [Prisma.Sql]>().mockResolvedValue([]);
    const reads = new AcademicContentRecipientReadRepository({
      $queryRaw: raw,
    } as unknown as PrismaService);
    await reads.listCurrentParentAccessibleChildren(
      {
        schoolId: context.schoolId,
        userId: context.userId,
        guardianIds: context.guardianIds,
        children: [context, { ...context, studentId: context.termId }],
      },
      context.studentId,
      now,
    );
    expect(raw).toHaveBeenCalledTimes(1);
    const sql = raw.mock.calls[0][0];
    expect(sql.sql).toContain('jsonb_to_recordset');
    expect(sql.sql).toContain('student_guardian_links');
    expect(sql.sql).toContain('guardian.user_id = actor.id');
    expect(sql.sql).not.toContain('typeSpecificSnapshot');
    expect(sql.sql).not.toContain('academic_content_audience_recipients');
    expect(sql.sql).not.toContain('can_receive_notifications');
  });

  it('does not fetch sensitive detail before authorization and fences the final read', async () => {
    const raw = jest.fn<Promise<unknown>, [Prisma.Sql]>().mockResolvedValue([]);
    const service = new AcademicContentCurrentAccessService(
      new AcademicContentRecipientReadRepository({
        $queryRaw: raw,
      } as unknown as PrismaService),
      {} as AcademicContentAudienceRepository,
    );
    await expect(
      service.getCurrentParentContent(context, context.studentId, now),
    ).rejects.toMatchObject({ code: 'not_found', httpStatus: 404 });
    expect(raw).toHaveBeenCalledTimes(1);
    expect(raw.mock.calls[0][0].sql).not.toContain('AS "typeSpecificSnapshot"');
    raw
      .mockClear()
      .mockResolvedValueOnce([
        { publicationId: context.studentId, revisionId: context.termId },
      ])
      .mockResolvedValueOnce([]);
    await expect(
      service.getCurrentParentContent(context, context.studentId, now),
    ).rejects.toMatchObject({ code: 'not_found', httpStatus: 404 });
    expect(raw).toHaveBeenCalledTimes(2);
    expect(raw.mock.calls[1][0].sql).toContain('AS "typeSpecificSnapshot"');
    expect(raw.mock.calls[1][0].sql).toContain("e.status = 'ACTIVE'");
    expect(raw.mock.calls[1][0].sql).toContain("p.status = 'PUBLISHED'");
  });
});
