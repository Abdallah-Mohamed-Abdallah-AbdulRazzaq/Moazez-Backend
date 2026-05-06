import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetStudentAcademicProgressUseCase } from '../application/get-student-academic-progress.use-case';
import { GetStudentBehaviorProgressUseCase } from '../application/get-student-behavior-progress.use-case';
import { GetStudentProgressUseCase } from '../application/get-student-progress.use-case';
import { GetStudentXpProgressUseCase } from '../application/get-student-xp-progress.use-case';
import {
  StudentAcademicProgressResponseDto,
  StudentBehaviorProgressResponseDto,
  StudentProgressOverviewResponseDto,
  StudentXpProgressResponseDto,
} from '../dto/student-progress.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/progress')
export class StudentProgressController {
  constructor(
    private readonly getStudentProgressUseCase: GetStudentProgressUseCase,
    private readonly getStudentAcademicProgressUseCase: GetStudentAcademicProgressUseCase,
    private readonly getStudentBehaviorProgressUseCase: GetStudentBehaviorProgressUseCase,
    private readonly getStudentXpProgressUseCase: GetStudentXpProgressUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: StudentProgressOverviewResponseDto })
  getProgress(): Promise<StudentProgressOverviewResponseDto> {
    return this.getStudentProgressUseCase.execute();
  }

  @Get('academic')
  @ApiOkResponse({ type: StudentAcademicProgressResponseDto })
  getAcademicProgress(): Promise<StudentAcademicProgressResponseDto> {
    return this.getStudentAcademicProgressUseCase.execute();
  }

  @Get('behavior')
  @ApiOkResponse({ type: StudentBehaviorProgressResponseDto })
  getBehaviorProgress(): Promise<StudentBehaviorProgressResponseDto> {
    return this.getStudentBehaviorProgressUseCase.execute();
  }

  @Get('xp')
  @ApiOkResponse({ type: StudentXpProgressResponseDto })
  getXpProgress(): Promise<StudentXpProgressResponseDto> {
    return this.getStudentXpProgressUseCase.execute();
  }
}
