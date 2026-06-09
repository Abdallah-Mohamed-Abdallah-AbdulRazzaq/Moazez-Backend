import { Injectable } from '@nestjs/common';
import { UserStatus, UserType } from '@prisma/client';
import { getRequestContext } from '../../../common/context/request-context';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import {
  ScopeMissingException,
  TokenInvalidException,
} from '../../iam/auth/domain/auth.exceptions';
import {
  ApplicantPortalRepository,
  ApplicantProfileRecord,
} from '../infrastructure/applicant-portal.repository';

export interface ApplicantPortalContext {
  applicantUserId: string;
  applicantProfileId: string;
  profile: ApplicantProfileRecord;
}

@Injectable()
export class ApplicantPortalAccessService {
  constructor(
    private readonly applicantPortalRepository: ApplicantPortalRepository,
  ) {}

  async getApplicantContext(): Promise<ApplicantPortalContext> {
    const ctx = getRequestContext();
    if (!ctx?.actor) throw new TokenInvalidException();

    if (ctx.actor.userType !== UserType.APPLICANT) {
      throw new ScopeMissingException({ requiredUserType: UserType.APPLICANT });
    }

    if (ctx.activeMembership) {
      throw new ScopeMissingException({
        reason: 'applicant_membership_not_allowed',
      });
    }

    const activeMembershipCount =
      await this.applicantPortalRepository.countActiveMembershipsForUser(
        ctx.actor.id,
      );
    if (activeMembershipCount > 0) {
      throw new ScopeMissingException({
        reason: 'applicant_membership_not_allowed',
      });
    }

    const profile =
      await this.applicantPortalRepository.findApplicantProfileByUserId(
        ctx.actor.id,
      );
    if (!profile) {
      throw new NotFoundDomainException('Applicant profile not found', {
        userId: ctx.actor.id,
      });
    }

    if (
      profile.user.userType !== UserType.APPLICANT ||
      profile.user.status !== UserStatus.ACTIVE ||
      profile.user.deletedAt
    ) {
      throw new ScopeMissingException({ requiredUserType: UserType.APPLICANT });
    }

    return {
      applicantUserId: ctx.actor.id,
      applicantProfileId: profile.id,
      profile,
    };
  }
}
