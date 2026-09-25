import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAcademicContentFilePolicyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  attachmentsEnabled?: boolean;

  @ApiPropertyOptional({
    type: String,
    description: 'Positive decimal bytes, at most 10 GiB',
  })
  @IsOptional()
  @IsString()
  @MaxLength(11)
  @Matches(/^[1-9][0-9]*$/u)
  maximumFileSizeBytes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  documentsEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  imagesEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  videosEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  audioEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  archivesEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  otherFilesEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowStudentDownload?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowGuardianDownload?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowInlinePreview?: boolean;
}
