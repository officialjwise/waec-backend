import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ResultCheckController } from './result-check.controller';
import { ResultCheckService } from './result-check.service';
import { SupabaseService } from '../../common/services/supabase.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [ConfigModule, PaymentsModule],
  controllers: [ResultCheckController],
  providers: [ResultCheckService, SupabaseService],
  exports: [ResultCheckService],
})
export class ResultCheckModule {}
