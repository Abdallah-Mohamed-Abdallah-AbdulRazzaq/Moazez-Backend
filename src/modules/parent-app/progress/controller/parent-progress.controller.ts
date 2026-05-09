import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetParentChildAcademicProgressUseCase } from '../application/get-parent-child-academic-progress.use-case';
import { GetParentChildBehaviorProgressUseCase } from '../application/get-parent-child-behavior-progress.use-case';
import { GetParentChildProgressUseCase } from '../application/get-parent-child-progress.use-case';
import { GetParentChildXpProgressUseCase } from '../application/get-parent-child-xp-progress.use-case';
import {
  ParentAcademicProgressResponseDto,
  ParentBehaviorProgressResponseDto,
  ParentProgressOverviewResponseDto,
  ParentXpProgressResponseDto,
} from '../dto/parent-progress.dto';

@ApiTags('parent-app')
@ApiBearerAuth()
@Controller('parent/children/:studentId/progress')
export class ParentProgressController {
  constructor(
    private readonly getParentChildProgressUseCase: GetParentChildProgressUseCase,
    private readonly getParentChildAcademicProgressUseCase: GetParentChildAcademicProgressUseCase,
    private readonly getParentChildBehaviorProgressUseCase: GetParentChildBehaviorProgressUseCase,
    private readonly getParentChildXpProgressUseCase: GetParentChildXpProgressUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: ParentProgressOverviewResponseDto })
  getProgress(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<ParentProgressOverviewResponseDto> {
    return this.getParentChildProgressUseCase.execute(studentId);
  }

  @Get('academic')
  @ApiOkResponse({ type: ParentAcademicProgressResponseDto })
  getAcademicProgress(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<ParentAcademicProgressResponseDto> {
    return this.getParentChildAcademicProgressUseCase.execute(studentId);
  }

  @Get('behavior')
  @ApiOkResponse({ type: ParentBehaviorProgressResponseDto })
  getBehaviorProgress(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<ParentBehaviorProgressResponseDto> {
    return this.getParentChildBehaviorProgressUseCase.execute(studentId);
  }

  @Get('xp')
  @ApiOkResponse({ type: ParentXpProgressResponseDto })
  getXpProgress(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<ParentXpProgressResponseDto> {
    return this.getParentChildXpProgressUseCase.execute(studentId);
  }
}
