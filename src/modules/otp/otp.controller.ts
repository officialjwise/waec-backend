import { Controller, Post, Body, HttpException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { OtpService } from './otp.service';
import { InitiateOtpDto, VerifyOtpDto } from '../../common/dtos/otp.dto';

@Controller('api/retrieve')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('initiate')
  async initiateOtp(@Body(ValidationPipe) body: InitiateOtpDto) {
    return this.otpService.initiateOtp(body.phone);
  }

  @Post('verify')
  async verifyOtp(@Body(ValidationPipe) body: VerifyOtpDto) {
    return this.otpService.verifyOtp(body.requestId, body.otp);
  }
}