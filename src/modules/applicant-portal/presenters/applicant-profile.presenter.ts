import { ApplicantProfileResponseDto } from '../dto/applicant-account.dto';
import { ApplicantProfileRecord } from '../infrastructure/applicant-portal.repository';

export function presentApplicantProfile(
  profile: ApplicantProfileRecord,
): ApplicantProfileResponseDto {
  return {
    applicantId: profile.id,
    userId: profile.userId,
    fullName: profile.fullName,
    email: profile.user.email,
    loginEmail: profile.user.email,
    contactEmail: profile.user.contactEmail ?? null,
    phoneNumber: profile.phoneNumber ?? null,
    city: profile.city ?? null,
    relationship: profile.relationship,
    userType: 'applicant',
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}
