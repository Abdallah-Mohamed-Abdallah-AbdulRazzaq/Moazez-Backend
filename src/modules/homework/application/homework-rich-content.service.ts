import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getRequestContext } from '../../../common/context/request-context';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TeacherAllocationOperationalWriteGate } from '../../academics/teacher-allocation/application/teacher-allocation-operational-write-gate';
import type { HomeworkAssetActor } from '../domain/homework-question-asset';
import { requireHomeworkScope } from '../homework-context';
import {
  authorizeHomeworkQuestionAssets,
  type HomeworkRichReadPermission,
} from '../infrastructure/homework-question-asset-authorization';
import { HomeworkQuestionAssetsRepository } from '../infrastructure/homework-question-assets.repository';
import type { RichContent } from '../../../common/rich-content/rich-content.types';
import { homeworkRichReferences } from '../domain/homework-rich-content';
import {
  readStoredRichContent,
  richContentFallback,
} from '../../../common/rich-content/rich-content.compatibility';
import { HomeworkAssignmentInvalidQuestionStructureException } from '../domain/homework-question.exceptions';
import { authorizeHomeworkMediaProjection } from './homework-typed-runtime';
import { assertHomeworkMediaAuthorization } from '../infrastructure/homework-media-authorization';
import {
  hasHomeworkRichSelection,
  projectHomeworkRichContent,
  type HomeworkRichQuestion,
} from '../infrastructure/homework-rich-content.projection';

export type HomeworkRichAudience =
  | 'question'
  | 'assignment'
  | 'review'
  | 'student'
  | 'student-submit';

@Injectable()
export class HomeworkRichContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gate: TeacherAllocationOperationalWriteGate,
    private readonly assets: HomeworkQuestionAssetsRepository,
  ) {}

  async actor(
    tx: Prisma.TransactionClient,
    homeworkId: string,
    supplied?: HomeworkAssetActor,
  ): Promise<HomeworkAssetActor> {
    if (supplied) return supplied;
    const scope = requireHomeworkScope();
    if (scope.userType === 'TEACHER') {
      const assignment = await tx.homeworkAssignment.findFirst({
        where: { id: homeworkId, deletedAt: null },
        select: { teacherSubjectAllocationId: true },
      });
      if (!assignment) throw new NotFoundDomainException();
      return {
        surface: 'teacher',
        classId: assignment.teacherSubjectAllocationId,
      };
    }
    if (
      scope.userType !== 'SCHOOL_USER' &&
      scope.userType !== 'ORGANIZATION_USER'
    )
      throw new NotFoundDomainException();
    return { surface: 'core' };
  }

  async assertWrite(
    tx: Prisma.TransactionClient,
    resource: { homeworkId: string; questionId?: string },
    supplied?: HomeworkAssetActor,
    permission?: 'homework.assignments.manage' | 'homework.targets.manage',
  ): Promise<void> {
    await authorizeHomeworkQuestionAssets(
      tx,
      this.gate,
      await this.actor(tx, resource.homeworkId, supplied),
      resource,
      true,
      false,
      undefined,
      permission,
    );
  }

  async assertMediaSource(
    tx: Prisma.TransactionClient,
    resource: { homeworkId: string; questionId: string; assetId: string },
    actor?: HomeworkAssetActor,
    publication = false,
  ): Promise<void> {
    await this.assets.assertMediaStimulus(
      tx,
      await this.actor(tx, resource.homeworkId, actor),
      resource,
      publication,
    );
  }

  async assertStudentWrite(
    tx: Prisma.TransactionClient,
    homeworkId: string,
    student: { studentId: string; enrollmentId: string },
    permission:
      | 'homework.answers.manage'
      | 'homework.submissions.save'
      | 'homework.submissions.submit',
  ): Promise<HomeworkAssetActor> {
    const scope = requireHomeworkScope();
    if (scope.userType !== 'STUDENT') throw new NotFoundDomainException();
    const enrollment = await tx.enrollment.findFirst({
      where: {
        id: student.enrollmentId,
        studentId: student.studentId,
        status: 'ACTIVE',
        endedAt: null,
        deletedAt: null,
        student: {
          is: { userId: scope.actorId, status: 'ACTIVE', deletedAt: null },
        },
      },
      select: { classroomId: true, academicYearId: true, termId: true },
    });
    if (!enrollment) throw new NotFoundDomainException();
    const actor: HomeworkAssetActor = {
      surface: 'student',
      student: { ...student, ...enrollment },
    };
    await authorizeHomeworkQuestionAssets(
      tx,
      this.gate,
      actor,
      { homeworkId },
      false,
      false,
      permission,
      undefined,
      true,
    );
    return actor;
  }

  async assertReviewWrite(
    tx: Prisma.TransactionClient,
    homeworkId: string,
    permission:
      | 'homework.submissions.review'
      | 'homework.assignments.manage' = 'homework.submissions.review',
  ): Promise<void> {
    const actor = await this.actor(tx, homeworkId);
    await authorizeHomeworkQuestionAssets(
      tx,
      this.gate,
      actor,
      { homeworkId },
      false,
      false,
      permission,
      undefined,
      true,
    );
    await assertHomeworkMediaAuthorization(
      tx,
      homeworkId,
      false,
      this.gate,
      true,
    );
    await authorizeHomeworkQuestionAssets(
      tx,
      this.gate,
      actor,
      { homeworkId },
      false,
      false,
      permission,
    );
  }

  async assertStudentMediaSource(
    tx: Prisma.TransactionClient,
    actor: HomeworkAssetActor,
    resource: { homeworkId: string; questionId: string; assetId: string },
    permission:
      | 'homework.answers.manage'
      | 'homework.submissions.save'
      | 'homework.submissions.submit',
  ): Promise<void> {
    await this.assets.assertMediaStimulus(
      tx,
      actor,
      resource,
      false,
      permission,
    );
  }

  async assertAuthorRead(
    tx: Prisma.TransactionClient,
    homeworkId: string,
    supplied?: HomeworkAssetActor,
  ): Promise<boolean> {
    const actor = await this.actor(tx, homeworkId, supplied);
    const permission =
      actor.surface === 'teacher'
        ? 'homework.questions.manage'
        : 'homework.assignments.manage';
    if (
      !(getRequestContext()?.activeMembership?.permissions ?? []).includes(
        permission,
      )
    )
      return false;
    try {
      await authorizeHomeworkQuestionAssets(
        tx,
        this.gate,
        actor,
        { homeworkId },
        false,
        false,
        permission,
      );
      return true;
    } catch (error) {
      if (!(error instanceof NotFoundDomainException)) throw error;
      return false;
    }
  }

  async projectTypedMediaRead(
    homeworkId: string,
    questions: Array<{ type: unknown; id: string; metadata?: unknown }>,
    supplied?: HomeworkAssetActor,
  ): Promise<void> {
    const media = questions.filter((question) => question.type === 'MEDIA');
    if (!media.length) return;
    const actor =
      supplied ??
      (await this.actor(
        this.prisma.scoped as unknown as Prisma.TransactionClient,
        homeworkId,
      ));
    const permissions =
      getRequestContext()?.activeMembership?.permissions ?? [];
    const candidates: HomeworkRichReadPermission[] =
      actor.surface === 'teacher'
        ? ['homework.questions.manage', 'homework.questions.view']
        : ['homework.assignments.manage', 'homework.assignments.view'];
    const permission = candidates.find((candidate) =>
      permissions.includes(candidate),
    );
    if (!permission) return;
    try {
      const views = await this.assets.read(actor, { homeworkId }, permission);
      for (const question of media)
        authorizeHomeworkMediaProjection(
          question,
          new Set(
            views
              .filter(
                (view) =>
                  view.usable && view.asset.homeworkQuestionId === question.id,
              )
              .map((view) => view.asset.id),
          ),
        );
    } catch (error) {
      if (!(error instanceof NotFoundDomainException)) throw error;
    }
  }

  async assertReferences(
    tx: Prisma.TransactionClient,
    homeworkId: string,
    questionId: string,
    content: RichContent,
    optionId?: string,
    publication = false,
  ): Promise<void> {
    const scope = requireHomeworkScope();
    const resourceActor = await this.actor(tx, homeworkId);
    for (const reference of homeworkRichReferences(content))
      await this.assets.assertReference({
        transaction: tx,
        actor: { ...scope, resourceActor },
        schoolId: scope.schoolId,
        owner: {
          domain: 'homework',
          homeworkId,
          questionId,
          ...(optionId ? { optionId } : {}),
        },
        reference,
        audience: 'author',
        publication,
      });
  }

  async assertPublicationDisplay(
    tx: Prisma.TransactionClient,
    homeworkId: string,
    questions: Array<{
      id: string;
      prompt: string;
      instructions: string | null;
      options: Array<{ id: string; text: string }>;
    }>,
  ): Promise<void> {
    if (!questions.length) return;
    const scope = requireHomeworkScope();
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        questionId: string;
        option: boolean;
        value: unknown;
        sqlNull: boolean;
      }>
    >`
      SELECT id, id AS "questionId", false AS option, rich_content AS value, rich_content IS NULL AS "sqlNull"
      FROM homework_questions WHERE school_id = ${scope.schoolId}::uuid AND homework_assignment_id = ${homeworkId}::uuid AND deleted_at IS NULL
      UNION ALL SELECT o.id, q.id AS "questionId", true AS option, o.rich_content AS value, o.rich_content IS NULL AS "sqlNull"
      FROM homework_question_options o JOIN homework_questions q ON q.id=o.homework_question_id AND q.school_id=o.school_id
      WHERE q.school_id = ${scope.schoolId}::uuid AND q.homework_assignment_id = ${homeworkId}::uuid AND q.deleted_at IS NULL AND o.deleted_at IS NULL`;
    for (const row of rows) {
      const question = questions.find((item) => item.id === row.questionId);
      const record = row.option
        ? question?.options.find((item) => item.id === row.id)
        : question;
      if (!record)
        throw new HomeworkAssignmentInvalidQuestionStructureException();
      const rich = readStoredRichContent(row.value, row.sqlNull);
      if (rich.state === 'absent') continue;
      if (rich.state !== 'valid')
        throw new HomeworkAssignmentInvalidQuestionStructureException({
          reason: 'invalid_rich_display',
        });
      const fallback = richContentFallback(
        rich.content,
        row.option ? 'homeworkOption' : 'homeworkQuestion',
      );
      for (const [field, value] of Object.entries(fallback))
        if ((record as Record<string, unknown>)[field] !== value)
          throw new HomeworkAssignmentInvalidQuestionStructureException({
            reason: 'rich_display_mismatch',
          });
      await this.assertReferences(
        tx,
        homeworkId,
        question!.id,
        rich.content,
        row.option ? row.id : undefined,
        true,
      );
    }
  }

  async project(
    homeworkId: string,
    questions: HomeworkRichQuestion[],
    audience: HomeworkRichAudience = 'question',
    supplied?: HomeworkAssetActor,
  ): Promise<void> {
    if (!hasHomeworkRichSelection(questions)) return;
    const scoped = this.prisma.scoped as unknown as PrismaService;
    await scoped.$transaction(
      async (tx) => {
        const actor = await this.actor(tx, homeworkId, supplied);
        if (audience === 'student-submit' && actor.surface !== 'student')
          throw new NotFoundDomainException();
        const permissions =
          getRequestContext()?.activeMembership?.permissions ?? [];
        const candidates: HomeworkRichReadPermission[] =
          audience === 'review'
            ? ['homework.submissions.view', 'homework.submissions.review']
            : audience === 'student-submit'
              ? ['homework.submissions.submit']
              : audience === 'student'
                ? [
                    'homework.assignments.view',
                    'homework.submissions.view',
                    'homework.answers.manage',
                    'homework.submissions.save',
                  ]
                : audience === 'assignment' || actor.surface === 'core'
                  ? ['homework.assignments.view', 'homework.assignments.manage']
                  : ['homework.questions.view', 'homework.questions.manage'];
        const permission = candidates.find((p) => permissions.includes(p));
        if (!permission) throw new NotFoundDomainException();
        await authorizeHomeworkQuestionAssets(
          tx,
          this.gate,
          actor,
          { homeworkId },
          false,
          false,
          permission,
        );
        await projectHomeworkRichContent(
          tx,
          homeworkId,
          questions,
          this.assets,
          actor.surface === 'student' ? 'student' : 'review',
          actor,
        );
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }
}
