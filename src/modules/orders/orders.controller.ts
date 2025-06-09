import { Controller, Post, Get, Param, Body, HttpException, HttpStatus } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { InitiateOrderDto } from '../../common/dtos/order.dto';

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
}