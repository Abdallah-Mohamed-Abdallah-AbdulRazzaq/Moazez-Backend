import type { AnswerAssetView } from '../../../files/assessment-media/dto/answer-media.dto';
import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  assertResponseModalities,
  responseAllowsMime,
} from '../../../../common/assessment-answer/response-config';
import { AssessmentMediaRepository } from '../../../files/assessment-media/infrastructure/assessment-media.repository';
import { AnswerMediaRegistry } from '../../../files/assessment-media/infrastructure/answer-media-registry';
import {
  assessmentMediaOwner,
  AssessmentMediaException,
} from '../../../files/assessment-media/domain/assessment-media.contract';
import { effectiveAssessmentMediaPolicy } from '../../../files/assessment-media/domain/assessment-media.policy';
import { assetCategoryForMime } from '../../../files/assessment-media/domain/assessment-asset-content';
import { requireGradesScope } from '../../grades-context';
import { gradeResponseConfig } from '../domain/grade-response-config';
import {
  assertGradeLiveMutationPermission,
  assertGradeSubmissionAccess,
} from './grades-resource-access';
import { ownedAllocationWhere } from '../../../academics/teacher-allocation/domain/owned-allocation';

const absent = () => new NotFoundDomainException();
export interface GradeAnswerMediaResource {
  assessmentId: string;
  submissionId: string;
  questionId: string;
  assetId?: string;
  classId?: string;
}

@Injectable()
export class GradeAnswerMediaRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: AssessmentMediaRepository,
    private readonly registry: AnswerMediaRegistry,
  ) {}

  async locate(
    submissionId: string,
    questionId: string,
  ): Promise<GradeAnswerMediaResource> {
    const scope = requireGradesScope();
    const submission = await (
      this.prisma.scoped as unknown as PrismaClient
    ).gradeSubmission.findFirst({
      where: { id: submissionId, schoolId: scope.schoolId },
      select: { assessmentId: true },
    });
    if (!submission) throw absent();
    return { assessmentId: submission.assessmentId, submissionId, questionId };
  }

  async studentResource(input: GradeAnswerMediaResource) {
    const scope = requireGradesScope();
    if (scope.userType !== 'STUDENT') throw absent();
    const submission = await (
      this.prisma.scoped as unknown as PrismaClient
    ).gradeSubmission.findFirst({
      where: {
        id: input.submissionId,
        assessmentId: input.assessmentId,
        schoolId: scope.schoolId,
        student: { userId: scope.actorId, deletedAt: null, status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!submission) throw absent();
  }

  async bind(
    input: GradeAnswerMediaResource,
    uploadId: string,
    replaceAssetId?: string,
  ) {
    const owner = assessmentMediaOwner(
      'GRADE_SUBMISSION_MEDIA',
      input.submissionId,
      input.questionId,
    );
    return this.media.answerTransaction(owner, async (tx, policy, binding) => {
      if (binding.gradeAssessmentId !== input.assessmentId) throw absent();
      await tx.$queryRaw`SELECT id FROM grade_submission_answers WHERE submission_id=${input.submissionId}::uuid AND question_id=${input.questionId}::uuid AND school_id=${owner.schoolId}::uuid FOR UPDATE`;
      const question = await tx.gradeAssessmentQuestion.findFirstOrThrow({
        where: {
          id: input.questionId,
          assessmentId: input.assessmentId,
          schoolId: owner.schoolId,
        },
        select: { points: true },
      });
      let answer = await tx.gradeSubmissionAnswer.findFirst({
        where: {
          schoolId: owner.schoolId,
          submissionId: input.submissionId,
          questionId: input.questionId,
        },
      });
      if (!answer)
        answer = await tx.gradeSubmissionAnswer.create({
          data: {
            schoolId: owner.schoolId,
            submissionId: input.submissionId,
            assessmentId: input.assessmentId,
            studentId: binding.studentId,
            questionId: input.questionId,
            maxPoints: question.points,
            answerJson: Prisma.DbNull,
          },
        });
      const { intent, file } = await this.registry.resolve(
        tx,
        owner,
        uploadId,
        policy,
      );
      const oldClaim = await tx.assessmentAnswerMediaClaim.findFirst({
        where: { intentId: intent.id },
      });
      if (oldClaim) {
        const asset = await tx.gradeSubmissionAnswerAsset.findFirst({
          where: {
            answerMediaClaimId: oldClaim.id,
            answerId: answer.id,
            deletedAt: null,
          },
        });
        if (!asset || replaceAssetId)
          throw new AssessmentMediaException('state_conflict');
        return asset;
      }
      if (replaceAssetId) {
        const old = await tx.gradeSubmissionAnswerAsset.findFirst({
          where: { id: replaceAssetId, answerId: answer.id, deletedAt: null },
        });
        if (!old) throw absent();
        await tx.gradeSubmissionAnswerAsset.update({
          where: { id: old.id },
          data: { deletedAt: new Date() },
        });
      }
      const assets = await tx.gradeSubmissionAnswerAsset.findMany({
        where: { answerId: answer.id, deletedAt: null },
        select: { file: { select: { mimeType: true } } },
      });
      try {
        assertResponseModalities({
          config: binding.responseConfig,
          hasText: !!answer.answerText?.trim(),
          assets: [...assets.map((a) => a.file), file],
          required: false,
          phase: 'draft',
        });
      } catch {
        throw new ValidationDomainException(
          'Invalid answer response modalities',
        );
      }
      const claim = await tx.assessmentAnswerMediaClaim.create({
        data: {
          intentId: intent.id,
          fileId: file.id,
          schoolId: owner.schoolId,
          organizationId: owner.organizationId,
          actorId: owner.actorId,
          studentId: binding.studentId,
          purpose: owner.purpose,
          contextId: input.submissionId,
          questionId: input.questionId,
          gradeAnswerId: answer.id,
          gradeAssessmentId: input.assessmentId,
        },
      });
      const asset = await tx.gradeSubmissionAnswerAsset.create({
        data: {
          schoolId: owner.schoolId,
          answerId: answer.id,
          fileId: file.id,
          answerMediaClaimId: claim.id,
          createdByUserId: owner.actorId,
          category: assetCategoryForMime(file.mimeType),
        },
      });
      await this.audit(tx, answer.id, 'bind', asset.id);
      return asset;
    });
  }

  async remove(input: GradeAnswerMediaResource & { assetId: string }) {
    const owner = assessmentMediaOwner(
      'GRADE_SUBMISSION_MEDIA',
      input.submissionId,
      input.questionId,
    );
    await this.media.answerTransaction(owner, async (tx, _policy, binding) => {
      if (binding.gradeAssessmentId !== input.assessmentId) throw absent();
      const asset = await tx.gradeSubmissionAnswerAsset.findFirst({
        where: {
          id: input.assetId,
          deletedAt: null,
          gradeSubmissionAnswer: {
            submissionId: input.submissionId,
            questionId: input.questionId,
            assessmentId: input.assessmentId,
          },
        },
      });
      if (!asset) throw absent();
      await tx.$queryRaw`SELECT id FROM grade_submission_answers WHERE id=${asset.answerId}::uuid AND school_id=${owner.schoolId}::uuid FOR UPDATE`;
      await tx.gradeSubmissionAnswerAsset.update({
        where: { id: asset.id },
        data: { deletedAt: new Date() },
      });
      await this.audit(tx, asset.answerId, 'remove', asset.id);
    });
  }

  read(
    input: GradeAnswerMediaResource,
    released?: {
      audience: 'STUDENT' | 'PARENT';
      authorize: (tx: Prisma.TransactionClient) => Promise<void>;
    },
  ) {
    return (this.prisma.scoped as unknown as PrismaClient).$transaction(
      async (tx) => {
        const scope = requireGradesScope();
        if (released) {
          if (scope.userType !== released.audience) throw absent();
          await assertGradeLiveMutationPermission(
            tx,
            'grades.assessments.view',
          );
          await released.authorize(tx);
        } else {
          if (
            ![
              'STUDENT',
              'TEACHER',
              'SCHOOL_USER',
              'ORGANIZATION_USER',
            ].includes(scope.userType)
          )
            throw absent();
          await assertGradeLiveMutationPermission(
            tx,
            'grades.submissions.view',
          );
          await assertGradeSubmissionAccess(tx, input.submissionId);
        }
        const submission = await tx.gradeSubmission.findFirst({
          where: {
            id: input.submissionId,
            assessmentId: input.assessmentId,
            schoolId: scope.schoolId,
          },
          include: { assessment: true, enrollment: true },
        });
        if (
          !submission ||
          (scope.userType !== 'STUDENT' && submission.status === 'IN_PROGRESS')
        )
          throw absent();
        if (scope.userType === 'TEACHER') {
          if (!input.classId || !submission.enrollment) throw absent();
          const allocation = await tx.teacherSubjectAllocation.findFirst({
            where: {
              AND: [
                ownedAllocationWhere(scope.actorId),
                {
                  id: input.classId,
                  classroomId: submission.enrollment.classroomId,
                  subjectId: submission.assessment.subjectId,
                  termId: submission.assessment.termId,
                  term: {
                    academicYearId: submission.assessment.academicYearId,
                  },
                },
              ],
            },
            select: { id: true },
          });
          if (!allocation) throw absent();
        }
        const answer = await tx.gradeSubmissionAnswer.findFirst({
          where: {
            submissionId: input.submissionId,
            questionId: input.questionId,
            schoolId: scope.schoolId,
          },
          include: {
            question: {
              select: { type: true, responseConfig: true, deletedAt: true },
            },
            assets: {
              where: {
                deletedAt: null,
                ...(input.assetId ? { id: input.assetId } : {}),
              },
              include: { mediaClaim: { include: { intent: true } } },
            },
          },
        });
        if (!answer) return [];
        const config = gradeResponseConfig(
          answer.question.type,
          answer.question.responseConfig,
        );
        if (answer.question.deletedAt || !config) throw absent();
        const policy = effectiveAssessmentMediaPolicy(
          await tx.schoolAssessmentMediaPolicy.findFirst({
            where: { schoolId: scope.schoolId },
          }),
        );
        const views: AnswerAssetView[] = [];
        for (const asset of answer.assets) {
          const intent = asset.mediaClaim?.intent;
          if (
            !intent ||
            intent.questionId !== input.questionId ||
            intent.contextId !== input.submissionId
          )
            throw absent();
          const file = await this.registry.verifyRead(tx, {
            fileId: asset.fileId,
            uploadId: intent.uploadId,
            contextId: input.submissionId,
            questionId: input.questionId,
            creatorId: intent.actorId,
            purpose: 'GRADE_SUBMISSION_MEDIA',
          });
          if (
            !policy.allowedMimeTypes.includes(file.mimeType) ||
            !responseAllowsMime(config, file.mimeType)
          )
            throw absent();
          views.push({
            asset,
            file,
            previewAllowed: policy.allowInlinePreview,
            downloadAllowed: policy.allowDownload,
          });
        }
        return views;
      },
    );
  }

  private async audit(
    tx: Prisma.TransactionClient,
    answerId: string,
    action: string,
    assetId: string,
  ) {
    const scope = requireGradesScope();
    await tx.auditLog.create({
      data: {
        schoolId: scope.schoolId,
        organizationId: scope.organizationId,
        actorId: scope.actorId,
        outcome: 'SUCCESS',
        module: 'grades',
        action: `answer_media.${action}`,
        resourceType: 'GradeSubmissionAnswer',
        resourceId: answerId,
        after: { assetId },
      },
    });
  }
}
