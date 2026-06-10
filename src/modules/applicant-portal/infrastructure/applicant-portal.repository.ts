import { Injectable } from '@nestjs/common';
import {
  AdmissionApplicationSource,
  AdmissionApplicationStatus,
  ApplicantAdmissionRequestDocumentStatus,
  ApplicantAdmissionRequestStatus,
  FileVisibility,
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

const ADMISSION_REQUIRED_DOCUMENT_FOR_UPLOAD_ARGS = {
  select: {
    id: true,
    schoolId: true,
    title: true,
    isMandatory: true,
    acceptedFileTypes: true,
  },
} satisfies Prisma.AdmissionRequiredDocumentDefaultArgs;

export type AdmissionRequiredDocumentForUploadRecord =
  Prisma.AdmissionRequiredDocumentGetPayload<
    typeof ADMISSION_REQUIRED_DOCUMENT_FOR_UPLOAD_ARGS
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
    application: {
      select: {
        status: true,
      },
    },
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

const APPLICANT_ADMISSION_REQUEST_FOR_DOCUMENT_ACCESS_ARGS = {
  select: {
    id: true,
    applicantUserId: true,
    schoolId: true,
    organizationId: true,
    status: true,
    application: {
      select: {
        status: true,
        deletedAt: true,
      },
    },
    school: {
      select: {
        id: true,
        organizationId: true,
        status: true,
        deletedAt: true,
        organization: {
          select: {
            id: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    },
  },
} satisfies Prisma.ApplicantAdmissionRequestDefaultArgs;

export type ApplicantAdmissionRequestForDocumentAccessRecord =
  Prisma.ApplicantAdmissionRequestGetPayload<
    typeof APPLICANT_ADMISSION_REQUEST_FOR_DOCUMENT_ACCESS_ARGS
  >;

const APPLICANT_ADMISSION_REQUEST_DOCUMENT_ARGS = {
  select: {
    id: true,
    requestId: true,
    title: true,
    documentType: true,
    status: true,
    notes: true,
    createdAt: true,
    updatedAt: true,
    requiredDocument: {
      select: {
        id: true,
        title: true,
        isMandatory: true,
        sortOrder: true,
      },
    },
    file: {
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        checksumSha256: true,
      },
    },
  },
} satisfies Prisma.ApplicantAdmissionRequestDocumentDefaultArgs;

export type ApplicantAdmissionRequestDocumentRecord =
  Prisma.ApplicantAdmissionRequestDocumentGetPayload<
    typeof APPLICANT_ADMISSION_REQUEST_DOCUMENT_ARGS
  >;

const APPLICANT_ADMISSION_REQUEST_DOCUMENT_DOWNLOAD_ARGS = {
  select: {
    id: true,
    requestId: true,
    applicantUserId: true,
    schoolId: true,
    organizationId: true,
    status: true,
    file: {
      select: {
        id: true,
        bucket: true,
        objectKey: true,
        originalName: true,
        deletedAt: true,
      },
    },
  },
} satisfies Prisma.ApplicantAdmissionRequestDocumentDefaultArgs;

export type ApplicantAdmissionRequestDocumentDownloadRecord =
  Prisma.ApplicantAdmissionRequestDocumentGetPayload<
    typeof APPLICANT_ADMISSION_REQUEST_DOCUMENT_DOWNLOAD_ARGS
  >;

const SUBMIT_APPLICANT_ADMISSION_REQUEST_ARGS = {
  select: {
    id: true,
    applicantUserId: true,
    schoolId: true,
    organizationId: true,
    requestedAcademicYearId: true,
    requestedGradeId: true,
    childFullName: true,
    status: true,
    submittedAt: true,
    applicationId: true,
  },
} satisfies Prisma.ApplicantAdmissionRequestDefaultArgs;

export type SubmitApplicantAdmissionRequestOutcome =
  | {
      kind: 'submitted';
      request: ApplicantAdmissionRequestRecord;
      schoolId: string;
      organizationId: string;
      missingItemsCount: number;
      createdApplication: boolean;
    }
  | {
      kind:
        | 'not_found'
        | 'unsafe_school'
        | 'invalid_academic_year'
        | 'invalid_grade'
        | 'invalid_state'
        | 'integrity_error';
    };

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

export interface CreateApplicantAdmissionRequestDocumentRecord {
  requestId: string;
  applicantUserId: string;
  schoolId: string;
  organizationId: string;
  requiredDocumentId: string | null;
  applicationDocumentId: string | null;
  title: string;
  documentType: string;
  notes: string | null;
  file: {
    bucket: string;
    objectKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: bigint;
    checksumSha256: string;
    visibility: FileVisibility;
  };
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
      where: buildMandatoryRequiredDocumentsWhere(schoolId),
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
      ...buildApplicantAdmissionRequestStatusWhere(params.status),
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

  findApplicantAdmissionRequestForDocumentAccess(params: {
    applicantUserId: string;
    requestId: string;
  }): Promise<ApplicantAdmissionRequestForDocumentAccessRecord | null> {
    return this.prisma.applicantAdmissionRequest.findFirst({
      where: {
        id: params.requestId,
        applicantUserId: params.applicantUserId,
        deletedAt: null,
      },
      ...APPLICANT_ADMISSION_REQUEST_FOR_DOCUMENT_ACCESS_ARGS,
    });
  }

  findActiveSchoolLevelRequiredDocumentForUpload(params: {
    schoolId: string;
    requiredDocumentId: string;
  }): Promise<AdmissionRequiredDocumentForUploadRecord | null> {
    return this.prisma.admissionRequiredDocument.findFirst({
      where: {
        id: params.requiredDocumentId,
        schoolId: params.schoolId,
        gradeId: null,
        isActive: true,
        deletedAt: null,
      },
      ...ADMISSION_REQUIRED_DOCUMENT_FOR_UPLOAD_ARGS,
    });
  }

  async createApplicantAdmissionRequestDocument(
    data: CreateApplicantAdmissionRequestDocumentRecord,
  ): Promise<ApplicantAdmissionRequestDocumentRecord> {
    return this.prisma.$transaction(async (tx) => {
      const file = await tx.file.create({
        data: {
          organizationId: data.organizationId,
          schoolId: data.schoolId,
          uploaderId: data.applicantUserId,
          bucket: data.file.bucket,
          objectKey: data.file.objectKey,
          originalName: data.file.originalName,
          mimeType: data.file.mimeType,
          sizeBytes: data.file.sizeBytes,
          checksumSha256: data.file.checksumSha256,
          visibility: data.file.visibility,
        },
        select: { id: true },
      });

      return tx.applicantAdmissionRequestDocument.create({
        data: {
          requestId: data.requestId,
          applicantUserId: data.applicantUserId,
          schoolId: data.schoolId,
          organizationId: data.organizationId,
          requiredDocumentId: data.requiredDocumentId,
          applicationDocumentId: data.applicationDocumentId,
          fileId: file.id,
          title: data.title,
          documentType: data.documentType,
          status: ApplicantAdmissionRequestDocumentStatus.UPLOADED,
          notes: data.notes,
        },
        ...APPLICANT_ADMISSION_REQUEST_DOCUMENT_ARGS,
      });
    });
  }

  listApplicantAdmissionRequestDocuments(params: {
    applicantUserId: string;
    requestId: string;
  }): Promise<ApplicantAdmissionRequestDocumentRecord[]> {
    return this.prisma.applicantAdmissionRequestDocument.findMany({
      where: {
        requestId: params.requestId,
        applicantUserId: params.applicantUserId,
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...APPLICANT_ADMISSION_REQUEST_DOCUMENT_ARGS,
    });
  }

  findApplicantAdmissionRequestDocumentForApplicant(params: {
    applicantUserId: string;
    requestId: string;
    documentId: string;
  }): Promise<ApplicantAdmissionRequestDocumentRecord | null> {
    return this.prisma.applicantAdmissionRequestDocument.findFirst({
      where: {
        id: params.documentId,
        requestId: params.requestId,
        applicantUserId: params.applicantUserId,
        deletedAt: null,
        request: {
          is: {
            applicantUserId: params.applicantUserId,
            deletedAt: null,
          },
        },
      },
      ...APPLICANT_ADMISSION_REQUEST_DOCUMENT_ARGS,
    });
  }

  findApplicantAdmissionRequestDocumentForDownload(params: {
    applicantUserId: string;
    requestId: string;
    documentId: string;
  }): Promise<ApplicantAdmissionRequestDocumentDownloadRecord | null> {
    return this.prisma.applicantAdmissionRequestDocument.findFirst({
      where: {
        id: params.documentId,
        requestId: params.requestId,
        applicantUserId: params.applicantUserId,
        deletedAt: null,
        request: {
          is: {
            id: params.requestId,
            applicantUserId: params.applicantUserId,
            deletedAt: null,
          },
        },
      },
      ...APPLICANT_ADMISSION_REQUEST_DOCUMENT_DOWNLOAD_ARGS,
    });
  }

  countMissingMandatoryRequiredDocumentsForRequest(params: {
    schoolId: string;
    requestId: string;
  }): Promise<number> {
    return this.prisma.admissionRequiredDocument.count({
      where: buildMissingMandatoryRequiredDocumentsWhere(params),
    });
  }

  async submitApplicantAdmissionRequest(params: {
    applicantUserId: string;
    requestId: string;
    submittedAt: Date;
  }): Promise<SubmitApplicantAdmissionRequestOutcome> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${params.requestId}))`,
      );

      const request = await tx.applicantAdmissionRequest.findFirst({
        where: {
          id: params.requestId,
          applicantUserId: params.applicantUserId,
          deletedAt: null,
        },
        ...SUBMIT_APPLICANT_ADMISSION_REQUEST_ARGS,
      });

      if (!request) return { kind: 'not_found' };

      if (
        request.status === ApplicantAdmissionRequestStatus.SUBMITTED &&
        request.applicationId
      ) {
        return this.buildSubmittedRequestOutcome(tx, {
          requestId: request.id,
          schoolId: request.schoolId,
          organizationId: request.organizationId,
          createdApplication: false,
        });
      }

      if (
        request.status !== ApplicantAdmissionRequestStatus.DRAFT ||
        request.submittedAt !== null ||
        request.applicationId !== null
      ) {
        return { kind: 'invalid_state' };
      }

      const school = await tx.school.findFirst({
        where: {
          id: request.schoolId,
          status: SchoolStatus.ACTIVE,
          deletedAt: null,
          organization: {
            status: OrganizationStatus.ACTIVE,
            deletedAt: null,
          },
        },
        select: { id: true, organizationId: true },
      });

      if (!school || school.organizationId !== request.organizationId) {
        return { kind: 'unsafe_school' };
      }

      if (request.requestedAcademicYearId) {
        const academicYear = await tx.academicYear.findFirst({
          where: {
            id: request.requestedAcademicYearId,
            schoolId: request.schoolId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!academicYear) return { kind: 'invalid_academic_year' };
      }

      if (request.requestedGradeId) {
        const grade = await tx.grade.findFirst({
          where: {
            id: request.requestedGradeId,
            schoolId: request.schoolId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!grade) return { kind: 'invalid_grade' };
      }

      const missingItemsCount = await tx.admissionRequiredDocument.count({
        where: buildMissingMandatoryRequiredDocumentsWhere({
          schoolId: request.schoolId,
          requestId: request.id,
        }),
      });
      const applicationStatus =
        missingItemsCount > 0
          ? AdmissionApplicationStatus.DOCUMENTS_PENDING
          : AdmissionApplicationStatus.SUBMITTED;

      const application = await tx.application.create({
        data: {
          schoolId: request.schoolId,
          organizationId: request.organizationId,
          studentName: request.childFullName,
          requestedAcademicYearId: request.requestedAcademicYearId,
          requestedGradeId: request.requestedGradeId,
          source: AdmissionApplicationSource.IN_APP,
          status: applicationStatus,
          submittedAt: params.submittedAt,
        },
        select: { id: true },
      });

      await tx.applicantAdmissionRequest.update({
        where: { id: request.id },
        data: {
          status: ApplicantAdmissionRequestStatus.SUBMITTED,
          submittedAt: params.submittedAt,
          applicationId: application.id,
        },
        select: { id: true },
      });

      return this.buildSubmittedRequestOutcome(tx, {
        requestId: request.id,
        schoolId: request.schoolId,
        organizationId: request.organizationId,
        missingItemsCount,
        createdApplication: true,
      });
    });
  }

  private async buildSubmittedRequestOutcome(
    tx: Prisma.TransactionClient,
    params: {
      requestId: string;
      schoolId: string;
      organizationId: string;
      missingItemsCount?: number;
      createdApplication: boolean;
    },
  ): Promise<SubmitApplicantAdmissionRequestOutcome> {
    const detail = await tx.applicantAdmissionRequest.findUnique({
      where: { id: params.requestId },
      ...APPLICANT_ADMISSION_REQUEST_ARGS,
    });
    if (!detail) return { kind: 'not_found' };
    if (detail.status === ApplicantAdmissionRequestStatus.SUBMITTED) {
      const missingItemsCount =
        params.missingItemsCount ??
        (await tx.admissionRequiredDocument.count({
          where: buildMissingMandatoryRequiredDocumentsWhere({
            schoolId: params.schoolId,
            requestId: params.requestId,
          }),
        }));

      return {
        kind: 'submitted',
        request: detail,
        schoolId: params.schoolId,
        organizationId: params.organizationId,
        missingItemsCount,
        createdApplication: params.createdApplication,
      };
    }

    return { kind: 'integrity_error' };
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

function buildApplicantAdmissionRequestStatusWhere(
  status: ApplicantRequestStatusFilter | undefined,
): Prisma.ApplicantAdmissionRequestWhereInput {
  switch (status) {
    case 'draft':
      return { status: ApplicantAdmissionRequestStatus.DRAFT };
    case 'needs_action':
      return buildSubmittedApplicationStatusWhere(
        AdmissionApplicationStatus.DOCUMENTS_PENDING,
      );
    case 'submitted':
      return buildSubmittedApplicationStatusWhere(
        AdmissionApplicationStatus.SUBMITTED,
      );
    case 'under_review':
      return buildSubmittedApplicationStatusWhere(
        AdmissionApplicationStatus.UNDER_REVIEW,
      );
    case 'waitlisted':
      return buildSubmittedApplicationStatusWhere(
        AdmissionApplicationStatus.WAITLISTED,
      );
    case 'accepted':
      return buildSubmittedApplicationStatusWhere(
        AdmissionApplicationStatus.ACCEPTED,
      );
    case 'rejected':
      return buildSubmittedApplicationStatusWhere(
        AdmissionApplicationStatus.REJECTED,
      );
    default:
      return {};
  }
}

function buildSubmittedApplicationStatusWhere(
  status: AdmissionApplicationStatus,
): Prisma.ApplicantAdmissionRequestWhereInput {
  return {
    status: ApplicantAdmissionRequestStatus.SUBMITTED,
    application: {
      is: {
        status,
        deletedAt: null,
      },
    },
  };
}

function buildMandatoryRequiredDocumentsWhere(
  schoolId: string,
): Prisma.AdmissionRequiredDocumentWhereInput {
  return {
    schoolId,
    gradeId: null,
    isMandatory: true,
    isActive: true,
    deletedAt: null,
  };
}

const REQUIRED_DOCUMENT_SATISFYING_STATUSES = [
  ApplicantAdmissionRequestDocumentStatus.UPLOADED,
  ApplicantAdmissionRequestDocumentStatus.ACCEPTED,
] as const;

function buildMissingMandatoryRequiredDocumentsWhere(params: {
  schoolId: string;
  requestId: string;
}): Prisma.AdmissionRequiredDocumentWhereInput {
  return {
    ...buildMandatoryRequiredDocumentsWhere(params.schoolId),
    NOT: {
      applicantAdmissionRequestDocuments: {
        some: {
          requestId: params.requestId,
          deletedAt: null,
          status: { in: [...REQUIRED_DOCUMENT_SATISFYING_STATUSES] },
        },
      },
    },
  };
}
