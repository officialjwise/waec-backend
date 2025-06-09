import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SupabaseService } from '../../common/services/supabase.service';

@Module({
  imports: [SupabaseService],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}