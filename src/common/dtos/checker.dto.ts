export class CheckerDto {
  serial: string;
  pin: string;
  waec_type: 'BECE' | 'WASSCE' | 'NOVDEC' | 'CSSPS';
}

export class StockAvailabilityDto {
  waec_type: 'BECE' | 'WASSCE' | 'NOVDEC' | 'CSSPS';
  count: number;
}

export class CheckerAvailabilityResponseDto {
  statusCode: number;
  message: string;
  count: number;
  data: StockAvailabilityDto[] | CheckerDto[];
}