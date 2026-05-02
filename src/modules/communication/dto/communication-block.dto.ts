import { IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCommunicationUserBlockDto {
  @IsUUID()
  targetUserId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
