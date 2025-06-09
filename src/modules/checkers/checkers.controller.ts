import { Controller, Post, Get, Query, UseGuards, UploadedFile, UseInterceptors, HttpException, HttpStatus } from '@nestjs/common';
import { CheckersService } from './checkers.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-auth.guard'; // Add this import
import { FileInterceptor } from '@nestjs/platform-express';
import { User } from '../../common/decorators/user.decorator';

@Controller('api/checkers')
export class CheckersController {
  constructor(private readonly checkersService: CheckersService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadCheckers(@UploadedFile() file: Express.Multer.File) {
    return this.checkersService.uploadCheckers(file);
  }

  @Get('availability')
  @UseGuards(OptionalJwtAuthGuard) // Use optional auth guard
  async getAvailability(
    @Query('waec_type') waec_type?: 'BECE' | 'WASSCE' | 'NOVDEC' | 'CSSPS',
    @Query('limit') limit?: string,
    @Query('detailed') detailed: string = 'false',
    @User() user?: any,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const isDetailed = detailed.toLowerCase() === 'true';
    const isAuthenticated = !!user;

    if (isNaN(parsedLimit) || parsedLimit <= 0) {
      throw new HttpException('Invalid limit parameter', HttpStatus.BAD_REQUEST);
    }

    // If authenticated, automatically enable detailed view regardless of detailed parameter
    const shouldShowDetailed = isAuthenticated || isDetailed;

    return this.checkersService.getAvailability(waec_type, parsedLimit, shouldShowDetailed, isAuthenticated);
  }

  @Get('summary')
  @UseGuards(JwtAuthGuard)
  async getSummary() {
    return this.checkersService.getSummary();
  }
}