import { AuditOutcome, StudentEnrollmentStatus } from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireStudentsScope } from '../../students/domain/students-scope';
import {
  CreateEnrollmentDto,
  UpsertEnrollmentDto,
  ValidateEnrollmentDto,
} from '../dto/enrollment.dto';
import { StudentEnrollmentStatusApiValue } from '../domain/enrollment-status.enums';
import { ResolvedEnrollmentPlacement } from '../domain/enrollment-placement.service';
import { EnrollmentsRepository, EnrollmentRecord } from '../infrastructure/enrollments.repository';
import { presentEnrollment } from '../presenters/enrollment.presenter';

type EnrollmentMutationCommand =
  | CreateEnrollmentDto
  | UpsertEnrollmentDto
  | ValidateEnrollmentDto;

export function mapEnrollmentStatusFromApi(
  status: StudentEnrollmentStatusApiValue,
): StudentEnrollmentStatus {
  switch (status) {
    case 'active':
      return StudentEnrollmentStatus.ACTIVE;
    case 'completed':
      return StudentEnrollmentStatus.COMPLETED;
    case 'withdrawn':
      return StudentEnrollmentStatus.WITHDRAWN;
  }
}

export function toEnrollmentDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function createEnrollmentRecord(params: {
  command: EnrollmentMutationCommand;
  resolvedPlacement: ResolvedEnrollmentPlacement;
  enrollmentsRepository: EnrollmentsRepository;
  authRepository?: AuthRepository;
  source: 'create' | 'upsert';
}): Promise<EnrollmentRecord> {
  const scope = requireStudentsScope();

  const enrollment = await params.enrollmentsRepository.createEnrollment({
    schoolId: scope.schoolId,
    studentId: params.command.studentId,
    academicYearId: params.resolvedPlacement.academicYear.id,
    termId: params.resolvedPlacement.term?.id ?? null,
    classroomId: params.resolvedPlacement.classroom.id,
    status: StudentEnrollmentStatus.ACTIVE,
    enrolledAt: toEnrollmentDate(params.command.enrollmentDate),
    endedAt: null,
    exitReason: null,
  });

  if (params.authRepository) {
    await params.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'students',
      action: 'students.enrollment.create',
      resourceType: 'enrollment',
      resourceId: enrollment.id,
      outcome: AuditOutcome.SUCCESS,
      after: {
        source: params.source,
        applicationId: params.command.applicationId ?? null,
        studentId: enrollment.studentId,
        academicYearId: enrollment.academicYearId,
        termId: enrollment.termId,
        classroomId: enrollment.classroomId,
        status: presentEnrollment(enrollment).status,
        enrollmentDate: presentEnrollment(enrollment).enrollmentDate,
      },
    });
  }

  return enrollment;
}
