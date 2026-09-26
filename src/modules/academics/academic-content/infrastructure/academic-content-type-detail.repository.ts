import { Injectable } from '@nestjs/common';
import {
  AcademicContentTargetScopeType as Scope,
  AuditOutcome,
  Prisma,
} from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  AcademicContentTypeDetailUnitOfWork,
  TypeDetailMutation,
  TypeDetailMutationResult,
} from '../application/academic-content-type-detail.unit-of-work';
import {
  assertAcademicContentMutable,
  assertAcademicContentTermWritable,
} from '../domain/academic-content-lifecycle.policy';
import {
  academicReferenceMatchesTargets,
  ResolvedAcademicScope,
} from '../domain/academic-content-reference-scope.policy';
import { NormalizedDetail } from '../domain/academic-content-type-detail.policy';

type Tx = Prisma.TransactionClient;
type Content = {
  id: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  type: string;
};
type Reference = {
  subjectId: string | null;
  scopeType: Scope;
  stageId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  classroomId?: string | null;
};
type CurriculumFields = {
  curriculumId: string | null;
  curriculumUnitId: string | null;
  curriculumLessonId: string | null;
};
const unavailable = (): never => {
  throw new ValidationDomainException(
    'Academic content reference is unavailable or incompatible',
  );
};
const datePart = (value: Date) => value.toISOString().slice(0, 10);
const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

/** Resolve every ancestor from the same school; a deleted hierarchy node is unusable. */
async function resolveScope(
  tx: Tx,
  schoolId: string,
  input: Reference,
): Promise<ResolvedAcademicScope> {
  const result: ResolvedAcademicScope = {
    scopeType: input.scopeType,
    subjectId: input.subjectId,
    stageId: null,
    gradeId: null,
    sectionId: null,
    classroomId: null,
  };
  if (input.scopeType === Scope.CLASSROOM) {
    const room = await tx.classroom.findFirst({
      where: { id: input.classroomId ?? undefined, schoolId, deletedAt: null },
      select: { id: true, sectionId: true },
    });
    if (!room || !input.classroomId) return unavailable();
    result.classroomId = room.id;
    result.sectionId = room.sectionId;
  } else if (input.scopeType === Scope.SECTION)
    result.sectionId = input.sectionId ?? null;
  if (result.sectionId) {
    const section = await tx.section.findFirst({
      where: { id: result.sectionId, schoolId, deletedAt: null },
      select: { gradeId: true },
    });
    if (!section) return unavailable();
    result.gradeId = section.gradeId;
  } else if (input.scopeType === Scope.GRADE)
    result.gradeId = input.gradeId ?? null;
  if (result.gradeId) {
    const grade = await tx.grade.findFirst({
      where: { id: result.gradeId, schoolId, deletedAt: null },
      select: { stageId: true },
    });
    if (!grade) return unavailable();
    result.stageId = grade.stageId;
  } else if (input.scopeType === Scope.STAGE)
    result.stageId = input.stageId ?? null;
  if (result.stageId) {
    const stage = await tx.stage.findFirst({
      where: { id: result.stageId, schoolId, deletedAt: null },
      select: { id: true },
    });
    if (!stage) return unavailable();
  }
  if (input.scopeType !== Scope.SCHOOL && !result.stageId) return unavailable();
  return result;
}

async function resolvedTargets(
  tx: Tx,
  content: Content,
  override?: readonly Reference[],
): Promise<ResolvedAcademicScope[]> {
  const rows: readonly Reference[] =
    override ??
    (await tx.academicContentTarget.findMany({
      where: { schoolId: content.schoolId, academicContentId: content.id },
      select: {
        scopeType: true,
        subjectId: true,
        stageId: true,
        gradeId: true,
        sectionId: true,
        classroomId: true,
      },
    }));
  return Promise.all(
    rows.map((row) => resolveScope(tx, content.schoolId, row)),
  );
}

async function compatible(
  tx: Tx,
  content: Content,
  targets: readonly ResolvedAcademicScope[],
  input: Reference,
  allowUnavailable = false,
) {
  let reference: ResolvedAcademicScope;
  try {
    reference = await resolveScope(tx, content.schoolId, input);
  } catch (error) {
    if (allowUnavailable && error instanceof ValidationDomainException) return;
    throw error;
  }
  if (!academicReferenceMatchesTargets(targets, reference))
    return unavailable();
}

async function validateCurriculum(
  tx: Tx,
  content: Content,
  targets: readonly ResolvedAcademicScope[],
  fields: CurriculumFields,
  allowUnavailable = false,
) {
  const { curriculumId, curriculumUnitId, curriculumLessonId } = fields;
  if (!curriculumId && (curriculumUnitId || curriculumLessonId))
    return unavailable();
  if (!curriculumUnitId && curriculumLessonId) return unavailable();
  if (curriculumId) {
    const curriculum = await tx.curriculum.findFirst({
      where: { id: curriculumId, schoolId: content.schoolId, deletedAt: null },
      select: {
        academicYearId: true,
        termId: true,
        subjectId: true,
        gradeId: true,
      },
    });
    if (!curriculum && allowUnavailable) return;
    if (
      !curriculum ||
      curriculum.academicYearId !== content.academicYearId ||
      curriculum.termId !== content.termId
    )
      return unavailable();
    await compatible(
      tx,
      content,
      targets,
      {
        subjectId: curriculum.subjectId,
        scopeType: Scope.GRADE,
        gradeId: curriculum.gradeId,
      },
      allowUnavailable,
    );
  }
  if (curriculumUnitId) {
    const unit = await tx.curriculumUnit.findFirst({
      where: {
        id: curriculumUnitId,
        schoolId: content.schoolId,
        deletedAt: null,
      },
      select: { curriculumId: true },
    });
    if (!unit && allowUnavailable) return;
    if (!unit || unit.curriculumId !== curriculumId) return unavailable();
  }
  if (curriculumLessonId) {
    const lesson = await tx.curriculumLesson.findFirst({
      where: {
        id: curriculumLessonId,
        schoolId: content.schoolId,
        deletedAt: null,
      },
      select: { curriculumId: true, unitId: true },
    });
    if (!lesson && allowUnavailable) return;
    if (
      !lesson ||
      lesson.curriculumId !== curriculumId ||
      lesson.unitId !== curriculumUnitId
    )
      return unavailable();
  }
}

async function validateTimetable(
  tx: Tx,
  content: Content,
  targets: readonly ResolvedAcademicScope[],
  id: string | null,
  allowUnavailable = false,
) {
  if (!id) return;
  const entry = await tx.timetableEntry.findFirst({
    where: { id, schoolId: content.schoolId },
    select: {
      academicYearId: true,
      termId: true,
      subjectId: true,
      classroomId: true,
    },
  });
  if (!entry && allowUnavailable) return;
  if (
    !entry ||
    entry.academicYearId !== content.academicYearId ||
    entry.termId !== content.termId
  )
    return unavailable();
  await compatible(
    tx,
    content,
    targets,
    {
      subjectId: entry.subjectId,
      scopeType: Scope.CLASSROOM,
      classroomId: entry.classroomId,
    },
    allowUnavailable,
  );
}

async function validateReferences(
  tx: Tx,
  content: Content,
  term: { startDate: Date; endDate: Date },
  targets: readonly ResolvedAcademicScope[],
  detail: NormalizedDetail,
  allowUnavailable = false,
) {
  if (detail.type === 'TEACHER_PREPARATION') {
    const s = detail.state;
    await validateCurriculum(tx, content, targets, s, allowUnavailable);
    if (!s.lessonPlanId && s.lessonPlanItemId) return unavailable();
    if (s.lessonPlanId) {
      const plan = await tx.lessonPlan.findFirst({
        where: {
          id: s.lessonPlanId,
          schoolId: content.schoolId,
          deletedAt: null,
        },
        select: {
          academicYearId: true,
          termId: true,
          subjectId: true,
          classroomId: true,
          curriculumId: true,
        },
      });
      if (!plan && !allowUnavailable) return unavailable();
      if (plan) {
        if (
          plan.academicYearId !== content.academicYearId ||
          plan.termId !== content.termId ||
          (s.curriculumId && plan.curriculumId !== s.curriculumId)
        )
          return unavailable();
        await compatible(
          tx,
          content,
          targets,
          {
            subjectId: plan.subjectId,
            scopeType: Scope.CLASSROOM,
            classroomId: plan.classroomId,
          },
          allowUnavailable,
        );
      }
    }
    if (s.lessonPlanItemId) {
      const item = await tx.lessonPlanItem.findFirst({
        where: {
          id: s.lessonPlanItemId,
          schoolId: content.schoolId,
          deletedAt: null,
        },
        select: {
          lessonPlanId: true,
          curriculumId: true,
          unitId: true,
          lessonId: true,
        },
      });
      if (!item && !allowUnavailable) return unavailable();
      if (
        item &&
        (item.lessonPlanId !== s.lessonPlanId ||
          (s.curriculumId && item.curriculumId !== s.curriculumId) ||
          (s.curriculumUnitId && item.unitId !== s.curriculumUnitId) ||
          (s.curriculumLessonId && item.lessonId !== s.curriculumLessonId))
      )
        return unavailable();
    }
    await validateTimetable(
      tx,
      content,
      targets,
      s.timetableEntryId,
      allowUnavailable,
    );
  } else if (detail.type === 'SUBJECT_RESOURCE') {
    await validateCurriculum(
      tx,
      content,
      targets,
      detail.state,
      allowUnavailable,
    );
  } else if (detail.type === 'ONLINE_SESSION') {
    const s = detail.state;
    const endExclusive = new Date(
      term.endDate.getTime() + 86_400_000,
    ).toISOString();
    if (s.startAt < term.startDate.toISOString() || s.endAt >= endExclusive)
      return unavailable();
    await validateTimetable(
      tx,
      content,
      targets,
      s.timetableEntryId,
      allowUnavailable,
    );
  } else if (detail.type === 'WEEKLY_PLAN') {
    const s = detail.state;
    if (
      s.weekStartDate < datePart(term.startDate) ||
      s.weekEndDate > datePart(term.endDate)
    )
      return unavailable();
    if (s.homeworkAssignmentIds.length) {
      const rows = await tx.homeworkAssignment.findMany({
        where: {
          id: { in: s.homeworkAssignmentIds },
          schoolId: content.schoolId,
          deletedAt: null,
        },
        select: {
          id: true,
          academicYearId: true,
          termId: true,
          subjectId: true,
          classroomId: true,
        },
      });
      if (!allowUnavailable && rows.length !== s.homeworkAssignmentIds.length)
        return unavailable();
      for (const row of rows) {
        if (
          row.academicYearId !== content.academicYearId ||
          row.termId !== content.termId
        )
          return unavailable();
        await compatible(
          tx,
          content,
          targets,
          {
            subjectId: row.subjectId,
            scopeType: Scope.CLASSROOM,
            classroomId: row.classroomId,
          },
          allowUnavailable,
        );
      }
    }
    if (s.gradeAssessmentIds.length) {
      const rows = await tx.gradeAssessment.findMany({
        where: {
          id: { in: s.gradeAssessmentIds },
          schoolId: content.schoolId,
          deletedAt: null,
        },
        select: {
          id: true,
          academicYearId: true,
          termId: true,
          subjectId: true,
          scopeType: true,
          scopeKey: true,
          stageId: true,
          gradeId: true,
          sectionId: true,
          classroomId: true,
        },
      });
      if (!allowUnavailable && rows.length !== s.gradeAssessmentIds.length)
        return unavailable();
      for (const row of rows) {
        if (
          row.academicYearId !== content.academicYearId ||
          row.termId !== content.termId
        )
          return unavailable();
        await compatible(
          tx,
          content,
          targets,
          {
            subjectId: row.subjectId,
            scopeType: row.scopeType as Scope,
            stageId:
              row.stageId ??
              (row.scopeType === Scope.STAGE ? row.scopeKey : null),
            gradeId:
              row.gradeId ??
              (row.scopeType === Scope.GRADE ? row.scopeKey : null),
            sectionId:
              row.sectionId ??
              (row.scopeType === Scope.SECTION ? row.scopeKey : null),
            classroomId:
              row.classroomId ??
              (row.scopeType === Scope.CLASSROOM ? row.scopeKey : null),
          },
          allowUnavailable,
        );
      }
    }
  }
}

function safeSummary(
  detail: NormalizedDetail,
  prior?: NormalizedDetail['state'],
) {
  switch (detail.type) {
    case 'TEACHER_PREPARATION': {
      const s = detail.state;
      return {
        topicChanged: !!prior && (prior as typeof s).topic !== s.topic,
        objectivesCount: s.objectives.length,
        learningOutcomesCount: s.learningOutcomes.length,
        teachingStrategiesCount: s.teachingStrategies.length,
        activitiesCount: s.activities.length,
        resourceNotesPresent: !!s.resourceNotes,
        assessmentNotesPresent: !!s.assessmentNotes,
        teacherNotesPresent: !!s.teacherNotes,
        curriculumId: s.curriculumId,
        curriculumUnitId: s.curriculumUnitId,
        curriculumLessonId: s.curriculumLessonId,
        lessonPlanId: s.lessonPlanId,
        lessonPlanItemId: s.lessonPlanItemId,
        timetableEntryId: s.timetableEntryId,
      };
    }
    case 'WEEKLY_PLAN': {
      const s = detail.state;
      return {
        weekStartDate: s.weekStartDate,
        weekEndDate: s.weekEndDate,
        objectivesCount: s.objectives.length,
        topicsCount: s.topics.length,
        narrativesChanged:
          !!prior &&
          ['expectedHomework', 'upcomingAssessments', 'notes'].some(
            (key) =>
              (prior as unknown as Record<string, unknown>)[key] !==
              (s as unknown as Record<string, unknown>)[key],
          ),
        homeworkReferenceCount: s.homeworkAssignmentIds.length,
        assessmentReferenceCount: s.gradeAssessmentIds.length,
      };
    }
    case 'GUARDIAN_WEEKLY_NOTE': {
      const s = detail.state;
      return {
        priority: s.priority,
        requiresAcknowledgement: s.requiresAcknowledgement,
        bodyChanged: !!prior && (prior as typeof s).body !== s.body,
        bodyLength: s.body.length,
      };
    }
    case 'SUBJECT_RESOURCE': {
      const s = detail.state;
      return {
        resourceCategory: s.resourceCategory,
        curriculumId: s.curriculumId,
        curriculumUnitId: s.curriculumUnitId,
        curriculumLessonId: s.curriculumLessonId,
      };
    }
    case 'ONLINE_SESSION': {
      const s = detail.state;
      return {
        platform: s.platform,
        providerNamePresent: !!s.providerName,
        startAt: s.startAt,
        endAt: s.endAt,
        timezone: s.timezone,
        timetableEntryId: s.timetableEntryId,
        joinUrlChanged: !!prior && (prior as typeof s).joinUrl !== s.joinUrl,
        accessCodeChanged:
          !!prior && (prior as typeof s).accessCode !== s.accessCode,
      };
    }
  }
}

function requiresTargets(detail: NormalizedDetail): boolean {
  switch (detail.type) {
    case 'TEACHER_PREPARATION':
      return !!(
        detail.state.curriculumId ||
        detail.state.lessonPlanId ||
        detail.state.timetableEntryId
      );
    case 'SUBJECT_RESOURCE':
      return !!detail.state.curriculumId;
    case 'WEEKLY_PLAN':
      return !!(
        detail.state.homeworkAssignmentIds.length ||
        detail.state.gradeAssessmentIds.length
      );
    case 'ONLINE_SESSION':
      return !!detail.state.timetableEntryId;
    case 'GUARDIAN_WEEKLY_NOTE':
      return false;
  }
}

async function currentDetail(
  tx: Tx,
  content: Content,
  type: NormalizedDetail['type'],
): Promise<NormalizedDetail['state'] | null> {
  const where = { schoolId: content.schoolId, academicContentId: content.id };
  if (type === 'TEACHER_PREPARATION') {
    const row = await tx.academicContentPreparationDetail.findFirst({ where });
    if (!row) return null;
    return {
      topic: row.topic,
      objectives: row.objectives as string[],
      learningOutcomes: row.learningOutcomes as string[],
      teachingStrategies: row.teachingStrategies as string[],
      activities: row.activities as string[],
      resourceNotes: row.resourceNotes,
      assessmentNotes: row.assessmentNotes,
      teacherNotes: row.teacherNotes,
      curriculumId: row.curriculumId,
      curriculumUnitId: row.curriculumUnitId,
      curriculumLessonId: row.curriculumLessonId,
      lessonPlanId: row.lessonPlanId,
      lessonPlanItemId: row.lessonPlanItemId,
      timetableEntryId: row.timetableEntryId,
    };
  }
  if (type === 'WEEKLY_PLAN') {
    const row = await tx.academicContentWeeklyPlanDetail.findFirst({
      where,
      include: { homeworkReferences: true, assessmentReferences: true },
    });
    if (!row) return null;
    return {
      weekStartDate: datePart(row.weekStartDate),
      weekEndDate: datePart(row.weekEndDate),
      objectives: row.objectives as string[],
      topics: row.topics as string[],
      expectedHomework: row.expectedHomework,
      upcomingAssessments: row.upcomingAssessments,
      notes: row.notes,
      homeworkAssignmentIds: row.homeworkReferences
        .map((ref) => ref.homeworkAssignmentId)
        .sort(),
      gradeAssessmentIds: row.assessmentReferences
        .map((ref) => ref.gradeAssessmentId)
        .sort(),
    };
  }
  if (type === 'GUARDIAN_WEEKLY_NOTE') {
    const row = await tx.academicContentGuardianNoteDetail.findFirst({ where });
    return (
      row && {
        body: row.body,
        priority: row.priority,
        requiresAcknowledgement: row.requiresAcknowledgement,
      }
    );
  }
  if (type === 'SUBJECT_RESOURCE') {
    const row = await tx.academicContentSubjectResourceDetail.findFirst({
      where,
    });
    return (
      row && {
        resourceCategory: row.resourceCategory,
        curriculumId: row.curriculumId,
        curriculumUnitId: row.curriculumUnitId,
        curriculumLessonId: row.curriculumLessonId,
      }
    );
  }
  const row = await tx.academicContentOnlineSessionDetail.findFirst({ where });
  return (
    row && {
      platform: row.platform,
      providerName: row.providerName,
      joinUrl: row.joinUrl,
      accessCode: row.accessCode,
      instructions: row.instructions,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      timezone: row.timezone,
      timetableEntryId: row.timetableEntryId,
    }
  );
}

/** Called under the same parent row lock by target replacement. */
export async function assertExistingTypeDetailReferencesCompatible(
  tx: Tx,
  content: Content,
  replacementTargets: readonly Reference[],
): Promise<void> {
  const targets = await resolvedTargets(tx, content, replacementTargets);
  const term = await tx.term.findFirst({
    where: { id: content.termId, schoolId: content.schoolId, deletedAt: null },
    select: { startDate: true, endDate: true },
  });
  if (!term) throw new NotFoundDomainException('Term not found');
  for (const type of [
    'TEACHER_PREPARATION',
    'WEEKLY_PLAN',
    'SUBJECT_RESOURCE',
    'ONLINE_SESSION',
  ] as const) {
    const state = await currentDetail(tx, content, type);
    if (state)
      await validateReferences(
        tx,
        content,
        term,
        targets,
        { type, state } as NormalizedDetail,
        true,
      );
  }
}

async function persist(
  tx: Tx,
  content: Content,
  detail: NormalizedDetail,
  before: NormalizedDetail['state'] | null,
) {
  const where = { schoolId: content.schoolId, academicContentId: content.id };
  const common = { ...where, contentType: detail.type };
  if (detail.type === 'TEACHER_PREPARATION') {
    const row = await tx.academicContentPreparationDetail.findFirst({
      where,
      select: { id: true },
    });
    const data = { ...detail.state };
    if (row)
      await tx.academicContentPreparationDetail.update({
        where: { id: row.id },
        data,
      });
    else
      await tx.academicContentPreparationDetail.create({
        data: { ...common, ...data },
      });
  } else if (detail.type === 'WEEKLY_PLAN') {
    const row = await tx.academicContentWeeklyPlanDetail.findFirst({
      where,
      select: { id: true },
    });
    const {
      homeworkAssignmentIds,
      gradeAssessmentIds,
      weekStartDate,
      weekEndDate,
      ...fields
    } = detail.state;
    const data = {
      ...fields,
      weekStartDate: new Date(`${weekStartDate}T00:00:00.000Z`),
      weekEndDate: new Date(`${weekEndDate}T00:00:00.000Z`),
    };
    const saved = row
      ? await tx.academicContentWeeklyPlanDetail.update({
          where: { id: row.id },
          data,
        })
      : await tx.academicContentWeeklyPlanDetail.create({
          data: { ...common, ...data },
        });
    const previous = before as
      | Extract<NormalizedDetail, { type: 'WEEKLY_PLAN' }>['state']
      | null;
    if (
      !previous ||
      !same(previous.homeworkAssignmentIds, homeworkAssignmentIds)
    ) {
      await tx.academicContentWeeklyPlanHomeworkReference.deleteMany({
        where: { schoolId: content.schoolId, weeklyPlanDetailId: saved.id },
      });
      if (homeworkAssignmentIds.length)
        await tx.academicContentWeeklyPlanHomeworkReference.createMany({
          data: homeworkAssignmentIds.map((homeworkAssignmentId) => ({
            schoolId: content.schoolId,
            weeklyPlanDetailId: saved.id,
            homeworkAssignmentId,
          })),
        });
    }
    if (!previous || !same(previous.gradeAssessmentIds, gradeAssessmentIds)) {
      await tx.academicContentWeeklyPlanAssessmentReference.deleteMany({
        where: { schoolId: content.schoolId, weeklyPlanDetailId: saved.id },
      });
      if (gradeAssessmentIds.length)
        await tx.academicContentWeeklyPlanAssessmentReference.createMany({
          data: gradeAssessmentIds.map((gradeAssessmentId) => ({
            schoolId: content.schoolId,
            weeklyPlanDetailId: saved.id,
            gradeAssessmentId,
          })),
        });
    }
  } else if (detail.type === 'GUARDIAN_WEEKLY_NOTE') {
    const row = await tx.academicContentGuardianNoteDetail.findFirst({
      where,
      select: { id: true },
    });
    if (row)
      await tx.academicContentGuardianNoteDetail.update({
        where: { id: row.id },
        data: detail.state,
      });
    else
      await tx.academicContentGuardianNoteDetail.create({
        data: { ...common, ...detail.state },
      });
  } else if (detail.type === 'SUBJECT_RESOURCE') {
    const row = await tx.academicContentSubjectResourceDetail.findFirst({
      where,
      select: { id: true },
    });
    if (row)
      await tx.academicContentSubjectResourceDetail.update({
        where: { id: row.id },
        data: detail.state,
      });
    else
      await tx.academicContentSubjectResourceDetail.create({
        data: { ...common, ...detail.state },
      });
  } else {
    const row = await tx.academicContentOnlineSessionDetail.findFirst({
      where,
      select: { id: true },
    });
    const { startAt, endAt, ...fields } = detail.state;
    const data = {
      ...fields,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
    };
    if (row)
      await tx.academicContentOnlineSessionDetail.update({
        where: { id: row.id },
        data,
      });
    else
      await tx.academicContentOnlineSessionDetail.create({
        data: { ...common, ...data },
      });
  }
}

@Injectable()
export class AcademicContentTypeDetailRepository implements AcademicContentTypeDetailUnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  async mutate(input: TypeDetailMutation): Promise<TypeDetailMutationResult> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            // First transaction action: serialize with archive and target replacement.
            const locked = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "academic_contents"
            WHERE "id" = ${input.contentId}::uuid AND "school_id" = ${input.schoolId}::uuid
              AND "deleted_at" IS NULL FOR UPDATE
          `;
            if (locked.length !== 1)
              throw new NotFoundDomainException('Academic content not found');
            const content = await tx.academicContent.findFirst({
              where: {
                id: input.contentId,
                schoolId: input.schoolId,
                deletedAt: null,
              },
              select: {
                id: true,
                schoolId: true,
                academicYearId: true,
                termId: true,
                type: true,
                status: true,
                updatedAt: true,
              },
            });
            if (!content)
              throw new NotFoundDomainException('Academic content not found');
            if (content.type !== input.detail.type)
              throw new ValidationDomainException(
                'Academic content type is incompatible with this authoring detail',
              );
            assertAcademicContentMutable(content.status);
            const term = await tx.term.findFirst({
              where: {
                id: content.termId,
                schoolId: content.schoolId,
                deletedAt: null,
              },
              select: { startDate: true, endDate: true, isActive: true },
            });
            if (!term) throw new NotFoundDomainException('Term not found');
            assertAcademicContentTermWritable(term, input.now);
            const before = await currentDetail(tx, content, input.detail.type);
            if (before && same(before, input.detail.state))
              return { changed: false, state: before };
            const targets = requiresTargets(input.detail)
              ? await resolvedTargets(tx, content)
              : [];
            await validateReferences(tx, content, term, targets, input.detail);
            await persist(tx, content, input.detail, before);
            await tx.academicContent.update({
              where: { id: content.id },
              data: {
                updatedByUserId: input.actorId,
                updatedAt: new Date(
                  Math.max(Date.now(), content.updatedAt.getTime() + 1),
                ),
              },
            });
            const action = {
              TEACHER_PREPARATION: 'preparation',
              WEEKLY_PLAN: 'weekly_plan',
              GUARDIAN_WEEKLY_NOTE: 'guardian_note',
              SUBJECT_RESOURCE: 'subject_resource',
              ONLINE_SESSION: 'online_session',
            }[input.detail.type];
            await tx.auditLog.create({
              data: {
                actorId: input.actorId,
                organizationId: input.organizationId,
                schoolId: input.schoolId,
                module: 'academic-content',
                action: `academics.academic_content.details.${action}.update`,
                resourceType: 'academic_content',
                resourceId: content.id,
                outcome: AuditOutcome.SUCCESS,
                before: before
                  ? safeSummary({
                      ...input.detail,
                      state: before,
                    } as NormalizedDetail)
                  : Prisma.JsonNull,
                after: safeSummary(input.detail, before ?? undefined),
              },
            });
            return { changed: true, state: input.detail.state };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
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
    throw new Error('Unreachable type-detail retry state');
  }
}
