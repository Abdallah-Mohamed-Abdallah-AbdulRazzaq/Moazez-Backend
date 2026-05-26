import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateHomeworkAttachmentDto {
  @IsUUID()
  fileId!: string;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MaxLength(180)
  title?: string | null;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number | null;
}

export class UpdateHomeworkAttachmentDto {
  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MaxLength(180)
  title?: string | null;

  @IsOptional()
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}

export class ReorderHomeworkAttachmentDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}
