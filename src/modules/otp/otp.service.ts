import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../common/services/supabase.service';
import axios from 'axios';

@Injectable()
export class OtpService {
  constructor(
    private supabaseService: SupabaseService,
    private configService: ConfigService,
  ) {}

  async initiateOtp(phone: string) {
    // Check for paid orders
    const { data: orders, error: orderError } = await this.supabaseService
      .getClient()
      .from('orders')
      .select('id')
      .eq('phone', phone)
      .eq('status', 'paid');

    if (orderError || !orders.length) {
      throw new HttpException('No paid orders found for this phone', HttpStatus.NOT_FOUND);
    }

    // Generate OTP via Hubtel
    const clientId = this.configService.get('hubtel.clientId');
    const clientSecret = this.configService.get('hubtel.clientSecret');
    try {
      const response = await axios.post(
        'https://api-otp.hubtel.com/otp/send',
        {
          senderId: this.configService.get('hubtel.senderId'),
          phoneNumber: phone,
          countryCode: 'GH',
        },
        {
          auth: { username: clientId, password: clientSecret },
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const { requestId, prefix } = response.data.data;
      const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

      const { error } = await this.supabaseService.getClient().from('otp_requests').insert({
        phone,
        hubtel_request_id: requestId,
        hubtel_prefix: prefix,
        status: 'sent',
        expires_at,
      });

      if (error) {
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return { message: 'OTP sent successfully' };
    } catch (error) {
      throw new HttpException('Failed to send OTP', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async verifyOtp(phone: string, otp: string) {
    // Get latest OTP request
    const { data: otpRequest, error } = await this.supabaseService
      .getClient()
      .from('otp_requests')
      .select('*')
      .eq('phone', phone)
      .eq('status', 'sent')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !otpRequest) {
      throw new HttpException('Invalid or expired OTP', HttpStatus.BAD_REQUEST);
    }

    // Verify OTP via Hubtel
    const clientId = this.configService.get('hubtel.clientId');
    const clientSecret = this.configService.get('hubtel.clientSecret');
    try {
      const response = await axios.post(
        'https://api-otp.hubtel.com/otp/verify',
        {
          requestId: otpRequest.hubtel_request_id,
          prefix: otpRequest.hubtel_prefix,
          code: otp,
        },
        {
          auth: { username: clientId, password: clientSecret },
          headers: { 'Content-Type': 'application/json' },
        },
      );

      if (response.status !== 200) {
        throw new HttpException('Invalid OTP', HttpStatus.UNAUTHORIZED);
      }

      // Update OTP status
      await this.supabaseService
        .getClient()
        .from('otp_requests')
        .update({ status: 'verified' })
        .eq('id', otpRequest.id);

      // Fetch paid orders and checkers
      const { data: orders } = await this.supabaseService
        .getClient()
        .from('orders')
        .select('id')
        .eq('phone', phone)
        .eq('status', 'paid');

      const orderIds = orders ? orders.map((o) => o.id) : [];
      const { data: checkers } = await this.supabaseService
        .getClient()
        .from('checkers')
        .select('serial, pin, waec_type')
        .in('order_id', orderIds);

      return { checkers };
    } catch (error) {
      throw new HttpException('OTP verification failed', HttpStatus.UNAUTHORIZED);
    }
  }
}