import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import {
  DomainException,
  NotFoundDomainException,
} from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { assertAcademicContentAudience } from '../domain/academic-content-audience.policy';
import { canReplaceAcademicContentTargets } from '../domain/academic-content-authoring.policy';
import {
  AcademicContentTargetInput,
  normalizeAcademicContentTargets,
} from '../domain/academic-content-target.policy';
import { AcademicContentRepository } from '../infrastructure/academic-content.repository';
import { AcademicContentContextValidator } from './academic-content-context-validator';
import { AcademicContentTargetValidator } from './academic-content-target-validator';

@Injectable()
export class ReplaceAcademicContentTargetsUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contents: AcademicContentRepository,
    private readonly contextValidator: AcademicContentContextValidator,
    private readonly targetValidator: AcademicContentTargetValidator,
  ) {}

  async execute(
    academicContentId: string,
    targets: readonly AcademicContentTargetInput[],
  ) {
    const context = getRequestContext();
    const schoolId = context?.activeMembership?.schoolId;
    const actor = context?.actor;
    if (
      !schoolId ||
      !actor ||
      !canReplaceAcademicContentTargets(
        actor.userType,
        context?.activeMembership?.permissions ?? [],
      )
    ) {
      throw new DomainException({
        code: 'auth.scope.missing',
        message: 'Academic content target authoring scope is required',
        httpStatus: HttpStatus.FORBIDDEN,
      });
    }
    const content = await this.contents.findByIdInSchool(
      academicContentId,
      schoolId,
    );
    if (!content)
      throw new NotFoundDomainException('Academic content not found');
    await this.contextValidator.validate(content);
    assertAcademicContentAudience(content.type, content.audience);
    const normalized = normalizeAcademicContentTargets(
      content.type,
      actor.userType,
      targets,
    );
    await this.targetValidator.validate(content, normalized, actor);

    // PostgreSQL may abort one SERIALIZABLE contender. Retry the entire locked replace,
    // never only the insertion, so both callers can complete with true replace semantics.
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
            await tx.academicContentTarget.deleteMany({
              where: { schoolId, academicContentId },
            });
            if (normalized.length) {
              await tx.academicContentTarget.createMany({
                data: normalized.map((target) => ({
                  ...target,
                  schoolId,
                  academicContentId,
                  createdByUserId: actor.id,
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
