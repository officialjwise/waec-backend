import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { CheckersModule } from './modules/checkers/checkers.module';
import { OrdersModule } from './modules/orders/orders.module';
import { OtpModule } from './modules/otp/otp.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { AdminModule } from './modules/admin/admin.module';
import { CommonModule } from './common/common.module';
import { LogMiddleware } from './middleware/log.middleware';
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
    CommonModule,
    AuthModule,
    CheckersModule,
    OrdersModule,
    OtpModule,
    PaymentsModule,
    AdminModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((req, res, next) => {
        console.log(
          `Pre-LogMiddleware: baseUrl=${req.baseUrl}, path=${req.path}, originalUrl=${req.originalUrl}`,
        );
        next();
      }, LogMiddleware)
      .forRoutes('*');
  }
}
