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
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateUserUseCase } from '../application/create-user.use-case';
import { InviteUserUseCase } from '../application/invite-user.use-case';
import { ListUsersUseCase } from '../application/list-users.use-case';
import { ResendInviteUseCase } from '../application/resend-invite.use-case';
import { ResetPasswordUseCase } from '../application/reset-password.use-case';
import { UpdateUserStatusUseCase } from '../application/update-user-status.use-case';
import { UpdateUserUseCase } from '../application/update-user.use-case';
import { CreateUserDto, InviteUserDto } from '../dto/create-user.dto';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import {
  ResetPasswordResponseDto,
  UserResponseDto,
  UserStatusResponseDto,
  UsersListResponseDto,
} from '../dto/user-response.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { UpdateUserDto } from '../dto/update-user.dto';

@ApiTags('settings-users')
@ApiBearerAuth()
@Controller('settings/users')
export class UsersController {
  constructor(
    private readonly listUsersUseCase: ListUsersUseCase,
    private readonly inviteUserUseCase: InviteUserUseCase,
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly updateUserStatusUseCase: UpdateUserStatusUseCase,
    private readonly resendInviteUseCase: ResendInviteUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
  ) {}

  @Get()
  @RequiredPermissions('settings.users.view')
  @ApiOperation({
    summary: 'List school users with login identity fields',
    description:
      'Returns school-scoped users for the settings dashboard, including generated login email and contact email fields.',
  })
  @ApiOkResponse({ type: UsersListResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Bearer token is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Requires settings.users.view in the current school scope.',
  })
  listUsers(@Query() query: ListUsersQueryDto): Promise<UsersListResponseDto> {
    return this.listUsersUseCase.execute(query);
  }

  @Post('invite')
  @RequiredPermissions('settings.users.manage')
  @ApiOperation({
    summary: 'Invite a school user',
    description:
      'Creates an invited user and membership. Username/contactEmail are used when school login identity is configured.',
  })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiConflictResponse({
    description: 'iam.user.email_taken | iam.user.username_taken',
  })
  @ApiForbiddenResponse({
    description: 'Requires settings.users.manage in the current school scope.',
  })
  inviteUser(@Body() dto: InviteUserDto): Promise<UserResponseDto> {
    return this.inviteUserUseCase.execute(dto);
  }

  @Post()
  @RequiredPermissions('settings.users.manage')
  @ApiOperation({
    summary: 'Create an active school user',
    description:
      'Creates an active user and membership. Credentials are provisioned separately through the credentials endpoints.',
  })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiConflictResponse({
    description: 'iam.user.email_taken | iam.user.username_taken',
  })
  @ApiForbiddenResponse({
    description: 'Requires settings.users.manage in the current school scope.',
  })
  createUser(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.createUserUseCase.execute(dto);
  }

  @Patch(':id')
  @RequiredPermissions('settings.users.manage')
  @ApiOperation({ summary: 'Update a school user profile or role' })
  @ApiParam({ name: 'id', description: 'User id', format: 'uuid' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiNotFoundResponse({
    description: 'User not found in current school scope.',
  })
  @ApiForbiddenResponse({
    description: 'Requires settings.users.manage in the current school scope.',
  })
  updateUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.updateUserUseCase.execute(id, dto);
  }

  @Patch(':id/status')
  @RequiredPermissions('settings.users.manage')
  @ApiOperation({ summary: 'Activate or deactivate a school user' })
  @ApiParam({ name: 'id', description: 'User id', format: 'uuid' })
  @ApiOkResponse({ type: UserStatusResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiNotFoundResponse({
    description: 'User not found in current school scope.',
  })
  @ApiForbiddenResponse({
    description: 'Requires settings.users.manage in the current school scope.',
  })
  updateUserStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<UserStatusResponseDto> {
    return this.updateUserStatusUseCase.execute(id, dto);
  }

  @Post(':id/resend-invite')
  @RequiredPermissions('settings.users.manage')
  @ApiOperation({ summary: 'Resend invite for an invited school user' })
  @ApiParam({ name: 'id', description: 'User id', format: 'uuid' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({
    description: 'User not found in current school scope.',
  })
  @ApiConflictResponse({
    description: 'Invite cannot be resent for this user state.',
  })
  @ApiForbiddenResponse({
    description: 'Requires settings.users.manage in the current school scope.',
  })
  resendInvite(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<UserResponseDto> {
    return this.resendInviteUseCase.execute(id);
  }

  @Post(':id/reset-password')
  @RequiredPermissions('settings.users.manage')
  @ApiOperation({ summary: 'Initiate password reset for a school user' })
  @ApiParam({ name: 'id', description: 'User id', format: 'uuid' })
  @ApiCreatedResponse({ type: ResetPasswordResponseDto })
  @ApiNotFoundResponse({
    description: 'User not found in current school scope.',
  })
  @ApiForbiddenResponse({
    description: 'Requires settings.users.manage in the current school scope.',
  })
  resetPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ResetPasswordResponseDto> {
    return this.resetPasswordUseCase.execute(id);
  }
}
