import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { CheckersModule } from './modules/checkers/checkers.module';
import { OrdersModule } from './modules/orders/orders.module';
import { OtpModule } from './modules/otp/otp.module';
import { PaymentsModule } from './modules/payments/payments.module';
import supabaseConfig from './config/supabase.config';
import paystackConfig from './config/paystack.config';
import hubtelConfig from './config/hubtel.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [supabaseConfig, paystackConfig, hubtelConfig],
    }),
    AuthModule,
    CheckersModule,
    OrdersModule,
    OtpModule,
    PaymentsModule,
    
  ],
})
export class AppModule {}