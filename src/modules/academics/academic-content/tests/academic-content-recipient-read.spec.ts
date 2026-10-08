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
  it.each([false, true])(
    'refreshes the final default clock and preserves an explicit clock (explicit=%s)',
    async (explicit) => {
      jest.useFakeTimers().setSystemTime(now);
      const later = new Date(now.getTime() + 1000);
      try {
        const identity = {
          publicationId: context.studentId,
          revisionId: context.termId,
        };
        const reads = {
          findCurrentStudentPublication: jest.fn().mockImplementation(() => {
            jest.setSystemTime(later);
            return Promise.resolve(identity);
          }),
          findCurrentStudentDetail: jest.fn().mockResolvedValue(null),
        };
        const service = new AcademicContentCurrentAccessService(
          reads as unknown as AcademicContentRecipientReadRepository,
          {} as AcademicContentAudienceRepository,
        );
        await expect(
          service.getCurrentStudentContent(
            context,
            context.studentId,
            explicit ? now : undefined,
          ),
        ).rejects.toMatchObject({ code: 'not_found', httpStatus: 404 });
        expect(reads.findCurrentStudentPublication).toHaveBeenCalledWith(
          context,
          context.studentId,
          now,
        );
        expect(reads.findCurrentStudentDetail).toHaveBeenCalledWith(
          context,
          identity,
          explicit ? now : later,
        );
      } finally {
        jest.useRealTimers();
      }
    },
  );
  it.each(['STUDENT', 'PARENT'] as const)(
    '%s selects canonical publication before exact live private File membership',
    async (actorKind) => {
      const raw = jest
        .fn<Promise<unknown>, [Prisma.Sql]>()
        .mockResolvedValue([]);
      const reads = new AcademicContentRecipientReadRepository({
        $queryRaw: raw,
      } as unknown as PrismaService);
      const recipient: AcademicContentCurrentRecipientContext =
        actorKind === 'STUDENT'
          ? { ...context, actorKind }
          : { ...context, actorKind, guardianIds: [context.userId] };
      await expect(
        reads.findCurrentRecipientAsset(
          recipient,
          context.studentId,
          context.enrollmentId,
          now,
        ),
      ).resolves.toBeNull();
      const sql = raw.mock.calls[0][0];
      const canonical = sql.sql.slice(
        0,
        sql.sql.indexOf('SELECT canonical.id'),
      );
      expect(canonical).toContain('canonical_publication AS MATERIALIZED');
      expect(canonical).toContain(
        'ORDER BY p.visible_from DESC, p.id DESC LIMIT 1',
      );
      expect(canonical).not.toContain('academic_content_revision_assets');
      expect(canonical).not.toContain('file_id');
      expect(canonical).toContain('academic_content_revision_targets');
      expect(canonical).toContain('subject_allocations');
      expect(canonical).toContain(
        actorKind === 'PARENT'
          ? 'student_guardian_links'
          : 'actor.id = student.user_id',
      );
      expect(sql.sql).toContain('asset.revision_id = canonical.revision_id');
      expect(sql.sql).toContain('asset.school_id = canonical.school_id');
      expect(sql.sql).toContain('file.school_id = canonical.school_id');
      expect(sql.sql).toContain("file.visibility = 'PRIVATE'");
      expect(sql.sql).toContain(
        'file.deleted_at IS NULL AND file.size_bytes > 0',
      );
      expect(sql.sql).not.toContain('academic_content_audience_recipients');
      expect(sql.sql).not.toContain('can_receive_notifications');
      expect(raw).toHaveBeenCalledTimes(1);
    },
  );
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
