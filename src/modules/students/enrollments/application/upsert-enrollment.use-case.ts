import { Injectable } from '@nestjs/common';
import { EnrollApplicationHandoffUseCase } from '../../../admissions/applications/application/enroll-application-handoff.use-case';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { EnrollmentResponseDto, UpsertEnrollmentDto } from '../dto/enrollment.dto';
import { EnrollmentPlacementService } from '../domain/enrollment-placement.service';
import { EnrollmentsRepository } from '../infrastructure/enrollments.repository';
import { presentEnrollment } from '../presenters/enrollment.presenter';
import { createEnrollmentRecord } from './shared';

@Injectable()
export class UpsertEnrollmentUseCase {
  constructor(
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly enrollmentPlacementService: EnrollmentPlacementService,
    private readonly enrollApplicationHandoffUseCase: EnrollApplicationHandoffUseCase,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: UpsertEnrollmentDto): Promise<EnrollmentResponseDto> {
    const handoff = command.applicationId
      ? await this.enrollApplicationHandoffUseCase.execute(command.applicationId)
      : null;

    const resolvedPlacement =
      await this.enrollmentPlacementService.resolvePlacement(command, {
        handoff,
        allowMatchingActiveEnrollment: true,
      });

    if (resolvedPlacement.activeEnrollment) {
      return presentEnrollment(resolvedPlacement.activeEnrollment);
    }

    const enrollment = await createEnrollmentRecord({
      command,
      resolvedPlacement,
      enrollmentsRepository: this.enrollmentsRepository,
      authRepository: this.authRepository,
      source: 'upsert',
    });

    return presentEnrollment(enrollment);
  }
}
