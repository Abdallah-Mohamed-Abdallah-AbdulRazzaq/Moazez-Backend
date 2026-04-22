import { AuditOutcome } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { ClassroomRecord } from '../../../academics/structure/infrastructure/structure.repository';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireStudentsScope } from '../../students/domain/students-scope';
import { StudentsRepository } from '../../students/infrastructure/students.repository';
import { StudentEnrollmentPlacementConflictException } from '../../enrollments/domain/enrollment.exceptions';
import { EnrollmentsRepository, EnrollmentRecord } from '../../enrollments/infrastructure/enrollments.repository';
import { StudentEnrollmentAlreadyWithdrawnException } from '../domain/lifecycle.exceptions';

function deriveName(nameAr: string, nameEn: string): string {
  return nameEn.trim().length > 0 ? nameEn : nameAr;
}

export function normalizeOptionalText(value?: string | null): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized && normalized.length > 0 ? normalized : null;
}

export function toLifecycleDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function requireStudentWithActiveEnrollment(params: {
  studentId: string;
  studentsRepository: StudentsRepository;
  enrollmentsRepository: EnrollmentsRepository;
}): Promise<{ activeEnrollment: EnrollmentRecord }> {
  const student = await params.studentsRepository.findStudentById(params.studentId);
  if (!student) {
    throw new NotFoundDomainException('Student not found', {
      studentId: params.studentId,
    });
  }

  const activeEnrollment =
    await params.enrollmentsRepository.findActiveEnrollmentByStudentId(student.id);
  if (!activeEnrollment) {
    throw new StudentEnrollmentAlreadyWithdrawnException({
      studentId: student.id,
    });
  }

  return { activeEnrollment };
}

export async function assertPlacementCapacity(params: {
  enrollmentsRepository: EnrollmentsRepository;
  academicYearId: string;
  classroom: ClassroomRecord;
  excludeEnrollmentId?: string;
}): Promise<void> {
  if (
    params.classroom.capacity === null ||
    params.classroom.capacity === undefined
  ) {
    return;
  }

  const activeCount =
    await params.enrollmentsRepository.countActiveEnrollmentsInPlacement({
      academicYearId: params.academicYearId,
      classroomId: params.classroom.id,
      excludeEnrollmentId: params.excludeEnrollmentId,
    });

  if (activeCount >= params.classroom.capacity) {
    throw new StudentEnrollmentPlacementConflictException({
      academicYearId: params.academicYearId,
      classroomId: params.classroom.id,
      capacity: params.classroom.capacity,
      activeCount,
    });
  }
}

function serializeEnrollmentForAudit(enrollment: EnrollmentRecord): Record<string, unknown> {
  return {
    id: enrollment.id,
    studentId: enrollment.studentId,
    academicYearId: enrollment.academicYear.id,
    academicYear: deriveName(
      enrollment.academicYear.nameAr,
      enrollment.academicYear.nameEn,
    ),
    gradeId: enrollment.classroom.section.grade.id,
    grade: deriveName(
      enrollment.classroom.section.grade.nameAr,
      enrollment.classroom.section.grade.nameEn,
    ),
    sectionId: enrollment.classroom.section.id,
    section: deriveName(
      enrollment.classroom.section.nameAr,
      enrollment.classroom.section.nameEn,
    ),
    classroomId: enrollment.classroom.id,
    classroom: deriveName(enrollment.classroom.nameAr, enrollment.classroom.nameEn),
    termId: enrollment.termId,
    status: enrollment.status,
    enrolledAt: enrollment.enrolledAt.toISOString(),
    endedAt: enrollment.endedAt?.toISOString() ?? null,
    exitReason: enrollment.exitReason,
  };
}

export function assertPlacementChanged(params: {
  currentEnrollment: EnrollmentRecord;
  nextAcademicYearId: string;
  nextClassroomId: string;
  nextTermId?: string | null;
}): void {
  const samePlacement =
    params.currentEnrollment.academicYearId === params.nextAcademicYearId &&
    params.currentEnrollment.classroomId === params.nextClassroomId &&
    (params.currentEnrollment.termId ?? null) === (params.nextTermId ?? null);

  if (samePlacement) {
    throw new StudentEnrollmentPlacementConflictException({
      studentId: params.currentEnrollment.studentId,
      activeEnrollmentId: params.currentEnrollment.id,
      requestedAcademicYearId: params.nextAcademicYearId,
      requestedClassroomId: params.nextClassroomId,
    });
  }
}

export async function writeLifecycleAuditLog(params: {
  authRepository: AuthRepository;
  action:
    | 'students.enrollment.transfer'
    | 'students.enrollment.withdraw'
    | 'students.enrollment.promote';
  resourceId: string;
  beforeEnrollment: EnrollmentRecord;
  afterEnrollment?: EnrollmentRecord | null;
  effectiveDate: string;
  reason?: string | null;
  notes?: string | null;
  sourceRequestId?: string | null;
  actionType: string;
}): Promise<void> {
  const scope = requireStudentsScope();

  await params.authRepository.createAuditLog({
    actorId: scope.actorId,
    userType: scope.userType,
    organizationId: scope.organizationId,
    schoolId: scope.schoolId,
    module: 'students',
    action: params.action,
    resourceType: 'enrollment',
    resourceId: params.resourceId,
    outcome: AuditOutcome.SUCCESS,
    before: {
      enrollment: serializeEnrollmentForAudit(params.beforeEnrollment),
    },
    after: {
      enrollment: params.afterEnrollment
        ? serializeEnrollmentForAudit(params.afterEnrollment)
        : null,
      effectiveDate: params.effectiveDate,
      reason: normalizeOptionalText(params.reason),
      notes: normalizeOptionalText(params.notes),
      sourceRequestId: params.sourceRequestId ?? null,
      actionType: params.actionType,
    },
  });
}

export function requireTargetAcademicYear(
  targetAcademicYear: string,
): string {
  const normalized = normalizeOptionalText(targetAcademicYear);
  if (!normalized) {
    throw new ValidationDomainException('Target academic year is required', {
      field: 'targetAcademicYear',
    });
  }

  return normalized;
}
