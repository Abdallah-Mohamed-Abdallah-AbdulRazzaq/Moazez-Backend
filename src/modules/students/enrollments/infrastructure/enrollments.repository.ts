import { Injectable } from '@nestjs/common';
import { Prisma, StudentEnrollmentStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const ACADEMIC_YEAR_ARGS =
  Prisma.validator<Prisma.AcademicYearDefaultArgs>()({
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
      isActive: true,
    },
  });

const ENROLLMENT_RECORD_ARGS = Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
  select: {
    id: true,
    schoolId: true,
    studentId: true,
    academicYearId: true,
    termId: true,
    classroomId: true,
    status: true,
    enrolledAt: true,
    endedAt: true,
    exitReason: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
    academicYear: {
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        isActive: true,
      },
    },
    classroom: {
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        section: {
          select: {
            id: true,
            nameAr: true,
            nameEn: true,
            grade: {
              select: {
                id: true,
                nameAr: true,
                nameEn: true,
              },
            },
          },
        },
      },
    },
  },
});

export type AcademicYearRecord = Prisma.AcademicYearGetPayload<
  typeof ACADEMIC_YEAR_ARGS
>;
export type EnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof ENROLLMENT_RECORD_ARGS
>;

function buildAcademicYearFilter(
  academicYearId?: string,
  academicYearName?: string,
): Prisma.EnrollmentWhereInput {
  const normalizedAcademicYearName = academicYearName?.trim();

  return {
    ...(academicYearId ? { academicYearId } : {}),
    ...(normalizedAcademicYearName
      ? {
          academicYear: {
            OR: [
              {
                nameEn: {
                  equals: normalizedAcademicYearName,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                nameAr: {
                  equals: normalizedAcademicYearName,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          },
        }
      : {}),
  };
}

@Injectable()
export class EnrollmentsRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  listEnrollments(filters: {
    studentId?: string;
    academicYearId?: string;
    academicYear?: string;
    status?: EnrollmentRecord['status'];
  }): Promise<EnrollmentRecord[]> {
    return this.scopedPrisma.enrollment.findMany({
      where: {
        ...(filters.studentId ? { studentId: filters.studentId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...buildAcademicYearFilter(filters.academicYearId, filters.academicYear),
      },
      orderBy: [{ enrolledAt: 'desc' }, { createdAt: 'desc' }],
      ...ENROLLMENT_RECORD_ARGS,
    });
  }

  findEnrollmentById(enrollmentId: string): Promise<EnrollmentRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: { id: enrollmentId },
      ...ENROLLMENT_RECORD_ARGS,
    });
  }

  findCurrentEnrollment(params: {
    studentId: string;
    academicYearId?: string;
    academicYear?: string;
  }): Promise<EnrollmentRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: {
        studentId: params.studentId,
        status: StudentEnrollmentStatus.ACTIVE,
        ...buildAcademicYearFilter(params.academicYearId, params.academicYear),
      },
      orderBy: [{ enrolledAt: 'desc' }, { createdAt: 'desc' }],
      ...ENROLLMENT_RECORD_ARGS,
    });
  }

  listEnrollmentHistory(studentId: string): Promise<EnrollmentRecord[]> {
    return this.scopedPrisma.enrollment.findMany({
      where: { studentId },
      orderBy: [{ enrolledAt: 'desc' }, { createdAt: 'desc' }],
      ...ENROLLMENT_RECORD_ARGS,
    });
  }

  findActiveEnrollmentByStudentId(
    studentId: string,
  ): Promise<EnrollmentRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: {
        studentId,
        status: StudentEnrollmentStatus.ACTIVE,
      },
      orderBy: [{ enrolledAt: 'desc' }, { createdAt: 'desc' }],
      ...ENROLLMENT_RECORD_ARGS,
    });
  }

  createEnrollment(
    data: Prisma.EnrollmentUncheckedCreateInput,
  ): Promise<EnrollmentRecord> {
    return this.prisma.enrollment.create({
      data,
      ...ENROLLMENT_RECORD_ARGS,
    });
  }

  listAcademicYears(): Promise<AcademicYearRecord[]> {
    return this.scopedPrisma.academicYear.findMany({
      orderBy: [{ startDate: 'desc' }, { nameEn: 'asc' }, { nameAr: 'asc' }],
      ...ACADEMIC_YEAR_ARGS,
    });
  }

  findAcademicYearById(
    academicYearId: string,
  ): Promise<AcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      ...ACADEMIC_YEAR_ARGS,
    });
  }

  findAcademicYearByName(
    academicYearName: string,
  ): Promise<AcademicYearRecord | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: {
        OR: [
          {
            nameEn: {
              equals: academicYearName,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            nameAr: {
              equals: academicYearName,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        ],
      },
      ...ACADEMIC_YEAR_ARGS,
    });
  }
}
