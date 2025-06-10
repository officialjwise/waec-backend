import { Controller, Get, Param, Post, Query, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';

@Controller('api/admin')
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('orders')
  async listOrders(
    @Query('status') status: string,
    @Query('phone') phone: string,
    @Query('email') email: string,
    @Query('waec_type') waecType: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    return this.adminService.listOrders({ status, phone, email, waecType, startDate, endDate });
  }

  @Get('orders/:id')
  async getOrderDetails(@Param('id') id: string) {
    return this.adminService.getOrderDetails(id);
  }

  @Get('checkers')
  async listCheckers(@Query('waec_type') waecType: string, @Query('assigned') assigned: string) {
    return this.adminService.listCheckers({ waecType, assigned: assigned === 'true' });
  }

  @Post('checkers')
  @UseInterceptors(FileInterceptor('file'))
  async addCheckers(@UploadedFile() file: Express.Multer.File) {
    return this.adminService.addCheckersFromCsv(file);
  }

  @Post('checkers/preview')
  @UseInterceptors(FileInterceptor('file'))
  async previewCheckers(@UploadedFile() file: Express.Multer.File) {
    return this.adminService.previewCheckersCsv(file);
  }

  @Get('otp-requests')
  async listOtpRequests(@Query('phone') phone: string, @Query('verified') verified: string) {
    return this.adminService.listOtpRequests({ phone, verified: verified === 'true' });
  }

  @Get('inventory')
  async getInventory() {
    return this.adminService.getInventory();
  }

  @Get('logs')
  async listLogs(@Query('action') action: string, @Query('admin_id') adminId: string) {
    return this.adminService.listLogs({ action, adminId });
  }
}