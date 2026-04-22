import { IsIn } from 'class-validator';

export class UpdateUserStatusDto {
  @IsIn(['active', 'inactive'])
  status!: 'active' | 'inactive';
}
