import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderCleanupService } from './order-cleanup.service';
import { SupabaseService } from '../../common/services/supabase.service';
import { PaymentsModule } from '../payments/payments.module';

import { ResultCheckModule } from '../result-check/result-check.module';

@Module({
  imports: [ConfigModule, PaymentsModule, ResultCheckModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderCleanupService, SupabaseService],
})
export class OrdersModule {}