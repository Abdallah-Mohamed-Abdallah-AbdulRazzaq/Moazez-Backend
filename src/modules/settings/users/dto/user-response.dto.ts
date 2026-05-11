export class UserResponseDto {
  id!: string;
  fullName!: string;
  username!: string | null;
  email!: string;
  loginEmail!: string;
  contactEmail!: string | null;
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
