import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OtpController } from './otp.controller';
import { OtpService } from './otp.service';
import { SupabaseService } from '../../common/services/supabase.service';

@Module({
  imports: [ConfigModule],
  controllers: [OtpController],
  providers: [OtpService, SupabaseService],
})
export class OtpModule {}