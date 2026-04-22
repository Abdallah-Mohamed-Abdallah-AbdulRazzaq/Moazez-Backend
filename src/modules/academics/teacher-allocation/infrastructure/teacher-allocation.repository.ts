import { Injectable } from '@nestjs/common';
import { MembershipStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const TEACHER_ALLOCATION_ARGS =
  Prisma.validator<Prisma.TeacherSubjectAllocationDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      teacherUserId: true,
      subjectId: true,
      classroomId: true,
      termId: true,
      createdAt: true,
      updatedAt: true,
      teacherUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      subject: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          code: true,
        },
      },
      classroom: {
        select: {
          id: true,
          sectionId: true,
          roomId: true,
          nameAr: true,
          nameEn: true,
        },
      },
      term: {
        select: {
          id: true,
          academicYearId: true,
          nameAr: true,
          nameEn: true,
          isActive: true,
        },
      },
    },
  });

const ACTIVE_MEMBERSHIP_ARGS =
  Prisma.validator<Prisma.MembershipDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      userType: true,
      status: true,
      endedAt: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          userType: true,
        },
      },
    },
  });

const SUBJECT_REFERENCE_ARGS = Prisma.validator<Prisma.SubjectDefaultArgs>()({
  select: {
    id: true,
    nameAr: true,
    nameEn: true,
    code: true,
    isActive: true,
  },
});

const CLASSROOM_REFERENCE_ARGS =
  Prisma.validator<Prisma.ClassroomDefaultArgs>()({
    select: {
      id: true,
      sectionId: true,
      roomId: true,
      nameAr: true,
      nameEn: true,
    },
  });

const TERM_REFERENCE_ARGS = Prisma.validator<Prisma.TermDefaultArgs>()({
  select: {
    id: true,
    academicYearId: true,
    nameAr: true,
    nameEn: true,
    isActive: true,
  },
});

export type TeacherAllocationRecord = Prisma.TeacherSubjectAllocationGetPayload<
  typeof TEACHER_ALLOCATION_ARGS
>;

export type ActiveMembershipRecord = Prisma.MembershipGetPayload<
  typeof ACTIVE_MEMBERSHIP_ARGS
>;

export type SubjectReferenceRecord = Prisma.SubjectGetPayload<
  typeof SUBJECT_REFERENCE_ARGS
>;

export type ClassroomReferenceRecord = Prisma.ClassroomGetPayload<
  typeof CLASSROOM_REFERENCE_ARGS
>;

export type TermReferenceRecord = Prisma.TermGetPayload<
  typeof TERM_REFERENCE_ARGS
>;

export type DeleteTeacherAllocationResult =
  | { status: 'deleted' }
  | { status: 'not_found' };

@Injectable()
export class TeacherAllocationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  listAllocations(filters: {
    termId?: string;
    classroomId?: string;
  }): Promise<TeacherAllocationRecord[]> {
    return this.scopedPrisma.teacherSubjectAllocation.findMany({
      where: {
        ...(filters.termId ? { termId: filters.termId } : {}),
        ...(filters.classroomId ? { classroomId: filters.classroomId } : {}),
        teacherUser: { is: { deletedAt: null } },
        subject: { is: { deletedAt: null } },
        classroom: { is: { deletedAt: null } },
        term: { is: { deletedAt: null } },
      },
      orderBy: [{ createdAt: 'desc' }],
      ...TEACHER_ALLOCATION_ARGS,
    });
  }

  findAllocationById(allocationId: string): Promise<TeacherAllocationRecord | null> {
    return this.scopedPrisma.teacherSubjectAllocation.findFirst({
      where: { id: allocationId },
      ...TEACHER_ALLOCATION_ARGS,
    });
  }

  findActiveMembershipByUserId(
    userId: string,
  ): Promise<ActiveMembershipRecord | null> {
    return this.scopedPrisma.membership.findFirst({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
        endedAt: null,
        user: { is: { deletedAt: null } },
      },
      ...ACTIVE_MEMBERSHIP_ARGS,
    });
  }

  findSubjectById(subjectId: string): Promise<SubjectReferenceRecord | null> {
    return this.scopedPrisma.subject.findFirst({
      where: { id: subjectId },
      ...SUBJECT_REFERENCE_ARGS,
    });
  }

  findClassroomById(
    classroomId: string,
  ): Promise<ClassroomReferenceRecord | null> {
    return this.scopedPrisma.classroom.findFirst({
      where: { id: classroomId },
      ...CLASSROOM_REFERENCE_ARGS,
    });
  }

  findTermById(termId: string): Promise<TermReferenceRecord | null> {
    return this.scopedPrisma.term.findFirst({
      where: { id: termId },
      ...TERM_REFERENCE_ARGS,
    });
  }

  createAllocation(
    data: Prisma.TeacherSubjectAllocationUncheckedCreateInput,
  ): Promise<TeacherAllocationRecord> {
    return this.scopedPrisma.teacherSubjectAllocation.create({
      data,
      ...TEACHER_ALLOCATION_ARGS,
    });
  }

  async deleteAllocation(
    allocationId: string,
  ): Promise<DeleteTeacherAllocationResult> {
    const result = await this.scopedPrisma.teacherSubjectAllocation.deleteMany({
      where: { id: allocationId },
    });

    return result.count > 0 ? { status: 'deleted' } : { status: 'not_found' };
  }
}
