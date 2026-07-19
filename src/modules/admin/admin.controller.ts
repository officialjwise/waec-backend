import { Controller, Get, Param, Post, Put, Body, Query, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
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
  async listCheckers(
    @Query('waec_type') waecType: string, 
    @Query('assigned') assigned: string, 
  ) {
    return this.adminService.listCheckers({ waecType, assigned: assigned === 'true'});
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

  @Get('result-check-orders')
  async listResultCheckOrders(
    @Query('status') status: string,
    @Query('phone') phone: string,
    @Query('email') email: string,
    @Query('result_type') result_type: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    return this.adminService.listResultCheckOrders({ status, phone, email, result_type, startDate, endDate });
  }

  @Get('result-check-orders/:id')
  async getResultCheckOrderDetails(@Param('id') id: string) {
    return this.adminService.getResultCheckOrderDetails(id);
  }

  @Get('result-release-years')
  async listReleaseYears(@Query('result_type') result_type: string) {
    return this.adminService.listReleaseYears({ result_type });
  }

  @Post('result-release-years')
  async upsertReleaseYear(@Body() body: { result_type: string; year: number; is_released: boolean }) {
    return this.adminService.upsertReleaseYear(body);
  }

  @Get('result-release-years/:id/toggle')
  async toggleReleaseYearGet(@Param('id') id: string) {
    return this.adminService.toggleReleaseYear(id);
  }

  @Put('result-release-years/:id')
  async toggleReleaseYear(@Param('id') id: string) {
    return this.adminService.toggleReleaseYear(id);
  }
}