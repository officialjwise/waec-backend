import { Module } from '@nestjs/common';
import { CheckersService } from './checkers.service';
import { CheckersController } from './checkers.controller';
import { SupabaseService } from '../../common/services/supabase.service';

@Module({
  providers: [CheckersService, SupabaseService],
  controllers: [CheckersController],
})
export class CheckersModule {}