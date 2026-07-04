import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  DismissalGateOperationalStatus,
  Prisma,
} from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireDismissalScope } from '../../shared/dismissal-context';
import {
  DismissalGateDuplicateCodeException,
  DismissalGateNotFoundException,
} from '../../shared/dismissal.errors';
import { parseGateStatus } from '../../shared/dismissal.types';
import { DismissalGateResponseDto, UpdateDismissalGateDto } from '../dto/dismissal-gate.dto';
import {
  DismissalGateRecord,
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
export class UpdateDismissalGateUseCase {
  constructor(
    private readonly dismissalGatesRepository: DismissalGatesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    gateId: string,
    command: UpdateDismissalGateDto,
  ): Promise<DismissalGateResponseDto> {
    const scope = requireDismissalScope();
    const existing = await this.dismissalGatesRepository.findGateById(gateId);
    if (!existing) {
      throw new DismissalGateNotFoundException();
    }

    const data: Prisma.DismissalGateUncheckedUpdateInput = {};

    if (this.hasOwn(command, 'code')) {
      const code = normalizeRequiredText(command.code, 50);
      const duplicate = await this.dismissalGatesRepository.findGateByCode(code);
      if (duplicate && duplicate.id !== gateId) {
        throw new DismissalGateDuplicateCodeException();
      }
      data.code = code;
    }
    if (this.hasOwn(command, 'name')) {
      data.name = normalizeRequiredText(command.name, 160);
    }
    if (this.hasOwn(command, 'campus')) {
      data.campus = normalizeOptionalText(command.campus, 160);
    }
    if (this.hasOwn(command, 'status')) {
      data.status = parseGateStatus(command.status);
    }
    if (this.hasOwn(command, 'isActive')) {
      data.isActive = Boolean(command.isActive);
    }
    if (this.hasOwn(command, 'sortOrder')) {
      data.sortOrder = command.sortOrder;
    }
    if (this.hasOwn(command, 'latitude')) {
      data.latitude =
        command.latitude === null || command.latitude === undefined
          ? null
          : (command.latitude as Prisma.Decimal | number);
    }
    if (this.hasOwn(command, 'longitude')) {
      data.longitude =
        command.longitude === null || command.longitude === undefined
          ? null
          : (command.longitude as Prisma.Decimal | number);
    }
    validateGateCoordinates({
      latitude: this.hasOwn(command, 'latitude')
        ? command.latitude
        : existing.latitude?.toNumber(),
      longitude: this.hasOwn(command, 'longitude')
        ? command.longitude
        : existing.longitude?.toNumber(),
    });
    if (this.hasOwn(command, 'waitingZones')) {
      data.waitingZones = normalizeWaitingZones(command.waitingZones);
    }
    if (this.hasOwn(command, 'notes')) {
      data.notes = normalizeOptionalText(command.notes, 4000);
    }

    try {
      const updated = await this.dismissalGatesRepository.updateGate(gateId, data);

      await this.authRepository.createAuditLog({
        actorId: scope.actorId,
        userType: scope.userType,
        organizationId: scope.organizationId,
        schoolId: scope.schoolId,
        module: 'dismissal',
        action: 'dismissal.gate.update',
        resourceType: 'dismissal_gate',
        resourceId: updated.id,
        outcome: AuditOutcome.SUCCESS,
        before: this.auditGate(existing),
        after: this.auditGate(updated),
      });

      return presentDismissalGate(updated);
    } catch (error) {
      if (isPrismaUniqueConflict(error)) {
        throw new DismissalGateDuplicateCodeException();
      }
      throw error;
    }
  }

  private hasOwn<T extends object>(object: T, key: keyof T): boolean {
    return (
      Object.prototype.hasOwnProperty.call(object, key) &&
      (object as Record<string, unknown>)[key as string] !== undefined
    );
  }

  private auditGate(gate: DismissalGateRecord): Record<string, unknown> {
    return {
      code: gate.code,
      name: gate.name,
      campus: gate.campus,
      status: gate.status as DismissalGateOperationalStatus,
      isActive: gate.isActive,
      sortOrder: gate.sortOrder,
    };
  }
}
