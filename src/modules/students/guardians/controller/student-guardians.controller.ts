import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetPrimaryStudentGuardiansUseCase } from '../application/get-primary-student-guardians.use-case';
import { LinkGuardianToStudentUseCase } from '../application/link-guardian-to-student.use-case';
import { ListStudentGuardiansUseCase } from '../application/list-student-guardians.use-case';
import { UnlinkGuardianFromStudentUseCase } from '../application/unlink-guardian-from-student.use-case';
import { UpdateStudentGuardianLinkUseCase } from '../application/update-student-guardian-link.use-case';
import {
  GuardianResponseDto,
  LinkGuardianToStudentDto,
  UpdateStudentGuardianLinkDto,
} from '../dto/guardian.dto';

@ApiTags('students-guardians')
@ApiBearerAuth()
@Controller('students-guardians/students')
export class StudentGuardiansController {
  constructor(
    private readonly listStudentGuardiansUseCase: ListStudentGuardiansUseCase,
    private readonly getPrimaryStudentGuardiansUseCase: GetPrimaryStudentGuardiansUseCase,
    private readonly linkGuardianToStudentUseCase: LinkGuardianToStudentUseCase,
    private readonly updateStudentGuardianLinkUseCase: UpdateStudentGuardianLinkUseCase,
    private readonly unlinkGuardianFromStudentUseCase: UnlinkGuardianFromStudentUseCase,
  ) {}

  @Get(':studentId/guardians')
  @ApiOkResponse({ type: GuardianResponseDto, isArray: true })
  @RequiredPermissions('students.guardians.view')
  listStudentGuardians(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<GuardianResponseDto[]> {
    return this.listStudentGuardiansUseCase.execute(studentId);
  }

  @Get(':studentId/guardians/primary')
  @ApiOkResponse({ type: GuardianResponseDto, isArray: true })
  @RequiredPermissions('students.guardians.view')
  getPrimaryStudentGuardians(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<GuardianResponseDto[]> {
    return this.getPrimaryStudentGuardiansUseCase.execute(studentId);
  }

  @Post(':studentId/guardians')
  @ApiCreatedResponse({ type: GuardianResponseDto })
  @RequiredPermissions('students.guardians.manage')
  linkGuardianToStudent(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Body() dto: LinkGuardianToStudentDto,
  ): Promise<GuardianResponseDto> {
    return this.linkGuardianToStudentUseCase.execute(studentId, dto);
  }

  @Patch(':studentId/guardians/:guardianId')
  @ApiOkResponse({ type: GuardianResponseDto })
  @RequiredPermissions('students.guardians.manage')
  updateStudentGuardianLink(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('guardianId', new ParseUUIDPipe()) guardianId: string,
    @Body() dto: UpdateStudentGuardianLinkDto,
  ): Promise<GuardianResponseDto> {
    return this.updateStudentGuardianLinkUseCase.execute(
      studentId,
      guardianId,
      dto,
    );
  }

  @Delete(':studentId/guardians/:guardianId')
  @HttpCode(204)
  @ApiNoContentResponse()
  @RequiredPermissions('students.guardians.manage')
  unlinkGuardianFromStudent(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('guardianId', new ParseUUIDPipe()) guardianId: string,
  ): Promise<void> {
    return this.unlinkGuardianFromStudentUseCase.execute(studentId, guardianId);
  }
}
