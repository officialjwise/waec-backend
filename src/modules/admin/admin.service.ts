import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/services/supabase.service';
import { PaymentsService } from '../payments/payments.service';
import { Checker } from '../../common/interfaces/checker.interface';
import { parse } from 'csv-parse';
import { Readable } from 'stream';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly LOW_STOCK_THRESHOLD = 10;

  constructor(
    private supabaseService: SupabaseService,
    private paymentsService: PaymentsService,
  ) {}

  async listOrders(filters: { status?: string; phone?: string; email?: string; waecType?: string; unassigned?: boolean; startDate?: string; endDate?: string }) {
    try {
      this.logger.debug(`Listing orders with filters: ${JSON.stringify(filters)}`);
      let query = this.supabaseService.getClient().from('orders').select('id, phone, email, waec_type, quantity, status, created_at, paystack_ref, checkers');

      if (filters.unassigned || filters.status === 'unassigned') {
        query = query.eq('status', 'paid').is('checkers', null);
      } else if (filters.status) query = query.eq('status', filters.status);
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
        .select('id, serial, pin, order_id, waec_type, created_at')
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

  async listCheckers(filters: { waecType?: string; assigned?: boolean; }) {
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
        if (!['BECE', 'WASSCE', 'NOVDEC', 'CSSPS', 'CTVET'].includes(waec_type)) {
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

  async listResultCheckOrders(filters: { status?: string; phone?: string; email?: string; result_type?: string; unassigned?: boolean; startDate?: string; endDate?: string }) {
    try {
      this.logger.debug(`Listing result check orders with filters: ${JSON.stringify(filters)}`);
      let query = this.supabaseService.getClient().from('result_check_orders').select('*');

      if (filters.unassigned || filters.status === 'unassigned') {
        query = query.eq('status', 'paid').is('assigned_checker_id', null);
      } else if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.phone) query = query.eq('phone', filters.phone.replace(/[+-\s]/g, ''));
      if (filters.email) query = query.eq('email', filters.email);
      if (filters.result_type) query = query.eq('result_type', filters.result_type);
      if (filters.startDate) query = query.gte('created_at', filters.startDate);
      if (filters.endDate) query = query.lte('created_at', filters.endDate);

      const { data, error } = await query;

      if (error) {
        this.logger.error(`Error listing result check orders: ${error.message}`);
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return {
        statusCode: HttpStatus.OK,
        message: 'Result check orders retrieved successfully',
        count: data.length,
        data: data,
      };
    } catch (error) {
      this.logger.error(`List result check orders error: ${error.message}`);
      throw new HttpException('Failed to list result check orders', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getResultCheckOrderDetails(id: string) {
    try {
      this.logger.debug(`Fetching result check order details for ID: ${id}`);
      const { data, error } = await this.supabaseService
        .getClient()
        .from('result_check_orders')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        throw new HttpException('Result check order not found', HttpStatus.NOT_FOUND);
      }

      return {
        statusCode: HttpStatus.OK,
        message: 'Result check order details retrieved successfully',
        data: data,
      };
    } catch (error) {
      this.logger.error(`Get result check order details error: ${error.message}`);
      throw error instanceof HttpException ? error : new HttpException('Failed to get result check order details', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async assignCheckerToResultCheckOrder(id: string, dto?: { checker_id?: string; serial?: string; pin?: string; force?: boolean }) {
    try {
      this.logger.debug(`Assigning checker for result check order ID: ${id}, DTO: ${JSON.stringify(dto)}`);
      const { data: order, error: orderError } = await this.supabaseService
        .getClient()
        .from('result_check_orders')
        .select('*')
        .eq('id', id)
        .single();

      if (orderError || !order) {
        throw new HttpException('Result check order not found', HttpStatus.NOT_FOUND);
      }

      // Verify payment with Paystack if order is not already marked as paid
      if (order.status !== 'paid' && !dto?.force) {
        if (!order.paystack_ref) {
          throw new HttpException('Cannot assign checker: No payment reference found for this order', HttpStatus.BAD_REQUEST);
        }

        this.logger.debug(`Confirming payment with Paystack for reference: ${order.paystack_ref}`);
        try {
          const verification = await this.paymentsService.verifyPayment(order.paystack_ref);
          if (verification?.status === 'success') {
            const amountPaid = verification.amount / 100;
            if (amountPaid !== Number(order.total_amount)) {
              throw new HttpException(`Cannot assign checker: Payment amount mismatch. Expected ₵${order.total_amount}, paid ₵${amountPaid}`, HttpStatus.BAD_REQUEST);
            }
          } else if (verification?.status === 'abandoned' || verification?.status === 'failed') {
            throw new HttpException(`Cannot assign checker: Payment has not been received/confirmed by Paystack (Paystack status: ${verification.status})`, HttpStatus.BAD_REQUEST);
          }
        } catch (paystackErr: any) {
          if (paystackErr instanceof HttpException) {
            throw paystackErr;
          }
          const errMsg = paystackErr.response?.data?.message || paystackErr.message || '';
          if (errMsg.toLowerCase().includes('transaction reference not found') || errMsg.toLowerCase().includes('not found')) {
            this.logger.warn(`Paystack reference ${order.paystack_ref} not found on Paystack API. Proceeding with manual admin assignment for order ${order.id}.`);
          } else {
            throw new HttpException(`Cannot assign checker: ${errMsg || 'Payment not confirmed by Paystack'}`, HttpStatus.BAD_REQUEST);
          }
        }
      }

      const waecTypeMap: Record<string, string> = {
        'BECE': 'BECE',
        'WASSCE': 'WASSCE',
        'WASSCE-NOVDEC': 'NOVDEC',
      };
      const waecType = waecTypeMap[order.result_type] || order.result_type;

      let checker: Checker;

      if (dto?.checker_id) {
        const { data: foundChecker, error: findError } = await this.supabaseService
          .getClient()
          .from('checkers')
          .select('id, serial, pin, waec_type')
          .eq('id', dto.checker_id)
          .single();

        if (findError || !foundChecker) {
          throw new HttpException('Specified checker not found in inventory', HttpStatus.BAD_REQUEST);
        }
        checker = foundChecker;
      } else if (dto?.serial && dto?.pin) {
        checker = {
          serial: dto.serial,
          pin: dto.pin,
          waec_type: waecType as any,
        };
        const { data: insertedChecker, error: insertError } = await this.supabaseService
          .getClient()
          .from('checkers')
          .insert([{ serial: dto.serial, pin: dto.pin, waec_type: waecType, order_id: order.id }])
          .select()
          .single();

        if (!insertError && insertedChecker) {
          checker.id = insertedChecker.id;
        }
      } else {
        const { data: checkers, error: stockError } = await this.supabaseService
          .getClient()
          .from('checkers')
          .select('id, serial, pin, waec_type')
          .eq('waec_type', waecType)
          .is('order_id', null)
          .limit(1);

        if (stockError || !checkers || checkers.length === 0) {
          throw new HttpException(`No unassigned checkers available in inventory for ${waecType}`, HttpStatus.BAD_REQUEST);
        }
        checker = checkers[0];
      }

      if (checker.id) {
        await this.supabaseService
          .getClient()
          .from('checkers')
          .update({ order_id: order.id })
          .eq('id', checker.id);
      }

      const { data: updatedOrder, error: updateOrderError } = await this.supabaseService
        .getClient()
        .from('result_check_orders')
        .update({
          status: 'paid',
          assigned_checker_id: checker.id || null,
          checker_serial: checker.serial,
          checker_pin: checker.pin,
        })
        .eq('id', order.id)
        .select()
        .single();

      if (updateOrderError) {
        throw new HttpException('Failed to update result check order with checker', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // Send SMS to customer
      try {
        await this.paymentsService.sendCheckersViaSms(order.phone, [checker]);
      } catch (smsError) {
        this.logger.error(`Failed to send SMS to ${order.phone}: ${smsError.message}`);
      }

      if (order.email) {
        try {
          await this.paymentsService.sendCheckersViaEmail(order.email, [checker]);
        } catch (emailError) {
          this.logger.error(`Failed to send email to ${order.email}: ${emailError.message}`);
        }
      }

      return {
        statusCode: HttpStatus.OK,
        message: 'Checker assigned successfully and SMS dispatched',
        data: {
          order: updatedOrder,
          checker: {
            serial: checker.serial,
            pin: checker.pin,
            waec_type: checker.waec_type,
          },
        },
      };
    } catch (error) {
      this.logger.error(`Assign checker to result check order error: ${error.message}`);
      throw error instanceof HttpException ? error : new HttpException('Failed to assign checker', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async assignCheckersToOrder(id: string, dto?: { force?: boolean }) {
    try {
      this.logger.debug(`Assigning checkers for main order ID: ${id}`);
      const { data: order, error: orderError } = await this.supabaseService
        .getClient()
        .from('orders')
        .select('*')
        .eq('id', id)
        .single();

      if (orderError || !order) {
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }

      // Verify payment with Paystack if order is not marked as paid
      if (order.status !== 'paid' && !dto?.force) {
        if (!order.paystack_ref) {
          throw new HttpException('Cannot assign checkers: No payment reference found for this order', HttpStatus.BAD_REQUEST);
        }

        this.logger.debug(`Confirming payment with Paystack for reference: ${order.paystack_ref}`);
        try {
          const verification = await this.paymentsService.verifyPayment(order.paystack_ref);
          if (verification?.status === 'success') {
            const amountPaid = verification.amount / 100;
            if (amountPaid !== Number(order.total_amount)) {
              throw new HttpException(`Cannot assign checkers: Payment amount mismatch. Expected ₵${order.total_amount}, paid ₵${amountPaid}`, HttpStatus.BAD_REQUEST);
            }
          } else if (verification?.status === 'abandoned' || verification?.status === 'failed') {
            throw new HttpException(`Cannot assign checkers: Payment has not been received/confirmed by Paystack (Paystack status: ${verification.status})`, HttpStatus.BAD_REQUEST);
          }
        } catch (paystackErr: any) {
          if (paystackErr instanceof HttpException) {
            throw paystackErr;
          }
          const errMsg = paystackErr.response?.data?.message || paystackErr.message || '';
          if (errMsg.toLowerCase().includes('transaction reference not found') || errMsg.toLowerCase().includes('not found')) {
            this.logger.warn(`Paystack reference ${order.paystack_ref} not found on Paystack API. Proceeding with manual admin assignment for order ${order.id}.`);
          } else {
            throw new HttpException(`Cannot assign checkers: ${errMsg || 'Payment not confirmed by Paystack'}`, HttpStatus.BAD_REQUEST);
          }
        }
      }

      const existingCheckers: Checker[] = Array.isArray(order.checkers) ? order.checkers : [];
      const neededCount = order.quantity - existingCheckers.length;

      if (neededCount <= 0) {
        return {
          statusCode: HttpStatus.OK,
          message: 'All checkers are already assigned to this order',
          data: order,
        };
      }

      // Fetch available checkers from inventory
      const { data: checkers, error: stockError } = await this.supabaseService
        .getClient()
        .from('checkers')
        .select('id, serial, pin, waec_type, created_at')
        .eq('waec_type', order.waec_type)
        .is('order_id', null)
        .limit(neededCount);

      if (stockError) {
        throw new HttpException(`Stock error: ${stockError.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      if (!checkers || checkers.length === 0) {
        throw new HttpException(`No unassigned checkers available in inventory for ${order.waec_type}`, HttpStatus.BAD_REQUEST);
      }

      if (checkers.length < neededCount) {
        throw new HttpException(`Insufficient checkers available in inventory for ${order.waec_type}. Needed: ${neededCount}, Available: ${checkers.length}`, HttpStatus.BAD_REQUEST);
      }

      const checkerIds = checkers.map((c: Checker) => c.id);
      const { error: assignError } = await this.supabaseService
        .getClient()
        .from('checkers')
        .update({ order_id: order.id })
        .in('id', checkerIds);

      if (assignError) {
        throw new HttpException(`Failed to assign checkers: ${assignError.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // Dispatch SMS & Email for newly assigned checkers
      try {
        await this.paymentsService.sendCheckersViaSms(order.phone, checkers);
      } catch (smsError) {
        this.logger.error(`Failed to send SMS to ${order.phone}: ${smsError.message}`);
      }

      if (order.email) {
        try {
          await this.paymentsService.sendCheckersViaEmail(order.email, checkers);
        } catch (emailError) {
          this.logger.error(`Failed to send email to ${order.email}: ${emailError.message}`);
        }
      }

      const newCheckersToStore = checkers.map((c: Checker) => ({
        id: c.id,
        serial: c.serial,
        pin: c.pin,
        waec_type: c.waec_type,
      }));

      const allCheckersToStore = [...existingCheckers, ...newCheckersToStore];

      const { data: updatedOrder, error: updateOrderError } = await this.supabaseService
        .getClient()
        .from('orders')
        .update({
          status: 'paid',
          checkers: allCheckersToStore,
        })
        .eq('id', order.id)
        .select()
        .single();

      if (updateOrderError) {
        throw new HttpException('Failed to update order with assigned checkers', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return {
        statusCode: HttpStatus.OK,
        message: 'Checkers assigned successfully and SMS dispatched',
        data: updatedOrder,
      };
    } catch (error) {
      this.logger.error(`Assign checkers to order error: ${error.message}`);
      throw error instanceof HttpException ? error : new HttpException('Failed to assign checkers', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async listReleaseYears(filters: { result_type?: string }) {
    try {
      this.logger.debug(`Listing release years with filters: ${JSON.stringify(filters)}`);
      let query = this.supabaseService.getClient().from('result_release_years').select('*').order('year', { ascending: false });

      if (filters.result_type) query = query.eq('result_type', filters.result_type);

      const { data, error } = await query;

      if (error) {
        this.logger.error(`Error listing release years: ${error.message}`);
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return {
        statusCode: HttpStatus.OK,
        message: 'Release years retrieved successfully',
        count: data.length,
        data: data,
      };
    } catch (error) {
      this.logger.error(`List release years error: ${error.message}`);
      throw new HttpException('Failed to list release years', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async upsertReleaseYear(data: { result_type: string; year: number; is_released: boolean }) {
    try {
      this.logger.debug(`Upserting release year: ${JSON.stringify(data)}`);
      
      const { data: existing, error: existingError } = await this.supabaseService
        .getClient()
        .from('result_release_years')
        .select('*')
        .eq('result_type', data.result_type)
        .eq('year', data.year)
        .single();

      if (existing) {
        const updateData: any = { is_released: data.is_released };
        if (data.is_released) {
          updateData.released_at = new Date().toISOString();
        }

        const { data: updated, error } = await this.supabaseService
          .getClient()
          .from('result_release_years')
          .update(updateData)
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);

        return {
          statusCode: HttpStatus.CREATED,
          message: 'Release year updated successfully',
          data: updated,
        };
      } else {
        const insertData: any = {
          result_type: data.result_type,
          year: data.year,
          is_released: data.is_released,
        };
        if (data.is_released) {
          insertData.released_at = new Date().toISOString();
        }

        const { data: inserted, error } = await this.supabaseService
          .getClient()
          .from('result_release_years')
          .insert([insertData])
          .select()
          .single();

        if (error) throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);

        return {
          statusCode: HttpStatus.CREATED,
          message: 'Release year created successfully',
          data: inserted,
        };
      }
    } catch (error) {
      this.logger.error(`Upsert release year error: ${error.message}`);
      throw new HttpException('Failed to upsert release year', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async toggleReleaseYear(id: string) {
    try {
      this.logger.debug(`Toggling release year for ID: ${id}`);
      const { data: existing, error: existingError } = await this.supabaseService
        .getClient()
        .from('result_release_years')
        .select('*')
        .eq('id', id)
        .single();

      if (existingError || !existing) {
        throw new HttpException('Release year not found', HttpStatus.NOT_FOUND);
      }

      const newIsReleased = !existing.is_released;
      const updateData: any = { is_released: newIsReleased };
      if (newIsReleased) {
        updateData.released_at = new Date().toISOString();
      }

      const { data: updated, error } = await this.supabaseService
        .getClient()
        .from('result_release_years')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);

      return {
        statusCode: HttpStatus.OK,
        message: 'Release year toggled successfully',
        data: updated,
      };
    } catch (error) {
      this.logger.error(`Toggle release year error: ${error.message}`);
      throw error instanceof HttpException ? error : new HttpException('Failed to toggle release year', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}