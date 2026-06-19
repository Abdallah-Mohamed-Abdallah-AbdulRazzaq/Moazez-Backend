import { Injectable } from '@nestjs/common';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { CreateRewardRedemptionUseCase } from '../../../reinforcement/rewards/application/reward-redemptions.use-cases';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import {
  RedeemStudentRewardDto,
  StudentRewardRedemptionResponseDto,
} from '../dto/student-rewards.dto';
import { StudentRewardsReadAdapter } from '../infrastructure/student-rewards-read.adapter';
import { StudentRewardsPresenter } from '../presenters/student-rewards.presenter';

@Injectable()
export class RedeemStudentRewardUseCase {
  constructor(
    private readonly accessService: StudentAppAccessService,
    private readonly readAdapter: StudentRewardsReadAdapter,
    private readonly createRewardRedemptionUseCase: CreateRewardRedemptionUseCase,
  ) {}

  async execute(params: {
    rewardId: string;
    dto: RedeemStudentRewardDto;
  }): Promise<StudentRewardRedemptionResponseDto> {
    const { context } =
      await this.accessService.getCurrentStudentWithEnrollment();
    const reward = await this.readAdapter.findReward({
      context,
      rewardId: params.rewardId,
    });

    if (!reward) {
      throw new NotFoundDomainException('Student App reward not found', {
        rewardId: params.rewardId,
      });
    }

    const created = (await this.createRewardRedemptionUseCase.execute({
      catalogItemId: params.rewardId,
      studentId: context.studentId,
      enrollmentId: context.enrollmentId,
      academicYearId: context.academicYearId,
      termId: context.termId,
      requestSource: 'student_app',
      requestNoteEn: normalizeNullableText(params.dto.note),
    })) as { id?: unknown };
    const redemptionId = typeof created.id === 'string' ? created.id : null;
    if (!redemptionId) {
      throw new ValidationDomainException(
        'Reward redemption response is invalid',
        {
          rewardId: params.rewardId,
        },
      );
    }

    const redemption = await this.readAdapter.findRedemption({
      context,
      redemptionId,
    });
    if (!redemption) {
      throw new NotFoundDomainException(
        'Student App reward redemption not found',
        {
          rewardId: params.rewardId,
          redemptionId,
        },
      );
    }

    return StudentRewardsPresenter.presentRedemption(redemption);
  }
}

function normalizeNullableText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}
