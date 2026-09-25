import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DomainException,
  NotFoundDomainException,
} from '../../../../common/exceptions/domain-exception';
import { NormalizedAcademicContentTarget } from '../domain/academic-content-target.policy';
import { AcademicContentRecord } from './academic-content.repository';
import {
  assertAcademicContentMutable,
  assertAcademicContentTermWritable,
} from '../domain/academic-content-lifecycle.policy';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

@Injectable()
export class AcademicContentTargetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async replace(input: {
    content: AcademicContentRecord;
    targets: readonly NormalizedAcademicContentTarget[];
    actorId: string;
  }) {
    const { content, targets, actorId } = input;
    const { id: academicContentId, schoolId } = content;
    // PostgreSQL may abort one SERIALIZABLE contender. Retry the entire locked
    // replacement so concurrent callers retain true replace semantics.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const locked = await tx.$queryRaw<Array<{ id: string }>>`
              SELECT "id" FROM "academic_contents"
              WHERE "id" = ${academicContentId}::uuid
                AND "school_id" = ${schoolId}::uuid
                AND "deleted_at" IS NULL
              FOR UPDATE
            `;
            if (locked.length !== 1)
              throw new NotFoundDomainException('Academic content not found');
            const current = await tx.academicContent.findFirst({
              where: { id: academicContentId, schoolId, deletedAt: null },
              select: {
                academicYearId: true,
                termId: true,
                type: true,
                audience: true,
                status: true,
              },
            });
            if (
              !current ||
              current.academicYearId !== content.academicYearId ||
              current.termId !== content.termId ||
              current.type !== content.type ||
              current.audience !== content.audience
            ) {
              throw new DomainException({
                code: 'validation.failed',
                message: 'Academic content changed during target replacement',
              });
            }
            assertAcademicContentMutable(current.status);
            const term = await tx.term.findFirst({
              where: { id: current.termId, schoolId, deletedAt: null },
              select: { startDate: true, endDate: true, isActive: true },
            });
            if (!term) throw new NotFoundDomainException('Term not found');
            assertAcademicContentTermWritable(term, new Date());
            await tx.academicContentTarget.deleteMany({
              where: { schoolId, academicContentId },
            });
            if (targets.length) {
              await tx.academicContentTarget.createMany({
                data: targets.map((target) => ({
                  ...target,
                  schoolId,
                  academicContentId,
                  createdByUserId: actorId,
                })),
              });
            }
            return tx.academicContentTarget.findMany({
              where: { schoolId, academicContentId },
              orderBy: [{ identityFingerprint: 'asc' }, { id: 'asc' }],
            });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 20_000,
            timeout: 20_000,
          },
        );
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034' ||
          attempt === 2
        )
          throw error;
      }
    }
    throw new Error('Unreachable target replacement retry state');
  }
}
