import { IsOptional, IsUUID } from 'class-validator';

export class ListTermsQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  yearId?: string;
}
