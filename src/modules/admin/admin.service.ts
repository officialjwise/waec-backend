import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/services/supabase.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private supabaseService: SupabaseService) {}

  async listOrders(filters: { status?: string; phone?: string; startDate?: string; endDate?: string }) {
    try {
      this.logger.debug(`Listing orders with filters: ${JSON.stringify(filters)}`);
      let query = this.supabaseService.getClient().from('orders').select('id, phone, email, waec_type, quantity, status, created_at, paystack_ref');

      if (filters.status) query = query.eq('status', filters.status);
      if (filters.phone) query = query.eq('phone', filters.phone.replace(/[+-\s]/g, ''));
      if (filters.startDate) query = query.gte('created_at', filters.startDate);
      if (filters.endDate) query = query.lte('created_at', filters.endDate);

      const { data, error } = await query;

      if (error) {
        this.logger.error(`Error listing orders: ${error.message}`);
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return { orders: data, count: data.length };
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
        this.logger.warn(`Order not found: ${id}`);
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }

      const { data: checkers, error: checkerError } = await this.supabaseService
        .getClient()
        .from('checkers')
        .select('id, serial, pin, waec_type, created_at')
        .eq('order_id', id);

      if (checkerError) {
        this.logger.error(`Error fetching checkers: ${checkerError.message}`);
        throw new HttpException(checkerError.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return { order, checkers };
    } catch (error) {
      this.logger.error(`Get order details error: ${error.message}`);
      throw error instanceof HttpException ? error : new HttpException('Failed to get order details', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async listCheckers(filters: { waecType?: string; assigned?: boolean }) {
    try {
      this.logger.debug(`Listing checkers with filters: ${JSON.stringify(filters)}`);
      let query = this.supabaseService.getClient().from('checkers').select('id, serial, pin, waec_type, order_id, created_at');

      if (filters.waecType) query = query.eq('waec_type', filters.waecType);
      if (filters.assigned !== undefined) query = filters.assigned ? query.is('order_id', null) : query.not('order_id', 'is', null);

      const { data, error } = await query;

      if (error) {
        this.logger.error(`Error listing checkers: ${error.message}`);
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return { checkers: data, count: data.length };
    } catch (error) {
      this.logger.error(`List checkers error: ${error.message}`);
      throw new HttpException('Failed to list checkers', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async addCheckers(serials: string[], pins: string[], waec_type: string) {
    try {
      this.logger.debug(`Adding ${serials.length} checkers for type: ${waec_type}`);
      if (serials.length !== pins.length) {
        throw new HttpException('Serials and pins arrays must have the same length', HttpStatus.BAD_REQUEST);
      }

      const checkers = serials.map((serial, index) => ({
        serial,
        pin: pins[index],
        waec_type,
        created_at: new Date().toISOString(),
      }));

      const { data, error } = await this.supabaseService.getClient().from('checkers').insert(checkers).select('id, serial, waec_type');

      if (error) {
        this.logger.error(`Error adding checkers: ${error.message}`);
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return { message: 'Checkers added successfully', checkers: data };
    } catch (error) {
      this.logger.error(`Add checkers error: ${error.message}`);
      throw error instanceof HttpException ? error : new HttpException('Failed to add checkers', HttpStatus.INTERNAL_SERVER_ERROR);
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

      return { otp_requests: data, count: data.length };
    } catch (error) {
      this.logger.error(`List OTP requests error: ${error.message}`);
      throw new HttpException('Failed to list OTP requests', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}