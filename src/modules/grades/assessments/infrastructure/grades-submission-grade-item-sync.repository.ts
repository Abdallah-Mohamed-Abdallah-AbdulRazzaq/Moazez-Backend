import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { GradeItemUpsertPayload } from '../domain/grade-item-entry-domain';

const SUBMISSION_FOR_GRADE_ITEM_SYNC_ARGS =
  Prisma.validator<Prisma.GradeSubmissionDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      assessmentId: true,
      termId: true,
      studentId: true,
      enrollmentId: true,
      status: true,
      correctedAt: true,
      totalScore: true,
      maxScore: true,
      assessment: {
        select: {
          id: true,
          schoolId: true,
          academicYearId: true,
          termId: true,
          deliveryMode: true,
          approvalStatus: true,
          lockedAt: true,
          maxScore: true,
          term: {
            select: {
              id: true,
              academicYearId: true,
              isActive: true,
            },
          },
        },
      },
      student: {
        select: {
          id: true,
          schoolId: true,
          status: true,
          deletedAt: true,
        },
      },
      enrollment: {
        select: {
          id: true,
          schoolId: true,
          studentId: true,
          academicYearId: true,
          termId: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });

const GRADE_ITEM_SYNC_ARGS = Prisma.validator<Prisma.GradeItemDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    termId: true,
    assessmentId: true,
    studentId: true,
    enrollmentId: true,
    score: true,
    status: true,
    comment: true,
    enteredById: true,
    enteredAt: true,
    createdAt: true,
    updatedAt: true,
  },
});

export type GradeSubmissionForGradeItemSyncRecord =
  Prisma.GradeSubmissionGetPayload<typeof SUBMISSION_FOR_GRADE_ITEM_SYNC_ARGS>;

export type GradeItemSyncRecord = Prisma.GradeItemGetPayload<
  typeof GRADE_ITEM_SYNC_ARGS
>;

@Injectable()
export class GradesSubmissionGradeItemSyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findSubmissionForGradeItemSync(
    submissionId: string,
  ): Promise<GradeSubmissionForGradeItemSyncRecord | null> {
    return this.scopedPrisma.gradeSubmission.findFirst({
      where: {
        id: submissionId,
        assessment: { deletedAt: null },
      },
      ...SUBMISSION_FOR_GRADE_ITEM_SYNC_ARGS,
    });
  }

  findGradeItemForSubmission(params: {
    assessmentId: string;
    studentId: string;
  }): Promise<GradeItemSyncRecord | null> {
    return this.scopedPrisma.gradeItem.findFirst({
      where: {
        assessmentId: params.assessmentId,
        studentId: params.studentId,
      },
      ...GRADE_ITEM_SYNC_ARGS,
    });
  }

  upsertGradeItemFromSubmission(
    input: GradeItemUpsertPayload,
  ): Promise<GradeItemSyncRecord> {
    return this.scopedPrisma.gradeItem.upsert({
      where: {
        schoolId_assessmentId_studentId: {
          schoolId: input.schoolId,
          assessmentId: input.assessmentId,
          studentId: input.studentId,
        },
      },
      create: this.buildGradeItemCreateInput(input),
      update: this.buildGradeItemUpdateInput(input),
      ...GRADE_ITEM_SYNC_ARGS,
    });
  }

  private buildGradeItemCreateInput(
    input: GradeItemUpsertPayload,
  ): Prisma.GradeItemUncheckedCreateInput {
    return {
      schoolId: input.schoolId,
      termId: input.termId,
      assessmentId: input.assessmentId,
      studentId: input.studentId,
      enrollmentId: input.enrollmentId,
      score: this.toNullableDecimal(input.score),
      status: input.status,
      comment: input.comment,
      enteredById: input.enteredById,
      enteredAt: input.enteredAt,
    };
  }

  private buildGradeItemUpdateInput(
    input: GradeItemUpsertPayload,
  ): Prisma.GradeItemUncheckedUpdateInput {
    return {
      termId: input.termId,
      enrollmentId: input.enrollmentId,
      score: this.toNullableDecimal(input.score),
      status: input.status,
      comment: input.comment,
      enteredById: input.enteredById,
      enteredAt: input.enteredAt,
    };
  }

  private toNullableDecimal(value: number | null): Prisma.Decimal | null {
    return value === null ? null : new Prisma.Decimal(value);
  }
}
