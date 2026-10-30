import type { AnswerAssetView } from '../../files/assessment-media/dto/answer-media.dto';
import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  assertResponseModalities,
  responseAllowsMime,
} from '../../../common/assessment-answer/response-config';
import { TeacherAllocationOperationalWriteGate } from '../../academics/teacher-allocation/application/teacher-allocation-operational-write-gate';
import { AssessmentMediaRepository } from '../../files/assessment-media/infrastructure/assessment-media.repository';
import { AnswerMediaRegistry } from '../../files/assessment-media/infrastructure/answer-media-registry';
import {
  assessmentMediaOwner,
  AssessmentMediaException,
} from '../../files/assessment-media/domain/assessment-media.contract';
import { effectiveAssessmentMediaPolicy } from '../../files/assessment-media/domain/assessment-media.policy';
import {
  assetCategoryForMime,
  type HomeworkAssetActor,
} from '../domain/homework-question-asset';
import { homeworkResponseConfig } from '../domain/homework-response-config';
import { HomeworkAnswerInvalidPayloadException } from '../domain/homework-answer.exceptions';
import { requireHomeworkScope } from '../homework-context';
import { authorizeHomeworkQuestionAssets } from './homework-question-asset-authorization';

const absent = () => new NotFoundDomainException();
export interface HomeworkAnswerMediaResource {
  homeworkId: string;
  questionId: string;
  submissionId?: string;
  classId?: string;
  assetId?: string;
}

@Injectable()
export class HomeworkAnswerMediaRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: AssessmentMediaRepository,
    private readonly registry: AnswerMediaRegistry,
    private readonly gate: TeacherAllocationOperationalWriteGate,
  ) {}

  /** Locator only; every operation repeats ownership/eligibility in its final transaction. */
  async target(input: HomeworkAnswerMediaResource) {
    const scope = requireHomeworkScope();
    if (scope.userType !== 'STUDENT') throw absent();
    const target = await (
      this.prisma.scoped as unknown as PrismaClient
    ).homeworkTarget.findFirst({
      where: {
        schoolId: scope.schoolId,
        homeworkAssignmentId: input.homeworkId,
        student: { userId: scope.actorId, deletedAt: null, status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!target) throw absent();
    return target.id;
  }

  async studentActor(
    input: HomeworkAnswerMediaResource,
  ): Promise<HomeworkAssetActor> {
    const id = await this.target(input);
    const target = await (
      this.prisma.scoped as unknown as PrismaClient
    ).homeworkTarget.findFirstOrThrow({
      where: { id },
      include: { enrollment: true },
    });
    return {
      surface: 'student',
      student: {
        studentId: target.studentId,
        enrollmentId: target.enrollmentId,
        classroomId: target.enrollment.classroomId,
        academicYearId: target.enrollment.academicYearId,
        termId: target.enrollment.termId,
      },
    };
  }

  async bind(
    input: HomeworkAnswerMediaResource,
    uploadId: string,
    replaceAssetId?: string,
  ) {
    const targetId = await this.target(input);
    const owner = assessmentMediaOwner(
      'HOMEWORK_SUBMISSION_MEDIA',
      targetId,
      input.questionId,
    );
    return this.media.answerTransaction(owner, async (tx, policy, binding) => {
      if (binding.homeworkAssignmentId !== input.homeworkId) throw absent();
      // Target lock from the domain authorization serializes even the first insertion.
      const target = await tx.homeworkTarget.findFirstOrThrow({
        where: { id: targetId, schoolId: owner.schoolId },
      });
      let submission = await tx.homeworkSubmission.findFirst({
        where: { homeworkTargetId: targetId, schoolId: owner.schoolId },
      });
      if (submission && submission.status !== 'DRAFT')
        throw new AssessmentMediaException('state_conflict');
      if (!submission)
        submission = await tx.homeworkSubmission.create({
          data: {
            schoolId: owner.schoolId,
            homeworkAssignmentId: input.homeworkId,
            homeworkTargetId: targetId,
            studentId: target.studentId,
            enrollmentId: target.enrollmentId,
          },
        });
      await tx.$queryRaw`SELECT id FROM homework_submission_answers WHERE homework_submission_id=${submission.id}::uuid AND homework_question_id=${input.questionId}::uuid AND school_id=${owner.schoolId}::uuid ORDER BY id FOR UPDATE`;
      const answers = await tx.homeworkSubmissionAnswer.findMany({
        where: {
          homeworkSubmissionId: submission.id,
          homeworkQuestionId: input.questionId,
          schoolId: owner.schoolId,
          deletedAt: null,
        },
      });
      if (answers.length > 1)
        throw new HomeworkAnswerInvalidPayloadException({
          reason: 'duplicate_stored_answers',
        });
      const answer =
        answers[0] ??
        (await tx.homeworkSubmissionAnswer.create({
          data: {
            schoolId: owner.schoolId,
            homeworkAssignmentId: input.homeworkId,
            homeworkTargetId: targetId,
            homeworkSubmissionId: submission.id,
            homeworkQuestionId: input.questionId,
            isDraft: true,
          },
        }));
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
        const asset = await tx.homeworkAnswerAsset.findFirst({
          where: {
            answerMediaClaimId: oldClaim.id,
            homeworkSubmissionAnswerId: answer.id,
            deletedAt: null,
          },
        });
        if (!asset || replaceAssetId)
          throw new AssessmentMediaException('state_conflict');
        return asset;
      }
      if (replaceAssetId) {
        const old = await tx.homeworkAnswerAsset.findFirst({
          where: {
            id: replaceAssetId,
            homeworkSubmissionAnswerId: answer.id,
            deletedAt: null,
          },
        });
        if (!old) throw absent();
        await tx.homeworkAnswerAsset.update({
          where: { id: old.id },
          data: { deletedAt: new Date() },
        });
      }
      const assets = await tx.homeworkAnswerAsset.findMany({
        where: { homeworkSubmissionAnswerId: answer.id, deletedAt: null },
        select: { file: { select: { mimeType: true } } },
      });
      try {
        assertResponseModalities({
          config: binding.responseConfig,
          hasText: !!answer.textAnswer?.trim(),
          assets: [...assets.map((a) => a.file), file],
          required: false,
          phase: 'draft',
        });
      } catch {
        throw new HomeworkAnswerInvalidPayloadException({
          reason: 'invalid_response_modalities',
        });
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
          contextId: targetId,
          questionId: input.questionId,
          homeworkAnswerId: answer.id,
          homeworkSubmissionId: submission.id,
          homeworkAssignmentId: input.homeworkId,
        },
      });
      const asset = await tx.homeworkAnswerAsset.create({
        data: {
          schoolId: owner.schoolId,
          homeworkSubmissionAnswerId: answer.id,
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

  async remove(input: HomeworkAnswerMediaResource & { assetId: string }) {
    const targetId = await this.target(input);
    const owner = assessmentMediaOwner(
      'HOMEWORK_SUBMISSION_MEDIA',
      targetId,
      input.questionId,
    );
    await this.media.answerTransaction(owner, async (tx) => {
      const asset = await tx.homeworkAnswerAsset.findFirst({
        where: {
          id: input.assetId,
          deletedAt: null,
          homeworkSubmissionAnswer: {
            homeworkTargetId: targetId,
            homeworkQuestionId: input.questionId,
            homeworkAssignmentId: input.homeworkId,
            deletedAt: null,
            homeworkSubmission: { status: 'DRAFT' },
          },
        },
      });
      if (!asset) throw absent();
      await tx.$queryRaw`SELECT id FROM homework_submission_answers WHERE id=${asset.homeworkSubmissionAnswerId}::uuid AND school_id=${owner.schoolId}::uuid FOR UPDATE`;
      await tx.homeworkAnswerAsset.update({
        where: { id: asset.id },
        data: { deletedAt: new Date() },
      });
      await this.audit(
        tx,
        asset.homeworkSubmissionAnswerId,
        'remove',
        asset.id,
      );
    });
  }

  read(actor: HomeworkAssetActor, input: HomeworkAnswerMediaResource) {
    return (this.prisma.scoped as unknown as PrismaClient).$transaction(
      async (tx) => {
        const { scope, assignment } = await authorizeHomeworkQuestionAssets(
          tx,
          this.gate,
          actor,
          input,
          false,
          false,
          'homework.submissions.view',
          undefined,
          true,
        );
        const answers = await tx.homeworkSubmissionAnswer.findMany({
          where: {
            schoolId: scope.schoolId,
            homeworkAssignmentId: input.homeworkId,
            homeworkQuestionId: input.questionId,
            homeworkSubmissionId: input.submissionId,
            deletedAt: null,
            AND: [
              {
                homeworkSubmission: {
                  student: { deletedAt: null, status: 'ACTIVE' },
                  enrollment: {
                    deletedAt: null,
                    status: 'ACTIVE',
                    endedAt: null,
                    classroomId: assignment.classroomId,
                    academicYearId: assignment.academicYearId,
                    OR: [{ termId: null }, { termId: assignment.termId }],
                  },
                },
              },
            ],
            ...(actor.surface === 'student'
              ? { homeworkTarget: { studentId: actor.student.studentId } }
              : {
                  homeworkSubmission: {
                    status: { in: ['SUBMITTED', 'LATE', 'REVIEWED'] },
                  },
                }),
          },
          include: {
            assets: {
              where: {
                deletedAt: null,
                ...(input.assetId ? { id: input.assetId } : {}),
              },
              include: { mediaClaim: { include: { intent: true } } },
            },
            homeworkQuestion: { select: { type: true, responseConfig: true } },
          },
        });
        if (answers.length > 1) throw absent();
        const policy = effectiveAssessmentMediaPolicy(
          await tx.schoolAssessmentMediaPolicy.findFirst({
            where: { schoolId: scope.schoolId },
          }),
        );
        const views: AnswerAssetView[] = [];
        for (const answer of answers) {
          const config = homeworkResponseConfig(
            answer.homeworkQuestion.type,
            answer.homeworkQuestion.responseConfig,
          );
          if (!config) throw absent();
          for (const asset of answer.assets) {
            const intent = asset.mediaClaim?.intent;
            if (
              !intent ||
              intent.questionId !== input.questionId ||
              intent.contextId !== answer.homeworkTargetId
            )
              throw absent();
            const file = await this.registry.verifyRead(tx, {
              fileId: asset.fileId,
              uploadId: intent.uploadId,
              contextId: answer.homeworkTargetId,
              questionId: input.questionId,
              creatorId: intent.actorId,
              purpose: 'HOMEWORK_SUBMISSION_MEDIA',
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
    const scope = requireHomeworkScope();
    await tx.auditLog.create({
      data: {
        schoolId: scope.schoolId,
        organizationId: scope.organizationId,
        actorId: scope.actorId,
        outcome: 'SUCCESS',
        module: 'homework',
        action: `answer_media.${action}`,
        resourceType: 'HomeworkSubmissionAnswer',
        resourceId: answerId,
        after: { assetId },
      },
    });
  }
}
