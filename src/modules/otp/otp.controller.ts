import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { OtpService } from './otp.service';
import { InitiateOtpDto, VerifyOtpDto } from '../../common/dtos/otp.dto';

@Controller('api/retrieve')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('initiate')
  async initiateOtp(@Body() body: InitiateOtpDto) {
    return this.otpService.initiateOtp(body.phone);
  }

  @Post('verify')
  async verifyOtp(@Body() body: VerifyOtpDto) {
    return this.otpService.verifyOtp(body.phone, body.otp);
  }
}