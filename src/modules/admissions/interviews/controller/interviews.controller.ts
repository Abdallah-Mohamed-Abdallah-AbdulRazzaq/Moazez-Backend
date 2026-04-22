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
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateInterviewUseCase } from '../application/create-interview.use-case';
import { GetInterviewUseCase } from '../application/get-interview.use-case';
import { ListInterviewsUseCase } from '../application/list-interviews.use-case';
import { UpdateInterviewUseCase } from '../application/update-interview.use-case';
import {
  CreateInterviewDto,
  InterviewResponseDto,
  InterviewsListResponseDto,
  ListInterviewsQueryDto,
  UpdateInterviewDto,
} from '../dto/interview.dto';

@ApiTags('admissions-interviews')
@ApiBearerAuth()
@Controller('admissions/interviews')
export class InterviewsController {
  constructor(
    private readonly listInterviewsUseCase: ListInterviewsUseCase,
    private readonly createInterviewUseCase: CreateInterviewUseCase,
    private readonly getInterviewUseCase: GetInterviewUseCase,
    private readonly updateInterviewUseCase: UpdateInterviewUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: InterviewsListResponseDto })
  @RequiredPermissions('admissions.interviews.view')
  listInterviews(
    @Query() query: ListInterviewsQueryDto,
  ): Promise<InterviewsListResponseDto> {
    return this.listInterviewsUseCase.execute(query);
  }

  @Post()
  @ApiCreatedResponse({ type: InterviewResponseDto })
  @RequiredPermissions('admissions.interviews.manage')
  createInterview(@Body() dto: CreateInterviewDto): Promise<InterviewResponseDto> {
    return this.createInterviewUseCase.execute(dto);
  }

  @Get(':id')
  @ApiOkResponse({ type: InterviewResponseDto })
  @RequiredPermissions('admissions.interviews.view')
  getInterview(
    @Param('id', new ParseUUIDPipe()) interviewId: string,
  ): Promise<InterviewResponseDto> {
    return this.getInterviewUseCase.execute(interviewId);
  }

  @Patch(':id')
  @ApiOkResponse({ type: InterviewResponseDto })
  @RequiredPermissions('admissions.interviews.manage')
  updateInterview(
    @Param('id', new ParseUUIDPipe()) interviewId: string,
    @Body() dto: UpdateInterviewDto,
  ): Promise<InterviewResponseDto> {
    return this.updateInterviewUseCase.execute(interviewId, dto);
  }
}
