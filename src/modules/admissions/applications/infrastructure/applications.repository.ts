import { Injectable } from '@nestjs/common';
import {
  InterviewStatus,
  PlacementTestStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const APPLICATION_RECORD_ARGS =
  Prisma.validator<Prisma.ApplicationDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      organizationId: true,
      leadId: true,
      studentName: true,
      requestedAcademicYearId: true,
      requestedGradeId: true,
      source: true,
      status: true,
      submittedAt: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    },
  });

export type ApplicationRecord = Prisma.ApplicationGetPayload<
  typeof APPLICATION_RECORD_ARGS
>;

const APPLICATION_ENROLLMENT_HANDOFF_RECORD_ARGS =
  Prisma.validator<Prisma.ApplicationDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      organizationId: true,
      leadId: true,
      studentName: true,
      requestedAcademicYearId: true,
      requestedGradeId: true,
      status: true,
      submittedAt: true,
      decision: {
        select: {
          id: true,
          decision: true,
          decidedAt: true,
        },
      },
      requestedAcademicYear: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          isActive: true,
        },
      },
      requestedGrade: {
        select: {
          id: true,
          stageId: true,
          nameAr: true,
          nameEn: true,
        },
      },
    },
  });

export type ApplicationEnrollmentHandoffRecord = Prisma.ApplicationGetPayload<
  typeof APPLICATION_ENROLLMENT_HANDOFF_RECORD_ARGS
>;

@Injectable()
export class ApplicationsRepository {
  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  constructor(private readonly prisma: PrismaService) {}

  listApplications(filters: {
    status?: Prisma.ApplicationWhereInput['status'];
  }): Promise<ApplicationRecord[]> {
    return this.scopedPrisma.application.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      ...APPLICATION_RECORD_ARGS,
    });
  }

  findApplicationById(applicationId: string): Promise<ApplicationRecord | null> {
    return this.scopedPrisma.application.findFirst({
      where: { id: applicationId },
      ...APPLICATION_RECORD_ARGS,
    });
  }

  findApplicationEnrollmentHandoffById(
    applicationId: string,
  ): Promise<ApplicationEnrollmentHandoffRecord | null> {
    return this.scopedPrisma.application.findFirst({
      where: { id: applicationId },
      ...APPLICATION_ENROLLMENT_HANDOFF_RECORD_ARGS,
    });
  }

  findLeadById(leadId: string): Promise<{ id: string } | null> {
    return this.scopedPrisma.lead.findFirst({
      where: { id: leadId },
      select: { id: true },
    });
  }

  findAcademicYearById(
    academicYearId: string,
  ): Promise<{ id: string } | null> {
    return this.scopedPrisma.academicYear.findFirst({
      where: { id: academicYearId },
      select: { id: true },
    });
  }

  findGradeById(gradeId: string): Promise<{ id: string } | null> {
    return this.scopedPrisma.grade.findFirst({
      where: { id: gradeId },
      select: { id: true },
    });
  }

  countPlacementTestsForApplication(params: {
    applicationId: string;
    status?: PlacementTestStatus;
  }): Promise<number> {
    return this.scopedPrisma.placementTest.count({
      where: {
        applicationId: params.applicationId,
        ...(params.status ? { status: params.status } : {}),
      },
    });
  }

  countInterviewsForApplication(params: {
    applicationId: string;
    status?: InterviewStatus;
  }): Promise<number> {
    return this.scopedPrisma.interview.count({
      where: {
        applicationId: params.applicationId,
        ...(params.status ? { status: params.status } : {}),
      },
    });
  }

  createApplication(
    data: Prisma.ApplicationUncheckedCreateInput,
  ): Promise<ApplicationRecord> {
    return this.prisma.application.create({
      data,
      ...APPLICATION_RECORD_ARGS,
    });
  }

  async updateApplication(
    applicationId: string,
    data: Prisma.ApplicationUncheckedUpdateInput,
  ): Promise<ApplicationRecord | null> {
    const result = await this.scopedPrisma.application.updateMany({
      where: {
        id: applicationId,
        deletedAt: null,
      },
      data,
    });

    if (result.count === 0) {
      return null;
    }

    return this.findApplicationById(applicationId);
  }
}
