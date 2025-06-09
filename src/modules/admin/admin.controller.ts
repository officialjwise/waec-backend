import { Controller, Get, Param, Post, Body, Query, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';

@Controller('api/admin')
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('orders')
  async listOrders(
    @Query('status') status: string,
    @Query('phone') phone: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    return this.adminService.listOrders({ status, phone, startDate, endDate });
  }

  @Get('orders/:id')
  async getOrderDetails(@Param('id') id: string) {
    return this.adminService.getOrderDetails(id);
  }

  @Get('checkers')
  async listCheckers(@Query('waec_type') waecType: string, @Query('assigned') assigned: boolean) {
    return this.adminService.listCheckers({ waecType, assigned });
  }

  @Post('checkers')
  async addCheckers(@Body() body: { serials: string[], pins: string[], waec_type: string }) {
    return this.adminService.addCheckers(body.serials, body.pins, body.waec_type);
  }

  @Get('otp-requests')
  async listOtpRequests(@Query('phone') phone: string, @Query('verified') verified: boolean) {
    return this.adminService.listOtpRequests({ phone, verified });
  }
}