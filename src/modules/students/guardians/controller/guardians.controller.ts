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
import {
  AccountLinkingDto,
  GuardianAccountLinkResponseDto,
} from '../../account/dto/account-linking.dto';
import { CreateOrLinkGuardianAccountUseCase } from '../application/create-or-link-guardian-account.use-case';
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

abstract class GuardiansRoutesControllerBase {
  constructor(
    protected readonly listGuardiansUseCase: ListGuardiansUseCase,
    protected readonly createGuardianUseCase: CreateGuardianUseCase,
    protected readonly getGuardianUseCase: GetGuardianUseCase,
    protected readonly updateGuardianUseCase: UpdateGuardianUseCase,
    protected readonly getGuardianStudentsUseCase: GetGuardianStudentsUseCase,
  ) {}

  protected handleListGuardians(
    query: ListGuardiansQueryDto,
  ): Promise<GuardianResponseDto[]> {
    return this.listGuardiansUseCase.execute(query);
  }

  protected handleCreateGuardian(
    dto: CreateGuardianDto,
  ): Promise<GuardianResponseDto> {
    return this.createGuardianUseCase.execute(dto);
  }

  protected handleGetGuardian(
    guardianId: string,
  ): Promise<GuardianResponseDto> {
    return this.getGuardianUseCase.execute(guardianId);
  }

  protected handleUpdateGuardian(
    guardianId: string,
    dto: UpdateGuardianDto,
  ): Promise<GuardianResponseDto> {
    return this.updateGuardianUseCase.execute(guardianId, dto);
  }

  protected handleGetGuardianStudents(
    guardianId: string,
  ): Promise<GuardianWithStudentsResponseDto> {
    return this.getGuardianStudentsUseCase.execute(guardianId);
  }
}

@ApiTags('students-guardians')
@ApiBearerAuth()
@Controller('students-guardians/guardians')
export class GuardiansController extends GuardiansRoutesControllerBase {
  constructor(
    listGuardiansUseCase: ListGuardiansUseCase,
    createGuardianUseCase: CreateGuardianUseCase,
    getGuardianUseCase: GetGuardianUseCase,
    updateGuardianUseCase: UpdateGuardianUseCase,
    getGuardianStudentsUseCase: GetGuardianStudentsUseCase,
  ) {
    super(
      listGuardiansUseCase,
      createGuardianUseCase,
      getGuardianUseCase,
      updateGuardianUseCase,
      getGuardianStudentsUseCase,
    );
  }

  @Get()
  @ApiOkResponse({ type: GuardianResponseDto, isArray: true })
  @RequiredPermissions('students.guardians.view')
  listGuardians(
    @Query() query: ListGuardiansQueryDto,
  ): Promise<GuardianResponseDto[]> {
    return this.handleListGuardians(query);
  }

  @Post()
  @ApiCreatedResponse({ type: GuardianResponseDto })
  @RequiredPermissions('students.guardians.manage')
  createGuardian(@Body() dto: CreateGuardianDto): Promise<GuardianResponseDto> {
    return this.handleCreateGuardian(dto);
  }

  @Get(':guardianId')
  @ApiOkResponse({ type: GuardianResponseDto })
  @RequiredPermissions('students.guardians.view')
  getGuardian(
    @Param('guardianId', new ParseUUIDPipe()) guardianId: string,
  ): Promise<GuardianResponseDto> {
    return this.handleGetGuardian(guardianId);
  }

  @Patch(':guardianId')
  @ApiOkResponse({ type: GuardianResponseDto })
  @RequiredPermissions('students.guardians.manage')
  updateGuardian(
    @Param('guardianId', new ParseUUIDPipe()) guardianId: string,
    @Body() dto: UpdateGuardianDto,
  ): Promise<GuardianResponseDto> {
    return this.handleUpdateGuardian(guardianId, dto);
  }

  @Get(':guardianId/students')
  @ApiOkResponse({ type: GuardianWithStudentsResponseDto })
  @RequiredPermissions('students.guardians.view')
  getGuardianStudents(
    @Param('guardianId', new ParseUUIDPipe()) guardianId: string,
  ): Promise<GuardianWithStudentsResponseDto> {
    return this.handleGetGuardianStudents(guardianId);
  }
}

@ApiTags('students-guardians')
@ApiBearerAuth()
@Controller('students-guardians/students/guardians')
export class LegacyGuardiansController extends GuardiansRoutesControllerBase {
  constructor(
    listGuardiansUseCase: ListGuardiansUseCase,
    createGuardianUseCase: CreateGuardianUseCase,
    getGuardianUseCase: GetGuardianUseCase,
    updateGuardianUseCase: UpdateGuardianUseCase,
    getGuardianStudentsUseCase: GetGuardianStudentsUseCase,
  ) {
    super(
      listGuardiansUseCase,
      createGuardianUseCase,
      getGuardianUseCase,
      updateGuardianUseCase,
      getGuardianStudentsUseCase,
    );
  }

  @Get()
  @ApiOkResponse({ type: GuardianResponseDto, isArray: true })
  @RequiredPermissions('students.guardians.view')
  listGuardians(
    @Query() query: ListGuardiansQueryDto,
  ): Promise<GuardianResponseDto[]> {
    return this.handleListGuardians(query);
  }

  @Post()
  @ApiCreatedResponse({ type: GuardianResponseDto })
  @RequiredPermissions('students.guardians.manage')
  createGuardian(@Body() dto: CreateGuardianDto): Promise<GuardianResponseDto> {
    return this.handleCreateGuardian(dto);
  }

  @Get(':guardianId')
  @ApiOkResponse({ type: GuardianResponseDto })
  @RequiredPermissions('students.guardians.view')
  getGuardian(
    @Param('guardianId', new ParseUUIDPipe()) guardianId: string,
  ): Promise<GuardianResponseDto> {
    return this.handleGetGuardian(guardianId);
  }

  @Patch(':guardianId')
  @ApiOkResponse({ type: GuardianResponseDto })
  @RequiredPermissions('students.guardians.manage')
  updateGuardian(
    @Param('guardianId', new ParseUUIDPipe()) guardianId: string,
    @Body() dto: UpdateGuardianDto,
  ): Promise<GuardianResponseDto> {
    return this.handleUpdateGuardian(guardianId, dto);
  }

  @Get(':guardianId/students')
  @ApiOkResponse({ type: GuardianWithStudentsResponseDto })
  @RequiredPermissions('students.guardians.view')
  getGuardianStudents(
    @Param('guardianId', new ParseUUIDPipe()) guardianId: string,
  ): Promise<GuardianWithStudentsResponseDto> {
    return this.handleGetGuardianStudents(guardianId);
  }
}

@ApiTags('students-guardians')
@ApiBearerAuth()
@Controller('students-guardians/guardians')
export class GuardianAccountsController {
  constructor(
    private readonly createOrLinkGuardianAccountUseCase: CreateOrLinkGuardianAccountUseCase,
  ) {}

  @Post(':guardianId/account')
  @ApiOkResponse({ type: GuardianAccountLinkResponseDto })
  @RequiredPermissions('students.guardians.manage')
  createOrLinkAccount(
    @Param('guardianId', new ParseUUIDPipe()) guardianId: string,
    @Body() dto: AccountLinkingDto,
  ): Promise<GuardianAccountLinkResponseDto> {
    return this.createOrLinkGuardianAccountUseCase.execute(guardianId, dto);
  }
}
