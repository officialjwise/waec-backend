import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SupabaseService } from '../../common/services/supabase.service';

import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [AdminController],
  providers: [AdminService, SupabaseService],
})
export class AdminModule {}