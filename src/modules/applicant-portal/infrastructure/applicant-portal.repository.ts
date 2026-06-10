import { Injectable } from '@nestjs/common';
import {
  ApplicantAdmissionRequestStatus,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ApplicantRequestStatusFilter } from '../domain/applicant-request.inputs';
import { NormalizedSchoolDiscoveryQuery } from '../domain/school-discovery.inputs';
import { ApplicantRelationship } from '../domain/applicant-profile.inputs';

const APPLICANT_PROFILE_WITH_USER = {
  include: { user: true },
} satisfies Prisma.ApplicantProfileDefaultArgs;

export type ApplicantProfileRecord = Prisma.ApplicantProfileGetPayload<
  typeof APPLICANT_PROFILE_WITH_USER
>;

const DISCOVERABLE_SCHOOL_ARGS = {
  select: {
    id: true,
    name: true,
    schoolProfile: {
      select: {
        schoolName: true,
        shortName: true,
        addressLine: true,
        formattedAddress: true,
        city: true,
        country: true,
        logoUrl: true,
      },
    },
  },
} satisfies Prisma.SchoolDefaultArgs;

export type DiscoverableSchoolRecord = Prisma.SchoolGetPayload<
  typeof DISCOVERABLE_SCHOOL_ARGS
>;

const DISCOVERABLE_SCHOOL_FOR_REQUEST_ARGS = {
  select: {
    id: true,
    organizationId: true,
  },
} satisfies Prisma.SchoolDefaultArgs;

export type DiscoverableSchoolForRequestRecord = Prisma.SchoolGetPayload<
  typeof DISCOVERABLE_SCHOOL_FOR_REQUEST_ARGS
>;

const ADMISSION_REQUIRED_DOCUMENT_ARGS = {
  select: {
    id: true,
    title: true,
    description: true,
    isMandatory: true,
    acceptedFileTypes: true,
    maxFiles: true,
    sortOrder: true,
  },
} satisfies Prisma.AdmissionRequiredDocumentDefaultArgs;

export type AdmissionRequiredDocumentRecord =
  Prisma.AdmissionRequiredDocumentGetPayload<
    typeof ADMISSION_REQUIRED_DOCUMENT_ARGS
  >;

const APPLICANT_REQUEST_SCHOOL_SUMMARY_SELECT = {
  id: true,
  name: true,
  schoolProfile: {
    select: {
      schoolName: true,
      shortName: true,
      city: true,
      country: true,
    },
  },
} satisfies Prisma.SchoolSelect;

const APPLICANT_ADMISSION_REQUEST_ARGS = {
  select: {
    id: true,
    status: true,
    childFirstName: true,
    childLastName: true,
    childFullName: true,
    childDateOfBirth: true,
    childGender: true,
    childNationality: true,
    previousSchool: true,
    notes: true,
    createdAt: true,
    updatedAt: true,
    school: { select: APPLICANT_REQUEST_SCHOOL_SUMMARY_SELECT },
    requestedAcademicYear: {
      select: {
        id: true,
        nameEn: true,
        nameAr: true,
      },
    },
    requestedGrade: {
      select: {
        id: true,
        nameEn: true,
        nameAr: true,
      },
    },
  },
} satisfies Prisma.ApplicantAdmissionRequestDefaultArgs;

export type ApplicantAdmissionRequestRecord =
  Prisma.ApplicantAdmissionRequestGetPayload<
    typeof APPLICANT_ADMISSION_REQUEST_ARGS
  >;

export interface CreateApplicantAccountRecord {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phoneNumber: string | null;
  city: string | null;
  relationship: ApplicantRelationship;
}

export interface DiscoverableSchoolListResult {
  items: DiscoverableSchoolRecord[];
  page: number;
  limit: number;
  total: number;
}

export interface CreateApplicantAdmissionRequestRecord {
  applicantUserId: string;
  applicantProfileId: string;
  schoolId: string;
  organizationId: string;
  requestedAcademicYearId: string | null;
  requestedGradeId: string | null;
  childFirstName: string;
  childLastName: string | null;
  childFullName: string;
  childDateOfBirth: Date | null;
  childGender: string | null;
  childNationality: string | null;
  previousSchool: string | null;
  notes: string | null;
}

export interface ApplicantAdmissionRequestListResult {
  items: ApplicantAdmissionRequestRecord[];
  page: number;
  limit: number;
  total: number;
}

@Injectable()
export class ApplicantPortalRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true },
    });
  }

  async createApplicantAccount(
    data: CreateApplicantAccountRecord,
  ): Promise<ApplicantProfileRecord> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          contactEmail: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          userType: UserType.APPLICANT,
          status: UserStatus.ACTIVE,
          passwordHash: data.passwordHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          credentialVersion: 1,
        },
        select: { id: true },
      });

      return tx.applicantProfile.create({
        data: {
          userId: user.id,
          fullName: data.fullName,
          phoneNumber: data.phoneNumber,
          city: data.city,
          relationship: data.relationship,
        },
        ...APPLICANT_PROFILE_WITH_USER,
      });
    });
  }

  findApplicantProfileByUserId(
    userId: string,
  ): Promise<ApplicantProfileRecord | null> {
    return this.prisma.applicantProfile.findUnique({
      where: { userId },
      ...APPLICANT_PROFILE_WITH_USER,
    });
  }

  countActiveMembershipsForUser(userId: string): Promise<number> {
    return this.prisma.membership.count({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
        deletedAt: null,
      },
    });
  }

  async listDiscoverableSchools(
    params: NormalizedSchoolDiscoveryQuery,
  ): Promise<DiscoverableSchoolListResult> {
    const where = buildDiscoverableSchoolWhere(params);
    const skip = (params.page - 1) * params.limit;

    const [items, total] = await Promise.all([
      this.prisma.school.findMany({
        where,
        orderBy: [{ name: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take: params.limit,
        ...DISCOVERABLE_SCHOOL_ARGS,
      }),
      this.prisma.school.count({ where }),
    ]);

    return {
      items,
      page: params.page,
      limit: params.limit,
      total,
    };
  }

  findDiscoverableSchoolById(
    schoolId: string,
  ): Promise<DiscoverableSchoolRecord | null> {
    return this.prisma.school.findFirst({
      where: {
        AND: [buildDiscoverableSchoolWhere(), { id: schoolId }],
      },
      ...DISCOVERABLE_SCHOOL_ARGS,
    });
  }

  findDiscoverableSchoolForRequest(
    schoolId: string,
  ): Promise<DiscoverableSchoolForRequestRecord | null> {
    return this.prisma.school.findFirst({
      where: {
        AND: [buildDiscoverableSchoolWhere(), { id: schoolId }],
      },
      ...DISCOVERABLE_SCHOOL_FOR_REQUEST_ARGS,
    });
  }

  listActiveAdmissionRequiredDocumentsForSchool(
    schoolId: string,
  ): Promise<AdmissionRequiredDocumentRecord[]> {
    return this.prisma.admissionRequiredDocument.findMany({
      where: {
        schoolId,
        gradeId: null,
        isActive: true,
        deletedAt: null,
      },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }, { createdAt: 'asc' }],
      ...ADMISSION_REQUIRED_DOCUMENT_ARGS,
    });
  }

  countMandatoryRequiredDocumentsForSchool(schoolId: string): Promise<number> {
    return this.prisma.admissionRequiredDocument.count({
      where: {
        schoolId,
        gradeId: null,
        isMandatory: true,
        isActive: true,
        deletedAt: null,
      },
    });
  }

  findAcademicYearForSchool(
    schoolId: string,
    academicYearId: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.academicYear.findFirst({
      where: {
        id: academicYearId,
        schoolId,
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  findGradeForSchool(
    schoolId: string,
    gradeId: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.grade.findFirst({
      where: {
        id: gradeId,
        schoolId,
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  createApplicantAdmissionRequest(
    data: CreateApplicantAdmissionRequestRecord,
  ): Promise<ApplicantAdmissionRequestRecord> {
    return this.prisma.applicantAdmissionRequest.create({
      data: {
        applicantUserId: data.applicantUserId,
        applicantProfileId: data.applicantProfileId,
        schoolId: data.schoolId,
        organizationId: data.organizationId,
        requestedAcademicYearId: data.requestedAcademicYearId,
        requestedGradeId: data.requestedGradeId,
        childFirstName: data.childFirstName,
        childLastName: data.childLastName,
        childFullName: data.childFullName,
        childDateOfBirth: data.childDateOfBirth,
        childGender: data.childGender,
        childNationality: data.childNationality,
        previousSchool: data.previousSchool,
        notes: data.notes,
        status: ApplicantAdmissionRequestStatus.DRAFT,
        submittedAt: null,
      },
      ...APPLICANT_ADMISSION_REQUEST_ARGS,
    });
  }

  async listApplicantAdmissionRequestsForApplicant(params: {
    applicantUserId: string;
    page: number;
    limit: number;
    status?: ApplicantRequestStatusFilter;
  }): Promise<ApplicantAdmissionRequestListResult> {
    const where: Prisma.ApplicantAdmissionRequestWhereInput = {
      applicantUserId: params.applicantUserId,
      deletedAt: null,
      status: toApplicantAdmissionRequestStatus(params.status),
    };
    const skip = (params.page - 1) * params.limit;

    const [items, total] = await Promise.all([
      this.prisma.applicantAdmissionRequest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: params.limit,
        ...APPLICANT_ADMISSION_REQUEST_ARGS,
      }),
      this.prisma.applicantAdmissionRequest.count({ where }),
    ]);

    return {
      items,
      page: params.page,
      limit: params.limit,
      total,
    };
  }

  findApplicantAdmissionRequestForApplicant(params: {
    applicantUserId: string;
    requestId: string;
  }): Promise<ApplicantAdmissionRequestRecord | null> {
    return this.prisma.applicantAdmissionRequest.findFirst({
      where: {
        id: params.requestId,
        applicantUserId: params.applicantUserId,
        deletedAt: null,
      },
      ...APPLICANT_ADMISSION_REQUEST_ARGS,
    });
  }
}

function buildDiscoverableSchoolWhere(
  params: Partial<Pick<NormalizedSchoolDiscoveryQuery, 'search' | 'city'>> = {},
): Prisma.SchoolWhereInput {
  const filters: Prisma.SchoolWhereInput[] = [
    {
      status: SchoolStatus.ACTIVE,
      deletedAt: null,
      organization: {
        status: OrganizationStatus.ACTIVE,
        deletedAt: null,
      },
    },
  ];

  if (params.city) {
    filters.push({
      schoolProfile: {
        is: {
          city: { equals: params.city, mode: 'insensitive' },
        },
      },
    });
  }

  if (params.search) {
    filters.push({
      OR: [
        { name: { contains: params.search, mode: 'insensitive' } },
        { slug: { contains: params.search, mode: 'insensitive' } },
        {
          schoolProfile: {
            is: {
              schoolName: {
                contains: params.search,
                mode: 'insensitive',
              },
            },
          },
        },
        {
          schoolProfile: {
            is: {
              shortName: {
                contains: params.search,
                mode: 'insensitive',
              },
            },
          },
        },
        {
          schoolProfile: {
            is: {
              city: {
                contains: params.search,
                mode: 'insensitive',
              },
            },
          },
        },
      ],
    });
  }

  return { AND: filters };
}

function toApplicantAdmissionRequestStatus(
  status: ApplicantRequestStatusFilter | undefined,
): ApplicantAdmissionRequestStatus | undefined {
  if (status === 'draft') return ApplicantAdmissionRequestStatus.DRAFT;
  if (status === 'submitted') return ApplicantAdmissionRequestStatus.SUBMITTED;
  return undefined;
}
