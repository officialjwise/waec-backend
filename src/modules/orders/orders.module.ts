import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { SupabaseService } from '../../common/services/supabase.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [ConfigModule, PaymentsModule],
  controllers: [OrdersController],
  providers: [OrdersService, SupabaseService],
})
export class OrdersModule {}