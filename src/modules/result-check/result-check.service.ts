import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../common/services/supabase.service';
import { PaymentsService } from '../payments/payments.service';
import { InitiateResultCheckDto } from '../../common/dtos/result-check.dto';

const { v4: uuidv4 } = require('uuid');

@Injectable()
export class ResultCheckService {
  private readonly logger = new Logger(ResultCheckService.name);

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
    private paymentsService: PaymentsService,
  ) {}

  async getReleasedYears(resultType: string) {
    try {
      this.logger.debug(`Fetching released years for resultType: ${resultType}`);
      const { data, error } = await this.supabaseService
        .getClient()
        .from('result_release_years')
        .select('year')
        .eq('result_type', resultType)
        .eq('is_released', true)
        .order('year', { ascending: false });

      if (error) {
        this.logger.error(`Error fetching released years: ${error.message}`);
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return data ? data.map((row) => row.year) : [];
    } catch (error) {
      this.logger.error(`Get released years error: ${error.message}`);
      throw new HttpException('Failed to fetch released years', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async initiateOrder(dto: InitiateResultCheckDto) {
    try {
      this.logger.debug(`Initiating result check order: ${JSON.stringify(dto)}`);

      if (!dto) {
        throw new HttpException('Request body is missing', HttpStatus.BAD_REQUEST);
      }

      this.logger.debug(`Result check values: type=${dto.result_type}, year=${dto.year} (type: ${typeof dto.year}), index=${dto.index_number}`);

      if (!['BECE', 'WASSCE', 'WASSCE-NOVDEC'].includes(dto.result_type)) {
        throw new HttpException(`Invalid result_type: ${dto.result_type}`, HttpStatus.BAD_REQUEST);
      }

      if (!/^\d{10}$/.test(dto.index_number)) {
        throw new HttpException('index_number must be exactly 10 digits', HttpStatus.BAD_REQUEST);
      }

      const waecTypeMap = {
        'BECE': 'BECE',
        'WASSCE': 'WASSCE',
        'WASSCE-NOVDEC': 'NOVDEC',
      };
      const waecType = waecTypeMap[dto.result_type];

      // Check stock
      const { data: checkers, error: checkStockError } = await this.supabaseService
        .getClient()
        .from('checkers')
        .select('id')
        .eq('waec_type', waecType)
        .is('order_id', null)
        .limit(1);

      if (checkStockError) {
        throw new HttpException(checkStockError.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      if (!checkers || checkers.length === 0) {
        throw new HttpException(`No unassigned checkers available for ${waecType}`, HttpStatus.BAD_REQUEST);
      }

      const total_amount = 25;
      const paystack_ref = `REF-${uuidv4()}`;

      const { data: orderData, error: orderError } = await this.supabaseService
        .getClient()
        .from('result_check_orders')
        .insert([
          {
            result_type: dto.result_type,
            index_number: dto.index_number,
            year: dto.year,
            phone: dto.phone,
            email: dto.email,
            momo_number: dto.momo_number,
            status: 'pending',
            total_amount,
            paystack_ref,
          },
        ])
        .select()
        .single();

      if (orderError) {
        throw new HttpException(orderError.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      try {
        const baseCallbackUrl = this.configService.get('paystack.callbackUrl') || '';
        const resultCheckCallbackUrl = baseCallbackUrl ? baseCallbackUrl.replace(/\/success\/?$/, '/check-results/success') : '';

        const paymentResponse = await this.paymentsService.initiatePayment({
          id: orderData.id,
          email: orderData.email,
          total_amount: orderData.total_amount,
          phone: orderData.phone,
          paystack_ref: orderData.paystack_ref,
          callback_url: resultCheckCallbackUrl || undefined,
        });

        // The order already has the correct paystack_ref, but following the spec "Update the order with the Paystack reference"
        await this.supabaseService
          .getClient()
          .from('result_check_orders')
          .update({ paystack_ref: paymentResponse.reference || orderData.paystack_ref })
          .eq('id', orderData.id);

        return { order_id: orderData.id, payment_url: paymentResponse.authorization_url };
      } catch (paymentError) {
        // Rollback
        await this.supabaseService
          .getClient()
          .from('result_check_orders')
          .delete()
          .eq('id', orderData.id);

        throw paymentError;
      }
    } catch (error) {
      this.logger.error(`Initiate order error: ${error.message}`);
      throw error instanceof HttpException ? error : new HttpException('Failed to initiate order', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async verifyPayment(reference: string) {
    try {
      this.logger.debug(`Verifying payment for result check reference: ${reference}`);
      const verification = await this.paymentsService.verifyPayment(reference);
      const orderId = verification.metadata?.order_id;

      if (!orderId) {
        throw new HttpException('Invalid payment metadata: order_id missing', HttpStatus.BAD_REQUEST);
      }

      const { data: order, error: orderError } = await this.supabaseService
        .getClient()
        .from('result_check_orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderError || !order) {
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }

      if (verification.status === 'success') {
        const amountPaid = verification.amount / 100;
        if (amountPaid !== order.total_amount) {
          throw new HttpException('Payment amount mismatch', HttpStatus.BAD_REQUEST);
        }

        // If order is already paid AND has an assigned checker, return it immediately
        if (order.status === 'paid' && order.assigned_checker_id) {
          return {
            status: 'success',
            message: 'Payment verified',
            order: {
              order_id: order.id,
              result_type: order.result_type,
              index_number: order.index_number,
              year: order.year,
              phone: order.phone,
              email: order.email,
              checker: {
                serial: order.checker_serial,
                pin: order.checker_pin,
                waec_type: order.result_type,
              },
            },
          };
        }

        const waecTypeMap = {
          'BECE': 'BECE',
          'WASSCE': 'WASSCE',
          'WASSCE-NOVDEC': 'NOVDEC',
        };
        const waecType = waecTypeMap[order.result_type];

        // Assign checker
        const { data: checkers, error: checkStockError } = await this.supabaseService
          .getClient()
          .from('checkers')
          .select('id, serial, pin, waec_type, created_at')
          .eq('waec_type', waecType)
          .is('order_id', null)
          .limit(1);

        if (checkStockError || !checkers || checkers.length === 0) {
          // Update order status to paid even if no checker is in stock so payment is recorded
          await this.supabaseService
            .getClient()
            .from('result_check_orders')
            .update({ status: 'paid' })
            .eq('id', order.id);

          this.logger.warn(`Order ${order.id} marked as paid, but no checkers available for ${waecType}`);

          return {
            status: 'success',
            message: 'Payment verified, but checker assignment is pending stock availability',
            order: {
              order_id: order.id,
              result_type: order.result_type,
              index_number: order.index_number,
              year: order.year,
              phone: order.phone,
              email: order.email,
              checker: null,
              pending_checker: true,
            },
          };
        }

        const checker = checkers[0];

        const { error: updateCheckerError } = await this.supabaseService
          .getClient()
          .from('checkers')
          .update({ order_id: order.id })
          .eq('id', checker.id);

        if (updateCheckerError) {
          throw new HttpException('Failed to assign checker', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const { error: updateOrderError } = await this.supabaseService
          .getClient()
          .from('result_check_orders')
          .update({
            status: 'paid',
            assigned_checker_id: checker.id,
            checker_serial: checker.serial,
            checker_pin: checker.pin,
          })
          .eq('id', order.id);

        if (updateOrderError) {
          throw new HttpException('Failed to update order status', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        await this.paymentsService.sendCheckersViaSms(order.phone, [checker], true);

        if (order.email) {
          await this.paymentsService.sendCheckersViaEmail(order.email, [checker]);
        }

        return {
          status: 'success',
          message: 'Payment verified',
          order: {
            order_id: order.id,
            result_type: order.result_type,
            index_number: order.index_number,
            year: order.year,
            phone: order.phone,
            email: order.email,
            checker: {
              serial: checker.serial,
              pin: checker.pin,
              waec_type: checker.waec_type,
            },
          },
        };
      } else {
        await this.supabaseService
          .getClient()
          .from('result_check_orders')
          .update({ status: 'failed' })
          .eq('id', order.id);

        return {
          status: 'failed',
          message: 'Payment failed',
          order,
        };
      }
    } catch (error) {
      this.logger.error(`Verify payment error: ${error.message}`);
      throw error instanceof HttpException ? error : new HttpException('Payment verification failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
