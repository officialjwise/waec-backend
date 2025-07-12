import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { SupabaseService } from '../../common/services/supabase.service';
import { parse } from 'csv-parse';
import { Readable } from 'stream';
import { CheckerDto, CheckerAvailabilityResponseDto, StockAvailabilityDto } from '../../common/dtos/checker.dto';

@Injectable()
export class CheckersService {
  constructor(private supabaseService: SupabaseService) {}

  // async uploadCheckers(file: Express.Multer.File) {
  //   if (!file) {
  //     throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
  //   }
  //   if (!file.originalname.endsWith('.csv')) {
  //     throw new HttpException('File must be a CSV', HttpStatus.BAD_REQUEST);
  //   }

  //   const validWaecTypes = ['BECE', 'WASSCE', 'NOVDEC', 'CSSPS', 'CTVET'];
  //   const checkers: CheckerDto[] = [];
  //   let hasRequiredHeaders = false;

  //   const parser = Readable.from(file.buffer).pipe(
  //     parse({
  //       columns: true,
  //       skip_empty_lines: true,
  //       trim: true,
  //     }),
  //   );

  //   for await (const record of parser) {
  //     if (!hasRequiredHeaders) {
  //       if (!record.serial || !record.pin || !record.waec_type) {
  //         throw new HttpException('CSV must contain serial, pin, and waec_type columns', HttpStatus.BAD_REQUEST);
  //       }
  //       hasRequiredHeaders = true;
  //     }

  //     const waec_type = record.waec_type.toUpperCase();
  //     if (!validWaecTypes.includes(waec_type)) {
  //       throw new HttpException(`Invalid waec_type: ${waec_type}`, HttpStatus.BAD_REQUEST);
  //     }

  //     checkers.push({
  //       serial: record.serial,
  //       pin: record.pin,
  //       waec_type: waec_type as 'BECE' | 'WASSCE' | 'NOVDEC' | 'CSSPS' | 'CTVET',
  //     });
  //   }

  //   if (checkers.length === 0) {
  //     throw new HttpException('No valid checkers found in CSV', HttpStatus.BAD_REQUEST);
  //   }

  //   const { error } = await this.supabaseService
  //     .getClient()
  //     .from('checkers')
  //     .insert(checkers);

  //   if (error) {
  //     throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
  //   }

  //   return { message: 'Checkers uploaded successfully', count: checkers.length };
  // }
  async getAvailability(
    waec_type?: 'BECE' | 'WASSCE' | 'NOVDEC' | 'CSSPS' | 'CTVET',
    limit: number = 10,
    detailed: boolean = false,
    isAuthenticated: boolean = false,
  ): Promise<CheckerAvailabilityResponseDto> {
    // If user requests detailed data but is not authenticated, throw error
    if (detailed && !isAuthenticated) {
      throw new HttpException('Authentication required for detailed data', HttpStatus.UNAUTHORIZED);
    }
  
    let query = this.supabaseService
      .getClient()
      .from('checkers')
      .select(detailed ? 'serial, pin, waec_type' : 'waec_type')
      .is('order_id', null);
  
    if (waec_type) {
      if (!['BECE', 'WASSCE', 'NOVDEC', 'CSSPS', 'CTVET'].includes(waec_type)) {
        throw new HttpException('Invalid checker type', HttpStatus.BAD_REQUEST);
      }
      query = query.eq('waec_type', waec_type);
    }
  
    // For detailed results, apply limit to the query
    // For summary results, we need all data to get accurate counts
    if (detailed) {
      query = query.limit(limit);
    }
  
    const { data, error } = await query;
  
    if (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  
    let responseData: StockAvailabilityDto[] | CheckerDto[];
    let count: number;
  
    if (detailed) {
      responseData = data as unknown as CheckerDto[];
      count = responseData.length;
    } else {
      // Summarize by waec_type
      const summaryMap = new Map<string, number>();
      (data as any[]).forEach((item) => {
        const type = item.waec_type;
        summaryMap.set(type, (summaryMap.get(type) || 0) + 1);
      });
  
      responseData = Array.from(summaryMap.entries()).map(([waec_type, count]) => ({
        waec_type: waec_type as 'BECE' | 'WASSCE' | 'NOVDEC' | 'CSSPS' | 'CTVET',
        count,
      }));
  
      // For summary mode, the total count is the sum of all individual counts
      count = responseData.reduce((sum, item) => sum + item.count, 0);
    }
  
    return {
      statusCode: HttpStatus.OK,
      message: waec_type 
        ? `Available checkers for ${waec_type}${detailed ? ' (detailed)' : ''}` 
        : `All available checkers${detailed ? ' (detailed)' : ''}`,
      count,
      data: responseData,
    };
  }

  async getSummary() {
    const validWaecTypes = ['BECE', 'WASSCE', 'NOVDEC', 'CSSPS', 'CTVET'];
    const summary: Array<{ waec_type: string; count: number | null }> = [];

    for (const type of validWaecTypes) {
      const { count, error } = await this.supabaseService
        .getClient()
        .from('checkers')
        .select('*', { count: 'exact', head: true })
        .eq('waec_type', type)
        .is('order_id', null);

      if (error) {
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      summary.push({ waec_type: type, count });
    }

    return summary;
  }
}