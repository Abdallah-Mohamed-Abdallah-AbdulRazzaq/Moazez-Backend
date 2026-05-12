import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../../common/decorators/required-permissions.decorator';
import { BulkCredentialGenerateUseCase } from '../application/bulk-credential-generate.use-case';
import { BulkCredentialPreviewUseCase } from '../application/bulk-credential-preview.use-case';
import { GenerateUserCredentialUseCase } from '../application/generate-user-credential.use-case';
import { ListCredentialStatusUseCase } from '../application/list-credential-status.use-case';
import { SetUserCredentialUseCase } from '../application/set-user-credential.use-case';
import {
  BulkCredentialPreviewResponseDto,
  BulkCredentialSelectionDto,
  BulkGenerateCredentialsResponseDto,
  CredentialStatusListResponseDto,
  CredentialStatusQueryDto,
  GeneratedCredentialResponseDto,
  SetCredentialPasswordDto,
  SetCredentialResponseDto,
} from '../dto/credential.dto';

@ApiTags('settings-user-credentials')
@ApiBearerAuth()
@Controller('settings/users/credentials')
export class UserCredentialsCollectionController {
  constructor(
    private readonly listCredentialStatusUseCase: ListCredentialStatusUseCase,
    private readonly bulkPreviewUseCase: BulkCredentialPreviewUseCase,
    private readonly bulkGenerateUseCase: BulkCredentialGenerateUseCase,
  ) {}

  @Get('status')
  @RequiredPermissions('settings.users.view')
  @ApiOperation({
    summary: 'List user credential status',
    description:
      'Returns school-scoped users with password provisioning and must-change-password state.',
  })
  @ApiOkResponse({ type: CredentialStatusListResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiForbiddenResponse({
    description: 'Requires settings.users.view in the current school scope.',
  })
  status(
    @Query() query: CredentialStatusQueryDto,
  ): Promise<CredentialStatusListResponseDto> {
    return this.listCredentialStatusUseCase.execute(query);
  }

  @Post('bulk-preview')
  @RequiredPermissions('settings.users.view')
  @ApiOperation({
    summary: 'Preview a bulk credential generation audience',
    description:
      'Resolves the selected users and reports eligible/skipped counts without changing credentials.',
  })
  @ApiCreatedResponse({ type: BulkCredentialPreviewResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiForbiddenResponse({
    description: 'Requires settings.users.view in the current school scope.',
  })
  bulkPreview(
    @Body() dto: BulkCredentialSelectionDto,
  ): Promise<BulkCredentialPreviewResponseDto> {
    return this.bulkPreviewUseCase.execute(dto);
  }

  @Post('bulk-generate')
  @RequiredPermissions('settings.users.manage')
  @ApiOperation({
    summary: 'Generate temporary passwords for a bulk audience',
    description:
      'Generates one-time temporary passwords, stores only hashes, requires password change on login, and revokes existing sessions.',
  })
  @ApiCreatedResponse({ type: BulkGenerateCredentialsResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiUnprocessableEntityResponse({
    description:
      'iam.credentials.no_eligible_users | iam.credentials.bulk_too_large',
  })
  @ApiForbiddenResponse({
    description: 'Requires settings.users.manage in the current school scope.',
  })
  bulkGenerate(
    @Body() dto: BulkCredentialSelectionDto,
  ): Promise<BulkGenerateCredentialsResponseDto> {
    return this.bulkGenerateUseCase.execute(dto);
  }
}

@ApiTags('settings-user-credentials')
@ApiBearerAuth()
@Controller('settings/users/:userId/credentials')
export class UserCredentialsMemberController {
  constructor(
    private readonly generateCredentialUseCase: GenerateUserCredentialUseCase,
    private readonly setCredentialUseCase: SetUserCredentialUseCase,
  ) {}

  @Post('generate')
  @RequiredPermissions('settings.users.manage')
  @ApiOperation({
    summary: 'Generate a temporary password for one user',
    description:
      'Returns a one-time temporary password while storing only the hash and requiring password change on next login.',
  })
  @ApiParam({ name: 'userId', description: 'User id', format: 'uuid' })
  @ApiCreatedResponse({ type: GeneratedCredentialResponseDto })
  @ApiNotFoundResponse({
    description: 'User not found in current school scope.',
  })
  @ApiConflictResponse({ description: 'iam.credentials.user_not_manageable' })
  @ApiForbiddenResponse({
    description: 'Requires settings.users.manage in the current school scope.',
  })
  generate(
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<GeneratedCredentialResponseDto> {
    return this.generateCredentialUseCase.execute(userId, 'generate');
  }

  @Post('set')
  @RequiredPermissions('settings.users.manage')
  @ApiOperation({
    summary: 'Set a user password',
    description:
      'Hashes an admin-provided password, optionally requires password change on login, and revokes existing sessions.',
  })
  @ApiParam({ name: 'userId', description: 'User id', format: 'uuid' })
  @ApiCreatedResponse({ type: SetCredentialResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiNotFoundResponse({
    description: 'User not found in current school scope.',
  })
  @ApiConflictResponse({ description: 'iam.credentials.user_not_manageable' })
  @ApiUnprocessableEntityResponse({
    description: 'iam.credentials.password_policy_failed',
  })
  @ApiForbiddenResponse({
    description: 'Requires settings.users.manage in the current school scope.',
  })
  set(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: SetCredentialPasswordDto,
  ): Promise<SetCredentialResponseDto> {
    return this.setCredentialUseCase.execute(userId, dto);
  }

  @Post('regenerate')
  @RequiredPermissions('settings.users.manage')
  @ApiOperation({
    summary: 'Regenerate a temporary password for one user',
    description:
      'Replaces the previous credential hash, returns a new one-time temporary password, and revokes existing sessions.',
  })
  @ApiParam({ name: 'userId', description: 'User id', format: 'uuid' })
  @ApiCreatedResponse({ type: GeneratedCredentialResponseDto })
  @ApiNotFoundResponse({
    description: 'User not found in current school scope.',
  })
  @ApiConflictResponse({ description: 'iam.credentials.user_not_manageable' })
  @ApiForbiddenResponse({
    description: 'Requires settings.users.manage in the current school scope.',
  })
  regenerate(
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<GeneratedCredentialResponseDto> {
    return this.generateCredentialUseCase.execute(userId, 'regenerate');
  }
}
