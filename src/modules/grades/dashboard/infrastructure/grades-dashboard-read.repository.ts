import { Injectable } from '@nestjs/common';
import { GradeScopeType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { GradesReadScope } from '../../shared/infrastructure/grades-read-model.repository';

const BOOTSTRAP_ACADEMIC_YEAR_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
  isActive: true,
} satisfies Prisma.AcademicYearSelect;

const BOOTSTRAP_TERM_SELECT = {
  id: true,
  academicYearId: true,
  nameAr: true,
  nameEn: true,
  startDate: true,
  endDate: true,
  isActive: true,
} satisfies Prisma.TermSelect;

const BOOTSTRAP_STAGE_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
  sortOrder: true,
} satisfies Prisma.StageSelect;

const BOOTSTRAP_GRADE_SELECT = {
  id: true,
  stageId: true,
  nameAr: true,
  nameEn: true,
  sortOrder: true,
} satisfies Prisma.GradeSelect;

const BOOTSTRAP_SECTION_SELECT = {
  id: true,
  gradeId: true,
  nameAr: true,
  nameEn: true,
  sortOrder: true,
} satisfies Prisma.SectionSelect;

const BOOTSTRAP_CLASSROOM_SELECT = {
  id: true,
  sectionId: true,
  nameAr: true,
  nameEn: true,
  section: {
    select: {
      gradeId: true,
    },
  },
} satisfies Prisma.ClassroomSelect;

const BOOTSTRAP_SUBJECT_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
  code: true,
  isActive: true,
} satisfies Prisma.SubjectSelect;

const SCOPE_LABEL_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
} satisfies Prisma.StageSelect;

export type GradesDashboardAcademicYearRecord = Prisma.AcademicYearGetPayload<{
  select: typeof BOOTSTRAP_ACADEMIC_YEAR_SELECT;
}>;
export type GradesDashboardTermRecord = Prisma.TermGetPayload<{
  select: typeof BOOTSTRAP_TERM_SELECT;
}>;
export type GradesDashboardStageRecord = Prisma.StageGetPayload<{
  select: typeof BOOTSTRAP_STAGE_SELECT;
}>;
export type GradesDashboardGradeRecord = Prisma.GradeGetPayload<{
  select: typeof BOOTSTRAP_GRADE_SELECT;
}>;
export type GradesDashboardSectionRecord = Prisma.SectionGetPayload<{
  select: typeof BOOTSTRAP_SECTION_SELECT;
}>;
export type GradesDashboardClassroomRecord = Prisma.ClassroomGetPayload<{
  select: typeof BOOTSTRAP_CLASSROOM_SELECT;
}>;
export type GradesDashboardSubjectRecord = Prisma.SubjectGetPayload<{
  select: typeof BOOTSTRAP_SUBJECT_SELECT;
}>;

export interface GradesDashboardBootstrapData {
  academicYears: GradesDashboardAcademicYearRecord[];
  terms: GradesDashboardTermRecord[];
  stages: GradesDashboardStageRecord[];
  grades: GradesDashboardGradeRecord[];
  sections: GradesDashboardSectionRecord[];
  classrooms: GradesDashboardClassroomRecord[];
  subjects: GradesDashboardSubjectRecord[];
}

@Injectable()
export class GradesDashboardReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async getBootstrapData(): Promise<GradesDashboardBootstrapData> {
    const [
      academicYears,
      terms,
      stages,
      grades,
      sections,
      classrooms,
      subjects,
    ] = await Promise.all([
      this.scopedPrisma.academicYear.findMany({
        orderBy: [
          { isActive: 'desc' },
          { id: 'asc' },
        ],
        select: BOOTSTRAP_ACADEMIC_YEAR_SELECT,
      }),
      this.scopedPrisma.term.findMany({
        orderBy: [
          { academicYearId: 'asc' },
          { startDate: 'asc' },
          { nameEn: 'asc' },
          { nameAr: 'asc' },
        ],
        select: BOOTSTRAP_TERM_SELECT,
      }),
      this.scopedPrisma.stage.findMany({
        orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }, { nameAr: 'asc' }],
        select: BOOTSTRAP_STAGE_SELECT,
      }),
      this.scopedPrisma.grade.findMany({
        where: { stage: { deletedAt: null } },
        orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }, { nameAr: 'asc' }],
        select: BOOTSTRAP_GRADE_SELECT,
      }),
      this.scopedPrisma.section.findMany({
        where: { grade: { deletedAt: null, stage: { deletedAt: null } } },
        orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }, { nameAr: 'asc' }],
        select: BOOTSTRAP_SECTION_SELECT,
      }),
      this.scopedPrisma.classroom.findMany({
        where: {
          section: {
            deletedAt: null,
            grade: { deletedAt: null, stage: { deletedAt: null } },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }, { nameAr: 'asc' }],
        select: BOOTSTRAP_CLASSROOM_SELECT,
      }),
      this.scopedPrisma.subject.findMany({
        where: { isActive: true },
        orderBy: [{ nameEn: 'asc' }, { nameAr: 'asc' }],
        select: BOOTSTRAP_SUBJECT_SELECT,
      }),
    ]);

    return {
      academicYears,
      terms,
      stages,
      grades,
      sections,
      classrooms,
      subjects,
    };
  }

  async findScopeLabel(scope: GradesReadScope): Promise<string> {
    switch (scope.scopeType) {
      case GradeScopeType.SCHOOL:
        return this.findSchoolLabel(scope.scopeKey);
      case GradeScopeType.STAGE:
        return this.findNamedScopeLabel('stage', scope.stageId ?? scope.scopeKey);
      case GradeScopeType.GRADE:
        return this.findNamedScopeLabel('grade', scope.gradeId ?? scope.scopeKey);
      case GradeScopeType.SECTION:
        return this.findNamedScopeLabel(
          'section',
          scope.sectionId ?? scope.scopeKey,
        );
      case GradeScopeType.CLASSROOM:
        return this.findNamedScopeLabel(
          'classroom',
          scope.classroomId ?? scope.scopeKey,
        );
    }
  }

  private async findSchoolLabel(schoolId: string): Promise<string> {
    const school = await this.prisma.school.findFirst({
      where: { id: schoolId, deletedAt: null },
      select: { name: true },
    });

    return school?.name ?? 'Whole school';
  }

  private async findNamedScopeLabel(
    model: 'stage' | 'grade' | 'section' | 'classroom',
    id: string,
  ): Promise<string> {
    const record =
      model === 'stage'
        ? await this.scopedPrisma.stage.findFirst({
            where: { id },
            select: SCOPE_LABEL_SELECT,
          })
        : model === 'grade'
          ? await this.scopedPrisma.grade.findFirst({
              where: { id },
              select: SCOPE_LABEL_SELECT,
            })
          : model === 'section'
            ? await this.scopedPrisma.section.findFirst({
                where: { id },
                select: SCOPE_LABEL_SELECT,
              })
            : await this.scopedPrisma.classroom.findFirst({
                where: { id },
                select: SCOPE_LABEL_SELECT,
              });

    return record?.nameEn || record?.nameAr || id;
  }
}
