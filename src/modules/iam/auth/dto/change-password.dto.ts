import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  currentPassword!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  newPassword!: string;
}

export class ChangePasswordResponseDto {
  @ApiProperty()
  success!: true;

  @ApiProperty()
  mustChangePassword!: false;
}
