import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { ScopeResolverGuard } from '../../../../common/guards/scope-resolver.guard';
import { ConfirmStudentArrivalUseCase } from '../application/confirm-student-arrival.use-case';
import { ListWaitingStudentsUseCase } from '../application/list-waiting-students.use-case';
import { ConfirmStudentArrivalDto } from '../dto/confirm-student-arrival.dto';
import {
  ConfirmStudentArrivalResponseDto,
  DismissalWaitingStudentsListResponseDto,
  ListDismissalWaitingStudentsQueryDto,
} from '../dto/dismissal-waiting-students-query.dto';

@ApiTags('dismissal-waiting-students')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ScopeResolverGuard, PermissionsGuard)
@Controller('dismissal/waiting-students')
export class DismissalWaitingStudentsController {
  constructor(
    private readonly listWaitingStudentsUseCase: ListWaitingStudentsUseCase,
    private readonly confirmStudentArrivalUseCase: ConfirmStudentArrivalUseCase,
  ) {}

  @Get()
  @RequiredPermissions('dismissal.requests.view')
  @ApiOkResponse({ type: DismissalWaitingStudentsListResponseDto })
  listWaitingStudents(
    @Query() query: ListDismissalWaitingStudentsQueryDto,
  ): Promise<DismissalWaitingStudentsListResponseDto> {
    return this.listWaitingStudentsUseCase.execute(query);
  }

  @Post(':id/arrival')
  @RequiredPermissions('dismissal.requests.manage')
  @ApiOkResponse({ type: ConfirmStudentArrivalResponseDto })
  confirmArrival(
    @Param('id', new ParseUUIDPipe()) requestId: string,
    @Body() command: ConfirmStudentArrivalDto,
  ): Promise<ConfirmStudentArrivalResponseDto> {
    return this.confirmStudentArrivalUseCase.execute(requestId, command);
  }
}
