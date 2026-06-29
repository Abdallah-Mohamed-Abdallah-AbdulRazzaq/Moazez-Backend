import {
  StudentAppEnrollmentNotFoundException,
  StudentAppStudentNotFoundException,
} from '../../shared/student-app-errors';
import type { StudentAppContext } from '../../shared/student-app.types';
import { StudentProfileResponseDto } from '../dto/student-profile.dto';
import { StudentProfileReadAdapter } from '../infrastructure/student-profile-read.adapter';
import { StudentProfilePresenter } from '../presenters/student-profile.presenter';

export async function buildStudentProfileResponse(params: {
  context: StudentAppContext;
  readAdapter: StudentProfileReadAdapter;
}): Promise<StudentProfileResponseDto> {
  const [student, school, enrollment, totalXp] = await Promise.all([
    params.readAdapter.findStudentProfile(params.context),
    params.readAdapter.findSchoolDisplay(params.context),
    params.readAdapter.findCurrentEnrollment(params.context),
    params.readAdapter.sumTotalXpForCurrentStudent(params.context),
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
    school,
    enrollment,
    totalXp,
  });
}
