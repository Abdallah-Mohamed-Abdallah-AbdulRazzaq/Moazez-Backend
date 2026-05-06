import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  StudentAppEnrollmentNotFoundException,
  StudentAppStudentNotFoundException,
} from '../../shared/student-app-errors';
import { StudentProfileResponseDto } from '../dto/student-profile.dto';
import { StudentProfileReadAdapter } from '../infrastructure/student-profile-read.adapter';
import { StudentProfilePresenter } from '../presenters/student-profile.presenter';

@Injectable()
export class GetStudentProfileUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentProfileReadAdapter,
  ) {}

  async execute(): Promise<StudentProfileResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();

    const [student, school, enrollment, totalXp] = await Promise.all([
      this.readAdapter.findStudentProfile(context),
      this.readAdapter.findSchoolDisplay(context),
      this.readAdapter.findCurrentEnrollment(context),
      this.readAdapter.sumTotalXpForCurrentStudent(context),
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
}
