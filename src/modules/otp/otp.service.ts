import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../common/services/supabase.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private supabaseService: SupabaseService,
    private configService: ConfigService,
  ) {}

  private getPhoneVariants(phone: string): string[] {
    const rawDigits = phone.replace(/\D/g, '');
    const coreNumber = rawDigits.slice(-9); // Get last 9 digits e.g. 541234567
    if (!coreNumber || coreNumber.length < 8) {
      return [phone];
    }
    return Array.from(
      new Set([
        phone,
        rawDigits,
        `0${coreNumber}`,
        `233${coreNumber}`,
        `+233${coreNumber}`,
      ]),
    );
  }

  async initiateOtp(phone: string) {
    this.logger.debug(`Initiating OTP for phone: ${phone}`);
    
    // Normalize phone number and get variants
    const phoneVariants = this.getPhoneVariants(phone);
    const normalizedPhone = this.normalizePhoneNumber(phone);
    this.logger.debug(`Normalized phone: ${normalizedPhone}, Phone variants: ${JSON.stringify(phoneVariants)}`);

    try {
      // Check for existing orders in 'orders' table
      const { data: orders, error: ordersError } = await this.supabaseService
        .getClient()
        .from('orders')
        .select('id, status')
        .in('phone', phoneVariants)
        .eq('status', 'paid');

      if (ordersError) {
        this.logger.error(`Orders check error: ${ordersError.message}`);
        throw new HttpException('Failed to check orders', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // Check for existing orders in 'result_check_orders' table
      const { data: rcOrders } = await this.supabaseService
        .getClient()
        .from('result_check_orders')
        .select('id, status')
        .in('phone', phoneVariants)
        .eq('status', 'paid');

      const totalFound = (orders?.length || 0) + (rcOrders?.length || 0);
      this.logger.debug(`Found ${totalFound} paid orders for phone variants: ${JSON.stringify(phoneVariants)}`);

      if (totalFound === 0) {
        this.logger.debug(`No paid orders found for phone variants: ${JSON.stringify(phoneVariants)}`);
        return {
          message: 'No checker found for this number to be retrieved',
          statusCode: HttpStatus.NOT_FOUND,
        };
      }

      // Get Hubtel configuration
      const hubtelConfig = this.configService.get('hubtel');
      const clientId = hubtelConfig?.clientId || this.configService.get('HUBTEL_CLIENT_ID');
      const clientSecret = hubtelConfig?.clientSecret || this.configService.get('HUBTEL_CLIENT_SECRET');
      const senderId = hubtelConfig?.senderId || this.configService.get('HUBTEL_SENDER_ID') || 'KCEONLINE';

      if (!clientId || !clientSecret) {
        this.logger.error('Hubtel credentials missing');
        throw new HttpException('SMS service configuration error', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // Create Basic Auth header
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      this.logger.debug('OTP Configuration:', {
        apiUrl: 'https://api-otp.hubtel.com/otp/send',
        senderId,
        phoneNumber: normalizedPhone,
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
      });

      // Send OTP using Hubtel OTP API
      const otpResponse = await axios.post(
        'https://api-otp.hubtel.com/otp/send',
        {
          senderId,
          phoneNumber: normalizedPhone,
          countryCode: 'GH',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${auth}`,
          },
        },
      );

      if (otpResponse.data.code === '0000') {
        this.logger.debug(`OTP sent successfully: ${otpResponse.data.data.requestId}`);

        // Store OTP session data in database for verification
        const { error: storeError } = await this.supabaseService
          .getClient()
          .from('otp_sessions')
          .insert({
            phone: normalizedPhone,
            request_id: otpResponse.data.data.requestId,
            prefix: otpResponse.data.data.prefix,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes expiry
            verified: false,
          });

        if (storeError) {
          this.logger.error(`OTP session storage error: ${storeError.message}`);
          throw new HttpException('Failed to store OTP session', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        this.logger.debug(`OTP session stored for requestId: ${otpResponse.data.data.requestId}`);

        return {
          message: 'OTP sent successfully',
          requestId: otpResponse.data.data.requestId,
          prefix: otpResponse.data.data.prefix,
        };
      } else {
        this.logger.error(`Hubtel OTP API Error: ${JSON.stringify(otpResponse.data)}`);
        throw new HttpException('Failed to send OTP', HttpStatus.INTERNAL_SERVER_ERROR);
      }
    } catch (error) {
      if (error.response) {
        this.logger.error('Hubtel OTP API Error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          url: error.response?.config?.url,
        });
        throw new HttpException(
          `Hubtel API Error (${error.response.status}): ${error.response.statusText}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      } else if (error instanceof HttpException) {
        throw error;
      } else {
        this.logger.error(`Initiate OTP error: ${error.message}`, error.stack);
        throw new HttpException(`Failed to send OTP: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async verifyOtp(requestId: string, code: string) {
    this.logger.debug(`Verifying OTP for requestId: ${requestId}`);

    try {
      // Get OTP session from database
      const { data: otpSession, error: sessionError } = await this.supabaseService
        .getClient()
        .from('otp_sessions')
        .select('*')
        .eq('request_id', requestId)
        .eq('verified', false)
        .single();

      if (sessionError || !otpSession) {
        this.logger.error(`OTP session not found for requestId: ${requestId}, error: ${sessionError?.message || 'No session found'}`);
        throw new HttpException('Invalid or expired OTP session', HttpStatus.BAD_REQUEST);
      }

      // Check if OTP has expired
      if (new Date() > new Date(otpSession.expires_at)) {
        this.logger.error(`OTP expired: ${requestId}`);
        throw new HttpException('OTP has expired', HttpStatus.BAD_REQUEST);
      }

      // Get Hubtel configuration
      const hubtelConfig = this.configService.get('hubtel');
      const clientId = hubtelConfig?.clientId || this.configService.get('HUBTEL_CLIENT_ID');
      const clientSecret = hubtelConfig?.clientSecret || this.configService.get('HUBTEL_CLIENT_SECRET');

      if (!clientId || !clientSecret) {
        this.logger.error('Hubtel credentials missing');
        throw new HttpException('SMS service configuration error', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // Create Basic Auth header
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      // Verify OTP with Hubtel
      const verifyResponse = await axios.post(
        'https://api-otp.hubtel.com/otp/verify',
        {
          requestId,
          prefix: otpSession.prefix,
          code,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${auth}`,
          },
        },
      );

      // For OTP verify endpoint, success is indicated by HTTP 200 status
      if (verifyResponse.status === 200) {
        // Mark OTP session as verified
        const { error: updateError } = await this.supabaseService
          .getClient()
          .from('otp_sessions')
          .update({ verified: true })
          .eq('request_id', requestId);

        if (updateError) {
          this.logger.error(`OTP session update error: ${updateError.message}`);
        }

        const phoneVariants = this.getPhoneVariants(otpSession.phone);

        // 1. Get checkers from 'orders' table
        const { data: orders, error: ordersError } = await this.supabaseService
          .getClient()
          .from('orders')
          .select('id, checkers, waec_type, quantity, created_at')
          .in('phone', phoneVariants)
          .eq('status', 'paid')
          .order('created_at', { ascending: false });

        if (ordersError) {
          this.logger.error(`Orders fetch error: ${ordersError.message}`);
          throw new HttpException('Failed to fetch orders', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const allCheckers: any[] = [];
        const orderIds: string[] = [];

        (orders || []).forEach((order) => {
          if (order.id) orderIds.push(order.id);
          if (order.checkers && Array.isArray(order.checkers) && order.checkers.length > 0) {
            order.checkers.forEach((checker: any) => {
              allCheckers.push({
                ...checker,
                waec_type: checker.waec_type || order.waec_type,
                order_date: order.created_at,
              });
            });
          }
        });

        // 2. Fetch checkers directly from 'checkers' table for those orders
        if (orderIds.length > 0) {
          const { data: dbCheckers } = await this.supabaseService
            .getClient()
            .from('checkers')
            .select('id, serial, pin, waec_type, order_id, created_at')
            .in('order_id', orderIds);

          if (dbCheckers && dbCheckers.length > 0) {
            dbCheckers.forEach((dbc) => {
              const exists = allCheckers.some((c) => c.serial === dbc.serial && c.pin === dbc.pin);
              if (!exists) {
                allCheckers.push({
                  id: dbc.id,
                  serial: dbc.serial,
                  pin: dbc.pin,
                  waec_type: dbc.waec_type,
                  order_date: dbc.created_at,
                });
              }
            });
          }
        }

        // 3. Fetch checkers from 'result_check_orders' table
        const { data: rcOrders } = await this.supabaseService
          .getClient()
          .from('result_check_orders')
          .select('id, checker_serial, checker_pin, result_type, created_at')
          .in('phone', phoneVariants)
          .eq('status', 'paid');

        if (rcOrders && rcOrders.length > 0) {
          rcOrders.forEach((rco) => {
            if (rco.checker_serial && rco.checker_pin) {
              const exists = allCheckers.some((c) => c.serial === rco.checker_serial && c.pin === rco.checker_pin);
              if (!exists) {
                allCheckers.push({
                  id: rco.id,
                  serial: rco.checker_serial,
                  pin: rco.checker_pin,
                  waec_type: rco.result_type,
                  order_date: rco.created_at,
                });
              }
            }
          });
        }

        if (allCheckers.length === 0) {
          this.logger.debug(`No paid checkers found for phone variants: ${JSON.stringify(phoneVariants)}`);
          return {
            message: 'No checker found for this number to be retrieved',
            statusCode: HttpStatus.NOT_FOUND,
          };
        }

        this.logger.debug(`OTP verified successfully: ${requestId}, returning ${allCheckers.length} checkers`);

        return {
          message: 'OTP verified successfully',
          checkers: allCheckers,
          phone: otpSession.phone,
        };
      } else {
        this.logger.error(`OTP verification failed: ${verifyResponse.status}`);
        throw new HttpException('Invalid OTP code', HttpStatus.BAD_REQUEST);
      }
    } catch (error) {
      if (error.response) {
        this.logger.error('Hubtel OTP Verify Error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          url: error.response?.config?.url,
        });
        if (error.response.status === 400 || error.response.status === 401) {
          throw new HttpException('Invalid OTP code', HttpStatus.BAD_REQUEST);
        }
        throw new HttpException(
          `Hubtel API Error (${error.response.status || 'unknown'}): ${error.response.statusText || 'unknown'}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      } else if (error instanceof HttpException) {
        throw error;
      } else {
        this.logger.error(`Verify OTP error: ${error.message}`, error.stack);
        throw new HttpException(`Failed to verify OTP: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  private normalizePhoneNumber(phone: string): string {
    // Remove any spaces, dashes, or other non-numeric characters
    let normalized = phone.replace(/\D/g, '');

    // Handle Ghana phone numbers
    if (normalized.startsWith('0')) {
      // Convert 0XXXXXXXXX to 233XXXXXXXXX
      normalized = '233' + normalized.substring(1);
    } else if (!normalized.startsWith('233')) {
      // If it doesn't start with 233, assume it's a local number and add 233
      normalized = '233' + normalized;
    }

    return normalized;
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async cleanupExpiredSessions() {
    const { error } = await this.supabaseService
      .getClient()
      .from('otp_sessions')
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (error) {
      this.logger.error(`Cleanup error: ${error.message}`);
    } else {
      this.logger.debug('Expired OTP sessions cleaned up');
    }
  }
}