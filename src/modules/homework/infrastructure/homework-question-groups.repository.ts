import { Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../common/exceptions/domain-exception';
import {
  groupOrder,
  groupReferences,
  groupStimulus,
  groupText,
  mixedQuestionLayout,
} from '../../../common/question-groups/question-group';
import {
  attachQuestionGroupContext,
  type QuestionGroupContext,
} from '../../../common/question-groups/question-group.projection';
import type {
  CreateQuestionGroupDto,
  UpdateQuestionGroupDto,
  ChangeQuestionGroupLayoutDto,
} from '../../../common/question-groups/question-group.dto';
import { requireHomeworkScope } from '../homework-context';
import type { HomeworkAssetActor } from '../domain/homework-question-asset';
import { TeacherAllocationOperationalWriteGate } from '../../academics/teacher-allocation/application/teacher-allocation-operational-write-gate';
import {
  QuestionGroupMedia,
  presentGroupAsset,
} from '../../files/assessment-media/infrastructure/question-group-media';
import type { CreateQuestionGroupAssetDto } from '../../files/assessment-media/dto/question-group-asset.dto';
import { authorizeHomeworkQuestionAssets } from './homework-question-asset-authorization';
import { HomeworkQuestionReadOnlyException } from '../domain/homework-question.exceptions';
const absent = () => new NotFoundDomainException();
const conflict = () =>
  new DomainException({
    code: 'question_group.conflict',
    message: 'Question group membership changed',
    httpStatus: HttpStatus.CONFLICT,
  });
type Resource = { homeworkId: string; groupId?: string; assetId?: string };
@Injectable()
export class HomeworkQuestionGroupsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gate: TeacherAllocationOperationalWriteGate,
    private readonly media: QuestionGroupMedia,
  ) {}
  private transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return (this.prisma.scoped as unknown as PrismaClient).$transaction(
      async (tx) => operation(tx),
      { maxWait: 5000, timeout: 15000 },
    );
  }
  private async authorize(
    tx: Prisma.TransactionClient,
    actor: HomeworkAssetActor,
    input: Resource,
    write = false,
    managed = false,
  ) {
    const readPermission =
      actor.surface === 'teacher'
        ? 'homework.submissions.view'
        : 'homework.assignments.view';
    const { scope } = await authorizeHomeworkQuestionAssets(
      tx,
      this.gate,
      actor,
      input,
      write,
      managed,
      write ? undefined : readPermission,
    );
    if (
      write &&
      (await tx.homeworkSubmission.count({
        where: { homeworkAssignmentId: input.homeworkId },
      }))
    )
      throw new HomeworkQuestionReadOnlyException();
    return scope;
  }
  private async lock(tx: Prisma.TransactionClient, parentId: string) {
    const scope = requireHomeworkScope();
    await tx.$queryRaw`SELECT id FROM homework_question_groups WHERE school_id=${scope.schoolId}::uuid AND homework_assignment_id=${parentId}::uuid AND deleted_at IS NULL ORDER BY id FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM homework_questions WHERE school_id=${scope.schoolId}::uuid AND homework_assignment_id=${parentId}::uuid AND deleted_at IS NULL ORDER BY id FOR UPDATE`;
  }
  private async group(
    tx: Prisma.TransactionClient,
    input: Resource & { groupId: string },
  ) {
    const group = await tx.homeworkQuestionGroup.findFirst({
      where: {
        id: input.groupId,
        homeworkAssignmentId: input.homeworkId,
        schoolId: requireHomeworkScope().schoolId,
        deletedAt: null,
      },
    });
    if (!group) throw absent();
    return group;
  }
  async read(actor: HomeworkAssetActor, input: Resource) {
    return this.transaction(async (tx) => {
      await this.authorize(tx, actor, input);
      await tx.$queryRaw`SELECT id FROM homework_assignments WHERE id=${input.homeworkId}::uuid AND school_id=${requireHomeworkScope().schoolId}::uuid FOR SHARE`;
      return this.project(tx, input.homeworkId);
    });
  }
  /** Internal display hook, called only after its consumer's existing parent authorization. */
  async project(
    tx: Prisma.TransactionClient,
    parentId: string,
    records?: readonly { id: string }[],
    publication = false,
  ) {
    const scope = requireHomeworkScope();
    const parents = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM homework_assignments WHERE id=${parentId}::uuid AND school_id=${scope.schoolId}::uuid AND deleted_at IS NULL FOR SHARE`;
    if (!parents.length) throw absent();
    const groups = await tx.homeworkQuestionGroup.findMany({
      where: {
        homeworkAssignmentId: parentId,
        schoolId: scope.schoolId,
        deletedAt: null,
      },
      orderBy: [{ layoutOrder: 'asc' }, { id: 'asc' }],
      include: {
        assets: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        },
      },
      take: 101,
    });
    if (groups.length > 100)
      throw new ValidationDomainException('Question group capacity exceeded');
    const questions = await tx.homeworkQuestion.findMany({
      where: {
        homeworkAssignmentId: parentId,
        schoolId: scope.schoolId,
        deletedAt: null,
      },
      select: {
        id: true,
        groupId: true,
        sortOrder: true,
        layoutOrder: true,
        points: true,
      },
    });
    const layout = mixedQuestionLayout(questions, groups);
    if (!groups.length && !questions.some((q) => q.layoutOrder !== null)) {
      if (records) attachQuestionGroupContext(records, undefined, new Map());
      return { groups: [], displayItems: layout.displayItems };
    }
    const output: QuestionGroupContext['groups'] = [];
    for (const group of groups) {
      const questionIds = layout.childIds.get(group.id)!;
      if (questionIds.length > 100)
        throw new ValidationDomainException('Question group capacity exceeded');
      const views = await Promise.all(
        group.assets.map((asset) =>
          this.media.view(tx, 'HOMEWORK_ASSIGNMENT_MEDIA', parentId, asset),
        ),
      );
      let stimulus: ReturnType<typeof groupStimulus> = null;
      let sharedStimulusSupported = true;
      try {
        stimulus =
          group.sharedStimulus === null
            ? null
            : groupStimulus(group.sharedStimulus);
        if (stimulus) this.references(stimulus, views);
      } catch (error) {
        if (!(error instanceof ValidationDomainException) || publication)
          throw error;
        sharedStimulusSupported = false;
        stimulus = null;
      }
      output.push({
        id: group.id,
        title: groupText(group.title, 255, true)!,
        instructions: groupText(group.instructions, 2000),
        layoutOrder: group.layoutOrder,
        sharedStimulusSupported,
        ...(stimulus ? { sharedStimulus: stimulus } : {}),
        questionIds,
        points: questions
          .filter((q) => q.groupId === group.id)
          .reduce((sum, q) => sum.plus(q.points), new Prisma.Decimal(0))
          .toFixed(2),
        assets: views.map(presentGroupAsset),
      });
    }
    const result = { groups: output, displayItems: layout.displayItems };
    if (records)
      attachQuestionGroupContext(
        records,
        result,
        new Map(questions.map((q) => [q.id, q.groupId])),
      );
    return result;
  }
  private references(
    stimulus: NonNullable<ReturnType<typeof groupStimulus>>,
    views: Awaited<ReturnType<QuestionGroupMedia['view']>>[],
  ) {
    for (const ref of groupReferences(stimulus)) {
      const view = views.find((v) => v.asset.id === ref.assetId);
      if (
        !view ||
        (!view.file && !view.externalUrl) ||
        view.asset.category.toLowerCase() !== ref.kind
      )
        throw new ValidationDomainException(
          'Group stimulus asset is unavailable',
        );
    }
  }
  private async data(
    tx: Prisma.TransactionClient,
    parentId: string,
    input: CreateQuestionGroupDto | UpdateQuestionGroupDto,
    creating: boolean,
    groupId?: string,
  ) {
    if (
      Object.keys(input).some(
        (key) =>
          !['title', 'instructions', 'sharedStimulus', 'layoutOrder'].includes(
            key,
          ),
      )
    )
      throw new ValidationDomainException('Question group input is invalid');
    const data: {
      title?: string;
      instructions?: string | null;
      layoutOrder?: number;
      sharedStimulus?: Prisma.InputJsonValue | typeof Prisma.DbNull;
    } = {};
    if (creating || input.title !== undefined)
      data.title = groupText(input.title, 255, true)!;
    if (input.instructions !== undefined)
      data.instructions = groupText(input.instructions, 2000);
    if (input.layoutOrder !== undefined)
      data.layoutOrder = groupOrder(input.layoutOrder);
    if (input.sharedStimulus !== undefined) {
      const stimulus = groupStimulus(input.sharedStimulus);
      if (stimulus) {
        const assets = groupId
          ? await tx.homeworkQuestionGroupAsset.findMany({
              where: { groupId, deletedAt: null },
            })
          : [];
        this.references(
          stimulus,
          await Promise.all(
            assets.map((a) =>
              this.media.view(tx, 'HOMEWORK_ASSIGNMENT_MEDIA', parentId, a),
            ),
          ),
        );
      }
      data.sharedStimulus = stimulus
        ? (stimulus as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull;
    }
    return data;
  }
  async create(
    actor: HomeworkAssetActor,
    input: Resource,
    command: CreateQuestionGroupDto,
  ) {
    return this.transaction(async (tx) => {
      const scope = await this.authorize(tx, actor, input, true);
      await this.lock(tx, input.homeworkId);
      if (
        (await tx.homeworkQuestionGroup.count({
          where: { homeworkAssignmentId: input.homeworkId, deletedAt: null },
        })) >= 100
      )
        throw new ValidationDomainException('Question group capacity exceeded');
      const data = await this.data(tx, input.homeworkId, command, true);
      const group = await tx.homeworkQuestionGroup.create({
        data: {
          ...data,
          title: data.title!,
          homeworkAssignmentId: input.homeworkId,
          schoolId: scope.schoolId,
          createdByUserId: scope.actorId,
        },
      });
      await this.audit(tx, input.homeworkId, 'create', group.id);
      return this.project(tx, input.homeworkId);
    });
  }
  async update(
    actor: HomeworkAssetActor,
    input: Resource & { groupId: string },
    command: UpdateQuestionGroupDto,
  ) {
    return this.transaction(async (tx) => {
      await this.authorize(tx, actor, input, true);
      await this.lock(tx, input.homeworkId);
      await this.group(tx, input);
      await tx.homeworkQuestionGroup.update({
        where: { id: input.groupId },
        data: await this.data(
          tx,
          input.homeworkId,
          command,
          false,
          input.groupId,
        ),
      });
      await this.audit(tx, input.homeworkId, 'update', input.groupId);
      return this.project(tx, input.homeworkId);
    });
  }
  async remove(
    actor: HomeworkAssetActor,
    input: Resource & { groupId: string },
  ) {
    return this.transaction(async (tx) => {
      await this.authorize(tx, actor, input, true);
      await this.lock(tx, input.homeworkId);
      await this.group(tx, input);
      await tx.homeworkQuestion.updateMany({
        where: {
          homeworkAssignmentId: input.homeworkId,
          groupId: input.groupId,
          deletedAt: null,
        },
        data: { groupId: null, layoutOrder: null },
      });
      await tx.homeworkQuestionGroupAsset.updateMany({
        where: { groupId: input.groupId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      await tx.homeworkQuestionGroup.update({
        where: { id: input.groupId },
        data: { deletedAt: new Date() },
      });
      await this.audit(tx, input.homeworkId, 'remove', input.groupId);
    });
  }
  async layout(
    actor: HomeworkAssetActor,
    input: Resource,
    command: ChangeQuestionGroupLayoutDto,
  ) {
    return this.transaction(async (tx) => {
      await this.authorize(tx, actor, input, true);
      await this.lock(tx, input.homeworkId);
      if (
        !Array.isArray(command.questions) ||
        !Array.isArray(command.blocks) ||
        command.questions.length > 100 ||
        command.blocks.length > 100 ||
        new Set(command.questions.map((q) => q.questionId)).size !==
          command.questions.length ||
        new Set(command.blocks.map((b) => b.id)).size !== command.blocks.length
      )
        throw new ValidationDomainException('Question group layout is invalid');
      for (const item of command.questions) {
        const q = await tx.homeworkQuestion.findFirst({
          where: {
            id: item.questionId,
            homeworkAssignmentId: input.homeworkId,
            deletedAt: null,
          },
        });
        if (!q) throw absent();
        if (q.groupId !== item.expectedGroupId) throw conflict();
        if (item.groupId !== null)
          await this.group(tx, { ...input, groupId: item.groupId });
        await tx.homeworkQuestion.update({
          where: { id: q.id },
          data: {
            groupId: item.groupId,
            layoutOrder: groupOrder(item.layoutOrder),
          },
        });
      }
      for (const item of command.blocks) {
        if (item.kind === 'group') {
          await this.group(tx, { ...input, groupId: item.id });
          await tx.homeworkQuestionGroup.update({
            where: { id: item.id },
            data: { layoutOrder: groupOrder(item.layoutOrder) },
          });
        } else if (item.kind === 'question') {
          const q = await tx.homeworkQuestion.findFirst({
            where: {
              id: item.id,
              homeworkAssignmentId: input.homeworkId,
              deletedAt: null,
            },
          });
          if (!q) throw absent();
          if (q.groupId) throw conflict();
          await tx.homeworkQuestion.update({
            where: { id: q.id },
            data: { layoutOrder: groupOrder(item.layoutOrder) },
          });
        } else
          throw new ValidationDomainException(
            'Question group layout is invalid',
          );
      }
      await this.audit(tx, input.homeworkId, 'layout');
      return this.project(tx, input.homeworkId);
    });
  }
  async createAsset(
    actor: HomeworkAssetActor,
    input: Resource & { groupId: string },
    command: CreateQuestionGroupAssetDto,
  ) {
    return this.transaction(async (tx) => {
      await this.authorize(
        tx,
        actor,
        input,
        true,
        command.sourceType === 'MANAGED_FILE',
      );
      await this.lock(tx, input.homeworkId);
      await this.group(tx, input);
      const parentId = input.homeworkId;
      const count =
        (await tx.homeworkQuestionAsset.count({
          where: {
            deletedAt: null,
            homeworkQuestion: {
              homeworkAssignmentId: parentId,
              deletedAt: null,
            },
          },
        })) +
        (await tx.homeworkQuestionGroupAsset.count({
          where: {
            deletedAt: null,
            group: { homeworkAssignmentId: parentId, deletedAt: null },
          },
        }));
      const policy = await this.media.policy(tx, true);
      if (count >= policy.maximumFilesPerResource)
        throw new ValidationDomainException(
          'Group asset reference capacity exceeded',
        );
      const asset = await tx.homeworkQuestionGroupAsset.create({
        data: {
          ...(await this.media.createData(
            tx,
            'HOMEWORK_ASSIGNMENT_MEDIA',
            parentId,
            command,
          )),
          groupId: input.groupId,
        },
      });
      await this.audit(tx, parentId, 'asset.create', asset.id);
      return presentGroupAsset(
        await this.media.view(tx, 'HOMEWORK_ASSIGNMENT_MEDIA', parentId, asset),
      );
    });
  }
  async changeAsset(
    actor: HomeworkAssetActor,
    input: Resource & { groupId: string; assetId: string },
    command: {
      title?: string | null;
      description?: string | null;
      sortOrder?: number;
    } | null,
  ) {
    return this.transaction(async (tx) => {
      await this.authorize(tx, actor, input, true);
      await this.lock(tx, input.homeworkId);
      const group = await this.group(tx, input);
      const asset = await tx.homeworkQuestionGroupAsset.findFirst({
        where: { id: input.assetId, groupId: group.id, deletedAt: null },
      });
      if (!asset) throw absent();
      const stimulus =
        group.sharedStimulus === null
          ? null
          : groupStimulus(group.sharedStimulus);
      if (
        !command &&
        stimulus &&
        groupReferences(stimulus).some((r) => r.assetId === asset.id)
      )
        throw new ValidationDomainException(
          'Remove the group stimulus reference before deleting its asset',
        );
      const data: {
        deletedAt?: Date;
        title?: string | null;
        description?: string | null;
        sortOrder?: number;
      } = command ? {} : { deletedAt: new Date() };
      if (command) {
        if (
          Object.keys(command).some(
            (k) => !['title', 'description', 'sortOrder'].includes(k),
          )
        )
          throw new ValidationDomainException(
            'Group asset identity is immutable',
          );
        if (command.title !== undefined)
          data.title = groupText(command.title, 255);
        if (command.description !== undefined)
          data.description = groupText(command.description, 2000);
        if (command.sortOrder !== undefined)
          data.sortOrder = groupOrder(command.sortOrder);
      }
      const updated = await tx.homeworkQuestionGroupAsset.update({
        where: { id: asset.id },
        data,
      });
      await this.audit(
        tx,
        input.homeworkId,
        command ? 'asset.update' : 'asset.remove',
        asset.id,
      );
      if (command)
        return presentGroupAsset(
          await this.media.view(
            tx,
            'HOMEWORK_ASSIGNMENT_MEDIA',
            input.homeworkId,
            updated,
          ),
        );
    });
  }
  asset(
    actor: HomeworkAssetActor,
    input: Resource & { groupId: string; assetId: string },
  ) {
    return this.transaction(async (tx) => {
      await this.authorize(tx, actor, input);
      await this.group(tx, input);
      const asset = await tx.homeworkQuestionGroupAsset.findFirst({
        where: { id: input.assetId, groupId: input.groupId, deletedAt: null },
      });
      if (!asset) throw absent();
      return this.media.view(
        tx,
        'HOMEWORK_ASSIGNMENT_MEDIA',
        input.homeworkId,
        asset,
      );
    });
  }
  private async audit(
    tx: Prisma.TransactionClient,
    parentId: string,
    action: string,
    resourceId = parentId,
  ) {
    const scope = requireHomeworkScope();
    await tx.auditLog.create({
      data: {
        schoolId: scope.schoolId,
        organizationId: scope.organizationId,
        actorId: scope.actorId,
        module: 'homework',
        action: 'question_group.' + action,
        resourceType: 'HomeworkQuestionGroup',
        resourceId,
        outcome: 'SUCCESS',
        after: { parentId },
      },
    });
  }
}
