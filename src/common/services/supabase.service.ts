import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly supabase: SupabaseClient;
  private readonly logger = new Logger(SupabaseService.name);

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get('supabase.url') || '';
    const supabaseKey = this.configService.get('supabase.serviceRoleKey') || '';
    if (!supabaseUrl || !supabaseKey) {
      this.logger.error('Supabase URL or Service Role Key not configured');
      throw new Error('Supabase URL or Service Role Key not configured');
    }
    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    this.testConnection();
  }

  async testConnection() {
    try {
      const { data, error } = await this.supabase.from('admins').select('id').limit(1);
      if (error) {
        this.logger.error(`Supabase connection test failed: ${JSON.stringify(error, null, 2)}`);
      } else {
        this.logger.debug(`Supabase connection test successful: ${JSON.stringify(data)}`);
      }
    } catch (err) {
      this.logger.error(`Supabase connection test error: ${err.message}`);
    }
  }

  getClient() {
    return this.supabase;
  }
}