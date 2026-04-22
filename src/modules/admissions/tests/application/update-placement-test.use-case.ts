import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireApplicationsScope } from '../../applications/applications-scope';
import {
  PlacementTestResponseDto,
  UpdatePlacementTestDto,
} from '../dto/placement-test.dto';
import { mapPlacementTestStatusFromApi } from '../domain/placement-test.enums';
import { PlacementTestsRepository } from '../infrastructure/placement-tests.repository';
import { presentPlacementTest } from '../presenters/placement-test.presenter';

function normalizeOptionalResult(
  value: string | undefined,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

@Injectable()
export class UpdatePlacementTestUseCase {
  constructor(
    private readonly placementTestsRepository: PlacementTestsRepository,
  ) {}

  async execute(
    placementTestId: string,
    command: UpdatePlacementTestDto,
  ): Promise<PlacementTestResponseDto> {
    requireApplicationsScope();

    const existing =
      await this.placementTestsRepository.findPlacementTestById(placementTestId);
    if (!existing) {
      throw new NotFoundDomainException('Placement test not found', {
        placementTestId,
      });
    }

    const data: Prisma.PlacementTestUncheckedUpdateInput = {
      ...(command.scheduledAt !== undefined
        ? { scheduledAt: new Date(command.scheduledAt) }
        : {}),
      ...(command.score !== undefined
        ? { score: new Prisma.Decimal(command.score) }
        : {}),
      ...(command.result !== undefined
        ? { result: normalizeOptionalResult(command.result) }
        : {}),
      ...(command.status !== undefined
        ? { status: mapPlacementTestStatusFromApi(command.status) }
        : {}),
    };

    if (Object.keys(data).length === 0) {
      return presentPlacementTest(existing);
    }

    const updated = await this.placementTestsRepository.updatePlacementTest(
      placementTestId,
      data,
    );
    if (!updated) {
      throw new NotFoundDomainException('Placement test not found', {
        placementTestId,
      });
    }

    return presentPlacementTest(updated);
  }
}
