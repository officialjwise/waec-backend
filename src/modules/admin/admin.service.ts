import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/services/supabase.service';
import { parse } from 'csv-parse';
import { Readable } from 'stream';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly LOW_STOCK_THRESHOLD = 10;

  constructor(private supabaseService: SupabaseService) {}

  async listOrders(filters: { status?: string; phone?: string; email?: string; waecType?: string; startDate?: string; endDate?: string }) {
    try {
      this.logger.debug(`Listing orders with filters: ${JSON.stringify(filters)}`);
      let query = this.supabaseService.getClient().from('orders').select('id, phone, email, waec_type, quantity, status, created_at, paystack_ref');

      if (filters.status) query = query.eq('status', filters.status);
      if (filters.phone) query = query.eq('phone', filters.phone.replace(/[+-\s]/g, ''));
      if (filters.email) query = query.eq('email', filters.email);
      if (filters.waecType) query = query.eq('waec_type', filters.waecType);
      if (filters.startDate) query = query.gte('created_at', filters.startDate);
      if (filters.endDate) query = query.lte('created_at', filters.endDate);

      const { data, error } = await query;

      if (error) {
        this.logger.error(`Error listing orders: ${error.message}`);
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return {
        statusCode: HttpStatus.OK,
        message: 'Orders retrieved successfully',
        count: data.length,
        data: data,
      };
    } catch (error) {
      this.logger.error(`List orders error: ${error.message}`);
      throw new HttpException('Failed to list orders', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getOrderDetails(id: string) {
    try {
      this.logger.debug(`Fetching order details for ID: ${id}`);
      const { data: order, error: orderError } = await this.supabaseService
        .getClient()
        .from('orders')
        .select('id, phone, email, waec_type, quantity, status, created_at, paystack_ref')
        .eq('id', id)
        .single();

      if (orderError || !order) {
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }

      const { data: checkers, error: checkerError } = await this.supabaseService
        .getClient()
        .from('checkers')
        .select('id, serial, order_id, waec_type, created_at')
        .eq('order_id', id);

      if (checkerError) {
        this.logger.error(`Error fetching checkers: ${checkerError.message}`);
        throw new HttpException(checkerError.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return {
        statusCode: HttpStatus.OK,
        message: 'Order details retrieved successfully',
        count: 1,
        data: [{ order, checkers }],
      };
    } catch (error) {
      this.logger.error(`Get order details error: ${error.message}`);
      throw error instanceof HttpException ? error : new HttpException('Failed to get order details', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async listCheckers(filters: { waecType?: string; assigned?: boolean }) {
    try {
      this.logger.debug(`Listing checkers with filters: ${JSON.stringify(filters)}`);
      let query = this.supabaseService.getClient().from('checkers').select('id, serial, order_id, waec_type, created_at');

      if (filters.waecType) query = query.eq('waec_type', filters.waecType);
      if (filters.assigned !== undefined) {
        query = filters.assigned ? query.not('order_id', 'is', null) : query.is('order_id', null);
      }

      const { data, error } = await query;

      if (error) {
        this.logger.error(`Error listing checkers: ${error.message}`);
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return {
        statusCode: HttpStatus.OK,
        message: 'Checkers retrieved successfully',
        count: data.length,
        data: data,
      };
    } catch (error) {
      this.logger.error(`List checkers error: ${error.message}`);
      throw new HttpException('Failed to list checkers', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async addCheckersFromCsv(file: Express.Multer.File) {
    try {
      this.logger.debug(`Processing CSV file: ${file.originalname}`);
      if (!file.mimetype.includes('csv')) {
        throw new HttpException('Only CSV files are supported', HttpStatus.BAD_REQUEST);
      }

      const checkers: Array<{ serial: string; pin: string; waec_type: string; created_at: string }> = [];
      const parser = parse({ columns: true, skip_empty_lines: true });

      const stream = Readable.from(file.buffer);
      for await (const record of stream.pipe(parser)) {
        const { serial, pin, waec_type } = record;
        if (!serial || !pin || !waec_type) {
          throw new HttpException('Invalid CSV format: Missing required fields', HttpStatus.BAD_REQUEST);
        }
        if (!['BECE', 'WASSCE', 'NOVDEC'].includes(waec_type)) {
          throw new HttpException(`Invalid waec_type: ${waec_type}`, HttpStatus.BAD_REQUEST);
        }
        checkers.push({ serial, pin, waec_type, created_at: new Date().toISOString() });
      }

      if (checkers.length === 0) {
        throw new HttpException('No valid checkers found in CSV', HttpStatus.BAD_REQUEST);
      }

      const { data, error } = await this.supabaseService.getClient().from('checkers').insert(checkers).select('id, serial, waec_type');

      if (error) {
        this.logger.error(`Error adding checkers: ${error.message}`);
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return {
        statusCode: HttpStatus.CREATED,
        message: 'Checkers added successfully from CSV',
        count: data.length,
        data: data,
      };
    } catch (error) {
      this.logger.error(`Add checkers error: ${error.message}`);
      throw error instanceof HttpException ? error : new HttpException('Failed to add checkers', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async previewCheckersCsv(file: Express.Multer.File) {
    try {
      this.logger.debug(`Previewing CSV file: ${file.originalname}`);
      if (!file.mimetype.includes('csv')) {
        throw new HttpException('Only CSV files are supported', HttpStatus.BAD_REQUEST);
      }

      const records: Array<{ serial: string; pin: string; waec_type: string }> = [];
      const parser = parse({ columns: true, skip_empty_lines: true });

      const stream = Readable.from(file.buffer);
      for await (const record of stream.pipe(parser)) {
        const { serial, pin, waec_type } = record;
        if (!serial || !pin || !waec_type) {
          throw new HttpException('Invalid CSV format: Missing required fields', HttpStatus.BAD_REQUEST);
        }
        if (!['BECE', 'WASSCE', 'NOVDEC'].includes(waec_type)) {
          throw new HttpException(`Invalid waec_type: ${waec_type}`, HttpStatus.BAD_REQUEST);
        }
        records.push({ serial, pin, waec_type });
      }

      if (records.length === 0) {
        throw new HttpException('No valid records found in CSV', HttpStatus.BAD_REQUEST);
      }

      return {
        statusCode: HttpStatus.OK,
        message: 'CSV preview generated successfully',
        count: records.length,
        data: records,
      };
    } catch (error) {
      this.logger.error(`Preview CSV error: ${error.message}`);
      throw error instanceof HttpException ? error : new HttpException('Failed to preview CSV', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getInventory() {
    try {
      this.logger.debug('Fetching inventory summary');
      const { data: checkers, error: checkerError } = await this.supabaseService
        .getClient()
        .from('checkers')
        .select('waec_type, order_id');

      if (checkerError) {
        this.logger.error(`Error fetching checkers: ${checkerError.message}`);
        throw new HttpException(checkerError.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      type WaecSummary = { total: number; available: number };
      const summary: Record<string, WaecSummary> = {};
      const lowStock: string[] = [];

      checkers.forEach(({ waec_type, order_id }) => {
        if (!summary[waec_type]) {
          summary[waec_type] = { total: 0, available: 0 };
        }
        summary[waec_type].total += 1;
        if (!order_id) summary[waec_type].available += 1;
        if (summary[waec_type].available < this.LOW_STOCK_THRESHOLD && !lowStock.includes(waec_type)) {
          lowStock.push(waec_type);
        }
      });

      const byWaecType = Object.entries(summary).map(([waec_type, { total, available }]) => ({
        waec_type,
        total,
        available,
      }));

      return {
        statusCode: HttpStatus.OK,
        message: 'Inventory summary retrieved successfully',
        count: byWaecType.length,
        data: { byWaecType, lowStock },
      };
    } catch (error) {
      this.logger.error(`Get inventory error: ${error.message}`);
      throw new HttpException('Failed to get inventory', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async listLogs(filters: { action?: string; adminId?: string }) {
    try {
      this.logger.debug(`Listing logs with filters: ${JSON.stringify(filters)}`);
      
      // First, let's see what's in the logs table
      const { data: allLogs, error: allLogsError } = await this.supabaseService
        .getClient()
        .from('logs')
        .select('id, action, admin_id, details, created_at')
        .order('created_at', { ascending: false });
      
      console.log('🔍 All logs in database:', allLogs);
      
      let query = this.supabaseService.getClient().from('logs').select('id, action, admin_id, details, created_at');
  
      if (filters.action) {
        console.log('🔍 Filtering by action:', filters.action);
        query = query.ilike('action', `%${filters.action}%`);
      }
      if (filters.adminId) {
        console.log('🔍 Filtering by admin_id:', filters.adminId);
        query = query.eq('admin_id', filters.adminId);
      }
  
      const { data, error } = await query.order('created_at', { ascending: false });
  
      if (error) {
        this.logger.error(`Error listing logs: ${error.message}`);
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
  
      console.log('🔍 Filtered results:', data);
  
      return {
        statusCode: HttpStatus.OK,
        message: 'Logs retrieved successfully',
        count: data.length,
        data: data,
      };
    } catch (error) {
      this.logger.error(`List logs error: ${error.message}`);
      throw new HttpException('Failed to list logs', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async listOtpRequests(filters: { phone?: string; verified?: boolean }) {
    try {
      this.logger.debug(`Listing OTP requests with filters: ${JSON.stringify(filters)}`);
      let query = this.supabaseService.getClient().from('otp_requests').select('id, phone_number, otp_code, order_id, expires_at, verified, created_at');

      if (filters.phone) query = query.eq('phone_number', filters.phone.replace(/[+-\s]/g, ''));
      if (filters.verified !== undefined) query = query.eq('verified', filters.verified);

      const { data, error } = await query;

      if (error) {
        this.logger.error(`Error listing OTP requests: ${error.message}`);
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return {
        statusCode: HttpStatus.OK,
        message: 'OTP requests retrieved successfully',
        count: data.length,
        data: data,
      };
    } catch (error) {
      this.logger.error(`List OTP requests error: ${error.message}`);
      throw new HttpException('Failed to list OTP requests', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}