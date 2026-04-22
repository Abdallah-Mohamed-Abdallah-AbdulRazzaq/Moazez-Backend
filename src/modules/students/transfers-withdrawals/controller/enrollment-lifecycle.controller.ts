import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { PromoteStudentEnrollmentUseCase } from '../application/promote-student-enrollment.use-case';
import { TransferStudentEnrollmentUseCase } from '../application/transfer-student-enrollment.use-case';
import { WithdrawStudentEnrollmentUseCase } from '../application/withdraw-student-enrollment.use-case';
import {
  EnrollmentMovementResponseDto,
  PromoteEnrollmentDto,
  TransferEnrollmentDto,
  WithdrawEnrollmentDto,
} from '../dto/enrollment-lifecycle.dto';

@ApiTags('students-enrollments')
@ApiBearerAuth()
@Controller('students-guardians/enrollments')
export class EnrollmentLifecycleController {
  constructor(
    private readonly transferStudentEnrollmentUseCase: TransferStudentEnrollmentUseCase,
    private readonly withdrawStudentEnrollmentUseCase: WithdrawStudentEnrollmentUseCase,
    private readonly promoteStudentEnrollmentUseCase: PromoteStudentEnrollmentUseCase,
  ) {}

  @Post('transfer')
  @HttpCode(200)
  @ApiOkResponse({ type: EnrollmentMovementResponseDto })
  @RequiredPermissions('students.lifecycle.manage')
  transferEnrollment(
    @Body() dto: TransferEnrollmentDto,
  ): Promise<EnrollmentMovementResponseDto> {
    return this.transferStudentEnrollmentUseCase.execute(dto);
  }

  @Post('withdraw')
  @HttpCode(200)
  @ApiOkResponse({ type: EnrollmentMovementResponseDto })
  @RequiredPermissions('students.lifecycle.manage')
  withdrawEnrollment(
    @Body() dto: WithdrawEnrollmentDto,
  ): Promise<EnrollmentMovementResponseDto> {
    return this.withdrawStudentEnrollmentUseCase.execute(dto);
  }

  @Post('promote')
  @HttpCode(200)
  @ApiOkResponse({ type: EnrollmentMovementResponseDto })
  @RequiredPermissions('students.lifecycle.manage')
  promoteEnrollment(
    @Body() dto: PromoteEnrollmentDto,
  ): Promise<EnrollmentMovementResponseDto> {
    return this.promoteStudentEnrollmentUseCase.execute(dto);
  }
}
