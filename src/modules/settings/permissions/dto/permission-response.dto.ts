export class PermissionResponseDto {
  key!: string;
  module!: string;
  resource!: string;
  action!: string;
  label!: string;
  description!: string | null;
}
