import { Injectable } from '@nestjs/common';
import {
  StudentEnrollmentStatus,
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

const APPLICATION_REGISTRATION_HANDOFF_RECORD_ARGS =
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
      lead: {
        select: {
          id: true,
          studentName: true,
          primaryContactName: true,
          phone: true,
          email: true,
        },
      },
      applicantAdmissionRequest: {
        select: {
          id: true,
          schoolId: true,
          applicationId: true,
          requestedAcademicYearId: true,
          requestedGradeId: true,
          childFirstName: true,
          childLastName: true,
          childFullName: true,
          childDateOfBirth: true,
          childGender: true,
          childNationality: true,
          previousSchool: true,
          notes: true,
          submittedAt: true,
          requestedAcademicYear: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
            },
          },
          requestedGrade: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
            },
          },
          applicantProfile: {
            select: {
              fullName: true,
              phoneNumber: true,
              city: true,
              relationship: true,
              user: {
                select: {
                  email: true,
                  contactEmail: true,
                },
              },
            },
          },
        },
      },
      documents: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          applicationId: true,
          fileId: true,
          documentType: true,
          status: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          file: {
            select: {
              id: true,
              originalName: true,
              mimeType: true,
              sizeBytes: true,
              visibility: true,
            },
          },
          applicantAdmissionRequestDocuments: {
            where: { deletedAt: null },
            select: {
              id: true,
            },
          },
        },
      },
      student: {
        select: {
          id: true,
          schoolId: true,
          organizationId: true,
          applicationId: true,
          userId: true,
          firstName: true,
          fatherNameEn: true,
          grandfatherNameEn: true,
          lastName: true,
          firstNameAr: true,
          fatherNameAr: true,
          grandfatherNameAr: true,
          familyNameAr: true,
          birthDate: true,
          gender: true,
          nationality: true,
          addressLine: true,
          city: true,
          district: true,
          studentPhone: true,
          studentEmail: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          enrollments: {
            where: {
              status: StudentEnrollmentStatus.ACTIVE,
              deletedAt: null,
            },
            orderBy: [{ enrolledAt: 'desc' }, { createdAt: 'desc' }],
            take: 1,
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
          },
        },
      },
    },
  });

export type ApplicationRegistrationHandoffRecord =
  Prisma.ApplicationGetPayload<
    typeof APPLICATION_REGISTRATION_HANDOFF_RECORD_ARGS
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

  findApplicationRegistrationHandoffById(
    applicationId: string,
  ): Promise<ApplicationRegistrationHandoffRecord | null> {
    return this.scopedPrisma.application.findFirst({
      where: { id: applicationId },
      ...APPLICATION_REGISTRATION_HANDOFF_RECORD_ARGS,
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
