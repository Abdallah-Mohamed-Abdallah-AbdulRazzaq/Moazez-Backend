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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateGuardianUseCase } from '../application/create-guardian.use-case';
import { GetGuardianStudentsUseCase } from '../application/get-guardian-students.use-case';
import { GetGuardianUseCase } from '../application/get-guardian.use-case';
import { ListGuardiansUseCase } from '../application/list-guardians.use-case';
import { UpdateGuardianUseCase } from '../application/update-guardian.use-case';
import {
  CreateGuardianDto,
  GuardianResponseDto,
  GuardianWithStudentsResponseDto,
  ListGuardiansQueryDto,
  UpdateGuardianDto,
} from '../dto/guardian.dto';

@ApiTags('students-guardians')
@ApiBearerAuth()
@Controller('students-guardians/students/guardians')
export class GuardiansController {
  constructor(
    private readonly listGuardiansUseCase: ListGuardiansUseCase,
    private readonly createGuardianUseCase: CreateGuardianUseCase,
    private readonly getGuardianUseCase: GetGuardianUseCase,
    private readonly updateGuardianUseCase: UpdateGuardianUseCase,
    private readonly getGuardianStudentsUseCase: GetGuardianStudentsUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: GuardianResponseDto, isArray: true })
  @RequiredPermissions('students.guardians.view')
  listGuardians(
    @Query() query: ListGuardiansQueryDto,
  ): Promise<GuardianResponseDto[]> {
    return this.listGuardiansUseCase.execute(query);
  }

  @Post()
  @ApiCreatedResponse({ type: GuardianResponseDto })
  @RequiredPermissions('students.guardians.manage')
  createGuardian(
    @Body() dto: CreateGuardianDto,
  ): Promise<GuardianResponseDto> {
    return this.createGuardianUseCase.execute(dto);
  }

  @Get(':guardianId')
  @ApiOkResponse({ type: GuardianResponseDto })
  @RequiredPermissions('students.guardians.view')
  getGuardian(
    @Param('guardianId', new ParseUUIDPipe()) guardianId: string,
  ): Promise<GuardianResponseDto> {
    return this.getGuardianUseCase.execute(guardianId);
  }

  @Patch(':guardianId')
  @ApiOkResponse({ type: GuardianResponseDto })
  @RequiredPermissions('students.guardians.manage')
  updateGuardian(
    @Param('guardianId', new ParseUUIDPipe()) guardianId: string,
    @Body() dto: UpdateGuardianDto,
  ): Promise<GuardianResponseDto> {
    return this.updateGuardianUseCase.execute(guardianId, dto);
  }

  @Get(':guardianId/students')
  @ApiOkResponse({ type: GuardianWithStudentsResponseDto })
  @RequiredPermissions('students.guardians.view')
  getGuardianStudents(
    @Param('guardianId', new ParseUUIDPipe()) guardianId: string,
  ): Promise<GuardianWithStudentsResponseDto> {
    return this.getGuardianStudentsUseCase.execute(guardianId);
  }
}
