import { ApiProperty } from '@nestjs/swagger';

export class UsersPaginationDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  total!: number;
}

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Nour Ali' })
  fullName!: string;

  @ApiProperty({ example: 'nour.ali', nullable: true })
  username!: string | null;

  @ApiProperty({
    description: 'Login email retained for backward-compatible auth contracts.',
    example: 'nour.ali@demo-school.moazez.local',
  })
  email!: string;

  @ApiProperty({ example: 'nour.ali@demo-school.moazez.local' })
  loginEmail!: string;

  @ApiProperty({ example: 'nour.parent@example.com', nullable: true })
  contactEmail!: string | null;

  @ApiProperty({ format: 'uuid' })
  roleId!: string;

  @ApiProperty({ example: 'Teacher' })
  roleName!: string;

  @ApiProperty({ enum: ['active', 'invited', 'inactive'], example: 'active' })
  status!: 'active' | 'invited' | 'inactive';

  @ApiProperty({ format: 'date-time', nullable: true })
  lastActiveAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  invitedAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  lastInviteSentAt!: string | null;
}

export class UsersListResponseDto {
  @ApiProperty({ type: [UserResponseDto] })
  items!: UserResponseDto[];

  @ApiProperty({ type: UsersPaginationDto })
  pagination!: UsersPaginationDto;
}

export class UserStatusResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['active', 'invited', 'inactive'], example: 'active' })
  status!: 'active' | 'invited' | 'inactive';
}

export class ResetPasswordResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['queued'], example: 'queued' })
  status!: 'queued';

  @ApiProperty({
    example: 'Password reset initiated.',
  })
  message!: string;
}
