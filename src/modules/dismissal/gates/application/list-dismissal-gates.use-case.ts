import { Injectable } from '@nestjs/common';
import {
  DismissalGatesListResponseDto,
  ListDismissalGatesQueryDto,
} from '../dto/dismissal-gate.dto';
import { DismissalGatesRepository } from '../infrastructure/dismissal-gates.repository';
import { presentDismissalGate } from '../presenter/dismissal-gate.presenter';
import {
  parseGateStatus,
  parseOptionalBoolean,
} from '../../shared/dismissal.types';

@Injectable()
export class ListDismissalGatesUseCase {
  constructor(
    private readonly dismissalGatesRepository: DismissalGatesRepository,
  ) {}

  async execute(
    query: ListDismissalGatesQueryDto,
  ): Promise<DismissalGatesListResponseDto> {
    const status = parseGateStatus(query.status);
    const isActive = parseOptionalBoolean(query.active);
    const q = query.q?.trim() || undefined;

    const result = await this.dismissalGatesRepository.listGates(
      { status, isActive, q },
      { page: query.page, limit: query.limit },
    );

    return {
      data: result.gates.map(presentDismissalGate),
      summary: result.summary,
    };
  }
}
