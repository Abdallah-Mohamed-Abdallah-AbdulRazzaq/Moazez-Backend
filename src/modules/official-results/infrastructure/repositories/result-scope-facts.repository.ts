import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import type {
  AcademicLevel,
  ConcreteResultsScope,
  ResultAcademicPath,
  ResultScopeFacts,
  ResultSelector,
} from '../../domain/result-scope';
import { OfficialResultsError } from '../../domain/official-results.error';

const topicSelect = {
  id: true,
  academicYearId: true,
  kind: true,
} satisfies Prisma.ResultReportingPeriodSelect;
const classSelect = {
  id: true,
  sectionId: true,
  section: {
    select: {
      gradeId: true,
      grade: { select: { stageId: true } },
    },
  },
} satisfies Prisma.ClassroomSelect;
const validGrade = { deletedAt: null, stage: { deletedAt: null } };
const validSection = { deletedAt: null, grade: validGrade };
const validClass = { deletedAt: null, section: validSection };

type ClassroomScopeRow = Prisma.ClassroomGetPayload<{
  select: typeof classSelect;
}>;

export function resultClassroomPath(
  classroom: ClassroomScopeRow,
): Required<ResultAcademicPath> {
  return {
    CLASSROOM: classroom.id,
    SECTION: classroom.sectionId,
    GRADE: classroom.section.gradeId,
    STAGE: classroom.section.grade.stageId,
  };
}

function exactIds<T>(
  selectors: readonly ResultSelector[],
  extract: (selector: ResultSelector) => readonly T[],
): T[] {
  return [...new Set(selectors.flatMap((selector) => extract(selector)))];
}

@Injectable()
export class ResultScopeFactsRepository {
  async forSelectors(
    client: Prisma.TransactionClient,
    schoolId: string,
    selectors: readonly ResultSelector[],
    requireLiveReferences: boolean,
  ): Promise<ResultScopeFacts> {
    const paths: ResultScopeFacts['paths'] = {
      STAGE: new Map(),
      GRADE: new Map(),
      SECTION: new Map(),
      CLASSROOM: new Map(),
    };
    const idsFor = (level: AcademicLevel) =>
      exactIds(selectors, ({ academicScope }) =>
        academicScope.level === level ? academicScope.ids : [],
      );
    const stageIds = idsFor('STAGE');
    const gradeIds = idsFor('GRADE');
    const sectionIds = idsFor('SECTION');
    const classroomIds = idsFor('CLASSROOM');
    const periodIds = exactIds(selectors, ({ periodSelector }) =>
      periodSelector.kind === 'EXACT_PERIODS' ? periodSelector.periodIds : [],
    );
    const yearIds = exactIds(selectors, ({ periodSelector }) =>
      periodSelector.kind === 'ACADEMIC_YEAR'
        ? [periodSelector.academicYearId]
        : [],
    );
    const subjectIds = exactIds(selectors, ({ groupScope }) =>
      groupScope.kind === 'SUBJECTS' ? groupScope.subjectIds : [],
    );
    const groupIds = exactIds(selectors, ({ groupScope }) =>
      groupScope.kind === 'CUSTOM_GROUPS' ? groupScope.groupIds : [],
    );

    if (!selectors.length) return { paths, periods: new Map() };

    const stageRows = client.stage.findMany({
      where: { schoolId, id: { in: stageIds }, deletedAt: null },
      select: { id: true },
    });
    const gradeRows = client.grade.findMany({
      where: { schoolId, id: { in: gradeIds }, ...validGrade },
      select: { id: true, stageId: true },
    });
    const sectionRows = client.section.findMany({
      where: { schoolId, id: { in: sectionIds }, ...validSection },
      select: { id: true, gradeId: true, grade: { select: { stageId: true } } },
    });
    const classroomRows = client.classroom.findMany({
      where: { schoolId, id: { in: classroomIds }, ...validClass },
      select: classSelect,
    });
    const periodRows = client.resultReportingPeriod.findMany({
      where: { schoolId, id: { in: periodIds } },
      select: topicSelect,
    });
    const [stages, grades, sections, classrooms, periods] = await Promise.all([
      stageRows,
      gradeRows,
      sectionRows,
      classroomRows,
      periodRows,
    ]);
    const [years, subjects, groups] = requireLiveReferences
      ? await Promise.all([
          client.academicYear.count({
            where: { schoolId, id: { in: yearIds }, deletedAt: null },
          }),
          client.subject.count({
            where: {
              schoolId,
              id: { in: subjectIds },
              isActive: true,
              deletedAt: null,
            },
          }),
          client.resultGroup.count({
            where: {
              schoolId,
              id: { in: groupIds },
              kind: 'CUSTOM',
              archivedAt: null,
            },
          }),
        ])
      : [yearIds.length, subjectIds.length, groupIds.length];
    if (
      requireLiveReferences &&
      (stages.length !== stageIds.length ||
        grades.length !== gradeIds.length ||
        sections.length !== sectionIds.length ||
        classrooms.length !== classroomIds.length ||
        periods.length !== periodIds.length ||
        years !== yearIds.length ||
        subjects !== subjectIds.length ||
        groups !== groupIds.length)
    )
      throw new NotFoundDomainException();

    stages.forEach((item) => paths.STAGE.set(item.id, { STAGE: item.id }));
    grades.forEach((item) =>
      paths.GRADE.set(item.id, { STAGE: item.stageId, GRADE: item.id }),
    );
    sections.forEach((item) =>
      paths.SECTION.set(item.id, {
        STAGE: item.grade.stageId,
        GRADE: item.gradeId,
        SECTION: item.id,
      }),
    );
    classrooms.forEach((item) =>
      paths.CLASSROOM.set(item.id, resultClassroomPath(item)),
    );
    return { paths, periods: new Map(periods.map((item) => [item.id, item])) };
  }

  async policyTargets(
    client: Prisma.TransactionClient,
    schoolId: string,
  ): Promise<ConcreteResultsScope[]> {
    const targetLimit = 50_000;
    const [classes, periods, groups, offerings] = await Promise.all([
      client.classroom.findMany({
        where: { schoolId, ...validClass },
        select: classSelect,
        take: targetLimit + 1,
      }),
      client.resultReportingPeriod.findMany({
        where: { schoolId, academicYear: { deletedAt: null } },
        select: { ...topicSelect, termId: true },
        take: targetLimit + 1,
      }),
      client.resultGroup.findMany({
        where: {
          schoolId,
          archivedAt: null,
          OR: [
            { subjectId: null },
            { subject: { isActive: true, deletedAt: null } },
          ],
        },
        select: { id: true, subjectId: true },
        take: targetLimit + 1,
      }),
      client.subjectAllocation.findMany({
        where: { schoolId, deletedAt: null },
        select: {
          academicYearId: true,
          termId: true,
          gradeId: true,
          subjectId: true,
        },
        take: targetLimit + 1,
      }),
    ]);
    if (
      classes.length > targetLimit ||
      periods.length > targetLimit ||
      groups.length > targetLimit ||
      offerings.length > targetLimit
    ) {
      throw new OfficialResultsError('scope.limit_exceeded');
    }
    const groupBySubject = new Map(
      groups.flatMap((group) =>
        group.subjectId ? [[group.subjectId, group] as const] : [],
      ),
    );
    const customGroups = groups.filter(({ subjectId }) => !subjectId);
    const offered = new Map<string, typeof groups>();
    for (const allocation of offerings) {
      const group = groupBySubject.get(allocation.subjectId);
      if (!group) continue;
      const key = `${allocation.academicYearId}:${allocation.termId}:${allocation.gradeId}`;
      const list = offered.get(key) ?? [];
      list.push(group);
      offered.set(key, list);
    }
    const targets: ConcreteResultsScope[] = [];
    let inspected = 0;
    for (const period of periods) {
      for (const classroom of classes) {
        if (++inspected > targetLimit)
          throw new OfficialResultsError('scope.limit_exceeded');
        const academic = resultClassroomPath(classroom);
        const available =
          offered.get(
            `${period.academicYearId}:${period.termId}:${academic.GRADE}`,
          ) ?? [];
        for (const group of [...customGroups, ...available]) {
          if (targets.length >= targetLimit)
            throw new OfficialResultsError('scope.limit_exceeded');
          targets.push({
            academic,
            groupId: group.id,
            subjectId: group.subjectId,
            period,
          });
        }
      }
    }
    return targets;
  }
}
