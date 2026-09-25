import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

@Injectable()
export class AcademicContentValidationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAcademicYear(id: string, schoolId: string) {
    return this.prisma.academicYear.findFirst({
      where: { id, schoolId, deletedAt: null },
      select: { id: true },
    });
  }

  findTerm(id: string, schoolId: string) {
    return this.prisma.term.findFirst({
      where: { id, schoolId, deletedAt: null },
      select: {
        academicYearId: true,
        startDate: true,
        endDate: true,
        isActive: true,
      },
    });
  }

  findSubject(id: string, schoolId: string) {
    return this.prisma.subject.findFirst({
      where: { id, schoolId, deletedAt: null },
      select: { id: true },
    });
  }

  findSubjectAllocation(input: {
    schoolId: string;
    academicYearId: string;
    termId: string;
    gradeIds: string[];
    subjectId: string;
  }) {
    return this.prisma.subjectAllocation.findFirst({
      where: {
        schoolId: input.schoolId,
        academicYearId: input.academicYearId,
        termId: input.termId,
        gradeId: { in: input.gradeIds },
        subjectId: input.subjectId,
        weeklyHours: { gt: 0 },
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  findTeacherAllocation(input: {
    id: string;
    schoolId: string;
    academicYearId: string;
    termId: string;
    classroomId: string;
    subjectId: string;
  }) {
    return this.prisma.teacherSubjectAllocation.findFirst({
      where: {
        id: input.id,
        schoolId: input.schoolId,
        termId: input.termId,
        classroomId: input.classroomId,
        subjectId: input.subjectId,
        term: {
          academicYearId: input.academicYearId,
          schoolId: input.schoolId,
          deletedAt: null,
        },
      },
      select: { teacherUserId: true },
    });
  }

  findStage(id: string, schoolId: string) {
    return this.prisma.stage.findFirst({
      where: { id, schoolId, deletedAt: null },
      select: { id: true },
    });
  }

  findGrades(schoolId: string, stageId?: string) {
    return this.prisma.grade.findMany({
      where: {
        schoolId,
        deletedAt: null,
        stageId,
        stage: { deletedAt: null },
      },
      select: { id: true },
    });
  }

  findGrade(id: string, schoolId: string) {
    return this.prisma.grade.findFirst({
      where: { id, schoolId, deletedAt: null, stage: { deletedAt: null } },
      select: { id: true },
    });
  }

  findSection(id: string, schoolId: string) {
    return this.prisma.section.findFirst({
      where: {
        id,
        schoolId,
        deletedAt: null,
        grade: { deletedAt: null, stage: { deletedAt: null } },
      },
      select: { gradeId: true },
    });
  }

  findClassroom(id: string, schoolId: string) {
    return this.prisma.classroom.findFirst({
      where: {
        id,
        schoolId,
        deletedAt: null,
        section: {
          deletedAt: null,
          grade: { deletedAt: null, stage: { deletedAt: null } },
        },
      },
      select: { section: { select: { gradeId: true } } },
    });
  }
}
