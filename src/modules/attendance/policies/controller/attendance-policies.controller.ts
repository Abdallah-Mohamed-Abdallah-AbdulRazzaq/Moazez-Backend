import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateAttendancePolicyUseCase } from '../application/create-attendance-policy.use-case';
import { DeleteAttendancePolicyUseCase } from '../application/delete-attendance-policy.use-case';
import { GetEffectiveAttendancePolicyUseCase } from '../application/get-effective-attendance-policy.use-case';
import { ListAttendancePoliciesUseCase } from '../application/list-attendance-policies.use-case';
import { UpdateAttendancePolicyUseCase } from '../application/update-attendance-policy.use-case';
import { ValidateAttendancePolicyNameUseCase } from '../application/validate-attendance-policy-name.use-case';
import {
  AttendancePoliciesListResponseDto,
  AttendancePolicyResponseDto,
  CreateAttendancePolicyDto,
  DeleteAttendancePolicyResponseDto,
  EffectiveAttendancePolicyQueryDto,
  EffectiveAttendancePolicyResponseDto,
  ListAttendancePoliciesQueryDto,
  UpdateAttendancePolicyDto,
  ValidateAttendancePolicyNameQueryDto,
  ValidateAttendancePolicyNameResponseDto,
} from '../dto/attendance-policy.dto';

@ApiTags('attendance-policies')
@ApiBearerAuth()
@Controller('attendance/policies')
export class AttendancePoliciesController {
  constructor(
    private readonly listAttendancePoliciesUseCase: ListAttendancePoliciesUseCase,
    private readonly createAttendancePolicyUseCase: CreateAttendancePolicyUseCase,
    private readonly updateAttendancePolicyUseCase: UpdateAttendancePolicyUseCase,
    private readonly deleteAttendancePolicyUseCase: DeleteAttendancePolicyUseCase,
    private readonly getEffectiveAttendancePolicyUseCase: GetEffectiveAttendancePolicyUseCase,
    private readonly validateAttendancePolicyNameUseCase: ValidateAttendancePolicyNameUseCase,
  ) {}

  @Get()
  @RequiredPermissions('attendance.policies.view')
  listPolicies(
    @Query() query: ListAttendancePoliciesQueryDto,
  ): Promise<AttendancePoliciesListResponseDto> {
    return this.listAttendancePoliciesUseCase.execute(query);
  }

  @Get('effective')
  @RequiredPermissions('attendance.policies.view')
  getEffectivePolicy(
    @Query() query: EffectiveAttendancePolicyQueryDto,
  ): Promise<EffectiveAttendancePolicyResponseDto> {
    return this.getEffectiveAttendancePolicyUseCase.execute(query);
  }

  @Get('validate-name')
  @RequiredPermissions('attendance.policies.view')
  validatePolicyName(
    @Query() query: ValidateAttendancePolicyNameQueryDto,
  ): Promise<ValidateAttendancePolicyNameResponseDto> {
    return this.validateAttendancePolicyNameUseCase.execute(query);
  }

  @Post()
  @RequiredPermissions('attendance.policies.manage')
  createPolicy(
    @Body() dto: CreateAttendancePolicyDto,
  ): Promise<AttendancePolicyResponseDto> {
    return this.createAttendancePolicyUseCase.execute(dto);
  }

  @Patch(':id')
  @RequiredPermissions('attendance.policies.manage')
  updatePolicy(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAttendancePolicyDto,
  ): Promise<AttendancePolicyResponseDto> {
    return this.updateAttendancePolicyUseCase.execute(id, dto);
  }

  @Delete(':id')
  @RequiredPermissions('attendance.policies.manage')
  deletePolicy(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DeleteAttendancePolicyResponseDto> {
    return this.deleteAttendancePolicyUseCase.execute(id);
  }
}
