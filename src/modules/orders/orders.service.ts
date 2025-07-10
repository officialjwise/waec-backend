import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../common/services/supabase.service';
import { PaymentsService } from '../payments/payments.service';
import { InitiateOrderDto } from '../../common/dtos/order.dto';
import { Checker } from '../../common/interfaces/checker.interface';
const { v4: uuidv4 } = require('uuid');

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private supabaseService: SupabaseService,
    private paymentsService: PaymentsService,
    private configService: ConfigService,
  ) {}

  async initiateOrder(dto: InitiateOrderDto) {
    const { waec_type, quantity, phone, email } = dto;

    this.logger.debug(`Initiating order: ${JSON.stringify(dto)}`);

    if (!['BECE', 'WASSCE', 'NOVDEC', 'CSSPS'].includes(waec_type)) {
      this.logger.warn(`Invalid waec_type: ${waec_type}`);
      throw new HttpException('Invalid checker type', HttpStatus.BAD_REQUEST);
    }
    if (quantity <= 0) {
      this.logger.warn(`Invalid quantity: ${quantity}`);
      throw new HttpException('Quantity must be greater than 0', HttpStatus.BAD_REQUEST);
    }

    const { count, error: stockError } = await this.supabaseService
      .getClient()
      .from('checkers')
      .select('*', { count: 'exact', head: true })
      .eq('waec_type', waec_type)
      .is('order_id', null);

    if (stockError) {
      this.logger.error(`Stock check error: ${stockError.message}`);
      throw new HttpException(stockError.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    if (count === null || count < quantity) {
      this.logger.warn(`Insufficient checkers: requested ${quantity}, available ${count}`);
      throw new HttpException('Insufficient checkers available', HttpStatus.BAD_REQUEST);
    }

    const paystack_ref = `REF-${uuidv4()}`;
    const total_amount = quantity * 17.5;
    const orderData = {
      waec_type,
      quantity,
      phone,
      total_amount,
      status: 'pending',
      email: email || null,
      paystack_ref,
    };

    this.logger.debug(`Creating order with data: ${JSON.stringify(orderData)}`);

    const { data: order, error } = await this.supabaseService
      .getClient()
      .from('orders')
      .insert(orderData)
      .select()
      .single();

    if (error) {
      this.logger.error(`Order creation error: ${error.message}`);
      throw new HttpException(`Failed to create order: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    try {
      const paymentData = await this.paymentsService.initiatePayment(order);

      const { error: updateError } = await this.supabaseService
        .getClient()
        .from('orders')
        .update({ paystack_ref: paymentData.reference })
        .eq('id', order.id);

      if (updateError) {
        this.logger.error(`Order update error: ${updateError.message}`);
        throw new HttpException('Failed to update order with Paystack reference', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      this.logger.debug(`Order initiated successfully: ${order.id}`);

      return { order_id: order.id, payment_url: paymentData.authorization_url };
    } catch (error) {
      this.logger.error(`Payment initiation failed: ${error.message}`);
      const { error: deleteError } = await this.supabaseService
        .getClient()
        .from('orders')
        .delete()
        .eq('id', order.id);

      if (deleteError) {
        this.logger.error(`Order rollback error: ${deleteError.message}`);
      }

      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async verifyPayment(reference: string) {
    this.logger.debug(`Verifying payment for reference: ${reference}`);

    const verification = await this.paymentsService.verifyPayment(reference);
    const orderId = verification.metadata.order_id;
    const { data: order, error: orderError } = await this.supabaseService
      .getClient()
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      this.logger.error(`Order not found: ${orderId}`);
      throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
    }

    if (verification.status === 'success') {
      if (verification.amount / 100 !== order.total_amount) {
        this.logger.warn(`Amount mismatch: expected ${order.total_amount}, got ${verification.amount / 100}`);
        throw new HttpException('Amount mismatch', HttpStatus.BAD_REQUEST);
      }

      const { error: updateError } = await this.supabaseService
        .getClient()
        .from('orders')
        .update({ status: 'paid', paystack_ref: reference })
        .eq('id', orderId);

      if (updateError) {
        this.logger.error(`Order update error: ${updateError.message}`);
        throw new HttpException(updateError.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      const { data: checkers, error: checkerError } = await this.supabaseService
        .getClient()
        .from('checkers')
        .select('id, serial, pin, waec_type, created_at')
        .eq('waec_type', order.waec_type)
        .is('order_id', null)
        .limit(order.quantity);

      if (checkerError) {
        this.logger.error(`Checker assignment error: ${checkerError.message}`);
        throw new HttpException(checkerError.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      const checkerIds = checkers.map((c: Checker) => c.id);
      const { error: assignError } = await this.supabaseService
        .getClient()
        .from('checkers')
        .update({ order_id: orderId })
        .in('id', checkerIds);

      if (assignError) {
        this.logger.error(`Checker update error: ${assignError.message}`);
        throw new HttpException(assignError.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      await this.paymentsService.sendCheckersViaSms(order.phone, checkers);

      const { error: storeError } = await this.supabaseService
        .getClient()
        .from('orders')
        .update({ checkers })
        .eq('id', orderId);

      if (storeError) {
        this.logger.error(`Checker storage error: ${storeError.message}`);
        throw new HttpException(storeError.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      this.logger.debug(`Payment verified successfully: ${orderId}`);

      return {
        status: 'success',
        message: 'Payment verified successfully',
        order: {
          id: order.id,
          reference: order.paystack_ref,
          status: 'paid',
          waec_type: order.waec_type,
          quantity: order.quantity,
          phone_number: order.phone,
          total_amount: order.total_amount,
          email: order.email,
          created_at: order.created_at,
          checkers: checkers
        }
      };
    } else {
      const { error: updateError } = await this.supabaseService
        .getClient()
        .from('orders')
        .update({ status: 'failed', paystack_ref: reference })
        .eq('id', orderId);

      if (updateError) {
        this.logger.error(`Order update error: ${updateError.message}`);
        throw new HttpException(updateError.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      this.logger.debug(`Payment failed: ${orderId}`);

      return {
        status: 'failed',
        message: 'Payment failed',
        order: {
          id: order.id,
          reference: order.paystack_ref,
          status: 'failed',
          waec_type: order.waec_type,
          quantity: order.quantity,
          phone_number: order.phone,
          total_amount: order.total_amount,
          email: order.email,
          created_at: order.created_at
        }
      };
    }
  }

  // ✅ ADDED METHOD: Handle Paystack Webhook
  async handlePaystackWebhook(req: any, res: any) {
    const signature = req.headers['x-paystack-signature'];
    const secret = this.configService.get<string>('PAYSTACK_SECRET_KEY');
    const crypto = require('crypto');

    const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(req.body)).digest('hex');
    if (hash !== signature) {
      this.logger.warn('Invalid Paystack webhook signature');
      return res.status(400).send('Invalid signature');
    }

    const payload = req.body;
    const result = await this.handleWebhook(payload);
    return res.status(200).json(result);
  }

  async handleWebhook(payload: any) {
    const event = payload?.event;
    const data = payload?.data;

    if (event === 'charge.success' && data?.status === 'success') {
      const reference = data.reference;
      const metadata = data.metadata;

      const orderId = metadata?.order_id;
      if (!orderId) {
        this.logger.warn(`Webhook received without order_id. Reference: ${reference}`);
        return { status: 'ignored', reason: 'Missing order_id in metadata' };
      }

      this.logger.log(`Webhook: Handling successful charge for Order ID ${orderId}, Ref: ${reference}`);

      try {
        const result = await this.verifyPayment(reference);
        return { status: 'processed', result };
      } catch (error) {
        this.logger.error(`Webhook handling failed for Ref ${reference}: ${error.message}`);
        throw new HttpException('Webhook processing failed', HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }

    this.logger.warn(`Unhandled webhook event type: ${event}`);
    return { status: 'ignored', reason: 'Unhandled event type' };
  }
}
