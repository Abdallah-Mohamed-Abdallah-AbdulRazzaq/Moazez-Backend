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
  ): Promise<void> {
    await authorizeHomeworkQuestionAssets(
      tx,
      this.gate,
      await this.actor(tx, resource.homeworkId, supplied),
      resource,
      true,
    );
  }

  async assertReferences(
    tx: Prisma.TransactionClient,
    homeworkId: string,
    questionId: string,
    content: RichContent,
    optionId?: string,
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
      });
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
