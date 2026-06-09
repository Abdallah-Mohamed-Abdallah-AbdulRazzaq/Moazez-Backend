import { Injectable } from '@nestjs/common';
import {
  MembershipStatus,
  Prisma,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ApplicantRelationship } from '../domain/applicant-profile.inputs';

const APPLICANT_PROFILE_WITH_USER = {
  include: { user: true },
} satisfies Prisma.ApplicantProfileDefaultArgs;

export type ApplicantProfileRecord = Prisma.ApplicantProfileGetPayload<
  typeof APPLICANT_PROFILE_WITH_USER
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
}
