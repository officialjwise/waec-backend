import { registerAs } from '@nestjs/config';

export default registerAs('paystack', () => ({
  secret: process.env.PAYSTACK_SECRET,
  callbackUrl: process.env.PAYSTACK_CALLBACK_URL,
  failureUrl: 'https://youngpress.netlify.app/payment-failed',
}));