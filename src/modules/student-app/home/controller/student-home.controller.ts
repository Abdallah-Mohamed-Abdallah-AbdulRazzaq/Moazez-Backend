import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetStudentHomeUseCase } from '../application/get-student-home.use-case';
import { StudentHomeResponseDto } from '../dto/student-home.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student')
export class StudentHomeController {
  constructor(private readonly getStudentHomeUseCase: GetStudentHomeUseCase) {}

  @Get('home')
  @ApiOkResponse({ type: StudentHomeResponseDto })
  getHome(): Promise<StudentHomeResponseDto> {
    return this.getStudentHomeUseCase.execute();
  }
}
