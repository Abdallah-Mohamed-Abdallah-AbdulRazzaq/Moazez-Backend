import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { OrganizationManagementOnly } from '../../../../common/decorators/organization-management-only.decorator';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { TransferTeacherBetweenSchoolsCoordinator } from '../application/transfer-teacher-between-schools.coordinator';
import { TransferTeacherToSchoolDto } from '../dto/transfer-teacher-to-school.dto';
import type { OrganizationTeacherTransferResponse } from '../presenters/organization-teacher-transfer.presenter';

@ApiTags('organization-admin')
@ApiBearerAuth()
@OrganizationManagementOnly()
@Controller('organization-admin/teachers')
export class OrganizationTeacherTransfersController {
  constructor(
    private readonly coordinator: TransferTeacherBetweenSchoolsCoordinator,
  ) {}

  @Post(':teacherId/transfer')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('teachers.records.manage')
  @ApiOperation({ summary: 'Transfer a Teacher between owned Schools' })
  @ApiParam({ name: 'teacherId', format: 'uuid' })
  @ApiOkResponse({ description: 'Teacher transferred in fail-closed state.' })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiForbiddenResponse({ description: 'auth.scope.missing' })
  @ApiNotFoundResponse({
    description: 'teachers.lifecycle.transfer_not_found',
  })
  @ApiConflictResponse({
    description:
      'teachers.lifecycle.transfer_conflict | teachers.profile.code_conflict | teachers.profile.incomplete | teachers.account.teacher_role_required',
  })
  @ApiServiceUnavailableResponse({
    description: 'teachers.lifecycle.revocation_failed',
  })
  transfer(
    @Param('teacherId', new ParseUUIDPipe()) teacherId: string,
    @Body() command: TransferTeacherToSchoolDto,
  ): Promise<OrganizationTeacherTransferResponse> {
    return this.coordinator.execute(teacherId, command);
  }
}
