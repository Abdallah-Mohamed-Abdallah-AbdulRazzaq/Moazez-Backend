import { IsOptional, IsUUID } from 'class-validator';

export class AcademicsOverviewQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;
}
