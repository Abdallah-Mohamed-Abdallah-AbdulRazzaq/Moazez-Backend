export class UserResponseDto {
  id!: string;
  fullName!: string;
  email!: string;
  roleId!: string;
  roleName!: string;
  status!: 'active' | 'invited' | 'inactive';
  lastActiveAt!: string | null;
  invitedAt!: string | null;
  lastInviteSentAt!: string | null;
}

export class UsersListResponseDto {
  items!: UserResponseDto[];
  pagination!: {
    page: number;
    limit: number;
    total: number;
  };
}

export class UserStatusResponseDto {
  id!: string;
  status!: 'active' | 'invited' | 'inactive';
}

export class ResetPasswordResponseDto {
  id!: string;
  status!: 'queued';
  message!: string;
}
