import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateSchoolRegistrationUseCase } from '../application/create-school-registration.use-case';
import {
  CreateSchoolRegistrationDto,
  SchoolRegistrationResponseDto,
} from '../dto/school-registration.dto';

@ApiTags('students-registration')
@ApiBearerAuth()
@Controller('students-guardians/registrations')
export class SchoolRegistrationController {
  constructor(
    private readonly createSchoolRegistrationUseCase: CreateSchoolRegistrationUseCase,
  ) {}

  @Post()
  @ApiCreatedResponse({ type: SchoolRegistrationResponseDto })
  @RequiredPermissions(
    'students.records.manage',
    'students.guardians.manage',
    'students.enrollments.manage',
  )
  createRegistration(
    @Body() dto: CreateSchoolRegistrationDto,
  ): Promise<SchoolRegistrationResponseDto> {
    return this.createSchoolRegistrationUseCase.execute(dto);
  }
}
