import { Controller, Post, Get, Param, Body, Req, Res, HttpException, HttpStatus } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { InitiateOrderDto } from '../../common/dtos/order.dto';
import { Request, Response } from 'express'; // ✅ Needed for the webhook method

@Controller('api/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('initiate')
  async initiateOrder(@Body() body: InitiateOrderDto) {
    return this.ordersService.initiateOrder(body);
  }

  @Get('verify/:reference')
  async verifyPayment(@Param('reference') reference: string) {
    return this.ordersService.verifyPayment(reference);
  }

  // ✅ NEW: Paystack Webhook Route
  // This will allow Paystack to notify your system after a user completes payment,
  // even if they don’t return to the website or click "I’ve completed payment".
  @Post('paystack/webhook')
  async handlePaystackWebhook(@Req() req: Request, @Res() res: Response) {
    return this.ordersService.handlePaystackWebhook(req, res);
  }
}
