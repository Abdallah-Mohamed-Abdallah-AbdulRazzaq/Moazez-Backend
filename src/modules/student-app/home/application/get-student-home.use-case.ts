import { Injectable } from '@nestjs/common';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  StudentAppEnrollmentNotFoundException,
  StudentAppStudentNotFoundException,
} from '../../shared/student-app-errors';
import { StudentHomeResponseDto } from '../dto/student-home.dto';
import { StudentHomeReadAdapter } from '../infrastructure/student-home-read.adapter';
import { StudentHomePresenter } from '../presenters/student-home.presenter';
import { ResolveSchoolLogoUrlService } from '../../../settings/branding/application/resolve-school-logo-url.service';

@Injectable()
export class GetStudentHomeUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentHomeReadAdapter,
    private readonly logoResolver: ResolveSchoolLogoUrlService,
  ) {}

  async execute(): Promise<StudentHomeResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();

    const [
      student,
      school,
      enrollment,
      subjectsCount,
      pendingTasksCount,
      totalXp,
      logoUrl,
    ] = await Promise.all([
      this.readAdapter.findStudentIdentity(context),
      this.readAdapter.findSchoolDisplay(context),
      this.readAdapter.findCurrentEnrollment(context),
      this.readAdapter.countSubjectsForCurrentClassroom(context),
      this.readAdapter.countPendingTasksForCurrentStudent(context),
      this.readAdapter.sumTotalXpForCurrentStudent(context),
      this.logoResolver.resolveForSchool(context.schoolId),
    ]);

    if (!student) {
      throw new StudentAppStudentNotFoundException({
        reason: 'student_home_identity_missing',
      });
    }

    if (!enrollment) {
      throw new StudentAppEnrollmentNotFoundException({
        reason: 'student_home_enrollment_missing',
      });
    }

    return StudentHomePresenter.present({
      student,
      school: { ...school, logoUrl },
      enrollment,
      subjectsCount,
      pendingTasksCount,
      totalXp,
    });
  }
}
