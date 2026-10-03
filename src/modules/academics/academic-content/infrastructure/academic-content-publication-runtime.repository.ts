import { Injectable } from '@nestjs/common';
import {
  AcademicContentPublicationStatus as Status,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  AcademicContentPublicationJobData,
  ACADEMIC_CONTENT_PUBLICATION_RECOVERY_PAGE_SIZE,
} from '../domain/academic-content-publication-runtime.constants';

const SELECT = {
  id: true,
  schoolId: true,
  academicContentId: true,
  publishAt: true,
  visibleUntil: true,
  status: true,
} satisfies Prisma.AcademicContentPublicationSelect;
export type PublicationRuntimeCandidate =
  Prisma.AcademicContentPublicationGetPayload<{
    select: typeof SELECT;
  }>;
export type PublicationRuntimeCursor = { at: Date; id: string };

@Injectable()
export class AcademicContentPublicationRuntimeRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(identity: AcademicContentPublicationJobData) {
    return this.prisma.academicContentPublication.findFirst({
      where: {
        id: identity.publicationId,
        schoolId: identity.schoolId,
        academicContentId: identity.contentId,
        academicContent: { deletedAt: null },
      },
      select: SELECT,
    });
  }

  listDuePublish(now: Date, cursor?: PublicationRuntimeCursor) {
    return this.prisma.academicContentPublication.findMany({
      where: {
        status: Status.SCHEDULED,
        publishAt: { lte: now },
        academicContent: { deletedAt: null },
        ...(cursor
          ? {
              OR: [
                { publishAt: { gt: cursor.at, lte: now } },
                { publishAt: cursor.at, id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      select: SELECT,
      orderBy: [{ publishAt: 'asc' }, { id: 'asc' }],
      take: ACADEMIC_CONTENT_PUBLICATION_RECOVERY_PAGE_SIZE,
    });
  }

  listDueExpiry(now: Date, cursor?: PublicationRuntimeCursor) {
    return this.prisma.academicContentPublication.findMany({
      where: {
        status: Status.PUBLISHED,
        visibleUntil: { not: null, lte: now },
        academicContent: { deletedAt: null },
        ...(cursor
          ? {
              OR: [
                { visibleUntil: { gt: cursor.at, lte: now } },
                { visibleUntil: cursor.at, id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      select: SELECT,
      orderBy: [{ visibleUntil: 'asc' }, { id: 'asc' }],
      take: ACADEMIC_CONTENT_PUBLICATION_RECOVERY_PAGE_SIZE,
    });
  }
}
