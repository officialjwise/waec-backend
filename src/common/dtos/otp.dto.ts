export class InitiateOtpDto {
    phone: string;
  }
  
  export class VerifyOtpDto {
    phone: string;
    otp: string;
  }