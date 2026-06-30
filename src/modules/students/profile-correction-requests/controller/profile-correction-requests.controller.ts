import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  ApproveProfileCorrectionRequestUseCase,
  GetStaffProfileCorrectionRequestUseCase,
  ListStaffProfileCorrectionRequestsUseCase,
  RejectProfileCorrectionRequestUseCase,
} from '../application/staff-profile-correction-requests.use-cases';
import {
  ListProfileCorrectionRequestsQueryDto,
  ReviewProfileCorrectionRequestDto,
  StaffProfileCorrectionRequestResponseDto,
} from '../dto/profile-correction-request.dto';

@ApiTags('students-records')
@ApiBearerAuth()
@Controller('students-guardians/profile-correction-requests')
export class ProfileCorrectionRequestsController {
  constructor(
    private readonly listRequestsUseCase: ListStaffProfileCorrectionRequestsUseCase,
    private readonly getRequestUseCase: GetStaffProfileCorrectionRequestUseCase,
    private readonly approveRequestUseCase: ApproveProfileCorrectionRequestUseCase,
    private readonly rejectRequestUseCase: RejectProfileCorrectionRequestUseCase,
  ) {}

  @Get()
  @ApiOkResponse({
    type: StaffProfileCorrectionRequestResponseDto,
    isArray: true,
  })
  @RequiredPermissions('students.records.view')
  listRequests(
    @Query() query: ListProfileCorrectionRequestsQueryDto,
  ): Promise<StaffProfileCorrectionRequestResponseDto[]> {
    return this.listRequestsUseCase.execute(query);
  }

  @Get(':requestId')
  @ApiOkResponse({ type: StaffProfileCorrectionRequestResponseDto })
  @RequiredPermissions('students.records.view')
  getRequest(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ): Promise<StaffProfileCorrectionRequestResponseDto> {
    return this.getRequestUseCase.execute(requestId);
  }

  @Post(':requestId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StaffProfileCorrectionRequestResponseDto })
  @RequiredPermissions('students.records.manage')
  approveRequest(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: ReviewProfileCorrectionRequestDto,
  ): Promise<StaffProfileCorrectionRequestResponseDto> {
    return this.approveRequestUseCase.execute(requestId, dto);
  }

  @Post(':requestId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StaffProfileCorrectionRequestResponseDto })
  @RequiredPermissions('students.records.manage')
  rejectRequest(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: ReviewProfileCorrectionRequestDto,
  ): Promise<StaffProfileCorrectionRequestResponseDto> {
    return this.rejectRequestUseCase.execute(requestId, dto);
  }
}
