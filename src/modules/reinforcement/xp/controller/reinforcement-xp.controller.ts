import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateXpPolicyUseCase } from '../application/create-xp-policy.use-case';
import { GetEffectiveXpPolicyUseCase } from '../application/get-effective-xp-policy.use-case';
import { GetXpSummaryUseCase } from '../application/get-xp-summary.use-case';
import { GrantManualXpUseCase } from '../application/grant-manual-xp.use-case';
import { GrantXpForReinforcementReviewUseCase } from '../application/grant-xp-for-reinforcement-review.use-case';
import { ListXpLedgerUseCase } from '../application/list-xp-ledger.use-case';
import { ListXpPoliciesUseCase } from '../application/list-xp-policies.use-case';
import { UpdateXpPolicyUseCase } from '../application/update-xp-policy.use-case';
import {
  CreateXpPolicyDto,
  GetEffectiveXpPolicyQueryDto,
  GetXpSummaryQueryDto,
  GrantManualXpDto,
  GrantXpForReinforcementReviewDto,
  ListXpLedgerQueryDto,
  ListXpPoliciesQueryDto,
  UpdateXpPolicyDto,
} from '../dto/reinforcement-xp.dto';

@ApiTags('reinforcement-xp')
@ApiBearerAuth()
@Controller('reinforcement/xp')
export class ReinforcementXpController {
  constructor(
    private readonly listXpPoliciesUseCase: ListXpPoliciesUseCase,
    private readonly getEffectiveXpPolicyUseCase: GetEffectiveXpPolicyUseCase,
    private readonly createXpPolicyUseCase: CreateXpPolicyUseCase,
    private readonly updateXpPolicyUseCase: UpdateXpPolicyUseCase,
    private readonly listXpLedgerUseCase: ListXpLedgerUseCase,
    private readonly getXpSummaryUseCase: GetXpSummaryUseCase,
    private readonly grantXpForReinforcementReviewUseCase: GrantXpForReinforcementReviewUseCase,
    private readonly grantManualXpUseCase: GrantManualXpUseCase,
  ) {}

  @Get('policies')
  @RequiredPermissions('reinforcement.xp.view')
  listPolicies(@Query() query: ListXpPoliciesQueryDto) {
    return this.listXpPoliciesUseCase.execute(query);
  }

  @Get('policies/effective')
  @RequiredPermissions('reinforcement.xp.view')
  getEffectivePolicy(@Query() query: GetEffectiveXpPolicyQueryDto) {
    return this.getEffectiveXpPolicyUseCase.execute(query);
  }

  @Post('policies')
  @RequiredPermissions('reinforcement.xp.manage')
  createPolicy(@Body() dto: CreateXpPolicyDto) {
    return this.createXpPolicyUseCase.execute(dto);
  }

  @Patch('policies/:policyId')
  @RequiredPermissions('reinforcement.xp.manage')
  updatePolicy(
    @Param('policyId', new ParseUUIDPipe()) policyId: string,
    @Body() dto: UpdateXpPolicyDto,
  ) {
    return this.updateXpPolicyUseCase.execute(policyId, dto);
  }

  @Get('ledger')
  @RequiredPermissions('reinforcement.xp.view')
  listLedger(@Query() query: ListXpLedgerQueryDto) {
    return this.listXpLedgerUseCase.execute(query);
  }

  @Get('summary')
  @RequiredPermissions('reinforcement.xp.view')
  getSummary(@Query() query: GetXpSummaryQueryDto) {
    return this.getXpSummaryUseCase.execute(query);
  }

  @Post('grants/reinforcement-review/:submissionId')
  @RequiredPermissions('reinforcement.xp.manage')
  grantForReinforcementReview(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Body() dto: GrantXpForReinforcementReviewDto,
  ) {
    return this.grantXpForReinforcementReviewUseCase.execute(
      submissionId,
      dto,
    );
  }

  @Post('grants/manual')
  @RequiredPermissions('reinforcement.xp.manage')
  grantManualBonus(@Body() dto: GrantManualXpDto) {
    return this.grantManualXpUseCase.execute(dto);
  }
}
