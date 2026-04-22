import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetStudentMedicalProfileUseCase } from '../application/get-student-medical-profile.use-case';
import { UpsertStudentMedicalProfileUseCase } from '../application/upsert-student-medical-profile.use-case';
import {
  StudentMedicalProfileResponseDto,
  UpdateStudentMedicalProfileDto,
} from '../dto/student-medical-profile.dto';

@ApiTags('students-guardians')
@ApiBearerAuth()
@Controller('students-guardians/students')
export class StudentMedicalController {
  constructor(
    private readonly getStudentMedicalProfileUseCase: GetStudentMedicalProfileUseCase,
    private readonly upsertStudentMedicalProfileUseCase: UpsertStudentMedicalProfileUseCase,
  ) {}

  @Get(':studentId/medical-profile')
  @ApiOkResponse({ type: StudentMedicalProfileResponseDto })
  @RequiredPermissions('students.medical.view')
  getMedicalProfile(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<StudentMedicalProfileResponseDto | null> {
    return this.getStudentMedicalProfileUseCase.execute(studentId);
  }

  @Patch(':studentId/medical-profile')
  @ApiOkResponse({ type: StudentMedicalProfileResponseDto })
  @RequiredPermissions('students.medical.manage')
  upsertMedicalProfile(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Body() dto: UpdateStudentMedicalProfileDto,
  ): Promise<StudentMedicalProfileResponseDto> {
    return this.upsertStudentMedicalProfileUseCase.execute(studentId, dto);
  }
}
