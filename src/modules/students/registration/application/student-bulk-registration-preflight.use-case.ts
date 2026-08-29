import { Injectable } from '@nestjs/common';
import {
  DomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { PlatformEntitlementStudentSeatLimitExceededException } from '../../../platform-admin/domain/platform-admin-errors';
import {
  StudentEnrollmentInactiveYearException,
  StudentEnrollmentPlacementConflictException,
} from '../../enrollments/domain/enrollment.exceptions';
import type {
  StudentBulkRegistrationPlacementDto,
  StudentBulkRegistrationPreflightResponseDto,
} from '../dto/student-bulk-registration.dto';
import { STUDENT_BULK_REGISTRATION_TEMPLATE_VERSION } from '../domain/student-bulk-registration.constants';
import { StudentBulkRegistrationPlacementService } from '../domain/student-bulk-registration-placement.service';

@Injectable()
export class StudentBulkRegistrationPreflightUseCase {
  constructor(
    private readonly placementService: StudentBulkRegistrationPlacementService,
  ) {}

  async execute(
    command: StudentBulkRegistrationPlacementDto,
  ): Promise<StudentBulkRegistrationPreflightResponseDto> {
    try {
      const placement = await this.placementService.resolve(command);

      return {
        valid: true,
        errors: [],
        templateVersion: STUDENT_BULK_REGISTRATION_TEMPLATE_VERSION,
        placement: {
          academicYear: presentNamedPlacement(placement.academicYear),
          term: placement.term ? presentNamedPlacement(placement.term) : null,
          stage: presentNamedPlacement(placement.stage),
          grade: presentNamedPlacement(placement.grade),
          section: presentNamedPlacement(placement.section),
          classroom: {
            ...presentNamedPlacement(placement.classroom),
            capacity: placement.classroom.capacity,
          },
          enrollmentDate: placement.enrollmentDate,
        },
        studentSeat: {
          limit: placement.studentSeat.limit,
          used: placement.studentSeat.used,
          remaining: placement.studentSeat.remaining,
        },
      };
    } catch (error) {
      if (
        error instanceof ValidationDomainException ||
        error instanceof StudentEnrollmentInactiveYearException ||
        error instanceof StudentEnrollmentPlacementConflictException ||
        error instanceof PlatformEntitlementStudentSeatLimitExceededException
      ) {
        return {
          valid: false,
          errors: [error.code],
          templateVersion: STUDENT_BULK_REGISTRATION_TEMPLATE_VERSION,
          placement: null,
          studentSeat: null,
        };
      }

      if (error instanceof DomainException) {
        throw error;
      }

      throw error;
    }
  }
}

function presentNamedPlacement(value: {
  id: string;
  nameAr: string;
  nameEn: string;
}): { id: string; nameAr: string; nameEn: string } {
  return {
    id: value.id,
    nameAr: value.nameAr,
    nameEn: value.nameEn,
  };
}
