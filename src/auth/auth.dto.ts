import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

/** Значения совпадают с Prisma enum Role — нужен объект enum для Swagger UI */
export enum RegisterRole {
  ALEXITHYMIC = 'ALEXITHYMIC',
  THERAPIST = 'THERAPIST',
  ADMIN = 'ADMIN',
}

export class RegisterDto {
  @ApiPropertyOptional({ type: String, format: 'email', example: 'user@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ type: String, example: '+79991234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ type: String, minLength: 8, example: 'SecurePass1!' })
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: RegisterRole, example: RegisterRole.ALEXITHYMIC })
  @IsEnum(RegisterRole)
  role!: RegisterRole;

  @ApiPropertyOptional({ type: String, example: 'Dr. Smith' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiProperty({ type: String, example: '123456' })
  @IsString()
  verificationCode!: string;
}

export class LoginDto {
  @ApiPropertyOptional({ type: String, format: 'email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ type: String, example: '+79991234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ type: String, format: 'password' })
  @IsString()
  password!: string;
}

export class RefreshDto {
  @ApiProperty({ type: String })
  @IsString()
  refreshToken!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ type: String, format: 'password' })
  @IsString()
  currentPassword!: string;

  @ApiProperty({ type: String, minLength: 8, format: 'password' })
  @MinLength(8)
  newPassword!: string;
}

export class RequestVerificationDto {
  @ApiPropertyOptional({ type: String, format: 'email', example: 'user@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ type: String, example: '+79991234567' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class VerifyCodeDto extends RequestVerificationDto {
  @ApiProperty({ type: String, example: '123456' })
  @IsString()
  code!: string;
}
