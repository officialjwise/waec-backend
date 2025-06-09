import { IsString, Matches, IsNotEmpty } from 'class-validator';

export class InitiateOtpDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?\d+$/, { message: 'Phone must be a valid phone number' })
  phone: string;
}

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?\d+$/, { message: 'Phone must be a valid phone number' })
  phone: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/, { message: 'OTP must be numeric' })
  otp: string;

  @IsString()
  @IsNotEmpty()
  requestId: string;

  @IsString()
  @IsNotEmpty()
  prefix: string;
}