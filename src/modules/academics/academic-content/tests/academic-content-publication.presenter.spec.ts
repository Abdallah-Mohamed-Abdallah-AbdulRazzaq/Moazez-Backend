import { randomUUID } from 'node:crypto';
import {
  AcademicContentPublicationStatus,
  AcademicContentStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AcademicContentRepository } from '../infrastructure/academic-content.repository';
import { presentAcademicContentPublication } from '../presenters/academic-content-publication.presenter';

describe('ACC-7E publication presentation and management projection', () => {
  const instant = new Date('2030-09-15T12:00:00.123Z');
  const publication = {
    publicationId: randomUUID(),
    revisionId: randomUUID(),
    status: AcademicContentPublicationStatus.SCHEDULED,
    sourceContentStatus: AcademicContentStatus.DRAFT,
    publishAt: instant,
    visibleFrom: instant,
    visibleUntil: instant,
    publishedAt: instant,
    expiredAt: instant,
    cancelledAt: instant,
    studentRecipientCount: 2,
    guardianRecipientContextCount: 3,
    createdByUserId: randomUUID(),
    createdAt: instant,
    schoolId: randomUUID(),
    requestFingerprint: 'private',
    recipients: [{ studentId: randomUUID() }],
  };

  it('converts every Date to an ISO string before framework serialization', () => {
    const result = presentAcademicContentPublication(publication);
    for (const key of [
      'publishAt',
      'visibleFrom',
      'visibleUntil',
      'publishedAt',
      'expiredAt',
      'cancelledAt',
      'createdAt',
    ] as const) {
      expect(result[key]).toBe(instant.toISOString());
      expect(typeof result[key]).toBe('string');
    }
    expect(result).not.toHaveProperty('schoolId');
    expect(result).not.toHaveProperty('requestFingerprint');
    expect(result).not.toHaveProperty('recipients');
  });

  it('keeps nullable timestamps explicitly null', () => {
    expect(
      presentAcademicContentPublication({
        ...publication,
        visibleUntil: null,
        publishedAt: null,
        expiredAt: null,
        cancelledAt: null,
      }),
    ).toMatchObject({
      visibleUntil: null,
      publishedAt: null,
      expiredAt: null,
      cancelledAt: null,
    });
  });

  it('uses one owned parent query with a deterministic bounded five-field publication selection', async () => {
    const findFirst = jest
      .fn<Promise<null>, [unknown]>()
      .mockResolvedValue(null);
    const prisma = {
      academicContent: { findFirst },
    } as unknown as PrismaService;
    const contentId = randomUUID();
    const schoolId = randomUUID();
    await new AcademicContentRepository(prisma).findManagementDetail(
      contentId,
      schoolId,
    );
    expect(findFirst).toHaveBeenCalledTimes(1);
    const query = findFirst.mock.calls[0][0] as {
      where: unknown;
      select: { publications: unknown };
    };
    expect(query.where).toEqual({ id: contentId, schoolId, deletedAt: null });
    expect(query.select.publications).toEqual({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 1,
      select: {
        id: true,
        status: true,
        publishAt: true,
        visibleFrom: true,
        visibleUntil: true,
      },
    });
  });
});
