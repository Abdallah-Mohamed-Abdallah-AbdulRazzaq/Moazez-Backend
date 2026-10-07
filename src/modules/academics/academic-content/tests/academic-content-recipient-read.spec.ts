import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AcademicContentCurrentAccessService } from '../application/academic-content-current-access.service';
import { AcademicContentAudienceRepository } from '../infrastructure/academic-content-audience.repository';
import { AcademicContentRecipientReadRepository } from '../infrastructure/academic-content-recipient-read.repository';
import { normalizeAcademicContentRecipientQuery } from '../domain/academic-content-recipient.query';
import { AcademicContentCurrentRecipientContext } from '../domain/academic-content-current-access.policy';

const context: Extract<
  AcademicContentCurrentRecipientContext,
  { actorKind: 'STUDENT' }
> = {
  actorKind: 'STUDENT',
  schoolId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  studentId: '33333333-3333-4333-8333-333333333333',
  enrollmentId: '44444444-4444-4444-8444-444444444444',
  classroomId: '55555555-5555-4555-8555-555555555555',
  academicYearId: '66666666-6666-4666-8666-666666666666',
  termId: '77777777-7777-4777-8777-777777777777',
};
const now = new Date('2026-10-07T10:00:00.000Z');

describe('Core bounded immutable Student recipient reads', () => {
  it('uses one parameterized statement for page and total, even for an empty page', async () => {
    const raw = jest
      .fn<Promise<unknown>, [Prisma.Sql]>()
      .mockResolvedValue([{ publicationId: null, total: 25 }]);
    const reads = new AcademicContentRecipientReadRepository({
      $queryRaw: raw,
    } as unknown as PrismaService);
    const result = await reads.listCurrentStudentPublications(
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
    await service.listCurrentStudentPublications(context, {}, now);
    expect(spy).not.toHaveBeenCalled();
    expect(raw).toHaveBeenCalledTimes(1);
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
      service.getCurrentStudentContent(context, context.studentId, now),
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
      service.getCurrentStudentContent(context, context.studentId, now),
    ).rejects.toMatchObject({ code: 'not_found', httpStatus: 404 });
    expect(raw).toHaveBeenCalledTimes(2);
    expect(raw.mock.calls[1][0].sql).toContain('AS "typeSpecificSnapshot"');
    expect(raw.mock.calls[1][0].sql).toContain("e.status = 'ACTIVE'");
    expect(raw.mock.calls[1][0].sql).toContain("p.status = 'PUBLISHED'");
  });
});
