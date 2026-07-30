import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../common/services/supabase.service';
import axios from 'axios';
import { Checker } from '../../common/interfaces/checker.interface';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
  ) { }

  async initiatePayment(order: any) {
    const paystackSecret = this.configService.get('paystack.secret');
    if (!paystackSecret) {
      this.logger.error('Paystack secret key is missing');
      throw new HttpException('Payment configuration error', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const callbackUrl = this.configService.get('paystack.callbackUrl');
    if (!callbackUrl) {
      this.logger.error('Paystack callback URL is missing');
      throw new HttpException('Payment configuration error', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const baseCallbackUrl = order.callback_url || callbackUrl;
    const finalCallbackUrl = baseCallbackUrl.includes('?')
      ? `${baseCallbackUrl}&order_id=${order.id}&reference=${order.paystack_ref}`
      : `${baseCallbackUrl}?order_id=${order.id}&reference=${order.paystack_ref}`;

    try {
      const payload: any = {
        email: order.email && order.email.trim() !== '' ? order.email : 'appiahyoung2002@gmail.com',
        amount: order.total_amount * 100, // Convert to kobo
        callback_url: finalCallbackUrl,
        metadata: {
          order_id: order.id,
          phone: order.phone,
          failure_url: this.configService.get('paystack.failureUrl'),
        },
        channels: ['mobile_money', 'card'], // ✅ Explicitly enable MoMo
      };
      if (order.paystack_ref) {
        payload.reference = order.paystack_ref;
      }

      this.logger.debug(`Initiating Paystack payment with payload: ${JSON.stringify(payload)}`);

      const response = await axios.post(
        'https://api.paystack.co/transaction/initialize',
        payload,
        {
          headers: {
            Authorization: `Bearer ${paystackSecret}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.debug(`Paystack response: ${JSON.stringify(response.data)}`);

      return response.data.data;
    } catch (error) {
      this.logger.error(`Paystack API error: ${error.response?.data?.message || error.message}`);
      throw new HttpException(
        `Failed to initiate payment: ${error.response?.data?.message || 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async verifyPayment(reference: string) {
    const paystackSecret = this.configService.get('paystack.secret');
    if (!paystackSecret) {
      this.logger.error('Paystack secret key is missing');
      throw new HttpException('Payment configuration error', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    try {
      this.logger.debug(`Verifying Paystack payment for reference: ${reference}`);

      const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
        },
      });

      this.logger.debug(`Paystack verification response: ${JSON.stringify(response.data)}`);

      return response.data.data;
    } catch (error) {
      this.logger.error(`Paystack verification error: ${error.response?.data?.message || error.message}`);
      throw new HttpException(
        `Payment verification failed: ${error.response?.data?.message || 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private readonly resultCheckingUrls: Record<string, string> = {
    BECE: 'https://eresults.waecgh.org',
    WASSCE: 'https://ghana.waecdirect.org',
    NOVDEC: 'https://ghana.waecdirect.org',
    'WASSCE-NOVDEC': 'https://ghana.waecdirect.org',
    CSSPS: 'https://cssps.gov.gh',
    CTVET: 'https://eresults.waecgh.org',
  };

  private getPortalUrl(waecType: string): string {
    if (!waecType) return 'https://ghana.waecdirect.org';
    const key = waecType.toUpperCase();
    return this.resultCheckingUrls[key] || this.resultCheckingUrls[waecType] || 'https://ghana.waecdirect.org';
  }

  async sendCheckersViaEmail(email: string, checkers: Checker[]) {
    // Create HTML content for the email
    const htmlContent = `
      <h2>YOUR WAEC CHECKER DETAILS</h2>
      ${checkers.map((c, index) => {
        const portalUrl = this.getPortalUrl(c.waec_type);
        const actionText = (c.waec_type || '').toUpperCase() === 'CSSPS' ? 'placement' : 'results';
        return `
        <div style="margin-bottom: 20px;">
          <h3>Checker #${index + 1}</h3>
          <p><strong>Type:</strong> ${c.waec_type}</p>
          <p><strong>Serial:</strong> ${c.serial}</p>
          <p><strong>PIN:</strong> ${c.pin}</p>
          <p>Visit <a href="${portalUrl}">${portalUrl}</a> to check your ${actionText}</p>
        </div>
      `;
      }).join('')}
    `;

    // Send email using your email service (implement according to your email provider)
    // This is just a placeholder - you'll need to implement the actual email sending logic
    // For now, just log that we would have sent an email
    this.logger.log(`[EMAIL NOT IMPLEMENTED YET] Would send checkers to ${email}`);
    this.logger.log(`[EMAIL CONTENT PREVIEW] ${htmlContent}`);
    // Don't throw an error, just return successfully
    return;
  }

  async sendCheckersViaSms(phone: string, checkers: Checker[], isResultCheck: boolean = false) {
    const clientId = this.configService.get('hubtel.clientId');
    const clientSecret = this.configService.get('hubtel.clientSecret');
    const senderId = this.configService.get('hubtel.senderId');

    if (!clientId || !clientSecret || !senderId) {
      this.logger.error('Hubtel configuration is missing');
      throw new HttpException('SMS configuration error', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    let content = '';
    if (isResultCheck) {
      content = `YOUR RESULT CHECK ORDER DETAILS\n\n${checkers
        .map((c, index) =>
          `Checker #${index + 1}:\n` +
          `Type: ${c.waec_type}\n` +
          `Serial: ${c.serial}\n` +
          `PIN: ${c.pin}`
        )
        .join('\n\n')}\n\nYour results will be sent to you via the whatsapp number provided, kindly contact support after 5mins if you don't receive your results on 0557538158`;
    } else {
      content = `YOUR WAEC CHECKER DETAILS\n\n${checkers
        .map((c, index) => {
          const portalUrl = this.getPortalUrl(c.waec_type);
          const actionText = (c.waec_type || '').toUpperCase() === 'CSSPS' ? 'placement' : 'results';
          return (
            `Checker #${index + 1}:\n` +
            `Type: ${c.waec_type}\n` +
            `Serial: ${c.serial}\n` +
            `PIN: ${c.pin}\n` +
            `Visit ${portalUrl} to check your ${actionText}`
          );
        })
        .join('\n\n')}`;
    }

    try {
      this.logger.debug(`Sending SMS to ${phone}`);

      const response = await axios.get('https://smsc.hubtel.com/v1/messages/send', {
        params: {
          clientid: clientId,
          clientsecret: clientSecret,
          from: senderId,
          to: phone,
          content,
        },
      });

      this.logger.debug(`Hubtel response: ${JSON.stringify(response.data)}`);

      return response.data;
    } catch (error) {
      this.logger.error(`Hubtel SMS error: ${error.response?.data?.message || error.message}`);
      throw new HttpException('Failed to send SMS', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
