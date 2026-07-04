import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { ScopeResolverGuard } from '../../../../common/guards/scope-resolver.guard';
import { CreateDismissalStaffAssignmentUseCase } from '../application/create-dismissal-staff-assignment.use-case';
import { DeleteDismissalStaffAssignmentUseCase } from '../application/delete-dismissal-staff-assignment.use-case';
import { GetDismissalStaffAssignmentUseCase } from '../application/get-dismissal-staff-assignment.use-case';
import { ListDismissalStaffAssignmentsUseCase } from '../application/list-dismissal-staff-assignments.use-case';
import { UpdateDismissalStaffAssignmentUseCase } from '../application/update-dismissal-staff-assignment.use-case';
import {
  CreateDismissalStaffAssignmentDto,
  DeleteDismissalStaffAssignmentResponseDto,
  DismissalStaffAssignmentResponseDto,
  DismissalStaffAssignmentsListResponseDto,
  ListDismissalStaffAssignmentsQueryDto,
  UpdateDismissalStaffAssignmentDto,
} from '../dto/dismissal-staff-assignment.dto';

@ApiTags('dismissal-staff-assignments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ScopeResolverGuard, PermissionsGuard)
@Controller('dismissal/staff-assignments')
export class DismissalStaffAssignmentsController {
  constructor(
    private readonly listDismissalStaffAssignmentsUseCase: ListDismissalStaffAssignmentsUseCase,
    private readonly createDismissalStaffAssignmentUseCase: CreateDismissalStaffAssignmentUseCase,
    private readonly getDismissalStaffAssignmentUseCase: GetDismissalStaffAssignmentUseCase,
    private readonly updateDismissalStaffAssignmentUseCase: UpdateDismissalStaffAssignmentUseCase,
    private readonly deleteDismissalStaffAssignmentUseCase: DeleteDismissalStaffAssignmentUseCase,
  ) {}

  @Get()
  @RequiredPermissions('dismissal.staff.view')
  @ApiOkResponse({ type: DismissalStaffAssignmentsListResponseDto })
  listAssignments(
    @Query() query: ListDismissalStaffAssignmentsQueryDto,
  ): Promise<DismissalStaffAssignmentsListResponseDto> {
    return this.listDismissalStaffAssignmentsUseCase.execute(query);
  }

  @Post()
  @RequiredPermissions('dismissal.staff.manage')
  @ApiCreatedResponse({ type: DismissalStaffAssignmentResponseDto })
  createAssignment(
    @Body() dto: CreateDismissalStaffAssignmentDto,
  ): Promise<DismissalStaffAssignmentResponseDto> {
    return this.createDismissalStaffAssignmentUseCase.execute(dto);
  }

  @Get(':id')
  @RequiredPermissions('dismissal.staff.view')
  @ApiOkResponse({ type: DismissalStaffAssignmentResponseDto })
  getAssignment(
    @Param('id', new ParseUUIDPipe()) assignmentId: string,
  ): Promise<DismissalStaffAssignmentResponseDto> {
    return this.getDismissalStaffAssignmentUseCase.execute(assignmentId);
  }

  @Patch(':id')
  @RequiredPermissions('dismissal.staff.manage')
  @ApiOkResponse({ type: DismissalStaffAssignmentResponseDto })
  updateAssignment(
    @Param('id', new ParseUUIDPipe()) assignmentId: string,
    @Body() dto: UpdateDismissalStaffAssignmentDto,
  ): Promise<DismissalStaffAssignmentResponseDto> {
    return this.updateDismissalStaffAssignmentUseCase.execute(assignmentId, dto);
  }

  @Delete(':id')
  @RequiredPermissions('dismissal.staff.manage')
  @ApiOkResponse({ type: DeleteDismissalStaffAssignmentResponseDto })
  deleteAssignment(
    @Param('id', new ParseUUIDPipe()) assignmentId: string,
  ): Promise<DeleteDismissalStaffAssignmentResponseDto> {
    return this.deleteDismissalStaffAssignmentUseCase.execute(assignmentId);
  }
}
