import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const STAGE_ARGS = Prisma.validator<Prisma.StageDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    nameAr: true,
    nameEn: true,
    sortOrder: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  },
});

const GRADE_ARGS = Prisma.validator<Prisma.GradeDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    stageId: true,
    nameAr: true,
    nameEn: true,
    sortOrder: true,
    capacity: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  },
});

const SECTION_ARGS = Prisma.validator<Prisma.SectionDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    gradeId: true,
    nameAr: true,
    nameEn: true,
    sortOrder: true,
    capacity: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  },
});

const CLASSROOM_ARGS = Prisma.validator<Prisma.ClassroomDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    sectionId: true,
    roomId: true,
    nameAr: true,
    nameEn: true,
    sortOrder: true,
    capacity: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  },
});

const TREE_ARGS = Prisma.validator<Prisma.StageDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    nameAr: true,
    nameEn: true,
    sortOrder: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
    grades: {
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }, { nameAr: 'asc' }],
      select: {
        id: true,
        schoolId: true,
        stageId: true,
        nameAr: true,
        nameEn: true,
        sortOrder: true,
        capacity: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        sections: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }, { nameAr: 'asc' }],
          select: {
            id: true,
            schoolId: true,
            gradeId: true,
            nameAr: true,
            nameEn: true,
            sortOrder: true,
            capacity: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
            classrooms: {
              where: { deletedAt: null },
              orderBy: [
                { sortOrder: 'asc' },
                { nameEn: 'asc' },
                { nameAr: 'asc' },
              ],
              select: {
                id: true,
                schoolId: true,
                sectionId: true,
                roomId: true,
                nameAr: true,
                nameEn: true,
                sortOrder: true,
                capacity: true,
                createdAt: true,
                updatedAt: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    },
  },
});

export type StageRecord = Prisma.StageGetPayload<typeof STAGE_ARGS>;
export type GradeRecord = Prisma.GradeGetPayload<typeof GRADE_ARGS>;
export type SectionRecord = Prisma.SectionGetPayload<typeof SECTION_ARGS>;
export type ClassroomRecord = Prisma.ClassroomGetPayload<typeof CLASSROOM_ARGS>;
export type StructureTreeStageRecord = Prisma.StageGetPayload<typeof TREE_ARGS>;

export type GuardedDeleteResult =
  | { status: 'deleted' }
  | { status: 'not_found' }
  | {
      status: 'has_children';
      childType: 'grade' | 'section' | 'classroom';
      childCount: number;
    };

@Injectable()
export class StructureRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  private getCurrentSchoolId(): string {
    const schoolId = getRequestContext()?.activeMembership?.schoolId;
    if (!schoolId) {
      throw new Error('StructureRepository requires an active school membership');
    }

    return schoolId;
  }

  listTree(): Promise<StructureTreeStageRecord[]> {
    return this.scopedPrisma.stage.findMany({
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }, { nameAr: 'asc' }],
      ...TREE_ARGS,
    });
  }

  findStageById(stageId: string): Promise<StageRecord | null> {
    return this.scopedPrisma.stage.findFirst({
      where: { id: stageId },
      ...STAGE_ARGS,
    });
  }

  findGradeById(gradeId: string): Promise<GradeRecord | null> {
    return this.scopedPrisma.grade.findFirst({
      where: { id: gradeId },
      ...GRADE_ARGS,
    });
  }

  findSectionById(sectionId: string): Promise<SectionRecord | null> {
    return this.scopedPrisma.section.findFirst({
      where: { id: sectionId },
      ...SECTION_ARGS,
    });
  }

  findClassroomById(classroomId: string): Promise<ClassroomRecord | null> {
    return this.scopedPrisma.classroom.findFirst({
      where: { id: classroomId },
      ...CLASSROOM_ARGS,
    });
  }

  createStage(
    data: Prisma.StageUncheckedCreateInput,
  ): Promise<StageRecord> {
    return this.scopedPrisma.stage.create({
      data,
      ...STAGE_ARGS,
    });
  }

  updateStage(
    stageId: string,
    data: Prisma.StageUncheckedUpdateInput,
  ): Promise<StageRecord> {
    return this.prisma.stage.update({
      where: {
        id_schoolId: {
          id: stageId,
          schoolId: this.getCurrentSchoolId(),
        },
      },
      data,
      ...STAGE_ARGS,
    });
  }

  reorderStage(stageId: string, sortOrder: number): Promise<StageRecord> {
    return this.updateStage(stageId, { sortOrder });
  }

  softDeleteStage(stageId: string): Promise<GuardedDeleteResult> {
    const schoolId = this.getCurrentSchoolId();

    return this.prisma.$transaction(async (tx) => {
      const stage = await tx.stage.findFirst({
        where: { id: stageId, schoolId, deletedAt: null },
        ...STAGE_ARGS,
      });
      if (!stage) {
        return { status: 'not_found' } as GuardedDeleteResult;
      }

      const childCount = await tx.grade.count({
        where: { stageId, schoolId, deletedAt: null },
      });
      if (childCount > 0) {
        return {
          status: 'has_children',
          childType: 'grade',
          childCount,
        } as GuardedDeleteResult;
      }

      await tx.stage.update({
        where: {
          id_schoolId: {
            id: stageId,
            schoolId,
          },
        },
        data: { deletedAt: new Date() },
      });

      return { status: 'deleted' } as GuardedDeleteResult;
    });
  }

  createGrade(
    data: Prisma.GradeUncheckedCreateInput,
  ): Promise<GradeRecord> {
    return this.scopedPrisma.grade.create({
      data,
      ...GRADE_ARGS,
    });
  }

  updateGrade(
    gradeId: string,
    data: Prisma.GradeUncheckedUpdateInput,
  ): Promise<GradeRecord> {
    return this.prisma.grade.update({
      where: {
        id_schoolId: {
          id: gradeId,
          schoolId: this.getCurrentSchoolId(),
        },
      },
      data,
      ...GRADE_ARGS,
    });
  }

  reorderGrade(gradeId: string, sortOrder: number): Promise<GradeRecord> {
    return this.updateGrade(gradeId, { sortOrder });
  }

  softDeleteGrade(gradeId: string): Promise<GuardedDeleteResult> {
    const schoolId = this.getCurrentSchoolId();

    return this.prisma.$transaction(async (tx) => {
      const grade = await tx.grade.findFirst({
        where: { id: gradeId, schoolId, deletedAt: null },
        ...GRADE_ARGS,
      });
      if (!grade) {
        return { status: 'not_found' } as GuardedDeleteResult;
      }

      const childCount = await tx.section.count({
        where: { gradeId, schoolId, deletedAt: null },
      });
      if (childCount > 0) {
        return {
          status: 'has_children',
          childType: 'section',
          childCount,
        } as GuardedDeleteResult;
      }

      await tx.grade.update({
        where: {
          id_schoolId: {
            id: gradeId,
            schoolId,
          },
        },
        data: { deletedAt: new Date() },
      });

      return { status: 'deleted' } as GuardedDeleteResult;
    });
  }

  createSection(
    data: Prisma.SectionUncheckedCreateInput,
  ): Promise<SectionRecord> {
    return this.scopedPrisma.section.create({
      data,
      ...SECTION_ARGS,
    });
  }

  updateSection(
    sectionId: string,
    data: Prisma.SectionUncheckedUpdateInput,
  ): Promise<SectionRecord> {
    return this.prisma.section.update({
      where: {
        id_schoolId: {
          id: sectionId,
          schoolId: this.getCurrentSchoolId(),
        },
      },
      data,
      ...SECTION_ARGS,
    });
  }

  reorderSection(
    sectionId: string,
    sortOrder: number,
  ): Promise<SectionRecord> {
    return this.updateSection(sectionId, { sortOrder });
  }

  softDeleteSection(sectionId: string): Promise<GuardedDeleteResult> {
    const schoolId = this.getCurrentSchoolId();

    return this.prisma.$transaction(async (tx) => {
      const section = await tx.section.findFirst({
        where: { id: sectionId, schoolId, deletedAt: null },
        ...SECTION_ARGS,
      });
      if (!section) {
        return { status: 'not_found' } as GuardedDeleteResult;
      }

      const childCount = await tx.classroom.count({
        where: { sectionId, schoolId, deletedAt: null },
      });
      if (childCount > 0) {
        return {
          status: 'has_children',
          childType: 'classroom',
          childCount,
        } as GuardedDeleteResult;
      }

      await tx.section.update({
        where: {
          id_schoolId: {
            id: sectionId,
            schoolId,
          },
        },
        data: { deletedAt: new Date() },
      });

      return { status: 'deleted' } as GuardedDeleteResult;
    });
  }

  createClassroom(
    data: Prisma.ClassroomUncheckedCreateInput,
  ): Promise<ClassroomRecord> {
    return this.scopedPrisma.classroom.create({
      data,
      ...CLASSROOM_ARGS,
    });
  }

  updateClassroom(
    classroomId: string,
    data: Prisma.ClassroomUncheckedUpdateInput,
  ): Promise<ClassroomRecord> {
    return this.prisma.classroom.update({
      where: {
        id_schoolId: {
          id: classroomId,
          schoolId: this.getCurrentSchoolId(),
        },
      },
      data,
      ...CLASSROOM_ARGS,
    });
  }

  reorderClassroom(
    classroomId: string,
    sortOrder: number,
  ): Promise<ClassroomRecord> {
    return this.updateClassroom(classroomId, { sortOrder });
  }

  softDeleteClassroom(classroomId: string): Promise<GuardedDeleteResult> {
    const schoolId = this.getCurrentSchoolId();

    return this.prisma.$transaction(async (tx) => {
      const classroom = await tx.classroom.findFirst({
        where: { id: classroomId, schoolId, deletedAt: null },
        ...CLASSROOM_ARGS,
      });
      if (!classroom) {
        return { status: 'not_found' } as GuardedDeleteResult;
      }

      await tx.classroom.update({
        where: {
          id_schoolId: {
            id: classroomId,
            schoolId,
          },
        },
        data: { deletedAt: new Date() },
      });

      return { status: 'deleted' } as GuardedDeleteResult;
    });
  }
}
