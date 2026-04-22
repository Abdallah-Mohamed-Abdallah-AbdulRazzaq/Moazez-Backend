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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
  listUsers(@Query() query: ListUsersQueryDto): Promise<UsersListResponseDto> {
    return this.listUsersUseCase.execute(query);
  }

  @Post('invite')
  @RequiredPermissions('settings.users.manage')
  inviteUser(@Body() dto: InviteUserDto): Promise<UserResponseDto> {
    return this.inviteUserUseCase.execute(dto);
  }

  @Post()
  @RequiredPermissions('settings.users.manage')
  createUser(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.createUserUseCase.execute(dto);
  }

  @Patch(':id')
  @RequiredPermissions('settings.users.manage')
  updateUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.updateUserUseCase.execute(id, dto);
  }

  @Patch(':id/status')
  @RequiredPermissions('settings.users.manage')
  updateUserStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<UserStatusResponseDto> {
    return this.updateUserStatusUseCase.execute(id, dto);
  }

  @Post(':id/resend-invite')
  @RequiredPermissions('settings.users.manage')
  resendInvite(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<UserResponseDto> {
    return this.resendInviteUseCase.execute(id);
  }

  @Post(':id/reset-password')
  @RequiredPermissions('settings.users.manage')
  resetPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ResetPasswordResponseDto> {
    return this.resetPasswordUseCase.execute(id);
  }
}
