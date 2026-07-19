import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ResultCheckService } from './result-check.service';
import { InitiateResultCheckDto } from '../../common/dtos/result-check.dto';

@Controller('api/result-check')
export class ResultCheckController {
  constructor(private readonly resultCheckService: ResultCheckService) {}

  @Get('released-years')
  async getReleasedYears(@Query('result_type') resultType: string) {
    return this.resultCheckService.getReleasedYears(resultType);
  }

  @Post('initiate')
  async initiateOrder(@Body() dto: InitiateResultCheckDto) {
    return this.resultCheckService.initiateOrder(dto);
  }

  @Get('verify/:reference')
  async verifyPayment(@Param('reference') reference: string) {
    return this.resultCheckService.verifyPayment(reference);
  }
}
