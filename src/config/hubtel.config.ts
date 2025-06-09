import { registerAs } from '@nestjs/config';

export default registerAs('hubtel', () => ({
  clientId: process.env.HUBTEL_CLIENT_ID || '',
  clientSecret: process.env.HUBTEL_CLIENT_SECRET || '',
  senderId: process.env.HUBTEL_SENDER_ID || 'KCEONLINE',
  apiUrl: process.env.HUBTEL_SMS_API_URL || 'https://smsc.hubtel.com/v1/messages/send',
}));