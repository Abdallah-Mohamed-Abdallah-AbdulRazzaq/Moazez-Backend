export class RoleResponseDto {
  id!: string;
  name!: string;
  description!: string | null;
  isSystem!: boolean;
  memberCount!: number;
  permissions!: string[];
}

export class RolePermissionsResponseDto {
  id!: string;
  permissions!: string[];
}

export class DeleteRoleResponseDto {
  ok!: boolean;
}
