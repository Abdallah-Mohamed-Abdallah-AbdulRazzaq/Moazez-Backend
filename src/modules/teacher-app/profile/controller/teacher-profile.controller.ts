import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetTeacherEmploymentProfileUseCase } from '../application/get-teacher-employment-profile.use-case';
import { GetTeacherProfileUseCase } from '../application/get-teacher-profile.use-case';
import {
  TeacherEmploymentProfileResponseDto,
  TeacherProfileResponseDto,
} from '../dto/teacher-profile.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/profile')
export class TeacherProfileController {
  constructor(
    private readonly getTeacherProfileUseCase: GetTeacherProfileUseCase,
    private readonly getTeacherEmploymentProfileUseCase: GetTeacherEmploymentProfileUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: TeacherProfileResponseDto })
  getProfile(): Promise<TeacherProfileResponseDto> {
    return this.getTeacherProfileUseCase.execute();
  }

  @Get('employment')
  @ApiOkResponse({ type: TeacherEmploymentProfileResponseDto })
  getEmploymentProfile(): TeacherEmploymentProfileResponseDto {
    return this.getTeacherEmploymentProfileUseCase.execute();
  }
}
