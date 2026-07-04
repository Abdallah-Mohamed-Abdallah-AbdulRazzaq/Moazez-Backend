import { Injectable } from '@nestjs/common';
import { DismissalGateNotFoundException } from '../../shared/dismissal.errors';
import { DismissalGateResponseDto } from '../dto/dismissal-gate.dto';
import { DismissalGatesRepository } from '../infrastructure/dismissal-gates.repository';
import { presentDismissalGate } from '../presenter/dismissal-gate.presenter';

@Injectable()
export class GetDismissalGateUseCase {
  constructor(
    private readonly dismissalGatesRepository: DismissalGatesRepository,
  ) {}

  async execute(gateId: string): Promise<DismissalGateResponseDto> {
    const gate = await this.dismissalGatesRepository.findGateById(gateId);
    if (!gate) {
      throw new DismissalGateNotFoundException();
    }

    return presentDismissalGate(gate);
  }
}
