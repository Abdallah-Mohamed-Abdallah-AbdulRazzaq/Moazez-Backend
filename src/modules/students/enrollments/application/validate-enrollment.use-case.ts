import { Injectable } from '@nestjs/common';
import {
  DomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { EnrollApplicationHandoffUseCase } from '../../../admissions/applications/application/enroll-application-handoff.use-case';
import {
  StudentEnrollmentInactiveYearException,
  StudentEnrollmentPlacementConflictException,
} from '../domain/enrollment.exceptions';
import { EnrollmentPlacementService } from '../domain/enrollment-placement.service';
import { StudentPlacementCapacityPolicyService } from '../domain/student-placement-capacity-policy.service';
import {
  ValidateEnrollmentDto,
  ValidateEnrollmentResponseDto,
} from '../dto/enrollment.dto';

@Injectable()
export class ValidateEnrollmentUseCase {
  constructor(
    private readonly enrollmentPlacementService: EnrollmentPlacementService,
    private readonly enrollApplicationHandoffUseCase: EnrollApplicationHandoffUseCase,
    private readonly studentPlacementCapacityPolicy: StudentPlacementCapacityPolicyService,
  ) {}

  async execute(
    command: ValidateEnrollmentDto,
  ): Promise<ValidateEnrollmentResponseDto> {
    try {
      const handoff = command.applicationId
        ? await this.enrollApplicationHandoffUseCase.execute(
            command.applicationId,
          )
        : null;

      const resolvedPlacement =
        await this.enrollmentPlacementService.resolvePlacement(command, {
          handoff,
          allowMatchingActiveEnrollment: Boolean(command.enrollmentId),
          ignoreEnrollmentId: command.enrollmentId,
        });

      await this.studentPlacementCapacityPolicy.assertCanPlace({
        academicYearId: resolvedPlacement.academicYear.id,
        classroom: resolvedPlacement.classroom,
        excludeEnrollmentId:
          resolvedPlacement.activeEnrollment?.id === command.enrollmentId
            ? command.enrollmentId
            : undefined,
      });

      return {
        valid: true,
        errors: [],
      };
    } catch (error) {
      if (
        error instanceof StudentEnrollmentPlacementConflictException ||
        error instanceof StudentEnrollmentInactiveYearException ||
        error instanceof ValidationDomainException
      ) {
        return {
          valid: false,
          errors: [error.code],
        };
      }

      if (error instanceof DomainException) {
        throw error;
      }

      throw error;
    }
  }
}
