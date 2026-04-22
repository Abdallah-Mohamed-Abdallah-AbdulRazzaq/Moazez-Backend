import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, IsString } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'The refresh token issued by /auth/login' })
  @IsString()
  @IsJWT()
  refreshToken!: string;
}
