import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetStudentProfileUseCase } from '../application/get-student-profile.use-case';
import { StudentProfileResponseDto } from '../dto/student-profile.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/profile')
export class StudentProfileController {
  constructor(
    private readonly getStudentProfileUseCase: GetStudentProfileUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: StudentProfileResponseDto })
  getProfile(): Promise<StudentProfileResponseDto> {
    return this.getStudentProfileUseCase.execute();
  }
}
