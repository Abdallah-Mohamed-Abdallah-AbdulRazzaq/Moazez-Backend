import { IsUUID } from 'class-validator';

export class TreeQueryDto {
  @IsUUID()
  yearId!: string;

  @IsUUID()
  termId!: string;
}
