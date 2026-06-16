import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ListSubjectAllocationsQueryDto {
  @IsUUID()
  termId!: string;

  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;
}

export class BulkSaveSubjectAllocationItemDto {
  @IsUUID()
  gradeId!: string;

  @IsUUID()
  subjectId!: string;

  @IsInt()
  @Min(0)
  @Max(80)
  weeklyHours!: number;
}

export class BulkSaveSubjectAllocationsDto {
  @IsUUID()
  termId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BulkSaveSubjectAllocationItemDto)
  items!: BulkSaveSubjectAllocationItemDto[];
}
