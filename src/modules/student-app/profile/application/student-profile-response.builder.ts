import {
  StudentAppEnrollmentNotFoundException,
  StudentAppStudentNotFoundException,
} from '../../shared/student-app-errors';
import type { StudentAppContext } from '../../shared/student-app.types';
import { StudentProfileResponseDto } from '../dto/student-profile.dto';
import { StudentProfileReadAdapter } from '../infrastructure/student-profile-read.adapter';
import { StudentProfilePresenter } from '../presenters/student-profile.presenter';
import type { ResolveSchoolLogoUrlService } from '../../../settings/branding/application/resolve-school-logo-url.service';

export async function buildStudentProfileResponse(params: {
  context: StudentAppContext;
  readAdapter: StudentProfileReadAdapter;
  logoResolver: ResolveSchoolLogoUrlService;
}): Promise<StudentProfileResponseDto> {
  const [student, school, enrollment, totalXp, logoUrl] = await Promise.all([
    params.readAdapter.findStudentProfile(params.context),
    params.readAdapter.findSchoolDisplay(params.context),
    params.readAdapter.findCurrentEnrollment(params.context),
    params.readAdapter.sumTotalXpForCurrentStudent(params.context),
    params.logoResolver.resolveForSchool(params.context.schoolId),
  ]);

  if (!student) {
    throw new StudentAppStudentNotFoundException({
      reason: 'student_profile_identity_missing',
    });
  }

  if (!enrollment) {
    throw new StudentAppEnrollmentNotFoundException({
      reason: 'student_profile_enrollment_missing',
    });
  }

  return StudentProfilePresenter.present({
    student,
    school: { ...school, logoUrl },
    enrollment,
    totalXp,
  });
}
