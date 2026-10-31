import {
  gradeSubmissionAccessWhere,
  gradeItemAccessWhere,
  assertGradeItemWriteAccess,
  assertGradeSubmissionAccess,
  assertGradeLiveMutationPermission,
} from './grades-resource-access';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { GradeItemUpsertPayload } from '../domain/grade-item-entry-domain';
import { requireGradesScope } from '../../grades-context';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';

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

  /** Serialize current review/lifecycle, the existing GradeItem and its audit. */
  async withSyncTransaction<T>(
    submissionId: string,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.scopedPrisma.$transaction(
      async (tx) => {
        await assertGradeLiveMutationPermission(tx, 'grades.items.manage');
        // The existing access predicate holds Teacher allocation rows before parent locks.
        await assertGradeSubmissionAccess(tx, submissionId);
        const reference = await tx.gradeSubmission.findFirst({
          where: { id: submissionId },
          select: { assessmentId: true, studentId: true },
        });
        if (!reference)
          throw new NotFoundDomainException('Grade submission not found');
        const { schoolId } = requireGradesScope();
        const assessments = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM grade_assessments
        WHERE id=${reference.assessmentId}::uuid AND school_id=${schoolId}::uuid
          AND deleted_at IS NULL FOR UPDATE
      `;
        if (!assessments.length)
          throw new NotFoundDomainException('Grade assessment not found');
        const submissions = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT g.id FROM grade_submissions g
        JOIN grade_assessments a ON a.id=g.assessment_id AND a.school_id=g.school_id
        JOIN students s ON s.id=g.student_id AND s.school_id=g.school_id
        JOIN student_enrollments e ON e.id=g.enrollment_id AND e.student_id=s.id AND e.school_id=g.school_id
        JOIN terms t ON t.id=a.term_id AND t.school_id=g.school_id
        WHERE g.id=${submissionId}::uuid AND g.school_id=${schoolId}::uuid
        FOR UPDATE OF g FOR SHARE OF s, e, t
      `;
        if (!submissions.length)
          throw new NotFoundDomainException('Grade submission not found');
        await assertGradeSubmissionAccess(tx, submissionId);
        await tx.$queryRaw`
        SELECT id FROM grade_items WHERE school_id=${schoolId}::uuid
          AND assessment_id=${reference.assessmentId}::uuid
          AND student_id=${reference.studentId}::uuid FOR UPDATE
      `;
        return operation(tx);
      },
      { maxWait: 5000, timeout: 5000 },
    );
  }

  async findSubmissionForGradeItemSync(
    submissionId: string,
    client: Prisma.TransactionClient = this.scopedPrisma,
  ): Promise<GradeSubmissionForGradeItemSyncRecord | null> {
    return client.gradeSubmission.findFirst({
      where: {
        id: submissionId,
        assessment: { deletedAt: null },
        AND: [await gradeSubmissionAccessWhere(client)],
      },
      ...SUBMISSION_FOR_GRADE_ITEM_SYNC_ARGS,
    });
  }

  async findGradeItemForSubmission(
    params: {
      assessmentId: string;
      studentId: string;
    },
    client: Prisma.TransactionClient = this.scopedPrisma,
  ): Promise<GradeItemSyncRecord | null> {
    return client.gradeItem.findFirst({
      where: {
        assessmentId: params.assessmentId,
        studentId: params.studentId,
        AND: [await gradeItemAccessWhere(client)],
      },
      ...GRADE_ITEM_SYNC_ARGS,
    });
  }

  async upsertGradeItemFromSubmission(
    input: GradeItemUpsertPayload,
    tx: Prisma.TransactionClient,
  ): Promise<GradeItemSyncRecord> {
    await assertGradeItemWriteAccess(tx, input);
    return tx.gradeItem.upsert({
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
