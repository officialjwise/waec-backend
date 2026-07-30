import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../../common/services/supabase.service';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class OrderCleanupService {
  private readonly logger = new Logger(OrderCleanupService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupStaleUnpaidOrders() {
    this.logger.log('Starting automated 2-day stale unpaid orders cleanup job...');
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Cleanup stale pending orders in 'orders' table
    try {
      const { data: pendingOrders } = await this.supabaseService
        .getClient()
        .from('orders')
        .select('id, paystack_ref, created_at')
        .eq('status', 'pending')
        .lt('created_at', twoDaysAgo);

      if (pendingOrders && pendingOrders.length > 0) {
        this.logger.log(`Found ${pendingOrders.length} stale pending bulk orders older than 2 days.`);
        for (const order of pendingOrders) {
          if (order.paystack_ref) {
            try {
              const verification = await this.paymentsService.verifyPayment(order.paystack_ref);
              if (verification?.status === 'success') {
                this.logger.log(`Order ${order.id} was paid on Paystack. Updating status to paid.`);
                await this.supabaseService.getClient().from('orders').update({ status: 'paid' }).eq('id', order.id);
                continue;
              }
            } catch (err: any) {
              this.logger.debug(`Paystack check for stale order ${order.id}: ${err.message}`);
            }
          }

          // Confirmed unpaid > 2 days old -> delete
          this.logger.log(`Auto-deleting unpaid stale pending order ${order.id}`);
          await this.supabaseService.getClient().from('orders').delete().eq('id', order.id);
        }
      }
    } catch (err: any) {
      this.logger.error(`Error in bulk orders cleanup: ${err.message}`);
    }

    // 2. Cleanup stale pending orders in 'result_check_orders' table
    try {
      const { data: pendingRcOrders } = await this.supabaseService
        .getClient()
        .from('result_check_orders')
        .select('id, paystack_ref, created_at')
        .eq('status', 'pending')
        .lt('created_at', twoDaysAgo);

      if (pendingRcOrders && pendingRcOrders.length > 0) {
        this.logger.log(`Found ${pendingRcOrders.length} stale pending result check orders older than 2 days.`);
        for (const order of pendingRcOrders) {
          if (order.paystack_ref) {
            try {
              const verification = await this.paymentsService.verifyPayment(order.paystack_ref);
              if (verification?.status === 'success') {
                this.logger.log(`Result check order ${order.id} was paid on Paystack. Updating status to paid.`);
                await this.supabaseService.getClient().from('result_check_orders').update({ status: 'paid' }).eq('id', order.id);
                continue;
              }
            } catch (err: any) {
              this.logger.debug(`Paystack check for stale rc order ${order.id}: ${err.message}`);
            }
          }

          // Confirmed unpaid > 2 days old -> delete
          this.logger.log(`Auto-deleting unpaid stale pending result check order ${order.id}`);
          await this.supabaseService.getClient().from('result_check_orders').delete().eq('id', order.id);
        }
      }
    } catch (err: any) {
      this.logger.error(`Error in result check orders cleanup: ${err.message}`);
    }

    this.logger.log('Automated stale unpaid orders cleanup job complete.');
  }
}
