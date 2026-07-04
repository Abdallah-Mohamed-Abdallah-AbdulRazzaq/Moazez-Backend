import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  DismissalGateOperationalStatus,
  Prisma,
} from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireDismissalScope } from '../../shared/dismissal-context';
import { DismissalGateDuplicateCodeException } from '../../shared/dismissal.errors';
import { parseGateStatus } from '../../shared/dismissal.types';
import { CreateDismissalGateDto, DismissalGateResponseDto } from '../dto/dismissal-gate.dto';
import {
  DismissalGatesRepository,
  isPrismaUniqueConflict,
} from '../infrastructure/dismissal-gates.repository';
import { presentDismissalGate } from '../presenter/dismissal-gate.presenter';
import {
  normalizeOptionalText,
  normalizeRequiredText,
  normalizeWaitingZones,
  validateGateCoordinates,
} from './dismissal-gate-inputs';

@Injectable()
export class CreateDismissalGateUseCase {
  constructor(
    private readonly dismissalGatesRepository: DismissalGatesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: CreateDismissalGateDto): Promise<DismissalGateResponseDto> {
    const scope = requireDismissalScope();
    const code = normalizeRequiredText(command.code, 50);
    const name = normalizeRequiredText(command.name, 160);
    const campus = normalizeOptionalText(command.campus, 160);
    const status =
      parseGateStatus(command.status) ?? DismissalGateOperationalStatus.CLOSED;
    const latitude = command.latitude ?? null;
    const longitude = command.longitude ?? null;
    validateGateCoordinates({ latitude, longitude });

    const duplicate = await this.dismissalGatesRepository.findGateByCode(code);
    if (duplicate) {
      throw new DismissalGateDuplicateCodeException();
    }

    try {
      const gate = await this.dismissalGatesRepository.createGate({
        schoolId: scope.schoolId,
        code,
        name,
        campus,
        status,
        isActive: command.isActive ?? true,
        sortOrder: command.sortOrder ?? 0,
        latitude: latitude as Prisma.Decimal | number | null,
        longitude: longitude as Prisma.Decimal | number | null,
        waitingZones: normalizeWaitingZones(command.waitingZones),
        notes: normalizeOptionalText(command.notes, 4000),
      });

      await this.authRepository.createAuditLog({
        actorId: scope.actorId,
        userType: scope.userType,
        organizationId: scope.organizationId,
        schoolId: scope.schoolId,
        module: 'dismissal',
        action: 'dismissal.gate.create',
        resourceType: 'dismissal_gate',
        resourceId: gate.id,
        outcome: AuditOutcome.SUCCESS,
        after: this.auditGate(gate),
      });

      return presentDismissalGate(gate);
    } catch (error) {
      if (isPrismaUniqueConflict(error)) {
        throw new DismissalGateDuplicateCodeException();
      }
      throw error;
    }
  }

  private auditGate(gate: {
    code: string;
    name: string;
    campus: string | null;
    status: DismissalGateOperationalStatus;
    isActive: boolean;
    sortOrder: number;
  }): Record<string, unknown> {
    return {
      code: gate.code,
      name: gate.name,
      campus: gate.campus,
      status: gate.status,
      isActive: gate.isActive,
      sortOrder: gate.sortOrder,
    };
  }
}
