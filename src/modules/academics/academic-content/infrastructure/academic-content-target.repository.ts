import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { NormalizedAcademicContentTarget } from '../domain/academic-content-target.policy';
import { AcademicContentRecord } from './academic-content.repository';
import {
  assertAcademicContentMutable,
  assertAcademicContentTermWritable,
} from '../domain/academic-content-lifecycle.policy';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { assertExistingTypeDetailReferencesCompatible } from './academic-content-type-detail.repository';
import { TeacherAllocationOperationalWriteGate } from '../../teacher-allocation/application/teacher-allocation-operational-write-gate';
import { AcademicContentTargetValidator } from '../application/academic-content-target-validator';
import { AcademicContentValidationRepository } from './academic-content-validation.repository';
import { assertAcademicContentAudience } from '../domain/academic-content-audience.policy';
import { UserType } from '@prisma/client';
import {
  AcademicContentTeacherWriteScope,
  assertTeacherAcademicContentClassIds,
  authorizeTeacherAcademicContentMutation,
  teacherAcademicContentTargets,
} from './academic-content-teacher-write.authorization';

type TargetReplacement = {
  content: AcademicContentRecord;
  targets: readonly NormalizedAcademicContentTarget[];
  actorId: string;
};
type TeacherTargetReplacement = AcademicContentTeacherWriteScope & {
  contentId: string;
  classIds: readonly string[];
};

@Injectable()
export class AcademicContentTargetRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly allocationWriteGate?: TeacherAllocationOperationalWriteGate,
  ) {}

  async replace(input: TargetReplacement | TeacherTargetReplacement) {
    const teacher = 'teacherUserId' in input ? input : undefined;
    const content = 'content' in input ? input.content : undefined;
    const actorId = input.actorId;
    const academicContentId = content?.id ?? teacher!.contentId;
    const schoolId = content?.schoolId ?? teacher!.schoolId;
    if (teacher) assertTeacherAcademicContentClassIds(teacher.classIds);
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
                id: true,
                schoolId: true,
                createdByUserId: true,
                academicYearId: true,
                termId: true,
                type: true,
                audience: true,
                status: true,
              },
            });
            if (
              !current ||
              (content &&
                (current.academicYearId !== content.academicYearId ||
                  current.termId !== content.termId ||
                  current.type !== content.type ||
                  current.audience !== content.audience))
            ) {
              throw new DomainException({
                code: 'validation.failed',
                message: 'Academic content changed during target replacement',
              });
            }
            let targets: readonly NormalizedAcademicContentTarget[];
            if (teacher) {
              const allocations = await authorizeTeacherAcademicContentMutation(
                tx,
                this.allocationWriteGate,
                { ...teacher, id: academicContentId },
                current.createdByUserId,
                teacher.classIds,
              );
              const requested = allocations.filter((allocation) =>
                teacher.classIds.includes(allocation.id),
              );
              if (
                requested.length !== teacher.classIds.length ||
                requested.some(
                  (allocation) => allocation.termId !== current.termId,
                ) ||
                new Set(requested.map((allocation) => allocation.subjectId))
                  .size !== 1
              )
                throw new ValidationDomainException(
                  'Teacher classes must share the content term and one subject',
                );
              assertAcademicContentAudience(current.type, current.audience);
              targets = teacherAcademicContentTargets(current.type, requested);
              await new AcademicContentTargetValidator(
                new AcademicContentValidationRepository(tx),
              ).validate(current, targets, {
                id: teacher.teacherUserId,
                userType: UserType.TEACHER,
              });
            } else {
              targets = (input as TargetReplacement).targets;
            }
            assertAcademicContentMutable(current.status);
            const term = await tx.term.findFirst({
              where: { id: current.termId, schoolId, deletedAt: null },
              select: { startDate: true, endDate: true, isActive: true },
            });
            if (!term) throw new NotFoundDomainException('Term not found');
            assertAcademicContentTermWritable(term, new Date());
            await assertExistingTypeDetailReferencesCompatible(
              tx,
              {
                id: academicContentId,
                schoolId,
                academicYearId: current.academicYearId,
                termId: current.termId,
                type: current.type,
              },
              targets.map((target) => ({
                scopeType: target.scopeType,
                subjectId: target.subjectId ?? '',
                stageId: target.stageId,
                gradeId: target.gradeId,
                sectionId: target.sectionId,
                classroomId: target.classroomId,
              })),
            );
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
