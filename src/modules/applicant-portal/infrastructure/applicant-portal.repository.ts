import { Injectable } from '@nestjs/common';
import {
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
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
